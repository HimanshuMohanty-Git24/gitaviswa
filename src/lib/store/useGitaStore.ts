"use client";
import { create } from "zustand";
import type { DeletedThought, GraphData, NodeLabel, PersonalThought, Verse, VersesDoc, ViewMode } from "@/lib/types";
import { decodeEmbeddings, loadEmbeddings, loadGraph, loadVerses } from "@/lib/data/loader";
import { buildGraphs, type GitaGraphs } from "@/lib/graph/graphStore";
import { detectCommunities, type Communities } from "@/lib/graph/communities";
import type { RelationGroup } from "@/lib/graph/relations";
import { buildSearchIndex, type SearchIndex } from "@/lib/graphrag/search";
import type { RagContext } from "@/lib/graphrag/engine";
import { loadThoughts, type ThoughtLoad } from "./personalStore";
import { describeStorageError } from "./thoughtModel";
import { useDraft } from "./draftStore";

export type HighlightSource = "path" | "chat" | "stem" | "thread" | "chain" | "manas" | "search" | "audio";
export interface Highlight {
  nodes: Set<string>;
  edges: Set<string>;
  label: string;
  source: HighlightSource;
  /** ordered node ids for path-like highlights (camera tour) */
  order?: string[];
}

export type ThemePref = "auto" | "dark" | "light";
export type CameraCmd = { kind: "fit" | "zoomIn" | "zoomOut" | "home"; nonce: number };
export type DockTab = "details" | "ask";
export type ColorBy = "label" | "community" | "chapter";
export type ScriptChoice = "deva" | "iast" | "phonetic" | "odia" | "bengali" | "gujarati" | "tamil" | "telugu" | "kannada" | "malayalam";

interface GitaState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  versesDoc: VersesDoc | null;
  graphData: GraphData | null;
  graphs: GitaGraphs | null;
  versesById: Map<string, Verse>;
  index: SearchIndex | null;
  indexStatus: "idle" | "building" | "ready" | "error";
  communities: Communities | null;
  thoughts: PersonalThought[];
  /** "error" means saved thoughts could not be read — distinct from having none. */
  thoughtsStatus: "loading" | "ready" | "error";
  thoughtsError?: string;
  /** Stored records this version could not read (kept untouched). */
  thoughtsUnreadable: number;
  /** "Recently deleted", newest first. */
  trash: DeletedThought[];
  graphVersion: number;

  view: ViewMode;
  themePref: ThemePref;
  /** resolved theme actually applied to <html> */
  theme: "dark" | "light";
  dockTab: DockTab;
  welcomeOpen: boolean;
  cameraCmd: CameraCmd | null;
  autoRotate: boolean;
  selectedId: string | null;
  lineageFocus: string | null;
  readerChapter: number;
  highlight: Highlight | null;
  hoverStem: string | null;
  layers: Record<NodeLabel, boolean>;
  edgeGroups: Record<RelationGroup, boolean>;
  colorBy: ColorBy;
  chatOpen: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  script: ScriptChoice;
  translationLang: string;
  enAuthor: number;
  hiAuthor: number;
  flyTo: { id: string; nonce: number } | null;

  init: () => Promise<void>;
  ragContext: () => RagContext | null;
  setThoughts: (t: PersonalThought[] | ThoughtLoad) => void;
  reloadThoughts: () => Promise<void>;
  setView: (v: ViewMode) => void;
  setThemePref: (t: ThemePref) => void;
  setTheme: (t: "dark" | "light") => void;
  setDockTab: (t: DockTab) => void;
  setWelcomeOpen: (o: boolean) => void;
  camera: (kind: CameraCmd["kind"]) => void;
  setAutoRotate: (on: boolean) => void;
  select: (id: string | null, opts?: { fly?: boolean }) => void;
  focusLineage: (id: string) => void;
  openChapter: (n: number) => void;
  setHighlight: (h: Highlight | null) => void;
  setHoverStem: (k: string | null) => void;
  toggleLayer: (l: NodeLabel) => void;
  setLayer: (l: NodeLabel, on: boolean) => void;
  toggleEdgeGroup: (g: RelationGroup) => void;
  setColorBy: (c: ColorBy) => void;
  setChatOpen: (o: boolean) => void;
  setPaletteOpen: (o: boolean) => void;
  setSettingsOpen: (o: boolean) => void;
  setScript: (s: ScriptChoice) => void;
  setTranslationLang: (l: string) => void;
  setAuthors: (en?: number, hi?: number) => void;
  fly: (id: string) => void;
}

