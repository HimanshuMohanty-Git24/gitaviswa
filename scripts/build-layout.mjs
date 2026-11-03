// Precomputes the 3D cosmos layout into public/data/gita-layout.json, so browsers place nodes directly instead of
// running a 350-tick force simulation on the main thread at every visit (and again on every legend toggle).
// Runs the same forces CosmicGraph3D used live (shared constants in src/lib/graph/layoutParams.ts).
// Usage: npm run data:layout   (also run after `npm run data` regenerates the graph)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { forceCenter, forceLink, forceManyBody, forceSimulation } from "d3-force-3d";
import { ALPHA_DECAY, CHARGE, LAYOUT_TICKS, VELOCITY_DECAY, containForce, fixedPosition, linkDistance, linkStrength } from "../src/lib/graph/layoutParams.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(readFileSync(join(root, "public/data/gita-graph.json"), "utf8"));

const nodes = graph.nodes.map((n) => {
  const f = fixedPosition(n);
  return f ? { id: n.id, type: n.type, x: f[0], y: f[1], z: f[2], fx: f[0], fy: f[1], fz: f[2] } : { id: n.id, type: n.type };
});
const ids = new Set(nodes.map((n) => n.id));
const links = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ source: e.source, target: e.target, type: e.type }));

const t0 = performance.now();
const sim = forceSimulation(nodes, 3)
  .alphaDecay(ALPHA_DECAY)
  .velocityDecay(VELOCITY_DECAY)
  .force("link", forceLink(links).id((d) => d.id).distance((l) => linkDistance(l.type)).strength((l) => linkStrength(l.type)))
  .force("charge", forceManyBody().strength(CHARGE.strength).distanceMax(CHARGE.distanceMax))
  .force("center", forceCenter())
  .force("contain", containForce())
  .stop();
for (let i = 0; i < LAYOUT_TICKS; i++) sim.tick();

const round = (v) => Math.round(v * 10) / 10;
const positions = Object.fromEntries(nodes.map((n) => [n.id, [round(n.x), round(n.y), round(n.z)]]));
const doc = { kind: "gitaviswa-layout", version: 1, graphVersion: graph.meta?.version ?? null, generatedAt: new Date().toISOString(), nodeCount: nodes.length, ticks: LAYOUT_TICKS, positions };
writeFileSync(join(root, "public/data/gita-layout.json"), JSON.stringify(doc));
console.log(`layout: ${nodes.length} nodes, ${links.length} links, ${LAYOUT_TICKS} ticks in ${Math.round(performance.now() - t0)} ms → public/data/gita-layout.json`);
