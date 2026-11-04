import { NextResponse } from "next/server";
import { isProviderId } from "@/lib/llm/providers";
import { completeChat, ProviderError, resolveProvider } from "@/lib/llm/client";
import { isLocalRequest, serverKeysAllowed } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Round-trip a tiny completion to verify a provider/key/model combination. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { provider?: string; model?: string; baseUrl?: string };
  if (!isProviderId(body.provider)) return NextResponse.json({ ok: false, error: "Unknown provider" }, { status: 400 });
  const t0 = Date.now();
  try {
    const p = resolveProvider(body.provider, { apiKey: req.headers.get("x-gitaviswa-key"), model: body.model, baseUrl: isLocalRequest(req) ? body.baseUrl : null, serverKeys: serverKeysAllowed(req) });
    const out = await Promise.race([
      completeChat(p, [{ role: "user", content: "Reply with exactly the word: Om" }], { maxTokens: 400, temperature: 0 }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new ProviderError("Timed out after 20s", 504, "network")), 20_000)),
    ]);
    return NextResponse.json({ ok: true, model: out.model, fallbackFrom: out.fallbackFrom, keySource: p.keySource, latencyMs: Date.now() - t0, sample: out.text.slice(0, 60) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, latencyMs: Date.now() - t0 });
  }
}
