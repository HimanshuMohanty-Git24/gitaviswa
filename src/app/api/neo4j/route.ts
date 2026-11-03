import { NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { loadServerDocs } from "@/lib/server/data";
import { isLocalRequest } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Prim = string | number | boolean;
const clean = (o: Record<string, unknown>) => {
  const out: Record<string, Prim | Prim[]> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v) && v.every((x) => ["string", "number", "boolean"].includes(typeof x))) out[k] = v as Prim[];
  }
  return out;
};

/** One-click sync of the whole knowledge graph into a Neo4j instance (idempotent MERGE, batched UNWIND). */
export async function POST(req: Request) {
  if (!isLocalRequest(req)) return NextResponse.json({ ok: false, error: "Neo4j sync is only available from localhost." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { uri?: string; user?: string; password?: string; database?: string };
  const uri = body.uri?.trim() || process.env.NEO4J_URI?.trim();
  const user = body.user?.trim() || process.env.NEO4J_USER?.trim() || "neo4j";
  const password = body.password || process.env.NEO4J_PASSWORD || "";
  if (!uri) return NextResponse.json({ ok: false, error: "Provide a Neo4j URI (e.g. neo4j://localhost:7687) or set NEO4J_URI." }, { status: 400 });

  const t0 = Date.now();
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session(body.database ? { database: body.database } : {});
  try {
    await driver.verifyConnectivity();
    const { graphData, versesDoc } = await loadServerDocs();
    const full = new Map(versesDoc.verses.map((v) => [v.id, v]));
    const byLabel = new Map<string, Record<string, Prim | Prim[]>[]>();
    for (const n of graphData.nodes) {
      const { type, ...rest } = n as unknown as Record<string, unknown> & { type: string };
      const row = clean(rest);
      const v = full.get(n.id);
      if (v) Object.assign(row, clean({ sanskrit: v.sanskrit.join("\n"), iast: v.iast.join("\n"), translation_en: v.translations.en?.[String(versesDoc.meta.defaults.en)], meter_name: v.meter.name, audio_url: v.audio.verse[0] }));
      if (!/^[A-Za-z]+$/.test(type)) continue;
      byLabel.set(type, [...(byLabel.get(type) || []), row]);
    }
    for (const label of byLabel.keys()) await session.run(`CREATE CONSTRAINT ${label.toLowerCase()}_id IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`);
    let nodes = 0;
    for (const [label, rows] of byLabel) {
      for (let i = 0; i < rows.length; i += 500) {
        await session.executeWrite((tx) => tx.run(`UNWIND $rows AS row MERGE (n:${label} {id: row.id}) SET n += row`, { rows: rows.slice(i, i + 500) }));
        nodes += Math.min(500, rows.length - i);
      }
    }
    const labelOf = new Map(graphData.nodes.map((n) => [n.id, n.type]));
    const groups = new Map<string, { s: string; t: string; p: Record<string, Prim | Prim[]> }[]>();
    for (const e of graphData.edges) {
      const k = `${e.type}|${labelOf.get(e.source)}|${labelOf.get(e.target)}`;
      groups.set(k, [...(groups.get(k) || []), { s: e.source, t: e.target, p: clean({ weight: e.weight ?? 1, ...(e.props || {}) }) }]);
    }
    let rels = 0;
    for (const [k, rows] of groups) {
      const [type, sl, tl] = k.split("|");
      if (![type, sl, tl].every((x) => /^[A-Za-z_]+$/.test(x))) continue;
      for (let i = 0; i < rows.length; i += 1000) {
        await session.executeWrite((tx) =>
          tx.run(`UNWIND $rows AS row MATCH (a:${sl} {id: row.s}) MATCH (b:${tl} {id: row.t}) MERGE (a)-[r:${type}]->(b) SET r += row.p`, { rows: rows.slice(i, i + 1000) }),
        );
        rels += Math.min(1000, rows.length - i);
      }
    }
    return NextResponse.json({ ok: true, nodes, relationships: rels, ms: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  } finally {
    await session.close();
    await driver.close();
  }
}
