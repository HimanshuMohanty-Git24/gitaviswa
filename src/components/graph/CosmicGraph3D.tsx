"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-3d";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { useGita } from "@/lib/store/useGitaStore";
import { useAudio } from "@/lib/store/audioStore";
import { RELATIONS, type RelationGroup } from "@/lib/graph/relations";
import { isSuggestedEdge } from "@/lib/graph/graphStore";
import { communityColor } from "@/lib/graph/communities";
import { KIND_META, NODE_HEX, nodeKind, typeName, type NodeKind } from "@/lib/graph/palette";
import { useCoarsePointer, useIsDesktop, useIsMobile, useReducedMotion } from "@/lib/hooks/useMedia";
import { loadLayout } from "@/lib/data/loader";
import { RING_R, containForce, fixedPosition, linkDistance, linkStrength, placeThought } from "@/lib/graph/layoutParams";
import { egoPositions, pickEgo, type EgoCandidate, type EgoPick } from "@/lib/graph/ego";
import { sheetPx } from "@/components/layout/SidePanel";
import type { GraphNode, NodeLabel, RelationType } from "@/lib/types";

type NodeT = { id: string; type: NodeLabel; label: string; data: GraphNode };
type LinkT = { key: string; type: RelationType; group: RelationGroup; suggested?: boolean };
type GNode = NodeObject<NodeT>;
type GLink = LinkObject<NodeT, LinkT>;
type Vec3 = [number, number, number];

/**
 * Rendering budget. "low" for touch devices and machines with few cores or little memory: no antialiasing and a lower
 * pixel ratio (fill rate dominates on high-density phone screens). Decided once, before the renderer is created.
 */
