import { MultiDirectedGraph, UndirectedGraph } from "graphology";
import type { GraphData, GraphEdge, GraphNode, PersonalThought, RelationType } from "@/lib/types";
import { RELATIONS, edgeKey } from "./relations";

export interface EdgeAttrs {
  type: RelationType;
  weight: number;
  props?: GraphEdge["props"];
}
export interface PathEdgeAttrs {
  weight: number;
  types: RelationType[];
}

export interface GitaGraphs {
  /** The property graph: directed, multi (several relation types may join the same pair). */
  graph: MultiDirectedGraph<GraphNode, EdgeAttrs>;
  /** Undirected projection with the cheapest relation cost per pair — used for traversal & the Sutra Tracer. */
  path: UndirectedGraph<{ type: GraphNode["type"] }, PathEdgeAttrs>;
  nodeById: Map<string, GraphNode>;
  edges: GraphEdge[];
}

export const thoughtNodeId = (id: string) => `thought:${id}`;

export function personalEdges(t: PersonalThought): GraphEdge[] {
  const id = thoughtNodeId(t.id);
  return [
    ...t.emotions.map((e) => ({ source: id, target: e.id, type: "FEELS" as const, weight: e.score })),
    ...t.dilemmas.map((d) => ({ source: id, target: d.id, type: "FACES" as const, weight: d.score })),
    ...t.verses.map((v) => ({ source: id, target: v.id, type: "RESONATES_WITH" as const, weight: v.score, props: v.why ? { why: v.why } : undefined })),
  ];
}

export function personalNode(t: PersonalThought): GraphNode {
  const label = t.text.length > 42 ? t.text.slice(0, 40).trimEnd() + "…" : t.text;
  return { id: thoughtNodeId(t.id), type: "PersonalThought", label, text: t.text, createdAt: t.createdAt };
}

export function buildGraphs(data: GraphData, thoughts: PersonalThought[] = []): GitaGraphs {
  const graph = new MultiDirectedGraph<GraphNode, EdgeAttrs>();
  const path = new UndirectedGraph<{ type: GraphNode["type"] }, PathEdgeAttrs>();
  const nodeById = new Map<string, GraphNode>();

  const nodes: GraphNode[] = [...data.nodes, ...thoughts.map(personalNode)];
  const edges: GraphEdge[] = [...data.edges, ...thoughts.flatMap(personalEdges)];

  for (const n of nodes) {
    graph.addNode(n.id, n);
    path.addNode(n.id, { type: n.type });
    nodeById.set(n.id, n);
  }
  for (const e of edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
    graph.addDirectedEdgeWithKey(edgeKey(e), e.source, e.target, { type: e.type, weight: e.weight ?? 1, props: e.props });
    const cost = RELATIONS[e.type]?.pathCost ?? 3;
    if (path.hasEdge(e.source, e.target)) {
      path.updateEdgeAttributes(e.source, e.target, (a) => ({
        weight: Math.min(a!.weight, cost),
        types: a!.types.includes(e.type) ? a!.types : [...a!.types, e.type],
      }));
    } else {
      path.addUndirectedEdge(e.source, e.target, { weight: cost, types: [e.type] });
    }
  }
  return { graph, path, nodeById, edges };
}

/** All relations (either direction) between two nodes, cheapest first. */
export function relationsBetween(g: GitaGraphs, a: string, b: string) {
  const out: { key: string; type: RelationType; forward: boolean; props?: GraphEdge["props"] }[] = [];
  g.graph.forEachDirectedEdge(a, b, (key, attr) => out.push({ key, type: attr.type, forward: true, props: attr.props }));
  g.graph.forEachDirectedEdge(b, a, (key, attr) => out.push({ key, type: attr.type, forward: false, props: attr.props }));
  return out.sort((x, y) => RELATIONS[x.type].pathCost - RELATIONS[y.type].pathCost);
}

export interface Neighbor {
  id: string;
  node: GraphNode;
  type: RelationType;
  /** true when the relation points from the focus node to the neighbour */
  outgoing: boolean;
  props?: GraphEdge["props"];
  key: string;
}

export function neighbors(g: GitaGraphs, id: string, filter?: (n: Neighbor) => boolean): Neighbor[] {
  if (!g.graph.hasNode(id)) return [];
  const out: Neighbor[] = [];
  g.graph.forEachOutEdge(id, (key, attr, _s, target) => {
    const n = { id: target, node: g.nodeById.get(target)!, type: attr.type, outgoing: true, props: attr.props, key };
    if (!filter || filter(n)) out.push(n);
  });
  g.graph.forEachInEdge(id, (key, attr, source) => {
    const n = { id: source, node: g.nodeById.get(source)!, type: attr.type, outgoing: false, props: attr.props, key };
    if (!filter || filter(n)) out.push(n);
  });
  return out;
}
