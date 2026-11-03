"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, ArrowRight, BookOpen, List, Orbit, PanelRight, Play, Workflow, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { audio } from "@/lib/store/audioStore";
import { isSuggestedEdge, neighbors, type GitaGraphs, type Neighbor } from "@/lib/graph/graphStore";
import { RELATIONS } from "@/lib/graph/relations";
import { typeName } from "@/lib/graph/palette";
import { useIsMobile } from "@/lib/hooks/useMedia";
import type { Chain, GraphNode, RelationType, Verse, VersesDoc } from "@/lib/types";
import { NodeGlyph } from "@/components/ui/primitives";
import { NodePicker } from "./NodePicker";
import { getReadingPosition } from "@/lib/store/readingPosition";

type Role = "up" | "core" | "down";
interface LData extends Record<string, unknown> {
  role: Role;
  nodeId?: string;
  title: string;
  subtitle?: string;
  sa?: string;
  relation?: string;
  /** curated relations are drawn solid; word matches and sequence dashed */
  curated?: boolean;
  verse?: Verse;
  node?: GraphNode;
  kind: "verse" | "entity" | "school" | "core-verse" | "core-entity" | "heading";
}
type LNode = Node<LData>;

const W = 248;
const H: Record<string, number> = { verse: 98, entity: 72, school: 78, heading: 26 };
const CORE_W = { "core-verse": 400, "core-entity": 340 };
const snippet = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function itemFor(nb: Neighbor, role: Role, verb: string, versesById: Map<string, Verse>): LData {
  const n = nb.node;
  const why = typeof nb.props?.why === "string" ? nb.props.why : undefined;
  // Solid lines for curated links and for connections the person kept; dashed for everything unconfirmed.
  const group = RELATIONS[nb.type].group;
  const curated = group === "curated" || (group === "personal" && !isSuggestedEdge(nb.props));
  if (n.type === "Verse") return { role, nodeId: n.id, kind: "verse", title: `BG ${n.ref}`, sa: n.sa, subtitle: why || snippet(n.snippet), relation: verb, curated, verse: versesById.get(n.id), node: n };
  const sub = "en" in n ? n.en : n.type === "Chapter" ? n.title : n.type === "Character" ? n.role : n.type === "LifeDilemma" ? snippet(n.desc, 80) : undefined;
  return { role, nodeId: n.id, kind: "entity", title: n.type === "Chapter" ? `Chapter ${n.number}` : n.label, sa: "sa" in n ? n.sa : n.type === "Chapter" ? n.name : undefined, subtitle: why || sub, relation: verb, curated, node: n };
}