function deviceTier(): "low" | "high" {
  if (typeof window === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  return coarse || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 ? "low" : "high";
}
/** Height of the graph toolbar row on phones; the visible strip for the graph starts below it. */
const TOP_HUD = 56;
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII"];
const HOME = { x: 0, y: 520, z: 820 };
/**
 * Home camera for a viewport: on portrait screens look down more steeply (the wheel reads rounder and uses the height)
 * and pull back just enough for the wheel to fit the width.
 */
function homePosition(w: number, h: number) {
  const aspect = w / h;
  const k = Math.max(1, 1 / aspect);
  const base = aspect < 0.9 ? { x: 0, y: 700, z: 640 } : HOME;
  return { x: base.x * k, y: base.y * k, z: base.z * k };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** "Read by position": verses coloured by chapter on one amber ramp, early chapters light, late ones deep. */
function chapterTone(ch: number, dark: boolean) {
  const t = (ch - 1) / 17;
  return `#${new THREE.Color().setHSL(0.095, dark ? 0.62 : 0.7, dark ? 0.8 - t * 0.42 : 0.62 - t * 0.38).getHexString()}`;
}

// ── shared GPU resources (one geometry per detail level, one texture per ring weight) ────────────
const geoCache = new Map<string, THREE.BufferGeometry>();
const sphere = (detail: "lo" | "mid" | "hi", low = false) => {
  const key = low ? `${detail}-low` : detail;
  let g = geoCache.get(key);
  if (!g) {
    const [w, h] = { lo: low ? [8, 6] : [10, 8], mid: low ? [14, 10] : [22, 16], hi: low ? [24, 16] : [36, 26] }[detail];
    g = new THREE.SphereGeometry(1, w, h);
    geoCache.set(key, g);
  }
  return g;
};
const ringTex = new Map<number, THREE.Texture>();
/** An anti-aliased circle outline, drawn once; `weight` is stroke width as a fraction of the radius. */
function ring(weight: number) {
  let t = ringTex.get(weight);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const lw = Math.max(2, 128 * weight);
  g.strokeStyle = "#fff";
  g.lineWidth = lw;
  g.beginPath();
  g.arc(128, 128, 128 - lw / 2 - 2, 0, Math.PI * 2);
  g.stroke();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  ringTex.set(weight, t);
  return t;
}

/** A node label (canvas text sprite); created lazily, the first time it has to be visible. */
function makeLabel(spec: NonNullable<NodeVisual["labelSpec"]>, font: string, scale = 1): SpriteText {
  const l = new SpriteText(spec.text, spec.size * scale, spec.color);
  l.fontFace = font;
  l.fontWeight = spec.weight;
  l.strokeWidth = 0.9;
  l.strokeColor = spec.stroke;
  l.material.depthWrite = false;
  l.material.opacity = 0;
  l.visible = false;
  l.position.y = spec.y;
  return l;
}

interface Emphasis {
  nodes: Set<string>;
  edges: Set<string>;
  kind: "highlight" | "focus";
  /** path-like highlights get thicker edges and flow particles */
  path: boolean;
}
type MaterialFn = (color: string, state: "base" | "dim" | "focus") => THREE.Material;

interface NodeVisual {
  group: THREE.Group;
  mesh: THREE.Mesh | null;
  ringSprite: THREE.Sprite | null;
  label: SpriteText | null;
  /** Not yet created: built the first time the label has to appear, so ~140 canvases aren't drawn at start-up. */
  labelSpec: { text: string; size: number; color: string; weight: string; stroke: string; y: number } | null;
  kind: NodeKind;
  color: string;
  r: number;
  labelOpacity: number;
}

function radiusOf(d: GraphNode, degree: number, maxDegree: number) {
  const k = nodeKind(d);
  const lift = 0.82 + 0.5 * Math.sqrt(Math.min(1, degree / Math.max(1, maxDegree)));
  switch (k) {
    case "chapter":
      return 6.4;
    case "verse":
      return d.type === "Verse" && !d.canonical ? 1.3 : 1.65;
    case "character":
      return d.id === "character:krishna" ? 7.5 : d.id === "character:arjuna" ? 5 : 3.2;
    case "dilemma":
      return 4.2 * lift;
    case "personal":
      return 3.6;
    default:
      return 3.9 * lift;
  }
}

export default function CosmicGraph3D() {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const graphs = useGita((s) => s.graphs);
  const graphVersion = useGita((s) => s.graphVersion);
  const layers = useGita((s) => s.layers);
  const edgeGroups = useGita((s) => s.edgeGroups);
  const colorBy = useGita((s) => s.colorBy);
  const communities = useGita((s) => s.communities);
  const highlight = useGita((s) => s.highlight);
  const selectedId = useGita((s) => s.selectedId);
  const hoverStem = useGita((s) => s.hoverStem);
  const flyTo = useGita((s) => s.flyTo);
  const theme = useGita((s) => s.theme);
  const versesDoc = useGita((s) => s.versesDoc);
  const cameraCmd = useGita((s) => s.cameraCmd);
  const autoRotate = useGita((s) => s.autoRotate);
  const audioVerse = useAudio((s) => s.verseId);
  const chatOpen = useGita((s) => s.chatOpen);
  const mobile = useIsMobile();
  const desktop = useIsDesktop();
  const reduceMotion = useReducedMotion();
  const coarse = useCoarsePointer();
  const dark = theme === "dark";
  const [hoverId, setHoverId] = useState<string | null>(null);

  const visuals = useRef(new Map<string, NodeVisual>());
  const labelScale = useRef(1.3);
  labelScale.current = mobile ? 1.6 : 1.3;
  const nodeCache = useRef(new Map<string, GNode>());
  const materials = useRef(new Map<string, THREE.Material>());
  const fontFace = useRef("Inter, system-ui, sans-serif");
  // Latest visual inputs for the frame loop; `dirty` asks it to re-apply materials and markers.
  const live = useRef<{ emphasis: Emphasis | null; selectedId: string | null; hoverId: string | null; audioVerse: string | null; dark: boolean; material: MaterialFn | null; dirty: boolean; ego: Set<string> | null }>({
    emphasis: null, selectedId: null, hoverId: null, audioVerse: null, dark: true, material: null, dirty: true, ego: null,
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, e.contentRect.width), h: Math.max(200, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The next/font family has a generated name; canvas text needs the real one.
  useEffect(() => {
    const face = getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim();
    if (face) fontFace.current = `${face}, system-ui, sans-serif`;
    document.fonts?.ready.then(() => {
      for (const v of visuals.current.values()) if (v.label) v.label.fontFace = fontFace.current;
    });
  }, []);

  const degree = useMemo(() => {
    const m = new Map<string, number>();
    let max = 1;
    graphs?.graph.forEachNode((id, a) => {
      const d = graphs.graph.degree(id);
      m.set(id, d);
      if (a.type !== "Verse" && a.type !== "Chapter" && a.type !== "Character") max = Math.max(max, d);
    });
    return { of: m, max };
  }, [graphs]);

  // ── layout: precomputed positions when available (no simulation at all), else the live force layout ──
  const [tier] = useState(deviceTier);
  const [layout, setLayout] = useState<Map<string, Vec3> | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadLayout().then((doc) => {
      if (!live) return;
      const m = doc ? new Map(Object.entries(doc.positions)) : null;
      // Only trust it if it describes (nearly) this graph; otherwise fall back to laying out live.
      const publicIds = graphs ? [...graphs.nodeById.values()].filter((n) => n.type !== "PersonalThought").map((n) => n.id) : [];
      const covered = m && publicIds.length ? publicIds.filter((id) => m.has(id)).length / publicIds.length : 0;
      setLayout(m && covered >= 0.95 ? m : null);
    });
    return () => {
      live = false;
    };
  }, [graphs]);
  const fixed = !!layout;
  const graphMode = useGita((s) => s.graphMode);
  const sheetSnap = useGita((s) => s.sheetSnap);
  // Focus view: a selection (without a path or answer highlight) shows just that node and its connections.
  const egoId = graphMode === "focus" && selectedId && !highlight && graphs?.graph.hasNode(selectedId) ? selectedId : null;
  // Created once with the renderer: antialiasing only where there is headroom; let the browser pick the GPU ("default"),
  // which avoids waking a discrete GPU on laptops for a scene this light.
  const [rendererConfig] = useState(() => ({ antialias: tier === "high", powerPreference: "default" as const, alpha: false }));

  // ── graph data (re-filtered on layer changes; node objects are reused so positions persist) ──
  const data = useMemo(() => {
    if (!graphs || layout === undefined) return { nodes: [] as GNode[], links: [] as GLink[], ego: null as { id: string; pick: EgoPick } | null };
    const nodes: GNode[] = [];
    const at = (id: string): Vec3 | undefined => layout?.get(id) ?? (fixedPosition(graphs.nodeById.get(id) as { id: string; type: string; number?: number }) || undefined);
    graphs.graph.forEachNode((id, attr) => {
      if (!layers[attr.type]) return;
      let n = nodeCache.current.get(id);
      if (!n) {
        n = { id, type: attr.type, label: attr.label, data: attr };
        nodeCache.current.set(id, n);
      }
      let p: Vec3 | undefined | null = layout ? at(id) : fixedPosition(attr as { id: string; type: string; number?: number });
      // Personal thoughts (and anything the file doesn't cover) sit just above what they connect to.
      if (layout && !p) {
        const targets: Vec3[] = [];
        graphs.graph.forEachOutNeighbor(id, (t) => {
          const q = at(t);
          if (q) targets.push(q);
        });
        p = placeThought(id, targets);
      }
      if (p) {
        n.fx = n.x = p[0];
        n.fy = n.y = p[1];
        n.fz = n.z = p[2];
      }
      n.data = attr;
      nodes.push(n);
    });
    const linksAmong = (visible: Set<string>) => {
      const links: GLink[] = [];
      graphs.graph.forEachEdge((key, attr, s, t) => {
        const group = RELATIONS[attr.type].group;
        if (!edgeGroups[group] || !visible.has(s) || !visible.has(t)) return;
        links.push({ key, source: s, target: t, type: attr.type, group, ...(group === "personal" && isSuggestedEdge(attr.props) ? { suggested: true } : {}) });
      });
      return links;
    };

    // Focus view: the selected node in place, and a fair selection of its connections arranged around it, so every
    // point can carry a label (the whole graph lights up hundreds of unlabelled neighbours for a hub like Kṛṣṇa).
    const center = egoId ? nodeCache.current.get(egoId) : undefined;
    if (egoId && center && nodes.includes(center)) {
      const g = graphs.graph;
      const shown = new Set(nodes.map((n) => n.id));
      const cands: EgoCandidate[] = [];
      const add = (other: string, type: RelationType, outgoing: boolean) => {
        const group = RELATIONS[type].group;
        if (other !== egoId && shown.has(other) && edgeGroups[group]) cands.push({ id: other, type, group, outgoing, degree: g.degree(other) });
      };
      g.forEachOutEdge(egoId, (_k, a, _s, t) => add(t, a.type, true));
      g.forEachInEdge(egoId, (_k, a, s) => add(s, a.type, false));
      const pick = pickEgo(cands, mobile ? 28 : 40);
      const c: Vec3 = [center.fx ?? center.x ?? 0, center.fy ?? center.y ?? 0, center.fz ?? center.z ?? 0];
      const members = pick.members.map((m) => nodeCache.current.get(m.id)!).filter(Boolean);
      egoPositions(c, members.length).forEach((p, i) => {
        const n = members[i];
        n.fx = n.x = p[0];
        n.fy = n.y = p[1];
        n.fz = n.z = p[2];
      });
      const egoNodes = [center, ...members];
      return { nodes: egoNodes, links: linksAmong(new Set(egoNodes.map((n) => String(n.id)))), ego: { id: egoId, pick } };
    }
    return { nodes, links: linksAmong(new Set(nodes.map((n) => String(n.id)))), ego: null as { id: string; pick: EgoPick } | null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphs, graphVersion, layers, edgeGroups, layout, egoId, mobile]);
  const egoRef = useRef<string | null>(null);
  egoRef.current = data.ego?.id ?? null;
  useEffect(() => {
    useGita.setState({ egoSummary: data.ego ? { id: data.ego.id, shown: data.ego.pick.members.length, total: data.ego.pick.total } : null });
  }, [data]);

  // ── forces: only when laying out live. With a precomputed layout every node is fixed and no force runs. ──
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || layout === undefined) return;
    if (fixed) {
      fg.d3Force("link", null);
      fg.d3Force("charge", null);
      fg.d3Force("center", null);
      return;
    }
    const link = fg.d3Force("link");
    link?.distance?.((l: GLink) => linkDistance(l.type)).strength?.((l: GLink) => linkStrength(l.type));
    fg.d3Force("charge")?.strength?.(-22).distanceMax?.(420);
    fg.d3Force("contain", containForce());
    fg.d3ReheatSimulation();
  }, [data, fixed, layout]);

  // ── scene: lighting, depth fog and a single reference circle through the 18 chapters ──
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const bg = new THREE.Color(dark ? "#0d0c0b" : "#f5f4f1");
    const scene = fg.scene();
    scene.fog = new THREE.Fog(bg, 620, 2100);
    const key = new THREE.DirectionalLight(0xfff6ea, dark ? 2.2 : 2.0);
    key.position.set(320, 720, 460);
    const rim = new THREE.DirectionalLight(dark ? 0x9fb4ff : 0xffffff, dark ? 0.55 : 0.4);
    rim.position.set(-520, -160, -620);
    fg.lights([new THREE.HemisphereLight(dark ? 0xf2ece2 : 0xffffff, dark ? 0x221e19 : 0xd9d4cc, dark ? 1.35 : 2.2), key, rim]);

    const group = new THREE.Group();
    group.name = "gv-reference";
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) {
      const th = (i / 256) * Math.PI * 2;
      pts.push(new THREE.Vector3(RING_R * Math.cos(th), 26 * Math.sin(th * 3), RING_R * Math.sin(th)));
    }
    const circle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: dark ? 0xe3a44b : 0x9a5a0c, transparent: true, opacity: dark ? 0.16 : 0.2 }));
    group.add(circle);
    scene.add(group);

    const r = fg.renderer();
    // High-density phone screens cost fill rate; 1.5x looks sharp on them at a fraction of the work.
    r.setPixelRatio(Math.min(tier === "low" ? 1.5 : 2, window.devicePixelRatio || 1));
    r.toneMapping = THREE.NoToneMapping;
    return () => {
      scene.remove(group);
      circle.geometry.dispose();
      (circle.material as THREE.Material).dispose();
    };
  }, [dark, tier]);

  const baseColor = useCallback(
    (n: GNode): string => {
      const d = n.data;
      if (colorBy === "community" && communities) return communityColor(communities, n.id, dark);
      if (colorBy === "chapter" && d.type === "Verse") return chapterTone(d.chapter, dark);
      return NODE_HEX[dark ? "dark" : "light"][nodeKind(d)];
    },
    [colorBy, communities, dark],
  );

  const material = useCallback(
    (color: string, state: "base" | "dim" | "focus") => {
      const k = `${color}|${state}|${dark}`;
      let m = materials.current.get(k);
      if (!m) {
        const c = new THREE.Color(color);
        m = new THREE.MeshStandardMaterial({
          color: c,
          roughness: 0.55,
          metalness: 0.05,
          emissive: c.clone().multiplyScalar(dark ? (state === "focus" ? 0.34 : 0.14) : state === "focus" ? 0.12 : 0.02),
          transparent: state === "dim",
          opacity: state === "dim" ? (dark ? 0.12 : 0.16) : 1,
          depthWrite: state !== "dim",
        });
        materials.current.set(k, m);
      }
      return m;
    },
    [dark],
  );

  const nodeObject = useCallback(
    (n: GNode) => {
      const d = n.data;
      const kind = nodeKind(d);
      const color = baseColor(n);
      const r = radiusOf(d, degree.of.get(n.id) ?? 0, degree.max);
      const group = new THREE.Group();
      let mesh: THREE.Mesh | null = null;
      if (kind !== "dilemma") {
        mesh = new THREE.Mesh(sphere(kind === "verse" ? "lo" : kind === "chapter" || r > 5 ? "hi" : "mid", tier === "low"), material(color, "base"));
        mesh.scale.setScalar(r);
        // With a fixed layout the 701 verses are drawn in one instanced batch; this mesh stays (invisible, so it costs no
        // draw call) because raycasting ignores visibility, keeping hover, tooltips and clicks exactly as they were.
        if (fixed && kind === "verse") mesh.visible = false;
        group.add(mesh);
      }
      let ringSprite: THREE.Sprite | null = null;
      const shape = KIND_META[kind].shape;
      if (shape === "hub" || shape === "ring" || shape === "halo") {
        ringSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ring(shape === "ring" ? 0.2 : 0.07), color, transparent: true, depthWrite: false, opacity: shape === "ring" ? 0.95 : 0.55 }));
        const s = shape === "ring" ? r * 2.4 : r * 3.6;
        ringSprite.scale.set(s, s, 1);
        group.add(ringSprite);
      }
      let label: SpriteText | null = null;
      let labelSpec: NodeVisual["labelSpec"] = null;
      if (kind !== "verse") {
        labelSpec = {
          text: d.type === "Chapter" ? `${ROMAN[d.number]}  ${d.title}` : d.label,
          size: kind === "chapter" ? 8.5 : d.id === "character:krishna" ? 6.4 : 5,
          color: dark ? (kind === "chapter" ? "#edeae4" : "#cfc9bf") : kind === "chapter" ? "#1b1a17" : "#3a3732",
          weight: kind === "chapter" ? "600" : "500",
          stroke: dark ? "rgba(13,12,11,0.85)" : "rgba(245,244,241,0.9)",
          y: r + (kind === "chapter" ? 10.5 : 6.5),
        };
        if (kind === "chapter") {
          label = makeLabel(labelSpec, fontFace.current);
          label.material.opacity = 0.92;
          label.visible = true;
          group.add(label);
        }
      }
      visuals.current.set(n.id, { group, mesh, ringSprite, label, labelSpec, kind, color, r, labelOpacity: label?.material.opacity ?? 0 });
      live.current.dirty = true;
      return group;
    },
    [baseColor, material, dark, degree, fixed, tier],
  );

  // ── emphasis: highlight (path / answer / thread / stem) > hover neighbourhood > selection neighbourhood ──
  const stemVerses = useMemo(() => {
    if (!hoverStem || !versesDoc) return null;
    return new Set(versesDoc.verses.filter((v) => v.padaccheda.some((p) => p.k.includes(hoverStem))).map((v) => v.id));
  }, [hoverStem, versesDoc]);

  const emphasis = useMemo((): Emphasis | null => {
    if (stemVerses) return { nodes: stemVerses, edges: new Set<string>(), kind: "highlight", path: false };
    if (highlight) return { nodes: highlight.nodes, edges: highlight.edges, kind: "highlight", path: highlight.source === "path" || highlight.source === "thread" };
    const focus = hoverId ?? selectedId;
    if (focus && graphs?.graph.hasNode(focus)) {
      const nodes = new Set<string>([focus]);
      const edges = new Set<string>();
      graphs.graph.forEachEdge(focus, (key, _a, s, t) => {
        nodes.add(s);
        nodes.add(t);
        edges.add(key);
      });
      return { nodes, edges, kind: "focus", path: false };
    }
    return null;
  }, [stemVerses, highlight, hoverId, selectedId, graphs]);

  // Visual state (materials, selection/recitation rings, verse labels) is reconciled in the frame loop whenever it is
  // marked dirty, because the graph builds node objects asynchronously after React effects run.
  const egoSet = useMemo(() => (data.ego ? new Set(data.nodes.map((n) => String(n.id))) : null), [data]);
  live.current = { ...live.current, emphasis, selectedId, hoverId, audioVerse, dark, material, ego: egoSet };
  useEffect(() => {
    live.current.dirty = true;
  }, [emphasis, selectedId, hoverId, audioVerse, dark, material, nodeObject]);

  const marks = useRef<{ sel: THREE.Sprite | null; audio: THREE.Sprite | null; verseLabels: Map<string, SpriteText> }>({ sel: null, audio: null, verseLabels: new Map() });
  const reconcile = useCallback(() => {
    const { emphasis: e, selectedId: sel, hoverId: hov, audioVerse: aud, dark: dk, material: mat } = live.current;
    if (!mat) return;
    for (const [id, v] of visuals.current) {
      const on = !e || e.nodes.has(id);
      const focus = !!e && on && (id === sel || id === hov || e.kind === "highlight");
      if (v.mesh) v.mesh.material = mat(v.color, on ? (focus ? "focus" : "base") : "dim");
      if (v.ringSprite) (v.ringSprite.material as THREE.SpriteMaterial).opacity = on ? (v.kind === "dilemma" ? 0.95 : 0.55) : 0.08;
    }
    const m = marks.current;
    const place = (sprite: THREE.Sprite | null, id: string | null, scale: number, opacity: number) => {
      const s = sprite ?? new THREE.Sprite(new THREE.SpriteMaterial({ map: ring(0.13), transparent: true, depthWrite: false, depthTest: false }));
      const v = id ? visuals.current.get(id) : undefined;
      if (s.parent !== v?.group) s.parent?.remove(s);
      if (v) {
        (s.material as THREE.SpriteMaterial).color.set(dk ? "#e3a44b" : "#9a5a0c");
        (s.material as THREE.SpriteMaterial).opacity = opacity;
        const size = Math.max(16, v.r * scale);
        s.scale.set(size, size, 1);
        s.renderOrder = 10;
        if (s.parent !== v.group) v.group.add(s);
      }
      return s;
    };
    m.sel = place(m.sel, sel, 4.2, 1);
    m.audio = place(m.audio, aud && aud !== sel ? aud : null, 5.2, 0.6);
    // Verses carry no permanent labels; the focused ones get their reference.
    const want = new Set([sel, hov, aud].filter((x): x is string => !!x && x.startsWith("BG_")));
    // In the focus view every verse shown gets its reference.
    if (live.current.ego) for (const id of live.current.ego) if (id.startsWith("BG_")) want.add(id);
    if (e?.kind === "highlight" && e.nodes.size <= 40) for (const id of e.nodes) if (id.startsWith("BG_")) want.add(id);
    for (const [id, l] of m.verseLabels) {
      if (want.has(id) && l.parent === visuals.current.get(id)?.group) continue;
      l.parent?.remove(l);
      m.verseLabels.delete(id);
    }
    for (const id of want) {
      const v = visuals.current.get(id);
      if (!v || m.verseLabels.has(id)) continue;
      const l = new SpriteText(id.replace("BG_", "BG "), 4.6 * (live.current.ego ? labelScale.current : 1), dk ? "#edeae4" : "#1b1a17");
      l.fontFace = fontFace.current;
      l.fontWeight = "600";
      l.strokeWidth = 0.9;
      l.strokeColor = dk ? "rgba(13,12,11,0.85)" : "rgba(245,244,241,0.9)";
      l.material.depthWrite = false;
      l.material.depthTest = false;
      l.renderOrder = 11;
      l.position.y = v.r + 5;
      v.group.add(l);
      m.verseLabels.set(id, l);
    }
  }, []);

  // ── per-frame: reconcile visual state, then label level-of-detail (chapters always, others by proximity/focus) ──
  useEffect(() => {
    let raf = 0;
    let running = false;
    const p = new THREE.Vector3();
    const tick = () => {
      const fg = fgRef.current;
      if (!fg) {
        raf = requestAnimationFrame(tick);
        return;
      }
      let fading = false;
      if (live.current.dirty) {
        live.current.dirty = false;
        reconcile();
      }
      const cam = fg.camera();
      const fog = fg.scene().fog as THREE.Fog | null;
      if (fog) {
        const target = (fg.controls() as { target?: THREE.Vector3 }).target;
        const d = target ? cam.position.distanceTo(target) : 900;
        fog.near = d * 0.7;
        fog.far = d + 1350;
      }
      const { emphasis: e, selectedId: sel, hoverId: hov } = live.current;
      const forceAll = !!live.current.ego || (!!e && e.nodes.size <= 60);
      for (const [id, v] of visuals.current) {
        if (!v.label && !v.labelSpec) continue;
        const on = !e || e.nodes.has(id);
        let target: number;
        if (id === sel || id === hov) target = 1;
        else if (!on) target = v.kind === "chapter" ? 0.18 : 0;
        else if (v.kind === "chapter") target = 0.92;
        else if (e && forceAll) target = 0.9;
        else {
          v.group.getWorldPosition(p);
          target = 0.9 * (1 - smooth(320, 600, p.distanceTo(cam.position)));
        }
        if (v.labelOpacity === target) continue;
        if (!v.label) {
          if (target <= 0.02 || !v.labelSpec) continue;
          v.label = makeLabel(v.labelSpec, fontFace.current, live.current.ego?.has(id) ? labelScale.current : 1);
          v.group.add(v.label);
        }
        fading = true;
        v.labelOpacity += (target - v.labelOpacity) * 0.2;
        if (Math.abs(v.labelOpacity - target) < 0.004) v.labelOpacity = target;
        v.label.material.opacity = v.labelOpacity;
        v.label.visible = v.labelOpacity > 0.02;
      }
      // Sleep when nothing moves: no rotation, no label fading, no flowing path particles, no recent input or change.
      const rotating = !!(fg.controls() as { autoRotate?: boolean }).autoRotate;
      const flowing = !!live.current.emphasis?.path;
      if (!rotating && !fading && !flowing && performance.now() > awakeUntil.current) {
        running = false;
        sleeping.current = true;
        fg.pauseAnimation();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    startLoop.current = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    startLoop.current();
    return () => {
      cancelAnimationFrame(raf);
      running = false;
      startLoop.current = null;
    };
  }, [reconcile]);

  // ── links ──
  const ink = dark ? "237,234,228" : "27,26,23";
  const accent = dark ? "227,164,75" : "154,90,12";
  const linkColor = useCallback(
    (l: GLink) => {
      if (emphasis) {
        if (emphasis.edges.has(l.key)) return emphasis.kind === "highlight" ? `rgba(${accent},0.85)` : `rgba(${ink},${dark ? 0.36 : 0.45})`;
        return `rgba(${ink},${dark ? 0.014 : 0.02})`;
      }
      switch (l.group) {
        case "structure":
          return `rgba(${ink},${dark ? 0.028 : 0.03})`;
        case "lexical":
          return `rgba(${ink},${dark ? 0.032 : 0.034})`;
        case "personal":
          // Faint until the person keeps the connection.
          return `rgba(${ink},${l.suggested ? 0.14 : 0.55})`;
        default:
          return `rgba(${ink},${dark ? 0.085 : 0.085})`;
      }
    },
    [emphasis, ink, accent, dark],
  );
  const linkWidth = useCallback((l: GLink) => (emphasis?.path && emphasis.edges.has(l.key) ? 0.9 : 0), [emphasis]);
  const linkParticles = useCallback((l: GLink) => (emphasis?.path && emphasis.edges.has(l.key) && !reduceMotion ? 2 : 0), [emphasis, reduceMotion]);

  // With a fixed layout the force-graph only draws highlighted path links (thick, with flowing particles); all other
  // links are batched below. Its links point at node objects directly, since no link force resolves ids.
  const fgData = useMemo(() => {
    if (!fixed) return data;
    const path = emphasis?.path ? data.links.filter((l) => emphasis.edges.has(l.key)) : [];
    return { nodes: data.nodes, links: path.map((l) => ({ ...l, source: nodeCache.current.get(String(l.source)) ?? l.source, target: nodeCache.current.get(String(l.target)) ?? l.target })) };
  }, [fixed, data, emphasis]);

  // ── links, batched: one draw call per visual class instead of one per link (5,350 → ≤ 8) ──
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !fixed || !data.links.length) return;
    const idOf = (x: GLink["source"]) => (typeof x === "object" && x ? String((x as GNode).id) : String(x));
    const posOf = (id: string) => nodeCache.current.get(id);
    const positions = new Float32Array(data.links.length * 6);
    const classes = new Map<string, number[]>();
    const cls = (l: GLink) => (emphasis ? (emphasis.edges.has(l.key) ? (emphasis.kind === "highlight" ? "hi" : "focus") : "dim") : l.group === "personal" ? (l.suggested ? "suggested" : "personal") : l.group);
    data.links.forEach((l, i) => {
      const s = posOf(idOf(l.source));
      const t = posOf(idOf(l.target));
      if (!s || !t) return;
      positions.set([s.fx ?? s.x ?? 0, s.fy ?? s.y ?? 0, s.fz ?? s.z ?? 0, t.fx ?? t.x ?? 0, t.fy ?? t.y ?? 0, t.fz ?? t.z ?? 0], i * 6);
      const c = cls(l);
      const list = classes.get(c) ?? [];
      list.push(i * 2, i * 2 + 1);
      classes.set(c, list);
    });
    const style: Record<string, [string, number]> = {
      structure: [ink, dark ? 0.028 : 0.03],
      lexical: [ink, dark ? 0.032 : 0.034],
      curated: [ink, 0.085],
      personal: [ink, 0.55],
      suggested: [ink, 0.14],
      hi: [accent, 0.85],
      focus: [ink, dark ? 0.36 : 0.45],
      dim: [ink, dark ? 0.014 : 0.02],
    };
    const attr = new THREE.BufferAttribute(positions, 3);
    const group = new THREE.Group();
    group.name = "gv-links";
    for (const [c, idx] of classes) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", attr);
      geo.setIndex(idx);
      const [rgb, opacity] = style[c] ?? style.curated;
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(`rgb(${rgb})`), transparent: true, opacity, depthWrite: false }));
      line.frustumCulled = false;
      line.raycast = () => {};
      line.renderOrder = c === "hi" || c === "focus" ? 2 : 0;
      group.add(line);
    }
    const scene = fg.scene();
    scene.add(group);
    return () => {
      scene.remove(group);
      for (const o of group.children as THREE.LineSegments[]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    };
  }, [fixed, data, emphasis, ink, accent, dark]);

  // ── verses, instanced: one draw call for every verse in view (two while some are dimmed) instead of 701 ──
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !fixed) return;
    const verses = data.nodes.filter((n) => n.type === "Verse");
    if (!verses.length) return;
    const solid: GNode[] = [];
    const dim: GNode[] = [];
    for (const n of verses) (!emphasis || emphasis.nodes.has(String(n.id)) ? solid : dim).push(n);
    const glow = new THREE.Color(NODE_HEX[dark ? "dark" : "light"].verse).multiplyScalar(dark ? 0.14 : 0.02);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const batch = (list: GNode[], dimmed: boolean) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05, emissive: dimmed ? 0x000000 : glow, transparent: dimmed, opacity: dimmed ? (dark ? 0.12 : 0.16) : 1, depthWrite: !dimmed });
      const im = new THREE.InstancedMesh(sphere("lo", tier === "low"), mat, list.length);
      list.forEach((n, i) => {
        const id = String(n.id);
        const r = visuals.current.get(id)?.r ?? radiusOf(n.data, degree.of.get(id) ?? 0, degree.max);
        im.setMatrixAt(i, m4.compose(p.set(n.fx ?? n.x ?? 0, n.fy ?? n.y ?? 0, n.fz ?? n.z ?? 0), q, s.setScalar(r)));
        c.set(baseColor(n));
        if (!dimmed && emphasis && (id === selectedId || id === hoverId || emphasis.kind === "highlight")) c.multiplyScalar(dark ? 1.35 : 0.85);
        im.setColorAt(i, c);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      im.raycast = () => {};
      return im;
    };
    const group = new THREE.Group();
    group.name = "gv-verses";
    if (solid.length) group.add(batch(solid, false));
    if (dim.length) group.add(batch(dim, true));
    const scene = fg.scene();
    scene.add(group);
    return () => {
      scene.remove(group);
      for (const o of group.children as THREE.InstancedMesh[]) {
        (o.material as THREE.Material).dispose();
        o.dispose();
      }
    };
  }, [fixed, data, emphasis, baseColor, dark, degree, selectedId, hoverId, tier]);

  // ── render only while something changes: an idle frame costs nothing (cooler laptops, longer battery) ──
  const awakeUntil = useRef(0);
  const sleeping = useRef(false);
  const startLoop = useRef<(() => void) | null>(null);
  const wake = useCallback((ms = 1200) => {
    awakeUntil.current = Math.max(awakeUntil.current, performance.now() + ms);
    if (sleeping.current && !document.hidden) {
      sleeping.current = false;
      fgRef.current?.resumeAnimation();
      startLoop.current?.();
    }
  }, []);
  useEffect(() => {
    wake(1500);
  }, [fgData, emphasis, selectedId, hoverId, audioVerse, dark, colorBy, size, autoRotate, wake]);
  // ── focus view: one relation tag per kind of connection ("speaks · 574"), on a representative line ──
  useEffect(() => {
    const fg = fgRef.current;
    const ego = data.ego;
    const center = ego ? nodeCache.current.get(ego.id) : undefined;
    if (!fg || !ego || !center) return;
    const group = new THREE.Group();
    group.name = "gv-ego-relations";
    const done = new Set<string>();
    for (const m of ego.pick.members) {
      const k = `${m.type}|${m.outgoing}`;
      const n = nodeCache.current.get(m.id);
      if (done.has(k) || !n) continue;
      done.add(k);
      const meta = RELATIONS[m.type as RelationType];
      const kind = ego.pick.kinds.find((x) => x.type === m.type && x.outgoing === m.outgoing);
      const text = `${m.outgoing ? meta.verb : meta.inverse}${kind && kind.total > kind.shown ? ` · ${kind.total}` : ""}`;
      const tag = new SpriteText(text, mobile ? 4.8 : 4.2, dark ? "#e8c58a" : "#7a4708");
      tag.fontFace = fontFace.current;
      tag.fontWeight = "500";
      tag.backgroundColor = dark ? "rgba(21,20,19,0.9)" : "rgba(255,255,255,0.92)";
      tag.borderColor = dark ? "rgba(227,164,75,0.45)" : "rgba(154,90,12,0.4)";
      tag.borderWidth = 0.3;
      tag.borderRadius = 1.4;
      tag.padding = [1.6, 0.9];
      tag.material.depthTest = false;
      tag.material.depthWrite = false;
      tag.renderOrder = 12;
      const t = 0.55;
      tag.position.set((center.fx ?? 0) + ((n.fx ?? 0) - (center.fx ?? 0)) * t, (center.fy ?? 0) + ((n.fy ?? 0) - (center.fy ?? 0)) * t, (center.fz ?? 0) + ((n.fz ?? 0) - (center.fz ?? 0)) * t);
      group.add(tag);
    }
    const scene = fg.scene();
    scene.add(group);
    wake(900);
    return () => {
      scene.remove(group);
      for (const o of group.children as SpriteText[]) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    };
  }, [data, dark, wake, mobile]);

  // Focus view labels are larger (phones especially), so a neighbourhood framed to fit the screen stays readable.
  useEffect(() => {
    const k = labelScale.current;
    for (const [id, v] of visuals.current) {
      if (!v.label || !v.labelSpec) continue;
      const want = v.labelSpec.size * (egoSet?.has(id) ? k : 1);
      if (v.label.textHeight !== want) v.label.textHeight = want;
    }
    // Verse references are rebuilt at the right size by the next reconcile.
    for (const l of marks.current.verseLabels.values()) l.parent?.remove(l);
    marks.current.verseLabels.clear();
    live.current.dirty = true;
    wake(600);
  }, [egoSet, wake]);

  // Frame the focus neighbourhood when it opens (above the sheet on phones), instead of flying close to one node.
  const egoKey = data.ego?.id ?? null;
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !egoKey) return;
    const ids = new Set(data.nodes.map((n) => String(n.id)));
    wake(1800);
    // Fit the neighbourhood into the part of the screen that is actually visible: below the toolbar and, on phones,
    // above the sheet (the projection is already shifted to centre that strip).
    const fit = () => {
      const cam = fg.camera() as THREE.PerspectiveCamera;
      const center = nodeCache.current.get(egoKey);
      if (!center) return;
      const c = new THREE.Vector3(center.fx ?? 0, center.fy ?? 0, center.fz ?? 0);
      let r = 30;
      for (const n of data.nodes) r = Math.max(r, Math.hypot((n.fx ?? 0) - c.x, (n.fy ?? 0) - c.y, (n.fz ?? 0) - c.z));
      r += mobile ? 14 : 18;
      const { w, h } = size;
      const visH = Math.max(140, h - (mobile ? sheetPx(sheetSnap, h) + TOP_HUD : 110));
      const visW = Math.max(160, w - (mobile ? 16 : 80));
      const tan = Math.tan((cam.fov * Math.PI) / 360);
      const d = Math.max(r / (tan * (visH / h)), r / (tan * cam.aspect * (visW / w)));
      const target = (fg.controls() as { target?: THREE.Vector3 }).target ?? new THREE.Vector3();
      const dir = cam.position.clone().sub(target);
      if (dir.lengthSq() < 1) dir.set(0, 0.45, 1);
      dir.normalize();
      const pos = c.clone().add(dir.multiplyScalar(d));
      fg.cameraPosition({ x: pos.x, y: pos.y, z: pos.z }, { x: c.x, y: c.y, z: c.z }, reduceMotion ? 0 : 800);
    };
    const t = setTimeout(() => (ids.size ? fit() : undefined), 90);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [egoKey, mobile ? sheetSnap : null]);

  useEffect(() => {
    // Development-only handles for performance checks (renderer stats, current data).
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __gvGraph: fgRef.current, __gvGraphData: fgData });
  });

  // ── camera ──
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // Measure the element directly: the ResizeObserver hasn't reported yet on the first run.
    const el = wrapRef.current;
    fg.cameraPosition(homePosition(el?.clientWidth || size.w, el?.clientHeight || size.h), { x: 0, y: 0, z: 0 }, 0);
    const controls = fg.controls() as { enableDamping?: boolean; dampingFactor?: number; minDistance?: number; maxDistance?: number; screenSpacePanning?: boolean; rotateSpeed?: number; addEventListener?: (e: string, fn: () => void) => void };
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 40;
    controls.maxDistance = 2600;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.7;
    controls.addEventListener?.("start", () => useGita.getState().autoRotate && useGita.getState().setAutoRotate(false));
    // Damping keeps the camera gliding after a drag; stay awake while it does.
    controls.addEventListener?.("change", () => wake(700));
    wake(1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const c = fgRef.current?.controls() as { autoRotate?: boolean; autoRotateSpeed?: number } | undefined;
    if (!c) return;
    c.autoRotate = autoRotate && !reduceMotion;
    c.autoRotateSpeed = 0.32;
  }, [autoRotate, reduceMotion]);

  // When the dock overlays the canvas, shift the projection so the centre of attention stays in the visible part:
  // up on phones (bottom sheet), left on tablets (right-hand panel). Desktop docks are in-flow and resize the canvas.
  const dockOpen = !!selectedId || chatOpen;
  useEffect(() => {
    const cam = fgRef.current?.camera() as THREE.PerspectiveCamera | undefined;
    if (!cam?.setViewOffset) return;
    const { w, h } = size;
    // Phones: shift the picture up by half the sheet, so what is selected sits in the part still visible above it.
    if (dockOpen && mobile) cam.setViewOffset(w, h, 0, (sheetPx(chatOpen && !selectedId ? "full" : sheetSnap, h) - TOP_HUD) / 2, w, h);
    else if (dockOpen && !desktop) cam.setViewOffset(w, h, 200, 0, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [dockOpen, mobile, desktop, size, sheetSnap, chatOpen, selectedId]);

  // Pause rendering when the tab is hidden.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        fgRef.current?.pauseAnimation();
        sleeping.current = true;
      } else wake(1200);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [wake]);

  // Camera flights wait for the layout to settle; flying to a node mid-simulation lands inside the cloud.
  const settled = useRef(false);
  const pendingFly = useRef<string | null>(null);
  useEffect(() => {
    settled.current = false;
  }, [data]);
  const flyToNode = useCallback((id: string) => {
    const fg = fgRef.current;
    const n = nodeCache.current.get(id);
    if (!fg || !n || n.x === undefined) return;
    // The focus view frames the whole neighbourhood itself; a close fly-in (e.g. one queued before the layout loaded)
    // would undo that.
    if (egoRef.current === id) return;
    useGita.getState().setAutoRotate(false);
    wake(reduceMotion ? 400 : 1600);
    const { x = 0, y = 0, z = 0 } = n;
    const dist = n.type === "Verse" ? 170 : n.type === "Chapter" ? 230 : 200;
    const len = Math.hypot(x, y, z);
    const pos = len < 1 ? { x: 0, y: dist * 0.45, z: dist } : { x: x * (1 + dist / len), y: y * (1 + dist / len) + dist * 0.4, z: z * (1 + dist / len) };
    fg.cameraPosition(pos, { x, y, z }, reduceMotion ? 0 : 1100);
  }, [reduceMotion, wake]);
  useEffect(() => {
    if (!flyTo) return;
    // The focus view frames its own neighbourhood (below) instead of flying close to one node.
    if (egoRef.current && egoRef.current === flyTo.id) return;
    if (settled.current) flyToNode(flyTo.id);
    else pendingFly.current = flyTo.id;
  }, [flyTo, flyToNode]);
  const onEngineStop = useCallback(() => {
    settled.current = true;
    if (pendingFly.current) {
      flyToNode(pendingFly.current);
      pendingFly.current = null;
    }
  }, [flyToNode]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !highlight?.order?.length || highlight.source !== "path") return;
    const ids = new Set(highlight.order);
    wake(1800);
    const t = setTimeout(() => fg.zoomToFit(reduceMotion ? 0 : 1200, 90, (n) => ids.has(String(n.id))), 120);
    return () => clearTimeout(t);
  }, [highlight, reduceMotion, wake]);

  // Toolbar camera commands (zoom, fit, home).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !cameraCmd) return;
    const ms = reduceMotion ? 0 : 600;
    wake(ms + 500);
    const controls = fg.controls() as { target?: THREE.Vector3 };
    const target = controls.target ?? new THREE.Vector3();
    const cam = fg.camera().position;
    if (cameraCmd.kind === "fit") fg.zoomToFit(ms, 40);
    else if (cameraCmd.kind === "home") {
      fg.cameraPosition(homePosition(size.w, size.h), { x: 0, y: 0, z: 0 }, ms);
    } else {
      const f = cameraCmd.kind === "zoomIn" ? 0.7 : 1.4;
      const next = target.clone().add(cam.clone().sub(target).multiplyScalar(f));
      fg.cameraPosition({ x: next.x, y: next.y, z: next.z }, { x: target.x, y: target.y, z: target.z }, ms * 0.6);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCmd]);

  const tooltip = useCallback(
    (n: GNode) => {
      if (coarse) return "";
      const d = n.data;
      const k = nodeKind(d);
      const head = `<div class="t"><span class="glyph" data-shape="${KIND_META[k].shape}" style="color:var(--n-${k})"></span>${esc(typeName(d))}</div>`;
      const hint = `<div class="hint">Click to open</div>`;
      switch (d.type) {
        case "Verse":
          return `<div class="gv-tip">${head}<div class="h">BG ${d.ref}${d.canonical ? "" : " <span style='font-weight:400;color:var(--text-3)'>(not in the traditional 700)</span>"}</div><div class="deva">${esc(d.sa)}</div><div class="s">${esc(d.snippet)}</div>${hint}</div>`;
        case "Chapter":
          return `<div class="gv-tip">${head}<div class="h">${d.number}. ${esc(d.title)}</div><div class="deva">${esc(d.name)}</div><div class="s">${esc(d.meaning)}. ${d.verseCount} verses.</div>${hint}</div>`;
        case "SanskritConcept":
        case "Emotion":
          return `<div class="gv-tip">${head}<div class="h">${esc(d.label)} <span class="deva" style="font-weight:400">${esc(d.sa)}</span></div><div class="s">${esc(d.en)}. ${esc(d.desc.slice(0, 140))}${d.desc.length > 140 ? "…" : ""}</div>${hint}</div>`;
        case "Character":
          return `<div class="gv-tip">${head}<div class="h">${esc(d.label)} <span class="deva" style="font-weight:400">${esc(d.sa)}</span></div><div class="s">${esc(d.role)}${d.versesSpoken ? `. Speaks ${d.versesSpoken} verses.` : ""}</div>${hint}</div>`;
        case "LifeDilemma":
          return `<div class="gv-tip">${head}<div class="h">${esc(d.label)}</div><div class="s">${esc(d.desc)}</div>${hint}</div>`;
        default:
          return `<div class="gv-tip">${head}<div class="s">${esc(d.label)}</div>${hint}</div>`;
      }
    },
    [coarse],
  );

  // Hover emphasis waits a beat so sweeping across the cloud doesn't strobe.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHover = useCallback(
    (n: GNode | null) => {
      if (coarse) return;
      if (wrapRef.current) wrapRef.current.style.cursor = n ? "pointer" : "";
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      const id = n ? String(n.id) : null;
      hoverTimer.current = setTimeout(() => setHoverId(id), id ? 70 : 140);
    },
    [coarse],
  );
  const onClick = useCallback((n: GNode) => {
    setHoverId(null);
    useGita.getState().select(String(n.id));
  }, []);
  const onBackgroundClick = useCallback(() => {
    if (useGita.getState().selectedId) useGita.getState().select(null);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      aria-label="3D knowledge graph. Use search or the legend to find nodes."
      role="img"
      onPointerDown={() => wake(1500)}
      onPointerMove={() => wake(900)}
      onWheel={() => wake(1200)}
      onTouchStart={() => wake(1500)}
    >
      <ForceGraph3D<NodeT, LinkT>
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={fgData}
        controlType="orbit"
        backgroundColor={dark ? "#0d0c0b" : "#f5f4f1"}
        showNavInfo={false}
        nodeThreeObject={nodeObject}
        nodeLabel={tooltip}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={1}
        linkResolution={4}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleWidth={1.6}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor={() => (dark ? "#f0c27a" : "#9a5a0c")}
        onNodeClick={onClick}
        onNodeHover={onHover}
        onBackgroundClick={onBackgroundClick}
        onEngineStop={onEngineStop}
        enableNodeDrag={false}
        warmupTicks={fixed ? 0 : 90}
        cooldownTicks={fixed ? 0 : 260}
        d3AlphaDecay={0.022}
        d3VelocityDecay={0.33}
        rendererConfig={rendererConfig}
      />
    </div>
  );
}
