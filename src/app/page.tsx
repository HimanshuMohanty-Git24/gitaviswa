"use client";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { RotateCw, TriangleAlert } from "lucide-react";
import { effectiveTheme, useGita, type ThemePref } from "@/lib/store/useGitaStore";
import { useSettings } from "@/lib/store/settingsStore";
import { MobileTabBar, TopNav } from "@/components/layout/TopNav";
import { RightDock } from "@/components/layout/SidePanel";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Welcome } from "@/components/layout/Welcome";
import { GraphHud } from "@/components/graph/GraphHud";
import { AudioDock } from "@/components/reader/AudioDock";
import { ChapterReader } from "@/components/reader/ChapterReader";
import { askPartha } from "@/components/chat/GraphRagChatbot";
import { PersonalMindMapper } from "@/components/manas/PersonalMindMapper";
import Home from "@/components/home/Home";
import { ByokSettingsModal } from "@/components/settings/ByokSettingsModal";
import { BrandMark } from "@/components/sacred/SacredMotifs";
import { describeNode, findSutraPath } from "@/lib/graph/pathfinder";
import { getReadingPosition } from "@/lib/store/readingPosition";
import type { ViewMode } from "@/lib/types";

const VIEW_IDS: ViewMode[] = ["home", "cosmos", "darshana", "adhyayana", "manas"];
const isView = (v: string | null): v is ViewMode => !!v && (VIEW_IDS as string[]).includes(v);
/** `/` is the home page. Links from before it existed (`/?node=…`, `/?trace=…`, `/?ask=…`) still open Explore. */
function viewFromQuery(qs: URLSearchParams): ViewMode {
  const v = qs.get("view");
  if (isView(v)) return v;
  return qs.get("node") || qs.get("trace") || qs.get("ask") || qs.get("chat") === "1" ? "cosmos" : "home";
}

function ViewLoading({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" role="status">
      <div className="w-48 text-center">
        <div className="progress-indeterminate" />
        <div className="mt-3 text-[12.5px] text-text-3">{label}</div>
      </div>
    </div>
  );
}

// WebGL & layout engines are browser-only.
const CosmicGraph3D = dynamic(() => import("@/components/graph/CosmicGraph3D"), { ssr: false, loading: () => <ViewLoading label="Preparing the 3D graph" /> });
const LineageGraph2D = dynamic(() => import("@/components/graph/LineageGraph2D"), { ssr: false, loading: () => <ViewLoading label="Laying out connections" /> });

function AppLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6" role="status" aria-live="polite">
      <div className="flex w-full max-w-[280px] flex-col items-center text-center">
        <BrandMark size={40} />
        <div className="mt-5 text-[15px] font-semibold text-text">Loading the Gita</div>
        <div className="mt-1 text-[13px] text-text-3">701 verses and the relationships between them</div>
        <div className="progress-indeterminate mt-5 w-full" />
      </div>
    </div>
  );
}

