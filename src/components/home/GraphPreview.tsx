"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { loadLayout, type LayoutDoc } from "@/lib/data/loader";
import { NODE_HEX, nodeKind, typeName, type NodeKind } from "@/lib/graph/palette";
import type { GitaGraphs } from "@/lib/graph/graphStore";
import type { GraphNode } from "@/lib/types";

/**
 * A small, live view of the real graph for the home page, drawn on a 2D canvas (no WebGL, so it is cheap on phones).
 * It uses the same precomputed positions as Explore, turns slowly while on screen, and shows a node's connections on
 * hover or tap. It stops drawing when scrolled away or when the tab is hidden, and holds still under reduced motion.
 * Personal reflections are left out: this is a front page, and someone may be looking over your shoulder.
 */

/** Relations that make the picture busy without saying much (every verse has a speaker and a next verse). */
const SKIP = new Set(["SPOKE", "NEXT_VERSE", "MENTIONS_CHARACTER", "NARRATED"]);
/** Nodes the preview cycles through when nobody is pointing at it. */
const SHOWCASE = ["BG_2.47", "dilemma:decision-paralysis", "emotion:krodha", "concept:karma-yoga", "CH_2", "BG_6.35", "emotion:shanti"];
const RADIUS: Record<NodeKind, number> = { chapter: 4.4, verse: 1.3, concept: 2.5, afflictive: 2.5, healing: 2.5, dilemma: 2.7, character: 2.5, personal: 2 };
const DRAW_ORDER: NodeKind[] = ["verse", "character", "concept", "afflictive", "healing", "dilemma", "chapter"];
const TILT = 0.42;
const SPEED = 0.00009; // radians per ms
const FRAME_MS = 33; // ~30 fps is plenty for a slow turn

interface Model {
  nodes: GraphNode[];
  kind: NodeKind[];
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  /** Flat pairs of node indices. */
  edges: Uint16Array;
  adj: number[][];
  index: Map<string, number>;
  extent: number;
  /** Robust spread (98th percentile) in the ring plane and vertically, for fitting the view. */
  spreadXZ: number;
  spreadY: number;
  showcase: number[];
}

