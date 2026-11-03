import { NextResponse } from "next/server";
import { getServerRag } from "@/lib/server/data";
import { composeOfflineAnswer, retrieve } from "@/lib/graphrag/engine";
import { embedQueryServer } from "@/lib/server/embedder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keyless GraphRAG retrieval API: GET /api/graphrag?q=…
 * Returns the ranked verses / concepts / states / dilemmas, the induced subgraph, the LLM-ready context and
 * the deterministic offline answer — the same pipeline the browser runs.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 2000).trim();
  if (!q) return NextResponse.json({ error: "Pass ?q=your question" }, { status: 400 });
  try {
    const ctx = await getServerRag();
    const vector = ctx.index?.hasVectors ? await embedQueryServer(q) : null;
    const r = await retrieve(ctx, q, { vector });
    const label = (id: string) => ctx.graphs.nodeById.get(id)?.label ?? id;
    return NextResponse.json({
      query: q,
      crisis: r.crisis,
      searchMode: r.searchMode,
      timings: r.timings,
      seeds: r.seeds.map((s) => ({ ...s, label: label(s.id) })),
      verses: r.verses.map((v) => ({ ...v, label: label(v.id) })),
      concepts: r.concepts.map((c) => ({ ...c, label: label(c.id) })),
      emotions: r.emotions.map((e) => ({ ...e, label: label(e.id) })),
      dilemmas: r.dilemmas.map((d) => ({ ...d, label: label(d.id) })),
      chains: r.chains.map((c) => c.title),
      dialogues: r.dialogues.map((d) => d.id),
      subgraph: { nodes: r.subgraph.nodes.length, edges: r.subgraph.edges.length },
      answer: composeOfflineAnswer(ctx, r),
      context: r.context,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
