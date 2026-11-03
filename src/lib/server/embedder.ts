import path from "node:path";

// Local sentence embeddings (all-MiniLM-L6-v2, quantised) — the model `npm run data:embeddings` used for every
// verse and entity, so query vectors share their space. Loaded lazily; callers treat failures as "no vectors".
export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist: () => number[][] }>;
let extractor: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  extractor ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = path.join(process.cwd(), ".cache", "models");
    return (await pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" })) as unknown as Extractor;
  })().catch((e) => {
    extractor = null;
    throw e;
  });
  return extractor;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (process.env.GITAVISWA_DISABLE_EMBED === "true") throw new Error("Embeddings disabled");
  const fx = await getExtractor();
  return (await fx(texts, { pooling: "mean", normalize: true })).tolist();
}

/** Best-effort single query vector (null when the model is unavailable). */
export async function embedQueryServer(text: string): Promise<number[] | null> {
  try {
    return (await embedTexts([text.slice(0, 2000)]))[0] ?? null;
  } catch {
    return null;
  }
}
