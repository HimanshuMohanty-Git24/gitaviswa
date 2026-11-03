"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Eye, EyeOff, Maximize, Minus, Pause, Plus, Rotate3d, Route, SlidersHorizontal, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { KIND_LAYER, KIND_META, KIND_ORDER, nodeKind, type NodeKind } from "@/lib/graph/palette";
import { useCoarsePointer, useIsMobile } from "@/lib/hooks/useMedia";
import { NodeGlyph } from "@/components/ui/primitives";
import { DisplayPanel } from "./LensPanel";
import { SutraPathFinder } from "./SutraPathFinder";

type Tool = "display" | "path" | "legend" | null;

/** Legend that is also the filter: each row names a kind, shows its mark and count, and toggles its visibility. */
function Legend({ onClose }: { onClose?: () => void }) {
  const layers = useGita((s) => s.layers);
  const toggleLayer = useGita((s) => s.toggleLayer);
  const graphs = useGita((s) => s.graphs);
  const colorBy = useGita((s) => s.colorBy);
  const counts = useMemo(() => {
    const c = {} as Record<NodeKind, number>;
    graphs?.graph.forEachNode((_id, a) => {
      const k = nodeKind(a);
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [graphs]);
  // Afflictive and healing states share the Emotion layer: present them as one toggle with two marks.
  const rows = KIND_ORDER.filter((k) => k !== "healing");
  return (
    <div>
      <ul className="-mx-1">
        {rows.map((k) => {
          const layer = KIND_LAYER[k];
          const on = layers[layer];
          const isState = k === "afflictive";
          const count = isState ? (counts.afflictive || 0) + (counts.healing || 0) : counts[k] || 0;
          return (
            <li key={k}>
              <button
                className={`flex w-full items-center gap-2.5 rounded-[var(--radius-1)] px-1.5 py-[5px] text-left transition-colors hover:bg-surface-3 ${on ? "" : "opacity-55"}`}
                onClick={() => toggleLayer(layer)}
                aria-pressed={on}
                title={`${on ? "Hide" : "Show"} ${isState ? "mental states" : KIND_META[k].label.toLowerCase()}. ${KIND_META[k].hint}.`}
              >
                <span className="flex w-5 shrink-0 items-center justify-center gap-0.5">
                  {isState ? (
                    <>
                      <NodeGlyph kind="afflictive" />
                      <NodeGlyph kind="healing" />
                    </>
                  ) : (
                    <NodeGlyph kind={k} />
                  )}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[12.5px] ${on ? "text-text" : "text-text-3 line-through decoration-text-4"}`}>{isState ? "Mental states" : KIND_META[k].label}</span>
                <span className="num text-[11.5px] text-text-3">{count}</span>
                {on ? <Eye size={13} className="text-text-3" /> : <EyeOff size={13} className="text-text-4" />}
              </button>
              {isState && on && (
                <div className="flex gap-3 pb-1 pl-9 text-[11.5px] text-text-3">
                  <span className="flex items-center gap-1.5">
                    <NodeGlyph kind="afflictive" /> afflictive
                  </span>
                  <span className="flex items-center gap-1.5">
                    <NodeGlyph kind="healing" /> healing
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 border-t border-line pt-2 text-[11.5px] leading-4 text-text-3">
        {colorBy === "label" ? "Larger points are more connected." : colorBy === "chapter" ? "Verses are shaded by chapter, light to deep. Shapes still mark each kind." : "Colours show communities. Shapes still mark each kind."}
      </p>
      {onClose && (
        <button className="btn mt-3 w-full md:hidden" onClick={onClose}>
          Done
        </button>
      )}
    </div>
  );
}

function CameraControls() {
  const camera = useGita((s) => s.camera);
  const autoRotate = useGita((s) => s.autoRotate);
  const setAutoRotate = useGita((s) => s.setAutoRotate);
  const btn = "btn btn-ghost btn-icon rounded-none border-0 h-9 w-9";
  return (
    <div className="hud flex flex-col overflow-hidden !rounded-[var(--radius-2)] p-0" role="toolbar" aria-label="Camera" aria-orientation="vertical">
      <button className={btn} onClick={() => camera("zoomIn")} aria-label="Zoom in" title="Zoom in">
        <Plus size={16} />
      </button>
      <button className={btn} onClick={() => camera("zoomOut")} aria-label="Zoom out" title="Zoom out">
        <Minus size={16} />
      </button>
      <span className="mx-2 h-px bg-line" />
      <button className={btn} onClick={() => camera("fit")} aria-label="Fit everything in view" title="Fit everything in view">
        <Maximize size={15} />
      </button>
      <button className={btn} onClick={() => (setAutoRotate(!autoRotate), autoRotate || camera("home"))} aria-pressed={autoRotate} aria-label={autoRotate ? "Stop rotating" : "Reset view and rotate slowly"} title={autoRotate ? "Stop rotating" : "Reset view and rotate slowly"}>
        {autoRotate ? <Pause size={15} /> : <Rotate3d size={15} />}
      </button>
    </div>
  );
}

/** The Focus / Whole graph switch, compact enough for the phone sheet header. */
export function FocusSwitch({ className = "" }: { className?: string }) {
  const graphMode = useGita((s) => s.graphMode);
  const setGraphMode = useGita((s) => s.setGraphMode);
  const ego = useGita((s) => s.egoSummary);
  const selectedId = useGita((s) => s.selectedId);
  const highlight = useGita((s) => s.highlight);
  if (!selectedId || highlight) return null;
  const count = graphMode === "focus" && ego?.id === selectedId ? (ego.total > ego.shown ? `${ego.shown} of ${ego.total} connections` : `${ego.total} connection${ego.total === 1 ? "" : "s"}`) : "Shown in the whole graph";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="num min-w-0 flex-1 truncate text-[12px] text-text-3">{count}</span>
      <div className="seg shrink-0" role="group" aria-label="How much of the graph to show">
        <button aria-pressed={graphMode === "focus"} onClick={() => setGraphMode("focus")}>
          Focus
        </button>
        <button aria-pressed={graphMode === "world"} onClick={() => setGraphMode("world")}>
          Whole graph
        </button>
      </div>
    </div>
  );
}

/** With something selected: what the focus view shows, and a switch between it and the whole graph. */
function FocusBar() {
  const selectedId = useGita((s) => s.selectedId);
  const highlight = useGita((s) => s.highlight);
  const graphMode = useGita((s) => s.graphMode);
  const setGraphMode = useGita((s) => s.setGraphMode);
  const ego = useGita((s) => s.egoSummary);
  const graphs = useGita((s) => s.graphs);
  const n = selectedId ? graphs?.nodeById.get(selectedId) : undefined;
  if (!n || highlight) return null;
  const name = n.type === "Verse" ? `BG ${n.ref}` : n.type === "Chapter" ? `Chapter ${n.number}` : n.label;
  const count = graphMode === "focus" && ego?.id === n.id ? (ego.total > ego.shown ? `${ego.shown} of ${ego.total} connections` : `${ego.total} connection${ego.total === 1 ? "" : "s"}`) : "in the whole graph";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3 max-md:top-14">
      <div className="hud pointer-events-auto flex max-w-[min(560px,100%)] items-center gap-2 py-1 pl-3 pr-1" role="status">
        <NodeGlyph node={n} />
        <span className="min-w-0 truncate text-[12.5px] font-medium text-text">{name}</span>
        <span className="num shrink-0 text-[12px] text-text-3 max-[380px]:hidden">{count}</span>
        <div className="seg shrink-0" role="group" aria-label="How much of the graph to show">
          <button aria-pressed={graphMode === "focus"} onClick={() => setGraphMode("focus")} title="Just this and its connections, each labelled">
            Focus
          </button>
          <button aria-pressed={graphMode === "world"} onClick={() => setGraphMode("world")} title="The whole Gita, with this highlighted">
            Whole graph
          </button>
        </div>
      </div>
    </div>
  );
}

function HighlightBanner() {
  const highlight = useGita((s) => s.highlight);
  const setHighlight = useGita((s) => s.setHighlight);
  return (
    <AnimatePresence>
      {highlight && (
        <motion.div
          key={highlight.label}
          className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3 max-md:top-14"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          <div className="hud pointer-events-auto flex max-w-[min(560px,100%)] items-center gap-2.5 py-1.5 pl-3 pr-1.5" role="status">
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="min-w-0 truncate text-[12.5px] font-medium text-text">{highlight.label}</span>
            <span className="num shrink-0 text-[12px] text-text-3">{highlight.nodes.size} nodes</span>
            <button className="btn btn-sm shrink-0" onClick={() => setHighlight(null)} title="Clear (Esc)">
              Clear
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** One-time gesture hint; disappears after the first interaction with the canvas. */
function GestureHint() {
  const coarse = useCoarsePointer();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("gitaviswa:hint-explore")) return;
    } catch {}
    const t = setTimeout(() => setShow(true), 900);
    const dismiss = () => setShow(false);
    const canvas = document.querySelector("#main canvas");
    canvas?.addEventListener("pointerdown", dismiss, { once: true });
    canvas?.addEventListener("wheel", dismiss, { once: true });
    return () => {
      clearTimeout(t);
      canvas?.removeEventListener("pointerdown", dismiss);
      canvas?.removeEventListener("wheel", dismiss);
    };
  }, []);
  useEffect(() => {
    if (!show) return;
    return () => {
      try {
        localStorage.setItem("gitaviswa:hint-explore", "1");
      } catch {}
    };
  }, [show]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
          <div className="hud pointer-events-auto flex items-center gap-3 py-2 pl-3.5 pr-1.5 text-[12.5px] text-text-2">
            <span>{coarse ? "Drag to rotate, pinch to zoom, tap any point to open it." : "Drag to rotate, scroll to zoom, right-drag to pan. Click any point to open it."}</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShow(false)} aria-label="Dismiss hint">
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Overlays for the 3D cosmos: tools (display, path), legend-as-filter, camera controls, highlight status, first-run hint. */
export function GraphHud() {
  const mobile = useIsMobile();
  const [tool, setTool] = useState<Tool>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const toggle = (t: Tool) => setTool((cur) => (cur === t ? null : t));
  const title = tool === "display" ? "Display" : tool === "path" ? "Find a path" : "Legend";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && tool && (e.preventDefault(), setTool(null));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool]);

  const panel = tool && (
    <motion.div
      key={tool}
      className={
        mobile
          ? "hud pointer-events-auto absolute inset-x-2 bottom-2 z-20 flex max-h-[70%] flex-col overflow-hidden"
          : "hud pointer-events-auto mt-2 flex max-h-[calc(100%-3.5rem)] w-[340px] flex-col overflow-hidden"
      }
      initial={{ opacity: 0, y: mobile ? 12 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: mobile ? 12 : -4 }}
      transition={{ duration: 0.16 }}
      role="dialog"
      aria-label={title}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pl-4 pr-1.5">
        <span className="text-[13px] font-semibold text-text">{title}</span>
        <button className="btn btn-ghost btn-icon" onClick={() => setTool(null)} aria-label={`Close ${title}`}>
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto p-4">{tool === "display" ? <DisplayPanel /> : tool === "path" ? <SutraPathFinder /> : <Legend onClose={() => setTool(null)} />}</div>
    </motion.div>
  );

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10 p-3">
        <div className="flex h-full flex-col items-start">
          <div className="hud pointer-events-auto flex gap-0.5 p-1" role="toolbar" aria-label="Graph tools">
            <button className="btn btn-ghost h-8" aria-pressed={tool === "display"} onClick={() => toggle("display")}>
              <SlidersHorizontal size={15} /> Display
            </button>
            <button className="btn btn-ghost h-8" aria-pressed={tool === "path"} onClick={() => toggle("path")}>
              <Route size={15} /> Find a path
            </button>
            {mobile && (
              <button className="btn btn-ghost h-8" aria-pressed={tool === "legend"} onClick={() => toggle("legend")}>
                Legend
              </button>
            )}
          </div>
          {!mobile && <AnimatePresence>{panel}</AnimatePresence>}
        </div>
      </div>
      {mobile && <AnimatePresence>{panel}</AnimatePresence>}

      {!mobile && !tool && (
        <div className="absolute bottom-3 left-3 z-10 w-[236px]">
          <div className="hud overflow-hidden">
            <button className="flex h-9 w-full items-center justify-between px-3 text-[12.5px] font-semibold text-text" onClick={() => setLegendOpen(!legendOpen)} aria-expanded={legendOpen}>
              Legend
              <ChevronDown size={15} className={`text-text-3 transition-transform ${legendOpen ? "" : "-rotate-90"}`} />
            </button>
            {legendOpen && (
              <div className="border-t border-line px-2 pb-2.5 pt-1.5">
                <Legend />
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`absolute right-3 z-10 ${mobile ? "top-3" : "bottom-3"}`}>
        <CameraControls />
      </div>
      <HighlightBanner />
      {/* Phones carry the switch in the details sheet, keeping the graph area clear. */}
      {!mobile && <FocusBar />}
      <GestureHint />
    </>
  );
}