function buildLineage(g: GitaGraphs, focus: string, versesById: Map<string, Verse>, versesDoc: VersesDoc): LData[] {
  const n = g.nodeById.get(focus);
  if (!n) return [];
  const all = neighbors(g, focus);
  const pick = (types: RelationType[], outgoing: boolean, limit: number, role: Role, sort?: (a: Neighbor, b: Neighbor) => number) => {
    const list = all.filter((x) => types.includes(x.type) && x.outgoing === outgoing);
    if (sort) list.sort(sort);
    return list.slice(0, limit).map((x) => itemFor(x, role, outgoing ? RELATIONS[x.type].verb : RELATIONS[x.type].inverse, versesById));
  };
  const out: LData[] = [];

  if (n.type === "Verse") {
    const v = versesById.get(n.id);
    out.push({ role: "core", nodeId: n.id, kind: "core-verse", title: `BG ${n.ref}`, verse: v, node: n });
    out.push(...pick(["SPOKE"], false, 1, "up"));
    out.push(...pick(["ANSWERS_QUESTION_IN"], true, 3, "up"));
    out.push(...pick(["ECHOES_VERSE"], false, 2, "up"));
    out.push(...pick(["ADDRESSES_DILEMMA"], true, 3, "up"));
    out.push(...pick(["DEPICTS_STATE"], true, 2, "up"));
    out.push(...pick(["NEXT_VERSE"], false, 1, "up"));
    out.push(...pick(["ANSWERS_QUESTION_IN"], false, 4, "down"));
    out.push(...pick(["ECHOES_VERSE", "CULMINATES_IN"], true, 3, "down"));
    out.push(...pick(["HEALS", "CULTIVATES"], true, 4, "down"));
    out.push(...pick(["DEFINES_CONCEPT"], true, 3, "down"));
    if (out.filter((x) => x.role === "down" && x.node?.type === "SanskritConcept").length < 2) out.push(...pick(["MENTIONS_CONCEPT"], true, 2, "down"));
    out.push(...pick(["NEXT_VERSE"], true, 1, "down"));
    if (v?.commentaryAuthors.length) {
      const bySchool = new Map<string, string[]>();
      for (const id of v.commentaryAuthors) {
        const a = versesDoc.authors.find((x) => x.id === id);
        if (!a?.school) continue;
        bySchool.set(a.school, [...(bySchool.get(a.school) || []), a.name.replace(/^(Sri|Swami|Shri|Dr\.) /, "")]);
      }
      // One card for the commentarial traditions: they are context, not lineage, and should not dominate the layout.
      if (bySchool.size) out.push({ role: "down", kind: "school", title: `${bySchool.size} commentarial ${bySchool.size === 1 ? "tradition" : "traditions"}`, subtitle: [...bySchool.keys()].join(", "), relation: "is commented on in", curated: false });
    }
  } else {
    const sub = "en" in n ? n.en : n.type === "Chapter" ? n.meaning : n.type === "Character" ? n.role : n.type === "PersonalThought" ? n.text : undefined;
    const title = n.type === "Chapter" ? n.title : n.type === "PersonalThought" ? "Your thought" : n.label;
    out.push({ role: "core", nodeId: n.id, kind: "core-entity", title, sa: "sa" in n ? n.sa : n.type === "Chapter" ? n.name : undefined, subtitle: sub, node: n });
    const versesFirst = (a: Neighbor, b: Neighbor) => (b.node.type === "Verse" ? 1 : 0) - (a.node.type === "Verse" ? 1 : 0);
    switch (n.type) {
      case "Emotion":
        out.push(...pick(["CAUSES_STATE"], false, 3, "up"), ...pick(["EVOKES_STATE"], false, 3, "up"), ...pick(["DEPICTS_STATE"], false, 3, "up"));
        out.push(...pick(["CAUSES_STATE"], true, 3, "down"), ...pick(["ANTIDOTE_TO"], false, 4, "down"), ...pick(["HEALS", "CULTIVATES"], false, 5, "down"));
        break;
      case "SanskritConcept":
        out.push(...pick(["EXPOUNDS"], false, 2, "up"), ...pick(["CAUSES_STATE"], false, 2, "up"), ...pick(["DEFINES_CONCEPT"], false, 5, "up"));
        out.push(...pick(["ANTIDOTE_TO"], true, 4, "down"), ...pick(["CAUSES_STATE"], true, 3, "down"), ...pick(["RESOLVED_THROUGH"], false, 4, "down"));
        break;
      case "LifeDilemma":
        out.push(...pick(["EVOKES_STATE"], true, 4, "up"));
        out.push(...pick(["ADDRESSES_DILEMMA"], false, 6, "down", versesFirst), ...pick(["RESOLVED_THROUGH"], true, 3, "down"));
        break;
      case "Character":
        out.push(...pick(["ADDRESSES"], false, 3, "up"), ...pick(["ADDRESSES"], true, 2, "down"), ...pick(["MENTIONS_CHARACTER"], false, 6, "down"));
        break;
      case "Chapter":
        out.push(...pick(["NEXT_CHAPTER"], false, 1, "up"), ...pick(["EXPOUNDS"], true, 5, "down"), ...pick(["NEXT_CHAPTER"], true, 1, "down"));
        break;
      case "PersonalThought": {
        // The person's own connections first; unconfirmed suggestions grouped apart so they never read as endorsed.
        const mine = all.filter((x) => RELATIONS[x.type].group === "personal");
        out.push(...mine.filter((x) => !x.outgoing).slice(0, 4).map((x) => itemFor(x, "up", RELATIONS[x.type].inverse, versesById)));
        out.push(...mine.filter((x) => x.outgoing && !isSuggestedEdge(x.props)).slice(0, 6).map((x) => itemFor(x, "down", RELATIONS[x.type].verb, versesById)));
        out.push(...mine.filter((x) => x.outgoing && isSuggestedEdge(x.props)).slice(0, 4).map((x) => itemFor(x, "down", "suggested, not confirmed", versesById)));
        break;
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((x) => {
    const k = `${x.role}|${x.nodeId || x.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

interface Group {
  role: "up" | "down";
  relation: string;
  items: LData[];
}
function groupItems(items: LData[]): Group[] {
  const groups: Group[] = [];
  for (const it of items) {
    if (it.role === "core") continue;
    const rel = it.relation || "related to";
    let g = groups.find((x) => x.role === it.role && x.relation === rel);
    if (!g) groups.push((g = { role: it.role, relation: rel, items: [] }));
    g.items.push(it);
  }
  return groups;
}

/** Deterministic layout: the focus in the middle, what leads to it on the left, what follows on the right. */
function layout(items: LData[]): { nodes: LNode[]; edges: Edge[] } {
  const core = items.find((x) => x.role === "core");
  if (!core) return { nodes: [], edges: [] };
  const coreW = CORE_W[core.kind as keyof typeof CORE_W] ?? 340;
  const coreH = core.kind === "core-verse" ? 300 : 190;
  const groups = groupItems(items);
  const maxCol = Math.max(760, coreH + 260);
  const nodes: LNode[] = [{ id: "core", type: "core", position: { x: -coreW / 2, y: -coreH / 2 }, data: core, draggable: false, selectable: false }];
  const edges: Edge[] = [];

  for (const role of ["up", "down"] as const) {
    const gs = groups.filter((g) => g.role === role);
    // pack whole groups into columns
    const cols: { groups: Group[]; h: number }[] = [];
    for (const g of gs) {
      const gh = H.heading + g.items.reduce((s, it) => s + H[it.kind] + 8, 0);
      const col = cols[cols.length - 1];
      if (!col || col.h + gh > maxCol) cols.push({ groups: [g], h: gh });
      else {
        col.groups.push(g);
        col.h += gh + 18;
      }
    }
    cols.forEach((col, ci) => {
      const x = role === "up" ? -coreW / 2 - 104 - W - ci * (W + 40) : coreW / 2 + 104 + ci * (W + 40);
      let y = -col.h / 2;
      col.groups.forEach((g, gi) => {
        nodes.push({ id: `${role}-g${ci}-${gi}`, type: "heading", position: { x, y }, data: { role, kind: "heading", title: cap(g.relation) }, draggable: false, selectable: false });
        y += H.heading;
        g.items.forEach((it, ii) => {
          const id = `${role}-${ci}-${gi}-${ii}`;
          nodes.push({ id, type: it.kind, position: { x, y }, data: it, draggable: false, selectable: false });
          const stroke = it.curated ? "var(--accent-line)" : "var(--line-3)";
          edges.push({
            id: `e-${id}`,
            source: role === "up" ? id : "core",
            target: role === "up" ? "core" : id,
            style: { stroke, strokeWidth: it.curated ? 1.4 : 1.1, strokeDasharray: it.curated ? undefined : "4 4" },
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: it.curated ? "var(--accent)" : "var(--text-4)" },
          });
          y += H[it.kind] + 8;
        });
        y += 18;
      });
    });
  }
  return { nodes, edges };
}

function chainLayout(g: GitaGraphs, chain: Chain): { nodes: LNode[]; edges: Edge[] } {
  const perRow = 4;
  const nodes: LNode[] = chain.steps.map((id, i) => {
    const n = g.nodeById.get(id);
    const row = Math.floor(i / perRow);
    const col = row % 2 === 0 ? i % perRow : perRow - 1 - (i % perRow);
    return { id: `c${i}`, type: "entity", position: { x: col * (W + 80), y: row * 150 }, data: { role: "down", nodeId: id, kind: "entity", title: n?.label || id, sa: n && "sa" in n ? n.sa : undefined, subtitle: n && "en" in n ? n.en : undefined, node: n }, draggable: false, selectable: false } as LNode;
  });
  const edges: Edge[] = chain.steps.slice(1).map((_, i) => {
    const sameRow = Math.floor(i / perRow) === Math.floor((i + 1) / perRow);
    const forward = Math.floor(i / perRow) % 2 === 0;
    return {
      id: `ce${i}`,
      source: `c${i}`,
      target: `c${i + 1}`,
      sourceHandle: sameRow ? (forward ? null : "ls") : "b",
      targetHandle: sameRow ? (forward ? null : "rt") : "t",
      type: "smoothstep",
      style: { stroke: "var(--accent-line)", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--accent)" },
    };
  });
  return { nodes, edges };
}

// ── node renderers ─────────────────────────────────────────────────────────────────────────────
const handle = "!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-3";
const Handles = () => (
  <>
    <Handle type="target" position={Position.Left} className={handle} />
    <Handle type="source" position={Position.Right} className={handle} />
    <Handle id="ls" type="source" position={Position.Left} className="!opacity-0" />
    <Handle id="rt" type="target" position={Position.Right} className="!opacity-0" />
    <Handle id="t" type="target" position={Position.Top} className="!opacity-0" />
    <Handle id="b" type="source" position={Position.Bottom} className="!opacity-0" />
  </>
);
const card = "rounded-2 border border-line-2 bg-surface px-3 py-2.5 shadow-[var(--shadow-1)] transition-colors hover:border-line-3 hover:bg-surface-2 cursor-pointer";

const HeadingLabel = memo(function HeadingLabel({ data }: NodeProps<LNode>) {
  return <div className="w-[248px] cursor-default truncate pb-1 text-[12.5px] font-medium text-text-3">{data.title}</div>;
});

const VerseNodeView = memo(function VerseNodeView({ data }: NodeProps<LNode>) {
  return (
    <div className={`${card} w-[248px]`}>
      <Handles />
      <div className="flex items-center gap-2">
        <NodeGlyph kind="verse" />
        <span className="text-[13.5px] font-semibold text-text">{data.title}</span>
      </div>
      {data.sa && <div className="deva mt-0.5 truncate text-[14px] !leading-6 text-text-2">{data.sa}</div>}
      {data.subtitle && <div className="line-clamp-2 text-[12.5px] leading-[1.05rem] text-text-3">{data.subtitle}</div>}
    </div>
  );
});

const EntityNodeView = memo(function EntityNodeView({ data }: NodeProps<LNode>) {
  return (
    <div className={`${card} w-[248px]`}>
      <Handles />
      <div className="flex items-center gap-2">
        {data.node && <NodeGlyph node={data.node} />}
        <span className="min-w-0 truncate text-[14px] font-semibold text-text">{data.title}</span>
        {data.sa && <span className="deva ml-auto shrink-0 truncate pl-1 text-[13px] !leading-5 text-text-3">{data.sa}</span>}
      </div>
      {data.subtitle && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-[1.05rem] text-text-3">{data.subtitle}</div>}
    </div>
  );
});

const SchoolNodeView = memo(function SchoolNodeView({ data }: NodeProps<LNode>) {
  return (
    <div className="w-[248px] rounded-2 border border-dashed border-line-2 bg-bg px-3 py-2">
      <Handles />
      <div className="text-[13.5px] font-medium text-text">{data.title}</div>
      <div className="line-clamp-2 text-[12.5px] leading-[1.05rem] text-text-3">{data.subtitle}</div>
    </div>
  );
});

const CoreNodeView = memo(function CoreNodeView({ data }: NodeProps<LNode>) {
  const setHoverStem = useGita((s) => s.setHoverStem);
  const enAuthor = useGita((s) => s.enAuthor);
  const v = data.verse;
  const details = (e: React.MouseEvent) => (e.stopPropagation(), data.nodeId && useGita.getState().select(data.nodeId, { fly: false }));
  if (data.kind === "core-verse" && v) {
    return (
      <div className="nodrag w-[400px] cursor-default rounded-3 border border-accent-line bg-surface px-5 pb-4 pt-4 shadow-[var(--shadow-2)]">
        <Handles />
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="label">Verse</div>
            <div className="text-[20px] font-semibold tracking-[-0.01em] text-text">{data.title}</div>
          </div>
          <div className="flex gap-1">
            <button className="btn btn-sm" onClick={(e) => (e.stopPropagation(), audio.playVerse(v.id))} aria-label="Listen">
              <Play size={13} />
            </button>
            <button className="btn btn-sm" onClick={details}>
              <PanelRight size={13} /> Details
            </button>
          </div>
        </div>
        <div className="deva mt-2 text-[18px] leading-[1.75] text-text">
          {v.sanskrit.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div className="serif mt-1 line-clamp-2 text-[13px] italic leading-snug text-text-3">{v.iast.join(" ")}</div>
        <p className="serif mt-3 line-clamp-3 border-t border-line pt-3 text-[14px] leading-[1.55] text-text-2">{v.translations.en?.[String(enAuthor)]}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {v.padaccheda.slice(0, 12).map((p, i) => (
            <span key={i} className="chip serif cursor-help !min-h-0 !py-0 italic" onMouseEnter={() => setHoverStem(p.k[0] || null)} onMouseLeave={() => setHoverStem(null)} title={p.m}>
              {p.w}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="nodrag w-[340px] cursor-default rounded-3 border border-accent-line bg-surface px-5 py-4 shadow-[var(--shadow-2)]">
      <Handles />
      <div className="flex items-center gap-2">
        {data.node && <NodeGlyph node={data.node} />}
        <span className="label">{data.node ? typeName(data.node) : ""}</span>
        <button className="btn btn-sm ml-auto" onClick={details}>
          <PanelRight size={13} /> Details
        </button>
      </div>
      <div className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.015em] text-text">{data.title}</div>
      {data.sa && <div className="deva mt-0.5 text-[17px] text-text-2">{data.sa}</div>}
      {data.subtitle &&
        (data.node?.type === "PersonalThought" ? (
          <p className="serif mt-1.5 line-clamp-6 whitespace-pre-wrap text-[15px] leading-[1.55] text-text [overflow-wrap:anywhere]">{data.subtitle}</p>
        ) : (
          <div className="serif mt-0.5 text-[14px] italic text-text-3">{data.subtitle}</div>
        ))}
    </div>
  );
});

const nodeTypes = { verse: VerseNodeView, entity: EntityNodeView, school: SchoolNodeView, core: CoreNodeView, heading: HeadingLabel };

function useFocus() {
  const lineageFocus = useGita((s) => s.lineageFocus);
  const selectedId = useGita((s) => s.selectedId);
  const graphs = useGita((s) => s.graphs);
  const [history, setHistory] = useState<string[]>([]);
  const focus = lineageFocus && graphs?.graph.hasNode(lineageFocus) ? lineageFocus : "BG_2.47";
  const focusRef = useRef(focus);
  focusRef.current = focus;
  // Opening Lineage with nothing selected and nothing traced yet: start from the verse being read, not a fixed verse.
  useEffect(() => {
    const s = useGita.getState();
    if (s.selectedId) return;
    let traced: string | null = null;
    try {
      traced = localStorage.getItem("gitaviswa:lineage-focus");
    } catch {}
    const pos = getReadingPosition();
    if (!traced && pos && s.graphs?.graph.hasNode(pos.verse) && pos.verse !== s.lineageFocus) useGita.setState({ lineageFocus: pos.verse });
  }, []);
  const go = (id: string, push = true) => {
    if (id === focusRef.current) return;
    if (push) setHistory((h) => [...h.slice(-30), focusRef.current]);
    useGita.setState({ lineageFocus: id });
    // Keep the details panel in step when it is open.
    if (useGita.getState().selectedId) useGita.getState().select(id, { fly: false });
  };
  // Opening a neighbour's details without moving the focus (a personal map keeps the thought in the middle).
  const inspected = useRef<string | null>(null);
  const inspect = (id: string) => {
    inspected.current = id;
    useGita.getState().select(id, { fly: false });
  };
  // Selecting something elsewhere (search, citations, the details panel) refocuses the lineage.
  useEffect(() => {
    if (selectedId && selectedId === inspected.current) {
      inspected.current = null;
      return;
    }
    if (selectedId && selectedId !== focusRef.current) {
      setHistory((h) => [...h.slice(-30), focusRef.current]);
      useGita.setState({ lineageFocus: selectedId });
    }
  }, [selectedId]);
  const back = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    go(prev, false);
  };
  return { focus, go, inspect, back, canGoBack: history.length > 0 };
}

function Toolbar({ focusNode, chain, setChainId, chainId, canGoBack, back, go, listView, setListView }: { focusNode?: GraphNode; chain: Chain | null | undefined; chainId: string | null; setChainId: (id: string | null) => void; canGoBack: boolean; back: () => void; go: (id: string) => void; listView: boolean | null; setListView: (on: boolean) => void }) {
  const graphData = useGita((s) => s.graphData);
  const [picking, setPicking] = useState(false);
  return (
    <div className="z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-bg px-3 py-2 sm:px-4">
      <button className="btn btn-ghost btn-icon" disabled={!canGoBack && !chain} onClick={() => (chain ? setChainId(null) : back())} aria-label="Back" title="Back">
        <ArrowLeft size={16} />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {chain ? <Workflow size={15} className="shrink-0 text-accent-text" /> : focusNode && <NodeGlyph node={focusNode} />}
        <div className="min-w-0">
          <div className="label">{chain ? "Causal chain" : focusNode?.type === "PersonalThought" ? "Map of your thought" : "Lineage of"}</div>
          <div className="truncate text-[14px] font-semibold leading-5 text-text">{chain ? chain.title : focusNode ? (focusNode.type === "Verse" ? `BG ${focusNode.ref}` : focusNode.type === "Chapter" ? `Chapter ${focusNode.number}: ${focusNode.title}` : focusNode.label) : ""}</div>
        </div>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        {picking ? (
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:w-72">
            <div className="min-w-0 flex-1">
              <NodePicker label="Focus on" value={null} onChange={(id) => (id && (setChainId(null), go(id)), setPicking(false))} placeholder="Focus on a verse or idea" />
            </div>
            <button className="btn btn-ghost btn-icon" onClick={() => setPicking(false)} aria-label="Cancel">
              <X size={15} />
            </button>
          </div>
        ) : (
          <button className="btn flex-1 sm:flex-none" onClick={() => setPicking(true)}>
            Change focus
          </button>
        )}
        <select className="field field-sm !w-auto min-w-0 flex-1 sm:max-w-[15rem] sm:flex-none" aria-label="Causal chains" value={chainId || ""} onChange={(e) => setChainId(e.target.value || null)}>
          <option value="">Causal chains</option>
          {graphData?.chains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        {listView !== null && (
          <button className="btn btn-icon hidden sm:inline-flex" aria-pressed={listView} onClick={() => setListView(!listView)} title={listView ? "Show as a diagram" : "Show as a list (keyboard and screen-reader friendly)"} aria-label="Show as a list">
            <List size={15} />
          </button>
        )}
        {focusNode && !chain && (
          <button className="btn btn-icon hidden sm:inline-flex" onClick={() => (useGita.getState().setView("cosmos"), useGita.getState().fly(focusNode.id))} title="See in the 3D graph" aria-label="See in the 3D graph">
            <Orbit size={15} />
          </button>
        )}
        {focusNode?.type === "Verse" && !chain && (
          <button className="btn btn-icon hidden sm:inline-flex" onClick={() => useGita.getState().openChapter(focusNode.chapter)} title={`Read chapter ${focusNode.chapter}`} aria-label={`Read chapter ${focusNode.chapter}`}>
            <BookOpen size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Narrow canvases: the same lineage as a vertical reading list, far easier to use than a pannable diagram. */
function LineageList({ items, go }: { items: LData[]; go: (id: string) => void }) {
  const alone = items.length <= 1;
  const groups = groupItems(items);
  const core = items.find((x) => x.role === "core");
  const enAuthor = useGita((s) => s.enAuthor);
  const Item = ({ it }: { it: LData }) => (
    <li>
      <button className="row" disabled={!it.nodeId} onClick={() => it.nodeId && go(it.nodeId)}>
        {it.node ? <NodeGlyph node={it.node} className="mt-1.5" /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-line-3" />}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[13.5px] font-medium text-text">{it.title}</span>
            {it.sa && it.kind !== "verse" && <span className="deva truncate text-[12px] !leading-5 text-text-3">{it.sa}</span>}
          </span>
          {it.subtitle && <span className="block line-clamp-2 text-[12px] leading-4 text-text-3">{it.subtitle}</span>}
        </span>
      </button>
    </li>
  );
  const side = (role: "up" | "down", title: string) => {
    const gs = groups.filter((g) => g.role === role);
    if (!gs.length) return null;
    return (
      <section>
        <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-text-2">
          <ArrowRight size={14} className="text-text-3" />
          {title}
        </div>
        <div className="space-y-4 border-l border-line pl-3">
          {gs.map((g) => (
            <div key={g.relation}>
              <div className="label mb-1">{cap(g.relation)}</div>
              <ul className="-mx-2.5">
                {g.items.map((it, i) => (
                  <Item key={i} it={it} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    );
  };
  return (
    <div className="h-full overflow-y-auto px-4 pb-10 pt-4">
      <div className="space-y-6">
        {side("up", "What leads to it")}
        {core && (
          <div className="rounded-3 border border-accent-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-semibold text-text">{core.title}</span>
              <button className="btn btn-sm" onClick={() => core.nodeId && useGita.getState().select(core.nodeId, { fly: false })}>
                <PanelRight size={13} /> Details
              </button>
            </div>
            {core.verse ? (
              <>
                <div className="deva mt-2 text-[17px] leading-[1.75] text-text">
                  {core.verse.sanskrit.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
                <p className="serif mt-2 line-clamp-4 text-[14.5px] leading-[1.55] text-text-2">{core.verse.translations.en?.[String(enAuthor)]}</p>
              </>
            ) : (
              <>
                {core.sa && <div className="deva text-[16px] text-text-2">{core.sa}</div>}
                {core.subtitle &&
                  (core.node?.type === "PersonalThought" ? (
                    <p className="serif mt-1.5 whitespace-pre-wrap text-[15px] leading-[1.6] text-text [overflow-wrap:anywhere]">{core.subtitle}</p>
                  ) : (
                    <div className="serif text-[14px] italic text-text-3">{core.subtitle}</div>
                  ))}
              </>
            )}
            {alone && core.node?.type === "PersonalThought" && <p className="mt-3 border-t border-line pt-3 text-[13px] leading-5 text-text-3">It stands on its own, and that is complete. Open Details to add a connection whenever you want one.</p>}
          </div>
        )}
        {side("down", "What follows from it")}
        {groups.length === 0 && <p className="text-center text-[13px] text-text-3">No curated connections for this yet.</p>}
      </div>
    </div>
  );
}

/** A causal chain as a vertical sequence, for narrow canvases. */
function ChainList({ chain, go }: { chain: Chain; go: (id: string) => void }) {
  const graphs = useGita((s) => s.graphs);
  return (
    <div className="h-full overflow-y-auto px-4 pb-10 pt-4">
      <p className="serif text-[14.5px] leading-[1.55] text-text-2">{chain.summary}</p>
      <div className="num mt-2 text-[12px] font-medium text-accent-text">{chain.verses.map((v) => v.replace("BG_", "")).join("  →  ")}</div>
      <ol className="mt-5">
        {chain.steps.map((id, i) => {
          const n = graphs?.nodeById.get(id);
          return (
            <li key={id} className="relative pb-1 pl-6">
              {i < chain.steps.length - 1 && <span className="absolute bottom-0 left-[7px] top-5 w-px bg-accent-line" aria-hidden />}
              <span className="absolute left-[3px] top-[11px]">{n && <NodeGlyph node={n} />}</span>
              <button className="row !px-2" onClick={() => go(id)}>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-text">{n?.label || id}</span>
                  {n && "en" in n && <span className="block text-[12px] text-text-3">{n.en}</span>}
                </span>
              </button>
              {i < chain.steps.length - 1 && <div className="pb-1 pl-2 text-[11.5px] text-text-3">gives rise to</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Flow() {
  const graphs = useGita((s) => s.graphs);
  const versesById = useGita((s) => s.versesById);
  const versesDoc = useGita((s) => s.versesDoc);
  const graphData = useGita((s) => s.graphData);
  const mobile = useIsMobile();
  const { focus, go, inspect, back, canGoBack } = useFocus();
  // A personal map keeps the thought in the middle: a neighbour opens beside it rather than taking its place.
  const thoughtFocus = graphs?.nodeById.get(focus)?.type === "PersonalThought";
  const open = (id: string) => (thoughtFocus ? inspect(id) : go(id));
  const [preferList, setPreferList] = useState(() => {
    try {
      return localStorage.getItem("gitaviswa:lineage-list") === "1";
    } catch {
      return false;
    }
  });
  const setListView = (on: boolean) => {
    setPreferList(on);
    try {
      localStorage.setItem("gitaviswa:lineage-list", on ? "1" : "0");
    } catch {}
  };
  const [chainId, setChainId] = useState<string | null>(null);
  // A chain requested from elsewhere (the home page) opens once, then the toolbar owns it.
  const pendingChain = useGita((s) => s.lineageChain);
  useEffect(() => {
    if (!pendingChain) return;
    setChainId(pendingChain);
    useGita.setState({ lineageChain: null });
  }, [pendingChain]);
  const { fitView, setViewport } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const forcedList = mobile || narrow;
  const list = forcedList || preferList;

  const chain = chainId ? graphData?.chains.find((c) => c.id === chainId) : null;
  const items = useMemo(() => (graphs && versesDoc ? buildLineage(graphs, focus, versesById, versesDoc) : []), [graphs, versesDoc, versesById, focus]);
  const { nodes, edges } = useMemo(() => {
    if (!graphs) return { nodes: [], edges: [] };
    if (chain) return chainLayout(graphs, chain);
    return layout(items);
  }, [graphs, chain, items]);

  // Fit when the diagram fits at a legible zoom; otherwise start at its left edge (the reading direction) and let the
  // reader pan right, rather than shrinking every card below readability.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = wrapRef.current;
      if (!el || !nodes.length) return;
      const bottom = (n: LNode) => n.position.y + (n.type === "core" ? (n.data.kind === "core-verse" ? 320 : 190) : H[n.data.kind] ?? 80);
      const minX = Math.min(...nodes.map((n) => n.position.x)) - 24;
      const maxX = Math.max(...nodes.map((n) => n.position.x + (n.type === "core" ? 400 : W))) + 24;
      const minY = Math.min(...nodes.map((n) => n.position.y)) - 24;
      const maxY = Math.max(...nodes.map(bottom)) + 24;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const fit = Math.min(cw / (maxX - minX), ch / (maxY - minY));
      const MIN = 0.74;
      if (fit >= MIN) fitView({ padding: 0.08, duration: 400, maxZoom: 1 });
      else {
        const tall = (maxY - minY) * MIN > ch;
        setViewport({ x: -minX * MIN + 16, y: tall ? -minY * MIN + 12 : ch / 2 - ((minY + maxY) / 2) * MIN, zoom: MIN }, { duration: 400 });
      }
    }, 40);
    return () => clearTimeout(t);
  }, [nodes, fitView, setViewport, list]);

  const focusNode = graphs?.nodeById.get(focus);
  const empty = !chain && items.length <= 1;
  const sample = items.find((x) => x.role === "down" && x.nodeId) || items.find((x) => x.role === "up" && x.nodeId);
  const coreItem = items.find((x) => x.role === "core");
  const example = sample && coreItem ? `${coreItem.title} ${sample.relation} ${sample.title}` : "";

  return (
    <div ref={outerRef} className="absolute inset-0 flex flex-col bg-bg">
      <Toolbar focusNode={focusNode} chain={chain} chainId={chainId} setChainId={setChainId} canGoBack={canGoBack} back={back} go={go} listView={forcedList || chain ? null : preferList} setListView={setListView} />
      {list ? (
        <div className="min-h-0 flex-1">
          {chain ? (
            <ChainList
              chain={chain}
              go={(id) => {
                setChainId(null);
                go(id);
              }}
            />
          ) : (
            <LineageList items={items} go={open} />
          )}
        </div>
      ) : (
        <div ref={wrapRef} className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => {
              const d = n.data as LData;
              if (n.type === "core" || n.type === "heading" || !d.nodeId) return;
              setChainId(null);
              open(d.nodeId);
            }}
            fitView
            minZoom={0.25}
            maxZoom={1.6}
            nodesConnectable={false}
            nodesDraggable={false}
            panOnScroll
            zoomOnPinch
            proOptions={{ hideAttribution: false }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--line-2)" />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
          {!chain && example && (
            <div className="hud pointer-events-none absolute bottom-3 left-3 hidden max-w-[calc(100%-5rem)] items-center gap-4 px-3 py-2 text-[12px] text-text-3 md:flex">
              <span className="min-w-0 truncate">
                Read each heading from the centre: <span className="text-text-2">“{example}”</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-5 border-t-[1.5px] border-accent-line" /> {thoughtFocus ? "kept by you" : "curated"}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-5 border-t-[1.5px] border-dashed border-line-3" /> {thoughtFocus ? "suggested, not confirmed" : "word match or sequence"}
              </span>
            </div>
          )}
          {chain && (
            <div className="hud absolute bottom-3 left-3 max-w-[min(34rem,calc(100%-5rem))] px-4 py-3">
              <div className="num text-[12px] font-medium text-accent-text">{chain.verses.map((v) => v.replace("BG_", "")).join("  →  ")}</div>
              <p className="serif mt-1 text-[14px] leading-[1.5] text-text-2">{chain.summary}</p>
              <p className="mt-1.5 text-[12px] text-text-3">Each arrow reads “gives rise to”. Select a step to see its lineage.</p>
            </div>
          )}
          {empty && (
            <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
              <div className="hud px-4 py-2 text-[13px] text-text-2">{thoughtFocus ? "This thought stands on its own, and that is complete. Open Details to add a connection." : "No curated connections for this yet. Try another focus."}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LineageGraph2D() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
