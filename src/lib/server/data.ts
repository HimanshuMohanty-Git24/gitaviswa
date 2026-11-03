import fs from "node:fs/promises";
import path from "node:path";
import type { GraphData, VersesDoc } from "@/lib/types";
import { buildGraphs } from "@/lib/graph/graphStore";
import { buildSearchIndex } from "@/lib/graphrag/search";
import type { RagContext } from "@/lib/graphrag/engine";
import { decodeEmbeddings, type EmbeddingsDoc } from "@/lib/data/loader";

const dataFile = (f: string) => path.join(process.cwd(), "public", "data", f);

let docs: Promise<{ versesDoc: VersesDoc; graphData: GraphData }> | null = null;
let rag: Promise<RagContext> | null = null;
let stamp = "";

/** Drop the caches when `npm run data` regenerates public/data while the server is running. */
async function revalidate() {
  const stats = await Promise.all(["gita-graph.json", "gita-verses.json", "gita-embeddings.json"].map((f) => fs.stat(dataFile(f)).then((s) => s.mtimeMs).catch(() => 0)));
  const now = stats.join("|");
  if (stamp && now !== stamp) {
    docs = null;
    rag = null;
  }
  stamp = now;
}

export async function loadServerDocs() {
  await revalidate();
  docs ??= (async () => {
    const [v, g] = await Promise.all([fs.readFile(dataFile("gita-verses.json"), "utf8"), fs.readFile(dataFile("gita-graph.json"), "utf8")]);
    return { versesDoc: JSON.parse(v) as VersesDoc, graphData: JSON.parse(g) as GraphData };
  })().catch((e) => {
    docs = null;
    throw e;
  });
  return docs;
}

/** Server-side GraphRAG context so /api/chat also works for API clients that don't send their own retrieval. */
export async function getServerRag(): Promise<RagContext> {
  await revalidate();
  rag ??= (async () => {
    const { versesDoc, graphData } = await loadServerDocs();
    const graphs = buildGraphs(graphData);
    const emb = await fs
      .readFile(dataFile("gita-embeddings.json"), "utf8")
      .then((t) => decodeEmbeddings(JSON.parse(t) as EmbeddingsDoc))
      .catch(() => null);
    const index = await buildSearchIndex(versesDoc, graphData, emb);
    return { graphs, versesDoc, data: graphData, versesById: new Map(versesDoc.verses.map((v) => [v.id, v])), index };
  })().catch((e) => {
    rag = null;
    throw e;
  });
  return rag;
}
