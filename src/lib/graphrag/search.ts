import { create, insertMultiple, search, type AnyOrama } from "@orama/orama";
import type { GraphData, GraphNode, Verse, VersesDoc } from "@/lib/types";
import { fold, hasDevanagari, keywords } from "./text";

export type DocKind = "verse" | "chapter" | "concept" | "emotion" | "dilemma" | "character";

export interface SearchHit {
  id: string;
  kind: DocKind;
  score: number;
  title: string;
}

export interface SearchIndex {
  db: AnyOrama;
  hasVectors: boolean;
  dim: number;
  docCount: number;
  buildMs: number;
  verses: Verse[];
}

const KIND: Partial<Record<GraphNode["type"], DocKind>> = {
  Chapter: "chapter",
  SanskritConcept: "concept",
  Emotion: "emotion",
  LifeDilemma: "dilemma",
  Character: "character",
};

/**
 * Build the Orama index over every verse (Sanskrit, ASCII-folded IAST, three English translations, Hindi,
 * padaccheda glosses) and every ontology entity. When precomputed embeddings exist the schema gains a vector
 * property and hybrid (BM25 + cosine) search becomes available.
 */
export async function buildSearchIndex(versesDoc: VersesDoc, graph: GraphData, vectors?: Map<string, number[]> | null): Promise<SearchIndex> {
  const t0 = performance.now();
  const dim = vectors && vectors.size ? vectors.values().next().value!.length : 0;
  const schema = {
    id: "string",
    kind: "enum",
    title: "string",
    iast: "string",
    english: "string",
    meanings: "string",
    body: "string",
    chapter: "number",
    ...(dim ? { embedding: `vector[${dim}]` } : {}),
  } as const;
  const db = create({ schema: schema as never });

  const enKeys = [String(versesDoc.meta.defaults.en), "21", "19"];
  const docs: Record<string, unknown>[] = [];
  for (const v of versesDoc.verses) {
    const english = enKeys.map((k) => v.translations.en?.[k]).filter(Boolean).join(" \n ");
    docs.push({
      id: v.id,
      kind: "verse",
      title: `BG ${v.ref}`,
      iast: fold(v.iast.join(" ") + " " + v.transliteration.join(" ")),
      english,
      meanings: v.padaccheda.map((p) => `${fold(p.w)} ${p.m}`).join(" ; "),
      body: "",
      chapter: v.chapter,
      ...(dim ? { embedding: vectors!.get(v.id) ?? new Array(dim).fill(0) } : {}),
    });
  }
  for (const n of graph.nodes) {
    const kind = KIND[n.type];
    if (!kind) continue;
    const parts: string[] = [];
    if ("en" in n) parts.push(n.en);
    if ("desc" in n) parts.push(n.desc);
    if ("modern" in n) parts.push(n.modern);
    if ("lexicon" in n) parts.push(n.lexicon.join(", "));
    if ("keywords" in n) parts.push(n.keywords.join(", "));
    if ("role" in n) parts.push(n.role);
    if (n.type === "Chapter") parts.push(n.title, n.meaning, n.summary);
    docs.push({
      id: n.id,
      kind,
      title: n.label,
      iast: "iast" in n ? fold(n.iast) : "",
      english: "",
      meanings: "",
      body: parts.join(" \n "),
      chapter: n.type === "Chapter" ? n.number : 0,
      ...(dim ? { embedding: vectors!.get(n.id) ?? new Array(dim).fill(0) } : {}),
    });
  }
  await insertMultiple(db as never, docs as never, 250);
  return { db, hasVectors: dim > 0, dim, docCount: docs.length, buildMs: performance.now() - t0, verses: versesDoc.verses };
}

export interface SearchOptions {
  limit?: number;
  kinds?: DocKind[];
  vector?: number[] | null;
}

/** Hybrid search: BM25 always; cosine similarity when a query vector is available; Devanagari by direct scan. */
export async function searchIndex(idx: SearchIndex, query: string, opts: SearchOptions = {}): Promise<{ hits: SearchHit[]; mode: "fulltext" | "hybrid" | "devanagari"; ms: number }> {
  const t0 = performance.now();
  const limit = opts.limit ?? 12;
  const q = query.trim();
  if (!q) return { hits: [], mode: "fulltext", ms: 0 };

  if (hasDevanagari(q)) {
    const needle = q.replace(/\s+/g, "");
    const hits: SearchHit[] = [];
    for (const v of idx.verses) {
      const hay = v.sanskrit.join("").replace(/\s+/g, "") + Object.values(v.translations.hi || {}).join(" ");
      if (hay.includes(needle)) hits.push({ id: v.id, kind: "verse", score: 1, title: `BG ${v.ref}` });
      if (hits.length >= limit) break;
    }
    return { hits, mode: "devanagari", ms: performance.now() - t0 };
  }

  const useVector = !!(opts.vector && idx.hasVectors && opts.vector.length === idx.dim);
  const where = opts.kinds ? { kind: opts.kinds.length === 1 ? { eq: opts.kinds[0] } : { in: opts.kinds } } : undefined;
  // Content words only: short function words ("who", "with") otherwise fuzzy-match half the corpus.
  const term = keywords(q).join(" ") || fold(q);
  const base = {
    term,
    limit,
    tolerance: 0,
    boost: { title: 3, iast: 1.6, meanings: 1.2, english: 1, body: 1.4 },
    properties: ["title", "iast", "english", "meanings", "body"],
    ...(where ? { where } : {}),
  };
  const run = (params: typeof base) =>
    useVector
      ? search(idx.db, { ...params, mode: "hybrid", vector: { value: opts.vector!, property: "embedding" }, similarity: 0.25, hybridWeights: { text: 0.45, vector: 0.55 } } as never)
      : search(idx.db, params as never);
  let res = await run(base);
  // Typo-tolerant retry only when the exact pass finds nothing.
  if (!res.hits.length && term.length > 4) res = await run({ ...base, tolerance: 1 });
  // Orama uses each document's own `id` field as its document id.
  const hits = (res.hits as unknown as { id: string; score: number; document: { kind: DocKind; title: string } }[]).map((h) => ({
    id: h.id,
    kind: h.document.kind,
    score: h.score,
    title: h.document.title,
  }));
  return { hits, mode: useVector ? "hybrid" : "fulltext", ms: performance.now() - t0 };
}

/** Ask the local embedding route for a query vector (returns null when semantic mode is unavailable). */
let embedUnavailable = false;
export async function embedQuery(text: string): Promise<number[] | null> {
  if (embedUnavailable) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch("/api/embed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts: [text] }), signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      if (res.status === 503) embedUnavailable = true;
      return null;
    }
    const j = (await res.json()) as { vectors: number[][] };
    return j.vectors?.[0] ?? null;
  } catch {
    return null;
  }
}
