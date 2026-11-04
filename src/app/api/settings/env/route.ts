import { NextResponse } from "next/server";
import { isProviderId, maskKey, PROVIDER_ORDER, PROVIDERS, type ProviderId } from "@/lib/llm/providers";
import { ENV_LOCAL, envSources, isSafeEnvValue, upsertEnvLocal } from "@/lib/server/envfile";
import { envWriteAllowed, isLocalRequest, serverKeysAllowed } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which providers are configured on the server (.env.local / .env / environment). Keys are never returned, only masked.
 *  Visitors to a deployment see none of the server's own configuration unless its owner shares it (see serverKeysAllowed). */
export async function GET(req: Request) {
  const sourceOf = await envSources();
  const local = isLocalRequest(req);
  const shared = serverKeysAllowed(req);
  const providers = {} as Record<ProviderId, { configured: boolean; source: string | null; masked: string | null; model: string | null; baseUrl?: string | null }>;
  for (const id of PROVIDER_ORDER) {
    const p = PROVIDERS[id];
    const key = shared && p.envKey ? process.env[p.envKey]?.trim() : undefined;
    providers[id] = {
      configured: p.envKey ? !!key : shared && !!process.env.OLLAMA_BASE_URL?.trim(),
      source: p.envKey ? (key ? sourceOf(p.envKey) : null) : shared ? sourceOf("OLLAMA_BASE_URL") : null,
      masked: key ? maskKey(key) : null,
      model: process.env[p.envModel]?.trim() || null,
      ...(id === "ollama" ? { baseUrl: (shared && process.env.OLLAMA_BASE_URL?.trim()) || null } : {}),
    };
  }
  const def = process.env.LLM_PROVIDER?.trim();
  const write = envWriteAllowed();
  return NextResponse.json({
    providers,
    defaultProvider: def && isProviderId(def) ? def : null,
    writable: write.allowed && local,
    reason: !local ? "On this site your key stays in your browser and is not stored on the server." : write.reason,
    file: ENV_LOCAL,
    neo4j: local ? { configured: !!process.env.NEO4J_URI?.trim(), uri: process.env.NEO4J_URI?.trim() || null } : { configured: false, uri: null },
  });
}

interface PostBody {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  makeDefault?: boolean;
}

/** Persist a key typed into the Agni-Kunda modal to .env.local (local development only). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PostBody;
  if (!isProviderId(body.provider)) return NextResponse.json({ written: false, reason: "Unknown provider." }, { status: 400 });
  if (!isLocalRequest(req)) return NextResponse.json({ written: false, reason: "On this site your key stays in your browser and is not stored on the server." }, { status: 403 });
  const allowed = envWriteAllowed();
  if (!allowed.allowed) return NextResponse.json({ written: false, reason: allowed.reason });

  const p = PROVIDERS[body.provider];
  const updates: Record<string, string | null> = {};
  if (body.apiKey !== undefined && p.envKey) {
    const k = String(body.apiKey).trim();
    if (k && !isSafeEnvValue(k)) return NextResponse.json({ written: false, reason: "That key contains characters that cannot be stored safely." }, { status: 400 });
    updates[p.envKey] = k || null;
  }
  if (body.model) {
    const m = String(body.model).trim();
    if (!/^[\w.:/@-]{1,120}$/.test(m)) return NextResponse.json({ written: false, reason: "Invalid model id." }, { status: 400 });
    updates[p.envModel] = m;
  }
  if (body.baseUrl && p.envBaseUrl) {
    const u = String(body.baseUrl).trim();
    if (!/^https?:\/\/[^\s"'`]{1,200}$/.test(u)) return NextResponse.json({ written: false, reason: "Invalid base URL." }, { status: 400 });
    updates[p.envBaseUrl] = u;
  }
  if (body.makeDefault) updates.LLM_PROVIDER = body.provider;
  if (!Object.keys(updates).length) return NextResponse.json({ written: false, reason: "Nothing to save." });

  try {
    const file = await upsertEnvLocal(updates);
    return NextResponse.json({ written: true, file, keys: Object.keys(updates) });
  } catch (e) {
    return NextResponse.json({ written: false, reason: `Could not write ${ENV_LOCAL}: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Remove a provider's key from .env.local. */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PostBody;
  if (!isProviderId(body.provider)) return NextResponse.json({ written: false, reason: "Unknown provider." }, { status: 400 });
  if (!isLocalRequest(req) || !envWriteAllowed().allowed) return NextResponse.json({ written: false, reason: "Not permitted here." }, { status: 403 });
  const p = PROVIDERS[body.provider];
  if (!p.envKey) return NextResponse.json({ written: false, reason: "This provider has no key." });
  const sourceOf = await envSources();
  const src = sourceOf(p.envKey);
  if (src === ENV_LOCAL) await upsertEnvLocal({ [p.envKey]: null });
  return NextResponse.json({
    written: src === ENV_LOCAL,
    reason: src && src !== ENV_LOCAL ? `The key is also defined in ${src}; remove it there to disconnect permanently.` : undefined,
  });
}