function hashUnit(s: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

function buildModel(graphs: GitaGraphs, layout: LayoutDoc | null): Model {
  const nodes: GraphNode[] = [];
  graphs.nodeById.forEach((n) => {
    if (n.type !== "PersonalThought") nodes.push(n);
  });
  const n = nodes.length;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const index = new Map<string, number>();
  let extent = 1;
  nodes.forEach((node, i) => {
    index.set(node.id, i);
    const p = layout?.positions[node.id];
    if (p) [x[i], y[i], z[i]] = p;
    else {
      // No precomputed layout: a deterministic ball, so the preview still reads as a graph.
      const u = hashUnit(node.id, 1) * 2 - 1;
      const t = hashUnit(node.id, 2) * Math.PI * 2;
      const r = 380 * Math.cbrt(hashUnit(node.id, 3));
      const s = Math.sqrt(1 - u * u);
      x[i] = r * s * Math.cos(t);
      y[i] = r * u * 0.5;
      z[i] = r * s * Math.sin(t);
    }
    extent = Math.max(extent, Math.hypot(x[i], y[i], z[i]));
  });
  const pairs: number[] = [];
  const adj: number[][] = nodes.map(() => []);
  const seen = new Set<number>();
  for (const e of graphs.edges) {
    if (SKIP.has(e.type)) continue;
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a < b ? a * 4096 + b : b * 4096 + a;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(a, b);
    adj[a].push(b);
    adj[b].push(a);
  }
  const showcase = SHOWCASE.map((id) => index.get(id)).filter((i): i is number => i !== undefined);
  const pct = (vals: number[]) => vals.sort((a, b) => a - b)[Math.floor(vals.length * 0.98)] || 1;
  const spreadXZ = pct(nodes.map((_, i) => Math.hypot(x[i], z[i])));
  const spreadY = pct(nodes.map((_, i) => Math.abs(y[i])));
  return { nodes, kind: nodes.map(nodeKind), x, y, z, edges: Uint16Array.from(pairs), adj, index, extent, spreadXZ, spreadY, showcase };
}

export interface PreviewFocus {
  id: string;
  label: string;
  type: string;
  degree: number;
  pinned: boolean;
}

export function GraphPreview({ onOpen }: { onOpen: (id?: string) => void }) {
  const graphs = useGita((s) => s.graphs);
  const status = useGita((s) => s.status);
  const theme = useGita((s) => s.theme);
  const [layout, setLayout] = useState<LayoutDoc | null | undefined>(undefined);
  const [focus, setFocus] = useState<PreviewFocus | null>(null);
  const [reduce, setReduce] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    loadLayout().then((l) => live && setLayout(l));
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener("change", on);
    return () => {
      live = false;
      m.removeEventListener("change", on);
    };
  }, []);

  const model = useMemo(() => (graphs && layout !== undefined ? buildModel(graphs, layout) : null), [graphs, layout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!model || !canvas || !wrap || !ctx || !graphs) return;

    const css = getComputedStyle(wrap);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const ink = { text: v("--text"), text2: v("--text-2"), bg: v("--surface"), accent: v("--accent"), edge: theme === "dark" ? "rgba(240,233,220,0.055)" : "rgba(32,27,18,0.07)", edgeDim: theme === "dark" ? "rgba(240,233,220,0.028)" : "rgba(32,27,18,0.035)" };
    const font = getComputedStyle(document.body).fontFamily;
    const hex = NODE_HEX[theme];
    const n = model.nodes.length;
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const pf = new Float32Array(n);
    const st = { angle: 0.6, hover: -1, pinned: -1, show: 0, dragging: false, downX: 0, downAngle: 0, moved: false };
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    let visible = false;
    let docVisible = !document.hidden;

    const focused = () => (st.hover >= 0 ? st.hover : st.pinned >= 0 ? st.pinned : (model.showcase[st.show] ?? -1));
    const publish = () => {
      const i = focused();
      if (i < 0) return setFocus(null);
      const node = model.nodes[i];
      setFocus({ id: node.id, label: node.label, type: typeName(node), degree: graphs.graph.hasNode(node.id) ? graphs.graph.degree(node.id) : model.adj[i].length, pinned: st.pinned === i });
    };

    const project = () => {
      // Fit the ring's real spread (not its few outliers) to the canvas: wide canvases see a flatter ellipse.
      const halfH = model.spreadXZ * Math.sin(TILT) + model.spreadY * Math.cos(TILT);
      const k = Math.min((w / 2) * 0.86 / model.spreadXZ, (h / 2) * 0.8 / halfH);
      const cx = w / 2;
      const cy = h / 2;
      const d = model.extent * 3.2;
      const ca = Math.cos(st.angle);
      const sa = Math.sin(st.angle);
      const ct = Math.cos(TILT);
      const stt = Math.sin(TILT);
      for (let i = 0; i < n; i++) {
        const x1 = model.x[i] * ca - model.z[i] * sa;
        const z1 = model.x[i] * sa + model.z[i] * ca;
        const y1 = model.y[i] * ct - z1 * stt;
        const z2 = model.y[i] * stt + z1 * ct;
        const f = d / (d - z2);
        px[i] = cx + x1 * f * k;
        py[i] = cy - y1 * f * k;
        pf[i] = f;
      }
    };

    /** Labels placed this frame, so later ones skip rather than overprint. */
    let placed: [number, number, number, number][] = [];
    const label = (i: number, strong: boolean) => {
      const text = model.nodes[i].label;
      const short = text.length > 28 ? `${text.slice(0, 27)}…` : text;
      ctx.font = `${strong ? 600 : 500} ${strong ? 13 : 11.5}px ${font}`;
      const tw = ctx.measureText(short).width;
      let tx = px[i] + 8;
      if (tx + tw > w - 6) tx = px[i] - 8 - tw;
      tx = Math.max(4, Math.min(tx, w - 4 - tw));
      const ty = py[i] - 7;
      const box: [number, number, number, number] = [tx - 2, ty - (strong ? 13 : 12), tx + tw + 2, ty + 4];
      if (!strong && placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) return;
      placed.push(box);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = ink.bg;
      ctx.strokeText(short, tx, ty);
      ctx.fillStyle = strong ? ink.text : ink.text2;
      ctx.fillText(short, tx, ty);
    };

    const draw = () => {
      if (!w || !h) return;
      project();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const f = focused();
      const e = model.edges;
      ctx.lineWidth = 1;
      ctx.strokeStyle = f >= 0 ? ink.edgeDim : ink.edge;
      ctx.beginPath();
      for (let j = 0; j < e.length; j += 2) {
        ctx.moveTo(px[e[j]], py[e[j]]);
        ctx.lineTo(px[e[j + 1]], py[e[j + 1]]);
      }
      ctx.stroke();
      const near = f >= 0 ? new Set(model.adj[f]) : null;
      if (f >= 0) {
        ctx.strokeStyle = ink.accent;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (const b of model.adj[f]) {
          ctx.moveTo(px[f], py[f]);
          ctx.lineTo(px[b], py[b]);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      for (const kind of DRAW_ORDER) {
        ctx.fillStyle = hex[kind];
        ctx.globalAlpha = kind === "verse" ? (near ? 0.35 : 0.6) : near ? 0.55 : 0.92;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (model.kind[i] !== kind) continue;
          const r = RADIUS[kind] * pf[i];
          ctx.moveTo(px[i] + r, py[i]);
          ctx.arc(px[i], py[i], r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (f >= 0 && near) {
        for (const b of near) {
          ctx.fillStyle = hex[model.kind[b]];
          ctx.beginPath();
          ctx.arc(px[b], py[b], Math.max(2.6, RADIUS[model.kind[b]] * pf[b] * 1.25), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = ink.accent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(px[f], py[f], RADIUS[model.kind[f]] * pf[f] + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = hex[model.kind[f]];
        ctx.beginPath();
        ctx.arc(px[f], py[f], RADIUS[model.kind[f]] * pf[f] * 1.35, 0, Math.PI * 2);
        ctx.fill();
        // Name a few neighbours: ideas and situations first, they say more than verse numbers.
        // The focus is placed first so its name always shows; neighbours fill in around it where there is room.
        placed = [];
        label(f, true);
        const named = [...near].sort((a, b) => Number(model.kind[a] === "verse") - Number(model.kind[b] === "verse") || pf[b] - pf[a]).slice(0, w < 420 ? 4 : 7);
        for (const b of named) label(b, false);
      }
    };

    const animating = () => !reduce && visible && docVisible;
    const tick = (t: number) => {
      raf = 0;
      if (!animating()) {
        last = 0;
        return;
      }
      if (!last) last = t;
      const dt = t - last;
      if (dt >= FRAME_MS) {
        if (!st.dragging && st.hover < 0) st.angle += Math.min(dt, 100) * SPEED * (st.pinned >= 0 ? 0.4 : 1);
        last = t;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf && animating()) raf = requestAnimationFrame(tick);
    };
    const redraw = () => {
      if (!animating()) requestAnimationFrame(draw);
    };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = r.width;
      h = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw();
    };

    const hit = (cx: number, cy: number) => {
      let best = -1;
      let bestD = 15;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(px[i] - cx, py[i] - cy) - RADIUS[model.kind[i]] * pf[i] * 0.6;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onMove = (e: PointerEvent) => {
      if (st.dragging) {
        const dx = e.clientX - st.downX;
        if (Math.abs(dx) > 4) st.moved = true;
        st.angle = st.downAngle + dx * 0.006;
        redraw();
        return;
      }
      if (e.pointerType !== "mouse") return;
      const [cx, cy] = local(e);
      const i = hit(cx, cy);
      if (i !== st.hover) {
        st.hover = i;
        canvas.style.cursor = i >= 0 ? "pointer" : "grab";
        publish();
        redraw();
      }
    };
    const onDown = (e: PointerEvent) => {
      st.dragging = true;
      st.moved = false;
      st.downX = e.clientX;
      st.downAngle = st.angle;
      canvas.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      if (!st.dragging) return;
      st.dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (st.moved) return;
      const [cx, cy] = local(e);
      const i = hit(cx, cy);
      st.pinned = i;
      if (e.pointerType !== "mouse") st.hover = -1;
      publish();
      redraw();
    };
    const onLeave = () => {
      if (st.hover < 0) return;
      st.hover = -1;
      publish();
      redraw();
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    const ro = new ResizeObserver(resize);
    const onVis = () => {
      docVisible = !document.hidden;
      start();
    };
    const timer = reduce
      ? 0
      : window.setInterval(() => {
          if (!visible || !docVisible || st.hover >= 0 || st.pinned >= 0 || !model.showcase.length) return;
          st.show = (st.show + 1) % model.showcase.length;
          publish();
        }, 4800);

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    io.observe(wrap);
    ro.observe(wrap);
    resize();
    publish();

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [model, graphs, theme, reduce]);

  const failed = status === "error";
  return (
    <div className="flex h-full flex-col">
      <div ref={wrapRef} className="relative min-h-0 flex-1 touch-pan-y select-none">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab"
          role="img"
          aria-label="A live preview of the graph: chapters, verses, ideas, states of mind and life situations as points, joined by their connections."
        />
        {!model && (
          <div className="absolute inset-0 flex items-center justify-center" role="status">
            <div className="w-40 text-center">
              {failed ? <div className="text-[12.5px] text-text-3">The graph could not be loaded.</div> : <div className="progress-indeterminate" />}
              {!failed && <div className="mt-3 text-[12.5px] text-text-3">Drawing the graph</div>}
            </div>
          </div>
        )}
      </div>
      <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-2.5">
        <div className="min-w-0 text-[13px] leading-5">
          {focus ? (
            <>
              <span className="font-semibold text-text">{focus.label}</span>
              <span className="text-text-3">
                {" "}
                {focus.type.toLowerCase()}, {focus.degree} connections
              </span>
            </>
          ) : (
            <span className="text-text-3">Point at anything to see what it connects to.</span>
          )}
        </div>
        <button className="btn btn-sm shrink-0" disabled={!model} onClick={() => onOpen(focus?.id)}>
          {focus ? "Open it in Explore" : "Explore the graph"}
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
