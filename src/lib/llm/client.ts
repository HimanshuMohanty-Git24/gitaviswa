import { PROVIDERS, type ProviderId } from "./providers";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ResolvedProvider {
  id: ProviderId;
  url: string;
  base: string;
  apiKey: string | null;
  model: string;
  /** the model the caller asked for (differs from `model` when a retired model was substituted) */
  requested: string;
  keySource: "request" | "env" | "none";
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: "no-key" | "upstream" | "network" | "bad-request",
  ) {
    super(message);
  }
}

/** Pick credentials: a key sent by the browser (BYOK) wins, otherwise the server's .env when `serverKeys` allows it. */
export function resolveProvider(id: ProviderId, opts: { apiKey?: string | null; model?: string | null; baseUrl?: string | null; serverKeys: boolean }): ResolvedProvider {
  const p = PROVIDERS[id];
  const envKey = opts.serverKeys && p.envKey ? process.env[p.envKey]?.trim() || null : null;
  const apiKey = opts.apiKey?.trim() || envKey;
  const model = opts.model?.trim() || process.env[p.envModel]?.trim() || p.defaultModel;
  let base = p.baseUrl;
  if (id === "ollama") {
    base = (opts.baseUrl?.trim() || process.env.OLLAMA_BASE_URL?.trim() || p.baseUrl).replace(/\/+$/, "");
    base = base.endsWith("/v1") ? base : `${base}/v1`;
  }
  if (p.envKey && !apiKey) throw new ProviderError(`No API key configured for ${p.name}.`, 400, "no-key");
  const remembered = fallbackFor.get(`${id}|${model}`);
  return {
    id,
    base,
    url: `${base}/chat/completions`,
    apiKey: apiKey ?? null,
    model: remembered || model,
    requested: model,
    keySource: opts.apiKey?.trim() ? "request" : envKey ? "env" : "none",
  };
}

function headers(p: ResolvedProvider): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  if (p.id === "openrouter") {
    h["HTTP-Referer"] = "https://github.com/gitaviswa";
    h["X-Title"] = "GitaViswa";
  }
  return h;
}

/** Stream text deltas from any OpenAI-compatible endpoint. */
export async function* streamChat(p: ResolvedProvider, messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {}): AsyncGenerator<string> {
  let res: Response;
  try {
    res = await fetch(p.url, {
      method: "POST",
      headers: headers(p),
      body: JSON.stringify({
        model: p.model,
        messages,
        stream: true,
        temperature: opts.temperature ?? 0.5,
        // Reasoning models spend tokens before answering; give them headroom.
        max_tokens: opts.maxTokens ?? (isReasoningModel(p.model) ? 2400 : 1100),
        // Groq's gpt-oss models stream reasoning separately; "low" keeps first-token latency down.
        ...(p.id === "groq" && /gpt-oss/.test(p.model) ? { reasoning_effort: "low" } : {}),
      }),
      signal: opts.signal,
    });
  } catch (e) {
    throw new ProviderError(`Could not reach ${PROVIDERS[p.id].name}: ${(e as Error).message}`, 502, "network");
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let msg = body.slice(0, 400);
    try {
      const j = JSON.parse(body);
      msg = j.error?.message || j.message || msg;
    } catch {}
    throw new ProviderError(`${PROVIDERS[p.id].name} responded ${res.status}: ${msg}`, res.status, "upstream");
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let inThink = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data);
        let delta: string = j.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        // Reasoning models (e.g. DeepSeek R1) may inline <think>…</think>; keep only the answer.
        if (delta.includes("<think>")) inThink = true;
        if (inThink) {
          const end = delta.indexOf("</think>");
          if (end < 0) continue;
          delta = delta.slice(end + 8);
          inThink = false;
        }
        if (delta) yield delta;
      } catch {
        // partial / keep-alive line
      }
    }
  }
}

const isReasoningModel = (m: string) => /gpt-oss|qwen3|deepseek-r1|o[134]|reason/i.test(m);

// ── model discovery & retired-model fallback ─────────────────────────────────────────────────────
// Providers retire models (Groq dropped llama-3.3-70b-versatile in 2026). When a configured model is gone we
// pick the best available chat model, remember the substitution for this server process, and tell the user.

const NON_CHAT = /whisper|tts|orpheus|guard|embed|moderation|transcri|speech|vision-preview|dall-e|image/i;
const modelCache = new Map<string, { at: number; ids: string[] }>();
const fallbackFor = new Map<string, string>();

export async function listModels(p: ResolvedProvider): Promise<string[]> {
  const cacheKey = `${p.id}|${p.base}|${p.apiKey?.slice(-6) ?? ""}`;
  const hit = modelCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.ids;
  let res: Response;
  try {
    res = await fetch(`${p.base}/models`, { headers: headers(p), signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new ProviderError(`Could not list ${PROVIDERS[p.id].name} models: ${(e as Error).message}`, 502, "network");
  }
  if (!res.ok) throw new ProviderError(`${PROVIDERS[p.id].name} /models responded ${res.status}`, res.status, "upstream");
  const j = (await res.json()) as { data?: { id: string; active?: boolean }[] };
  const ids = (j.data || []).filter((m) => m.active !== false && !NON_CHAT.test(m.id)).map((m) => m.id).sort();
  modelCache.set(cacheKey, { at: Date.now(), ids });
  return ids;
}

/** Choose a replacement: the provider's preset order first, then anything chat-capable. */
export function pickModel(id: ProviderId, available: string[]): string | null {
  for (const m of PROVIDERS[id].models) if (available.includes(m.id)) return m.id;
  return available[0] ?? null;
}

const isMissingModel = (e: unknown) =>
  e instanceof ProviderError && e.code === "upstream" && (e.status === 404 || e.status === 400) && /model/i.test(e.message) && /not exist|not found|decommission|no longer|invalid model|unknown model|does not have access/i.test(e.message);

/**
 * Start a stream, transparently substituting an available model if the configured one was retired.
 * Returns the first chunk eagerly so callers can still answer with a JSON error before streaming.
 */
export async function openStream(
  p: ResolvedProvider,
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<{ gen: AsyncGenerator<string>; first: IteratorResult<string>; provider: ResolvedProvider; fallbackFrom?: string }> {
  try {
    const gen = streamChat(p, messages, opts);
    return { gen, first: await gen.next(), provider: p, fallbackFrom: p.requested !== p.model ? p.requested : undefined };
  } catch (e) {
    if (!isMissingModel(e)) throw e;
    const available = await listModels(p).catch(() => []);
    const next = pickModel(p.id, available.filter((m) => m !== p.model));
    if (!next) throw e;
    fallbackFor.set(`${p.id}|${p.requested}`, next);
    const q = { ...p, model: next };
    const gen = streamChat(q, messages, opts);
    return { gen, first: await gen.next(), provider: q, fallbackFrom: p.requested };
  }
}

/** Non-streaming helper (JSON tasks such as journal analysis). */
export async function completeChat(p: ResolvedProvider, messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<{ text: string; model: string; fallbackFrom?: string }> {
  const { gen, first, provider, fallbackFrom } = await openStream(p, messages, opts);
  let out = first.done ? "" : first.value;
  if (!first.done) for await (const d of gen) out += d;
  return { text: out.trim(), model: provider.model, fallbackFrom };
}
