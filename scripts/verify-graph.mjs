#!/usr/bin/env node
// Re-verify the generated knowledge graph in public/data without rebuilding it.
import fs from "node:fs/promises";
import { verifyGraph } from "./lib/verify.mjs";

const graph = JSON.parse(await fs.readFile("public/data/gita-graph.json", "utf8"));
const verses = JSON.parse(await fs.readFile("public/data/gita-verses.json", "utf8"));
const { errors, warnings, stats } = verifyGraph(graph, verses);
console.log(JSON.stringify(stats, null, 2));
for (const w of warnings.slice(0, 20)) console.warn("warn:", w);
if (errors.length) {
  for (const e of errors) console.error("error:", e);
  process.exit(1);
}
console.log(`✓ integrity verified — ${stats.nodes} nodes, ${stats.edges} edges, 0 errors, ${warnings.length} warnings`);
