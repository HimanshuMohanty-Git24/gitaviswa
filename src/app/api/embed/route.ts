import { NextResponse } from "next/server";
import { EMBED_MODEL, embedTexts } from "@/lib/server/embedder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Local query embeddings for hybrid search. Optional: returns 503 when the model is unavailable. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { texts?: unknown };
  const texts = Array.isArray(body.texts) ? body.texts.filter((t): t is string => typeof t === "string").slice(0, 16).map((t) => t.slice(0, 2000)) : [];
  if (!texts.length) return NextResponse.json({ error: "texts[] required" }, { status: 400 });
  try {
    const t0 = Date.now();
    const vectors = await embedTexts(texts);
    return NextResponse.json({ model: EMBED_MODEL, vectors, ms: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({ error: `Local embeddings unavailable: ${(e as Error).message}` }, { status: 503 });
  }
}
