import { NextResponse } from "next/server";
import { isProviderId, PROVIDERS } from "@/lib/llm/providers";
import { listModels, pickModel, resolveProvider } from "@/lib/llm/client";
import { isLocalRequest, serverKeysAllowed } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live chat-model list for a provider (key from the BYOK header or .env), so retired presets never strand the user. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("provider");
  if (!isProviderId(id)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  try {
    const p = resolveProvider(id, { apiKey: req.headers.get("x-gitaviswa-key"), baseUrl: isLocalRequest(req) ? url.searchParams.get("baseUrl") : null, serverKeys: serverKeysAllowed(req) });
    const models = await listModels(p);
    const configured = url.searchParams.get("model") || process.env[PROVIDERS[id].envModel]?.trim() || PROVIDERS[id].defaultModel;
    return NextResponse.json({ provider: PROVIDERS[id].name, models, recommended: pickModel(id, models), configured, configuredAvailable: models.includes(configured) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
