import type { CommentaryDoc, GraphData, VersesDoc } from "@/lib/types";

let versesPromise: Promise<VersesDoc> | null = null;
let graphPromise: Promise<GraphData> | null = null;
const commentaryCache = new Map<string, Promise<CommentaryDoc | null>>();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "force-cache" });
  // Shown to people (the developer hint lives in AppError, development only).
  if (!res.ok) throw new Error(`Part of the Gita data could not be loaded (${url.split("/").pop()}, HTTP ${res.status}).`);
  return (await res.json()) as T;
}

export function loadVerses(): Promise<VersesDoc> {
  versesPromise ??= getJson<VersesDoc>("/data/gita-verses.json").catch((e) => {
    versesPromise = null;
    throw e;
  });
  return versesPromise;
}

export function loadGraph(): Promise<GraphData> {
  graphPromise ??= getJson<GraphData>("/data/gita-graph.json").catch((e) => {
    graphPromise = null;
    throw e;
  });
  return graphPromise;
}

export interface LayoutDoc {
  kind: "gitaviswa-layout";
  version: number;
  nodeCount: number;
  positions: Record<string, [number, number, number]>;
}
let layoutPromise: Promise<LayoutDoc | null> | null = null;
/** Precomputed 3D positions (scripts/build-layout.mjs). Null when absent or unreadable: the graph then lays itself out live. */
export function loadLayout(): Promise<LayoutDoc | null> {
  layoutPromise ??= fetch("/data/gita-layout.json", { cache: "force-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<LayoutDoc>) : null))
    .then((d) => (d && d.kind === "gitaviswa-layout" && d.positions ? d : null))
    .catch(() => null);
  return layoutPromise;
}

/** Per-verse multi-author commentary, lazy-loaded on demand (null when the build ran without commentary). */
export function loadCommentary(verseId: string): Promise<CommentaryDoc | null> {
  if (!commentaryCache.has(verseId)) {
    commentaryCache.set(
      verseId,
      fetch(`/data/commentary/${verseId}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<CommentaryDoc>) : null))
        .catch(() => null),
    );
  }
  return commentaryCache.get(verseId)!;
}

export interface EmbeddingsDoc {
  model: string;
  dim: number;
  ids: string[];
  /** base64 of an Int8Array (row-major, values = round(v * 127)) */
  vectors: string;
}

let embPromise: Promise<EmbeddingsDoc | null> | null = null;
export function loadEmbeddings(): Promise<EmbeddingsDoc | null> {
  embPromise ??= fetch("/data/gita-embeddings.json")
    .then((r) => (r.ok ? (r.json() as Promise<EmbeddingsDoc>) : null))
    .catch(() => null);
  return embPromise;
}

export function decodeEmbeddings(doc: EmbeddingsDoc): Map<string, number[]> {
  const bin = typeof atob === "function" ? atob(doc.vectors) : Buffer.from(doc.vectors, "base64").toString("binary");
  const bytes = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = (bin.charCodeAt(i) << 24) >> 24;
  const out = new Map<string, number[]>();
  doc.ids.forEach((id, row) => {
    const v = new Array<number>(doc.dim);
    let norm = 0;
    for (let j = 0; j < doc.dim; j++) {
      v[j] = bytes[row * doc.dim + j] / 127;
      norm += v[j] * v[j];
    }
    norm = Math.sqrt(norm) || 1;
    for (let j = 0; j < doc.dim; j++) v[j] /= norm;
    out.set(id, v);
  });
  return out;
}
