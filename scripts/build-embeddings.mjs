#!/usr/bin/env node
/**
 * Optional: precompute sentence embeddings for every verse and ontology node so Orama can run hybrid
 * (BM25 + vector) search. Uses the same local model as /api/embed (Xenova/all-MiniLM-L6-v2, 384-d, quantised).
 *
 *   npm run data:embeddings          (run after `npm run data`; downloads ~23 MB model once into .cache/models)
 *
 * Output: public/data/gita-embeddings.json  { model, dim, ids, vectors: base64(Int8Array) }
 */
import fs from "node:fs/promises";
import path from "node:path";

const MODEL = "Xenova/all-MiniLM-L6-v2";
const OUT = path.resolve("public/data/gita-embeddings.json");
const t0 = Date.now();

let transformers;
try {
  transformers = await import("@huggingface/transformers");
} catch (e) {
  console.error("✗ @huggingface/transformers is not installed (it is an optional dependency).", e.message);
  process.exit(1);
}
const { pipeline, env } = transformers;
env.cacheDir = path.resolve(".cache/models");

const verses = JSON.parse(await fs.readFile("public/data/gita-verses.json", "utf8"));
const graph = JSON.parse(await fs.readFile("public/data/gita-graph.json", "utf8"));
const def = String(verses.meta.defaults.en);

const docs = [];
for (const v of verses.verses) {
  const en = v.translations.en?.[def] || Object.values(v.translations.en || {})[0] || "";
  const gloss = v.padaccheda.map((p) => p.m).join(", ");
  docs.push([v.id, `Bhagavad Gita ${v.ref}. ${en} Words: ${gloss}`.slice(0, 1200)]);
}
for (const n of graph.nodes) {
  if (n.type === "Verse") continue;
  const text = [n.label, n.en, n.desc, n.modern, n.role, n.title, n.meaning, (n.lexicon || n.keywords || []).join(", ")].filter(Boolean).join(". ");
  docs.push([n.id, text.slice(0, 1200)]);
}

console.log(`🪷  Embedding ${docs.length} documents with ${MODEL} (first run downloads the model)…`);
const extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
const dim = 384;
const bytes = new Int8Array(docs.length * dim);
const BATCH = 32;
for (let i = 0; i < docs.length; i += BATCH) {
  const batch = docs.slice(i, i + BATCH);
  const out = await extractor(batch.map(([, t]) => t), { pooling: "mean", normalize: true });
  const rows = out.tolist();
  rows.forEach((row, j) => row.forEach((x, k) => (bytes[(i + j) * dim + k] = Math.max(-127, Math.min(127, Math.round(x * 127))))));
  process.stdout.write(`\r   ${Math.min(i + BATCH, docs.length)}/${docs.length}`);
}
await fs.writeFile(OUT, JSON.stringify({ model: MODEL, dim, ids: docs.map(([id]) => id), vectors: Buffer.from(bytes.buffer).toString("base64") }));
const kb = ((await fs.stat(OUT)).size / 1024).toFixed(0);
console.log(`\n✓ Wrote ${path.relative(process.cwd(), OUT)} (${kb} KB) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
