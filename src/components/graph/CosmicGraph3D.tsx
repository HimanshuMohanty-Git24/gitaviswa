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
import type { GraphNode, NodeLabel, RelationType } from "@/lib/types";

type NodeT = { id: string; type: NodeLabel; label: string; data: GraphNode };
type LinkT = { key: string; type: RelationType; group: RelationGroup; suggested?: boolean };
type GNode = NodeObject<NodeT>;
type GLink = LinkObject<NodeT, LinkT>;

const RING_R = 380;
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

const LINK_DIST: Partial<Record<RelationType, number>> = {
  BELONGS_TO: 30, NEXT_VERSE: 9, SPOKE: 240, NARRATED: 240, ADDRESSES: 60, MENTIONS_CHARACTER: 180, MENTIONS_CONCEPT: 120,
  MENTIONS_STATE: 120, EXPOUNDS: 150, NEXT_CHAPTER: 120,
};
const LINK_STR: Partial<Record<RelationType, number>> = {
  BELONGS_TO: 0.9, NEXT_VERSE: 0.5, SPOKE: 0.003, NARRATED: 0.003, ADDRESSES: 0.02, MENTIONS_CHARACTER: 0.008, MENTIONS_CONCEPT: 0.025,
  MENTIONS_STATE: 0.025, EXPOUNDS: 0.04, NEXT_CHAPTER: 0,
};

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
const sphere = (detail: "lo" | "mid" | "hi") => {
  let g = geoCache.get(detail);
  if (!g) {
    g = detail === "lo" ? new THREE.SphereGeometry(1, 10, 8) : detail === "mid" ? new THREE.SphereGeometry(1, 22, 16) : new THREE.SphereGeometry(1, 36, 26);
    geoCache.set(detail, g);
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
  const nodeCache = useRef(new Map<string, GNode>());
  const materials = useRef(new Map<string, THREE.Material>());
  const fontFace = useRef("Inter, system-ui, sans-serif");
  // Latest visual inputs for the frame loop; `dirty` asks it to re-apply materials and markers.
  const live = useRef<{ emphasis: Emphasis | null; selectedId: string | null; hoverId: string | null; audioVerse: string | null; dark: boolean; material: MaterialFn | null; dirty: boolean }>({
    emphasis: null, selectedId: null, hoverId: null, audioVerse: null, dark: true, material: null, dirty: true,
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

  // ── graph data (re-filtered on layer changes; node objects are reused so positions persist) ──
  const data = useMemo(() => {
    if (!graphs) return { nodes: [] as GNode[], links: [] as GLink[] };
    const nodes: GNode[] = [];
    graphs.graph.forEachNode((id, attr) => {
      if (!layers[attr.type]) return;
      let n = nodeCache.current.get(id);
      if (!n) {
        n = { id, type: attr.type, label: attr.label, data: attr };
        if (attr.type === "Chapter") {
          const th = ((attr.number - 1) / 18) * Math.PI * 2;
          n.fx = RING_R * Math.cos(th);
          n.fz = RING_R * Math.sin(th);
          n.fy = 26 * Math.sin(th * 3);
        }
        if (id === "character:krishna") {
          n.fx = 0;
          n.fy = 0;
          n.fz = 0;
        }
        nodeCache.current.set(id, n);
      }
      n.data = attr;
      nodes.push(n);
    });
    const visible = new Set(nodes.map((n) => n.id));
    const links: GLink[] = [];
    graphs.graph.forEachEdge((key, attr, s, t) => {
      const group = RELATIONS[attr.type].group;
      if (!edgeGroups[group] || !visible.has(s) || !visible.has(t)) return;
      links.push({ key, source: s, target: t, type: attr.type, group, ...(group === "personal" && isSuggestedEdge(attr.props) ? { suggested: true } : {}) });
    });
    return { nodes, links };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphs, graphVersion, layers, edgeGroups]);

  // ── forces ──
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const link = fg.d3Force("link");
    link?.distance?.((l: GLink) => LINK_DIST[l.type] ?? 85).strength?.((l: GLink) => LINK_STR[l.type] ?? 0.07);
    fg.d3Force("charge")?.strength?.(-22).distanceMax?.(420);
    // Keep the cosmos inside its wheel: ontology inside the inner circle, verses near the rim, all near the plane.
    let nodes: GNode[] = [];
    const contain = Object.assign(
      (alpha: number) => {
        for (const n of nodes) {
          if (n.fx !== undefined || n.x === undefined || n.z === undefined) continue;
          const r = Math.hypot(n.x, n.z);
          const max = n.type === "Verse" ? RING_R * 1.2 : RING_R * 0.72;
          if (r > max) {
            const k = ((r - max) / r) * alpha * 0.35;
            n.vx = (n.vx ?? 0) - n.x * k;
            n.vz = (n.vz ?? 0) - n.z * k;
          }
          n.vy = (n.vy ?? 0) - (n.y ?? 0) * alpha * 0.03;
        }
      },
      { initialize: (ns: GNode[]) => (nodes = ns) },
    );
    fg.d3Force("contain", contain);
    fg.d3ReheatSimulation();
  }, [data]);

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
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.toneMapping = THREE.NoToneMapping;
    return () => {
      scene.remove(group);
      circle.geometry.dispose();
      (circle.material as THREE.Material).dispose();
    };
  }, [dark]);

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
        mesh = new THREE.Mesh(sphere(kind === "verse" ? "lo" : kind === "chapter" || r > 5 ? "hi" : "mid"), material(color, "base"));
        mesh.scale.setScalar(r);
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
      if (kind !== "verse") {
        const text = d.type === "Chapter" ? `${ROMAN[d.number]}  ${d.title}` : d.label;
        label = new SpriteText(text, kind === "chapter" ? 8.5 : d.id === "character:krishna" ? 6.4 : 5, dark ? (kind === "chapter" ? "#edeae4" : "#cfc9bf") : kind === "chapter" ? "#1b1a17" : "#3a3732");
        label.fontFace = fontFace.current;
        label.fontWeight = kind === "chapter" ? "600" : "500";
        label.strokeWidth = 0.9;
        label.strokeColor = dark ? "rgba(13,12,11,0.85)" : "rgba(245,244,241,0.9)";
        label.material.depthWrite = false;
        label.material.opacity = kind === "chapter" ? 0.92 : 0;
        label.visible = kind === "chapter";
        label.position.y = r + (kind === "chapter" ? 10.5 : 6.5);
        group.add(label);
      }
      visuals.current.set(n.id, { group, mesh, ringSprite, label, kind, color, r, labelOpacity: label?.material.opacity ?? 0 });
      live.current.dirty = true;
      return group;
    },
    [baseColor, material, dark, degree],
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
  live.current = { ...live.current, emphasis, selectedId, hoverId, audioVerse, dark, material };
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
    if (e?.kind === "highlight" && e.nodes.size <= 40) for (const id of e.nodes) if (id.startsWith("BG_")) want.add(id);
    for (const [id, l] of m.verseLabels) {
      if (want.has(id) && l.parent === visuals.current.get(id)?.group) continue;
      l.parent?.remove(l);
      m.verseLabels.delete(id);
    }
    for (const id of want) {
      const v = visuals.current.get(id);
      if (!v || m.verseLabels.has(id)) continue;
      const l = new SpriteText(id.replace("BG_", ""), 4.6, dk ? "#edeae4" : "#1b1a17");
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
    const p = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const fg = fgRef.current;
      if (!fg) return;
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
      const forceAll = !!e && e.nodes.size <= 60;
      for (const [id, v] of visuals.current) {
        if (!v.label) continue;
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
        v.labelOpacity += (target - v.labelOpacity) * 0.2;
        if (Math.abs(v.labelOpacity - target) < 0.004) v.labelOpacity = target;
        v.label.material.opacity = v.labelOpacity;
        v.label.visible = v.labelOpacity > 0.02;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
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
    if (dockOpen && mobile) cam.setViewOffset(w, h, 0, h * 0.27, w, h);
    else if (dockOpen && !desktop) cam.setViewOffset(w, h, 200, 0, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [dockOpen, mobile, desktop, size]);

  // Pause rendering when the tab is hidden.
  useEffect(() => {
    const onVis = () => (document.hidden ? fgRef.current?.pauseAnimation() : fgRef.current?.resumeAnimation());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

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
    useGita.getState().setAutoRotate(false);
    const { x = 0, y = 0, z = 0 } = n;
    const dist = n.type === "Verse" ? 170 : n.type === "Chapter" ? 230 : 200;
    const len = Math.hypot(x, y, z);
    const pos = len < 1 ? { x: 0, y: dist * 0.45, z: dist } : { x: x * (1 + dist / len), y: y * (1 + dist / len) + dist * 0.4, z: z * (1 + dist / len) };
    fg.cameraPosition(pos, { x, y, z }, reduceMotion ? 0 : 1100);
  }, [reduceMotion]);
  useEffect(() => {
    if (!flyTo) return;
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
    const t = setTimeout(() => fg.zoomToFit(reduceMotion ? 0 : 1200, 90, (n) => ids.has(String(n.id))), 120);
    return () => clearTimeout(t);
  }, [highlight, reduceMotion]);

  // Toolbar camera commands (zoom, fit, home).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !cameraCmd) return;
    const ms = reduceMotion ? 0 : 600;
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
    <div ref={wrapRef} className="absolute inset-0" aria-label="3D knowledge graph. Use search or the legend to find nodes." role="img">
      <ForceGraph3D<NodeT, LinkT>
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={data}
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
        warmupTicks={90}
        cooldownTicks={260}
        d3AlphaDecay={0.022}
        d3VelocityDecay={0.33}
        rendererConfig={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      />
    </div>
  );
}
