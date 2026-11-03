import { dijkstra } from "graphology-shortest-path";
import type { GraphNode, RelationType } from "@/lib/types";
import { RELATIONS } from "./relations";
import { relationsBetween, type GitaGraphs } from "./graphStore";

export interface PathStep {
  from: string;
  to: string;
  type: RelationType;
  forward: boolean;
  edgeKey: string;
  detail?: string;
}

export interface SutraPath {
  nodes: string[];
  steps: PathStep[];
  cost: number;
  narration: string[];
  ms: number;
}

export function describeNode(n: GraphNode | undefined): string {
  if (!n) return "?";
  switch (n.type) {
    case "Verse":
      return `BG ${n.ref}`;
    case "Chapter":
      return `Chapter ${n.number} (${n.title})`;
    case "SanskritConcept":
      return `${n.label} (${n.en})`;
    case "Emotion":
      return `${n.label} (${n.en})`;
    default:
      return n.label;
  }
}

/** Weighted shortest path ("Sutra") between any two nodes, narrated hop by hop. */
export function findSutraPath(g: GitaGraphs, a: string, b: string): SutraPath | null {
  if (!g.path.hasNode(a) || !g.path.hasNode(b)) return null;
  const t0 = performance.now();
  const nodes = a === b ? [a] : dijkstra.bidirectional(g.path, a, b, "weight");
  const ms = performance.now() - t0;
  if (!nodes || !nodes.length) return null;

  const steps: PathStep[] = [];
  let cost = 0;
  for (let i = 1; i < nodes.length; i++) {
    const rels = relationsBetween(g, nodes[i - 1], nodes[i]);
    const r = rels[0];
    if (!r) continue;
    cost += RELATIONS[r.type].pathCost;
    const why = typeof r.props?.why === "string" ? r.props.why : undefined;
    const terms = Array.isArray(r.props?.terms) ? r.props!.terms!.slice(0, 2).join(", ") : undefined;
    steps.push({ from: nodes[i - 1], to: nodes[i], type: r.type, forward: r.forward, edgeKey: r.key, detail: why || terms });
  }

  const narration = steps.map((s) => {
    const A = describeNode(g.nodeById.get(s.from));
    const B = describeNode(g.nodeById.get(s.to));
    const meta = RELATIONS[s.type];
    const sentence = s.forward ? `${A} ${meta.verb} ${B}` : `${A} ${meta.inverse} ${B}`;
    return s.detail ? `${sentence}: “${s.detail}”` : sentence;
  });
  return { nodes, steps, cost, narration, ms };
}

export const SUTRA_PRESETS: { label: string; from: string; to: string }[] = [
  { label: "Arjuna's collapse → Final surrender", from: "BG_1.28", to: "BG_18.66" },
  { label: "Fear & anxiety → Equanimity", from: "emotion:bhaya", to: "concept:samatva" },
  { label: "Anger → Inner peace", from: "emotion:krodha", to: "emotion:shanti" },
  { label: "Restless mind → Liberation", from: "emotion:chanchalata", to: "concept:moksha" },
  { label: "Grief → The undying Self", from: "emotion:shoka", to: "concept:atman" },
  { label: "Burnout → Selfless action", from: "dilemma:burnout", to: "concept:nishkama-karma" },
];
