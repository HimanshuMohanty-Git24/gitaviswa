"use client";
import { useState } from "react";
import { ArrowDownUp, LoaderCircle, Route, Sparkles } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { useConnection } from "@/lib/store/settingsStore";
import { findSutraPath, SUTRA_PRESETS, describeNode, type SutraPath } from "@/lib/graph/pathfinder";
import { RELATIONS } from "@/lib/graph/relations";
import { streamFromApi } from "@/lib/llm/browser";
import { buildContext, type Retrieval } from "@/lib/graphrag/engine";
import { NodeGlyph, Notice } from "@/components/ui/primitives";
import { NodePicker, nodeTitle } from "./NodePicker";
import { RichText } from "@/components/chat/RichText";

/**
 * Find a path (the Sūtra tracer): the strongest chain of relationships between any two nodes, lit up on the graph and
 * narrated step by step; plus the curated thematic threads that run through the text.
 */
export function SutraPathFinder() {
  const graphs = useGita((s) => s.graphs);
  const graphData = useGita((s) => s.graphData);
  const highlight = useGita((s) => s.highlight);
  const setHighlight = useGita((s) => s.setHighlight);
  const select = useGita((s) => s.select);
  const setSettingsOpen = useGita((s) => s.setSettingsOpen);
  const conn = useConnection();
  const [from, setFrom] = useState<string | null>("BG_1.28");
  const [to, setTo] = useState<string | null>("BG_18.66");
  const [path, setPath] = useState<SutraPath | null>(null);
  const [missing, setMissing] = useState(false);
  const [bridge, setBridge] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"trace" | "threads">("trace");

  const trace = (a = from, b = to) => {
    if (!graphs || !a || !b) return;
    const p = findSutraPath(graphs, a, b);
    setPath(p);
    setMissing(!p);
    setBridge("");
    if (p) setHighlight({ nodes: new Set(p.nodes), edges: new Set(p.steps.map((s) => s.edgeKey)), label: `Path from ${describeNode(graphs.nodeById.get(a))} to ${describeNode(graphs.nodeById.get(b))}`, source: "path", order: p.nodes });
  };

  const explain = async () => {
    const ctx = useGita.getState().ragContext();
    if (!path || !graphs || !ctx) return;
    setBusy(true);
    setBridge("");
    const verses = path.nodes.filter((id) => id.startsWith("BG_")).map((id) => ({ id, score: 1, reasons: [] }));
    const pick = (t: string) => path.nodes.filter((id) => graphs.nodeById.get(id)?.type === t).map((id) => ({ id, score: 1, reasons: [] }));
    const pseudo = { verses, concepts: pick("SanskritConcept"), emotions: pick("Emotion"), dilemmas: pick("LifeDilemma"), chains: [], dialogues: [] } as unknown as Retrieval;
    const context = buildContext(ctx, pseudo) + "\n\n## Path (hop by hop)\n" + path.narration.map((s, i) => `${i + 1}. ${s}`).join("\n");
    const r = await streamFromApi({ mode: "bridge", question: `Explain the bridge from ${describeNode(graphs.nodeById.get(path.nodes[0]))} to ${describeNode(graphs.nodeById.get(path.nodes[path.nodes.length - 1]))}.`, context, onToken: (_t, full) => setBridge(full) });
    if (!r.ok) setBridge(`_${r.error}_`);
    setBusy(false);
  };

  const showThread = (id: string) => {
    if (!graphs || !graphData) return;
    const t = graphData.threads.find((x) => x.id === id);
    if (!t) return;
    const nodes = t.verses.map((r) => `BG_${r}`);
    const edges = new Set<string>();
    for (let i = 1; i < nodes.length; i++) edges.add(`ECHOES_VERSE|${nodes[i - 1]}|${nodes[i]}`);
    setPath(null);
    setHighlight({ nodes: new Set(nodes), edges, label: `Thread: ${t.title}`, source: "thread", order: nodes });
    useGita.getState().fly(nodes[0]);
  };

  return (
    <div>
      <div className="tabs mb-4" role="tablist">
        <button role="tab" className="tab" aria-selected={tab === "trace"} onClick={() => setTab("trace")}>
          Between two points
        </button>
        <button role="tab" className="tab" aria-selected={tab === "threads"} onClick={() => setTab("threads")}>
          Thematic threads
        </button>
      </div>

      {tab === "trace" ? (
        <>
          <p className="mb-3 text-[12.5px] leading-[1.45] text-text-3">Choose any two verses, ideas or states. GitaViśva finds the strongest chain of relationships that connects them.</p>
          <div className="space-y-1.5">
            <NodePicker label="From" value={from} onChange={setFrom} placeholder="From: a verse, idea or feeling" />
            <div className="flex items-center gap-2 pl-1">
              <span className="h-px flex-1 bg-line" />
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => (setFrom(to), setTo(from))} aria-label="Swap start and end" title="Swap">
                <ArrowDownUp size={14} />
              </button>
              <span className="h-px flex-1 bg-line" />
            </div>
            <NodePicker label="To" value={to} onChange={setTo} placeholder="To: a verse, idea or feeling" />
          </div>
          <button className="btn btn-primary mt-3 w-full" disabled={!from || !to} onClick={() => trace()}>
            <Route size={15} /> Show the path
          </button>

          {!path && (
            <div className="mt-4">
              <div className="label mb-2">Try one of these</div>
              <div className="flex flex-wrap gap-1.5">
                {SUTRA_PRESETS.map((p) => (
                  <button key={p.label} className="chip" onClick={() => (setFrom(p.from), setTo(p.to), trace(p.from, p.to))}>
                    {p.label.replace(" → ", " to ").replace("&", "and")}
                  </button>
                ))}
              </div>
            </div>
          )}
          {missing && (
            <div className="mt-3">
              <Notice>These two are not connected by any visible relationship. Try turning more relationship types on under Display.</Notice>
            </div>
          )}

          {path && graphs && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[13px] font-semibold text-text">
                  {path.steps.length} {path.steps.length === 1 ? "step" : "steps"}
                </span>
                <button
                  className="text-[12px] text-text-3 hover:text-text"
                  onClick={() => {
                    setPath(null);
                    if (highlight?.source === "path") setHighlight(null);
                  }}
                >
                  Clear
                </button>
              </div>
              <ol className="relative">
                {path.nodes.map((id, i) => {
                  const n = graphs.nodeById.get(id)!;
                  const step = path.steps[i];
                  return (
                    <li key={id} className="relative pb-0.5 pl-6">
                      {i < path.nodes.length - 1 && <span className="absolute bottom-0 left-[7px] top-4 w-px bg-accent-line" aria-hidden />}
                      <span className="absolute left-[3px] top-[7px] flex h-2.5 w-2.5 items-center justify-center">
                        <NodeGlyph node={n} />
                      </span>
                      <button className="text-left text-[13px] font-medium text-text hover:text-accent-text" onClick={() => select(id)}>
                        {nodeTitle(n)}
                      </button>
                      {step && <div className="pb-2 pt-0.5 text-[12px] text-text-3">{step.forward ? RELATIONS[step.type].verb : RELATIONS[step.type].inverse}</div>}
                    </li>
                  );
                })}
              </ol>
              <div className="mt-3">
                {conn ? (
                  <button className="btn w-full" onClick={explain} disabled={busy}>
                    {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {busy ? "Writing the explanation" : "Explain this path"}
                  </button>
                ) : (
                  <Notice action={<button className="text-[12px] font-medium text-accent-text hover:underline" onClick={() => setSettingsOpen(true, "model")}>Connect</button>}>
                    Connect a language model to have this path explained in prose.
                  </Notice>
                )}
              </div>
              {bridge && (
                <div className="prose-gita mt-3 !text-[14.5px]">
                  <RichText text={bridge} />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] leading-[1.45] text-text-3">Curated progressions of a single idea through the text. Choose one to light it up.</p>
          <ul className="space-y-1">
            {graphData?.threads.map((t) => (
              <li key={t.id}>
                <button className="row flex-col !gap-0.5" data-active={highlight?.label === `Thread: ${t.title}`} onClick={() => showThread(t.id)}>
                  <span className="text-[13px] font-medium text-text">{t.title}</span>
                  <span className="num text-[12px] text-accent-text">{t.verses.join("  →  ")}</span>
                  <span className="text-[12px] leading-4 text-text-3">{t.note}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