function AppError({ error }: { error?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6" role="alert">
      <div className="panel w-full max-w-md p-6">
        <div className="flex items-center gap-2 text-danger">
          <TriangleAlert size={17} />
          <span className="text-[15px] font-semibold">The graph could not be loaded</span>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-text-2">{error || "The data files did not load."}</p>
        <p className="mt-3 text-[13px] leading-5 text-text-3">Check your connection and try again. Your saved thoughts are stored separately and are not affected.</p>
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-2 text-[12px] leading-5 text-text-3">
            Developer: if the data files are missing, rebuild them with <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[12px] text-text">npm run data</code>.
          </p>
        )}
        <button className="btn mt-5" onClick={() => window.location.reload()}>
          <RotateCw size={14} /> Try again
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const status = useGita((s) => s.status);
  const error = useGita((s) => s.error);
  const view = useGita((s) => s.view);
  const themePref = useGita((s) => s.themePref);
  const selectedId = useGita((s) => s.selectedId);

  useEffect(() => {
    const pref = (typeof localStorage !== "undefined" && localStorage.getItem("gitaviswa:theme")) as ThemePref | null;
    if (pref === "dark" || pref === "light" || pref === "auto") useGita.setState({ themePref: pref });
    // Deep links: ?view=darshana&node=BG_2.47&chapter=2
    const qs = new URLSearchParams(window.location.search);
    const startView = viewFromQuery(qs);
    useGita.setState({ view: startView });
    if (startView === "home") delete document.documentElement.dataset.entry;
    const ch = Number(qs.get("chapter"));
    if (ch >= 1 && ch <= 18) useGita.setState({ readerChapter: ch });
    else {
      const pos = getReadingPosition();
      if (pos) useGita.setState({ readerChapter: pos.chapter });
    }
    if (qs.get("chat") === "1") useGita.getState().setChatOpen(true);
    if (qs.get("settings") === "1") useGita.setState({ settingsOpen: true });
    const ask = qs.get("ask");
    if (ask) askPartha(ask.slice(0, 500));
    const node = qs.get("node");
    // First visit with no specific destination: the home page is the introduction. Arriving straight in a view
    // (a shared ?view= link) shows the short guide once instead.
    let welcomed = true;
    try {
      welcomed = !!localStorage.getItem("gitaviswa:welcomed");
      if (!welcomed && startView === "home") localStorage.setItem("gitaviswa:welcomed", "1");
    } catch {}
    if (!welcomed && startView !== "home" && !node && !ask && !qs.get("trace") && !qs.get("settings")) useGita.setState({ welcomeOpen: true });
    useGita
      .getState()
      .init()
      .then(() => {
        const g = useGita.getState();
        if (node && g.graphs?.graph.hasNode(node)) g.select(node);
        // ?trace=emotion:bhaya,concept:samatva lights a path on load
        const [a, b] = (qs.get("trace") || "").split(",");
        const p = a && b && g.graphs ? findSutraPath(g.graphs, a, b) : null;
        if (p && g.graphs)
          g.setHighlight({ nodes: new Set(p.nodes), edges: new Set(p.steps.map((x) => x.edgeKey)), label: `Path from ${describeNode(g.graphs.nodeById.get(a))} to ${describeNode(g.graphs.nodeById.get(b))}`, source: "path", order: p.nodes });
      });
    useSettings.getState().loadEnv();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // One theme for the whole product: pinned, or following the system live.
  useEffect(() => {
    const apply = () => {
      const t = effectiveTheme(themePref);
      document.documentElement.dataset.theme = t;
      useGita.getState().setTheme(t);
    };
    apply();
    if (themePref !== "auto") return;
    const m = window.matchMedia("(prefers-color-scheme: light)");
    m.addEventListener("change", apply);
    return () => m.removeEventListener("change", apply);
  }, [themePref]);

  // A deep link hid the server-rendered home page (layout.tsx); show it again once it has left (after its fade-out),
  // so going home later works normally.
  useEffect(() => {
    const root = document.documentElement;
    if (!root.dataset.entry) return;
    // The first pass renders the server's "home" before the URL's view is applied; the store already knows better.
    if (view === "home") {
      if (useGita.getState().view === "home") delete root.dataset.entry;
      return;
    }
    const t = window.setTimeout(() => delete root.dataset.entry, 400);
    return () => window.clearTimeout(t);
  }, [view]);

  // Escape steps back one level: highlight → selection. (Dialogs handle their own Escape first.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const s = useGita.getState();
      if (s.paletteOpen || s.settingsOpen || s.welcomeOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (s.highlight) s.setHighlight(null);
      else if (s.selectedId) s.select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the URL shareable. Moving to another view adds a history entry, so browser/system Back retraces your path
  // instead of leaving the app; selections and chapter changes replace the current entry.
  const readerChapter = useGita((s) => s.readerChapter);
  const lastView = useRef<string | null>(null);
  const popping = useRef(false);
  useEffect(() => {
    if (status !== "ready") return;
    const changedView = lastView.current !== null && lastView.current !== view;
    lastView.current = view;
    const fromPop = popping.current;
    popping.current = false;
    const qs = new URLSearchParams();
    if (view !== "home" || selectedId) qs.set("view", view);
    if (selectedId) qs.set("node", selectedId);
    if (view === "adhyayana") qs.set("chapter", String(readerChapter));
    const next = `${window.location.pathname}${qs.size ? `?${qs}` : ""}`;
    if (next === window.location.pathname + window.location.search) return;
    if (changedView && !fromPop) window.history.pushState(null, "", next);
    else window.history.replaceState(null, "", next);
  }, [status, view, selectedId, readerChapter]);
  // Back / Forward: restore the view, chapter and selection the URL describes.
  useEffect(() => {
    const onPop = () => {
      const qs = new URLSearchParams(window.location.search);
      const ch = Number(qs.get("chapter"));
      const node = qs.get("node");
      const g = useGita.getState();
      popping.current = true;
      useGita.setState({ view: viewFromQuery(qs), ...(ch >= 1 && ch <= 18 ? { readerChapter: ch } : {}) });
      if (node && g.graphs?.graph.hasNode(node)) g.select(node, { fly: false });
      else if (!node && g.selectedId) g.select(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-dvh flex-col bg-bg text-text">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-[var(--radius-2)] focus:bg-accent focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-accent-ink">
          Skip to content
        </a>
        <TopNav />
        <div className="relative flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1 overflow-hidden" id="main" tabIndex={-1}>
            {/* The home page paints straight away; the tools wait for the data. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={view} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                {view === "home" ? (
                  <Home />
                ) : status === "error" ? (
                  <AppError error={error} />
                ) : status !== "ready" ? (
                  <AppLoading />
                ) : (
                  <>
                    {view === "cosmos" && (
                      <>
                        <CosmicGraph3D />
                        <GraphHud />
                      </>
                    )}
                    {view === "darshana" && <LineageGraph2D />}
                    {view === "adhyayana" && <ChapterReader />}
                    {view === "manas" && <PersonalMindMapper />}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
          {status === "ready" && <RightDock />}
        </div>
        <AudioDock />
        <MobileTabBar />
        <CommandPalette />
        <ByokSettingsModal />
        <Welcome />
      </div>
    </MotionConfig>
  );
}