export const useGita = create<GitaState>((set, get) => ({
  status: "idle",
  versesDoc: null,
  graphData: null,
  graphs: null,
  versesById: new Map(),
  index: null,
  indexStatus: "idle",
  communities: null,
  thoughts: [],
  thoughtsStatus: "loading",
  thoughtsUnreadable: 0,
  trash: [],
  graphVersion: 0,

  view: "cosmos",
  themePref: "auto",
  theme: "dark",
  dockTab: "details",
  welcomeOpen: false,
  cameraCmd: null,
  autoRotate: true,
  selectedId: null,
  lineageFocus: "BG_2.47",
  readerChapter: 2,
  highlight: null,
  hoverStem: null,
  layers: { Chapter: true, Verse: true, SanskritConcept: true, Emotion: true, Character: true, LifeDilemma: true, PersonalThought: true },
  edgeGroups: { structure: true, lexical: true, curated: true, personal: true },
  colorBy: "label",
  chatOpen: false,
  paletteOpen: false,
  settingsOpen: false,
  script: "deva",
  translationLang: "en",
  enAuthor: 16,
  hiAuthor: 17,
  flyTo: null,

  init: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading" });
    try {
      // Personal storage failing must not stop the Gita from loading, and must not look like an empty history.
      const personal = loadThoughts().then(
        (l) => ({ thoughts: l.thoughts, thoughtsUnreadable: l.unreadable, trash: l.trash ?? [], thoughtsStatus: "ready" as const, thoughtsError: undefined }),
        (e) => ({ thoughts: [] as PersonalThought[], thoughtsUnreadable: 0, trash: [] as DeletedThought[], thoughtsStatus: "error" as const, thoughtsError: describeStorageError(e) }),
      );
      const [versesDoc, graphData, mine] = await Promise.all([loadVerses(), loadGraph(), personal, useDraft.getState().hydrate()]);
      const graphs = buildGraphs(graphData, mine.thoughts);
      set({
        versesDoc,
        graphData,
        graphs,
        ...mine,
        versesById: new Map(versesDoc.verses.map((v) => [v.id, v])),
        enAuthor: versesDoc.meta.defaults.en,
        hiAuthor: versesDoc.meta.defaults.hi,
        status: "ready",
        graphVersion: 1,
      });
      // Communities & the search index are built off the critical path.
      const idle = (fn: () => void) => (typeof window !== "undefined" && "requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 50));
      idle(() => set({ communities: detectCommunities(graphs) }));
      idle(async () => {
        set({ indexStatus: "building" });
        try {
          const emb = await loadEmbeddings();
          const vectors = emb ? decodeEmbeddings(emb) : null;
          set({ index: await buildSearchIndex(versesDoc, graphData, vectors), indexStatus: "ready" });
        } catch (e) {
          console.error("search index failed", e);
          set({ indexStatus: "error" });
        }
      });
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  ragContext: () => {
    const s = get();
    if (!s.graphs || !s.versesDoc || !s.graphData) return null;
    return { graphs: s.graphs, versesById: s.versesById, versesDoc: s.versesDoc, data: s.graphData, index: s.index };
  },

  setThoughts: (next) => {
    const { thoughts, unreadable, trash } = Array.isArray(next) ? { thoughts: next, unreadable: get().thoughtsUnreadable, trash: undefined } : next;
    const ok = { thoughts, thoughtsUnreadable: unreadable, thoughtsStatus: "ready" as const, thoughtsError: undefined, ...(trash ? { trash } : {}) };
    const { graphData } = get();
    if (!graphData) return set(ok);
    set({ ...ok, graphs: buildGraphs(graphData, thoughts), graphVersion: get().graphVersion + 1 });
  },
  reloadThoughts: async () => {
    set({ thoughtsStatus: "loading" });
    try {
      get().setThoughts(await loadThoughts());
    } catch (e) {
      set({ thoughtsStatus: "error", thoughtsError: describeStorageError(e) });
    }
  },

  setView: (view) => set({ view }),
  setThemePref: (themePref) => {
    set({ themePref });
    try {
      localStorage.setItem("gitaviswa:theme", themePref);
    } catch {}
  },
  select: (id, opts) => {
    set(id ? { selectedId: id, dockTab: "details" } : { selectedId: null, dockTab: get().chatOpen ? "ask" : "details" });
    if (id && opts?.fly !== false) get().fly(id);
    if (id?.startsWith("BG_")) {
      const v = get().versesById.get(id);
      if (v) set({ readerChapter: v.chapter });
    }
  },
  focusLineage: (id) => set({ lineageFocus: id, view: "darshana" }),
  openChapter: (n) => set({ readerChapter: n, view: "adhyayana" }),
  setHighlight: (highlight) => set({ highlight }),
  setHoverStem: (hoverStem) => set({ hoverStem }),
  toggleLayer: (l) => set({ layers: { ...get().layers, [l]: !get().layers[l] } }),
  setLayer: (l, on) => set({ layers: { ...get().layers, [l]: on } }),
  toggleEdgeGroup: (g) => set({ edgeGroups: { ...get().edgeGroups, [g]: !get().edgeGroups[g] } }),
  setColorBy: (colorBy) => set({ colorBy }),
  setChatOpen: (chatOpen) => set(chatOpen ? { chatOpen, dockTab: "ask" } : { chatOpen, dockTab: "details" }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setScript: (script) => set({ script }),
  setTranslationLang: (translationLang) => set({ translationLang }),
  setAuthors: (en, hi) => set({ ...(en ? { enAuthor: en } : {}), ...(hi ? { hiAuthor: hi } : {}) }),
  fly: (id) => set({ flyTo: { id, nonce: Date.now() } }),
  setTheme: (theme) => set({ theme }),
  setDockTab: (dockTab) => set({ dockTab }),
  setWelcomeOpen: (welcomeOpen) => {
    set({ welcomeOpen });
    if (!welcomeOpen)
      try {
        localStorage.setItem("gitaviswa:welcomed", "1");
      } catch {}
  },
  camera: (kind) => set({ cameraCmd: { kind, nonce: Date.now() } }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
}));

/** "auto" follows the operating system; the whole product shares one theme across every view. */
export function effectiveTheme(pref: ThemePref): "dark" | "light" {
  if (pref !== "auto") return pref;
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
