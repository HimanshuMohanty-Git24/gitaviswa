"use client";
import { currentConnection, useSettings } from "@/lib/store/settingsStore";
import { PROVIDERS } from "./providers";

export interface StreamResult {
  ok: boolean;
  text: string;
  error?: string;
  code?: string;
  provider?: string;
  model?: string;
  /** set when the configured model was retired and the server substituted another */
  fallbackFrom?: string;
}

/** Stream a completion through /api/chat with the user's active provider (BYOK key sent per request, never stored server-side unless saved). */
export async function streamFromApi(opts: {
  mode: "chat" | "bridge" | "translate" | "analyze" | "commentary";
  question: string;
  context?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  onToken?: (t: string, full: string) => void;
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const s = useSettings.getState();
  const conn = currentConnection(s);
  if (!conn) return { ok: false, text: "", code: "no-key", error: "No LLM provider connected." };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = s.keys[conn.provider];
  if (key) headers["x-gitaviswa-key"] = key;
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers,
      signal: opts.signal,
      body: JSON.stringify({
        mode: opts.mode,
        provider: conn.provider,
        model: conn.model,
        baseUrl: conn.provider === "ollama" ? s.ollamaBaseUrl : undefined,
        question: opts.question,
        context: opts.context,
        history: opts.history,
      }),
    });
  } catch (e) {
    return { ok: false, text: "", code: "network", error: (e as Error).message };
  }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    return { ok: false, text: "", code: j.code || "upstream", error: j.error || `HTTP ${res.status}` };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      text += chunk;
      opts.onToken?.(chunk, text);
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") return { ok: false, text, code: "network", error: (e as Error).message };
  }
  return {
    ok: true,
    text,
    provider: res.headers.get("X-GitaViswa-Provider") || PROVIDERS[conn.provider].name,
    model: res.headers.get("X-GitaViswa-Model") || conn.model,
    fallbackFrom: res.headers.get("X-GitaViswa-Model-Fallback") || undefined,
  };
}
