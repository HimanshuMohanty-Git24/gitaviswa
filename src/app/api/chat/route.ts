import { NextResponse } from "next/server";
import { isProviderId, PROVIDERS } from "@/lib/llm/providers";
import { openStream, ProviderError, resolveProvider, type ChatMessage } from "@/lib/llm/client";
import { ANALYZE_SYSTEM, BRIDGE_SYSTEM, COMMENTARY_SYSTEM, PARTHA_SARATHI_SYSTEM, TRANSLATE_SYSTEM, buildUserTurn } from "@/lib/graphrag/prompts";
import { getServerRag } from "@/lib/server/data";
import { retrieve } from "@/lib/graphrag/engine";
import { isLocalRequest, serverKeysAllowed } from "@/lib/server/guard";
import { embedQueryServer } from "@/lib/server/embedder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "chat" | "bridge" | "translate" | "analyze" | "commentary";
const SYSTEM: Record<Mode, string> = { chat: PARTHA_SARATHI_SYSTEM, bridge: BRIDGE_SYSTEM, translate: TRANSLATE_SYSTEM, analyze: ANALYZE_SYSTEM, commentary: COMMENTARY_SYSTEM };

interface Body {
  mode?: Mode;
  provider?: string;
  model?: string;
  baseUrl?: string;
  question?: string;
  context?: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

/**
 * Streaming Hybrid-GraphRAG endpoint for every BYOK provider (Groq, OpenRouter, xAI, OpenAI, Ollama).
 * The browser normally performs retrieval itself (zero-latency, highlights the subgraph) and sends `context`;
 * API clients may omit it and the server retrieves from its own copy of the graph.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "bad-request" }, { status: 400 });
  }
  const mode: Mode = body.mode && body.mode in SYSTEM ? body.mode : "chat";
  const question = (body.question || "").toString().slice(0, 4000).trim();
  if (!question) return NextResponse.json({ error: "Missing question", code: "bad-request" }, { status: 400 });

  const providerId = body.provider || process.env.LLM_PROVIDER || "";
  if (!isProviderId(providerId)) return NextResponse.json({ error: "No LLM provider selected", code: "no-key" }, { status: 400 });

  let provider;
  try {
    provider = resolveProvider(providerId, {
      apiKey: req.headers.get("x-gitaviswa-key"),
      model: body.model,
      // Custom endpoints are honoured only for local requests (prevents use as an open relay when deployed).
      baseUrl: isLocalRequest(req) ? body.baseUrl : null,
      serverKeys: serverKeysAllowed(req),
    });
  } catch (e) {
    const err = e as ProviderError;
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status || 400 });
  }

  let context = (body.context || "").toString().slice(0, 24000);
  let retrieval = "client";
  if (!context && mode === "chat") {
    try {
      const ctx = await getServerRag();
      const vector = ctx.index?.hasVectors ? await embedQueryServer(question) : null;
      context = (await retrieve(ctx, question, { vector })).context;
      retrieval = "server";
    } catch {
      retrieval = "none";
    }
  }

  const history: ChatMessage[] = (body.history || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM[mode] }, ...history, { role: "user", content: context ? buildUserTurn(question, context) : question }];

  // Pull the first chunk before committing to a 200 so upstream auth/model errors surface as JSON.
  // openStream also swaps in an available model if the configured one has been retired by the provider.
  let opened: Awaited<ReturnType<typeof openStream>>;
  try {
    opened = await openStream(provider, messages, { temperature: mode === "analyze" || mode === "translate" || mode === "commentary" ? 0.2 : 0.55, signal: req.signal });
  } catch (e) {
    const err = e as ProviderError;
    return NextResponse.json({ error: err.message, code: err.code || "upstream" }, { status: err.status && err.status < 600 ? err.status : 502 });
  }

  const { gen, first, fallbackFrom } = opened;
  const used = opened.provider;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done && first.value) controller.enqueue(enc.encode(first.value));
        if (!first.done) for await (const d of gen) controller.enqueue(enc.encode(d));
      } catch (e) {
        controller.enqueue(enc.encode(`\n\n⚠ Stream interrupted: ${(e as Error).message}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-GitaViswa-Provider": PROVIDERS[used.id].name,
      "X-GitaViswa-Model": used.model,
      "X-GitaViswa-Key-Source": used.keySource,
      ...(fallbackFrom ? { "X-GitaViswa-Model-Fallback": fallbackFrom } : {}),
      "X-GitaViswa-Retrieval": retrieval,
    },
  });
}
