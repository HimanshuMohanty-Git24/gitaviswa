"use client";
import { useMemo, useState } from "react";
import { ChevronDown, Orbit } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { resolveCitation } from "@/lib/graphrag/citations";
import type { Retrieval } from "@/lib/graphrag/engine";
import { NodeGlyph } from "@/components/ui/primitives";

export function focusIds(ids: string[], label: string) {
  const s = useGita.getState();
  if (!ids.length || !s.graphs) return;
  const set = new Set(ids);
  const edges = new Set<string>();
  for (const id of ids) {
    if (!s.graphs.graph.hasNode(id)) continue;
    s.graphs.graph.forEachOutEdge(id, (key, _a, _s, t) => {
      if (set.has(t)) edges.add(key);
    });
  }
  s.setHighlight({ nodes: set, edges, label, source: "chat" });
  s.select(ids[0]);
}

/** An inline citation in an answer ([BG 2.47], [Concept: Samatva]…): a chip that opens the node. */
export function CitationChip({ raw }: { raw: string }) {
  const graphData = useGita((s) => s.graphData);
  const graphs = useGita((s) => s.graphs);
  const c = useMemo(() => (graphData && graphs ? resolveCitation(raw, graphData.nodes, (id) => graphs.graph.hasNode(id)) : null), [raw, graphData, graphs]);
  if (!c || c.kind === "unknown") return <span className="text-text-3">{raw}</span>;
  const n = graphs?.nodeById.get(c.ids[0]);
  return (
    <button className="chip mx-0.5 !min-h-0 !py-0 align-baseline font-sans !text-[12px] not-italic" onClick={() => focusIds(c.ids, c.label)} title={`Open ${c.label}`}>
      {n && <NodeGlyph node={n} />}
      {c.label}
    </button>
  );
}

/** What an answer was grounded in. Collapsed to one line by default; expands to the cited nodes. */
export function SubgraphCitationChips({ retrieval }: { retrieval: Retrieval }) {
  const graphs = useGita((s) => s.graphs);
  const view = useGita((s) => s.view);
  const setHighlight = useGita((s) => s.setHighlight);
  const [open, setOpen] = useState(false);
  if (!graphs) return null;
  const show = () => {
    setHighlight({ nodes: new Set(retrieval.subgraph.nodes), edges: new Set(retrieval.subgraph.edges), label: `Answer to “${retrieval.query.slice(0, 48)}${retrieval.query.length > 48 ? "…" : ""}”`, source: "chat" });
    if (view !== "cosmos") useGita.getState().setView("cosmos");
  };
  const items = [...retrieval.emotions, ...retrieval.dilemmas, ...retrieval.concepts, ...retrieval.verses.slice(0, 6)];
  return (
    <div className="mt-3 rounded-2 border border-line bg-surface-2">
      <div className="flex items-center gap-1 pr-1.5">
        <button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-[12.5px] text-text-2" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown size={14} className={`shrink-0 text-text-3 transition-transform ${open ? "" : "-rotate-90"}`} />
          <span className="truncate">
            Based on <span className="num font-medium text-text">{retrieval.subgraph.nodes.length}</span> connected points
          </span>
        </button>
        <button className="btn btn-sm shrink-0" onClick={show} title="Light up this part of the graph">
          <Orbit size={13} /> Show in graph
        </button>
      </div>
      {open && (
        <div className="border-t border-line px-3 pb-3 pt-2.5">
          <div className="flex flex-wrap gap-1">
            {items.map((it) => {
              const n = graphs.nodeById.get(it.id);
              if (!n) return null;
              return (
                <button key={it.id} className="chip" title={it.reasons.join("; ")} onClick={() => focusIds([it.id], n.label)}>
                  <NodeGlyph node={n} />
                  {n.type === "Verse" ? `BG ${n.ref}` : n.label}
                </button>
              );
            })}
          </div>
          <div className="num mt-2 text-[11.5px] text-text-3">
            {retrieval.subgraph.edges.length} relationships, {retrieval.searchMode} search, {retrieval.timings.total.toFixed(0)} ms
          </div>
        </div>
      )}
    </div>
  );
}
