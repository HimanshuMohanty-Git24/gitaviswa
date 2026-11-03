"use client";
import { CircleHelp, MessagesSquare, Monitor, Moon, Search, Settings, Sun } from "lucide-react";
import { useGita, type ThemePref } from "@/lib/store/useGitaStore";
import { useConnection } from "@/lib/store/settingsStore";
import { PROVIDERS } from "@/lib/llm/providers";
import { BrandMark } from "@/components/sacred/SacredMotifs";
import { useModKey } from "@/lib/hooks/useMedia";
import { VIEWS } from "./views";

const NEXT_THEME: Record<ThemePref, ThemePref> = { auto: "dark", dark: "light", light: "auto" };
const THEME_LABEL: Record<ThemePref, string> = { auto: "System theme", dark: "Dark theme", light: "Light theme" };

export function ThemeButton({ className = "" }: { className?: string }) {
  const themePref = useGita((s) => s.themePref);
  const setThemePref = useGita((s) => s.setThemePref);
  const Icon = themePref === "auto" ? Monitor : themePref === "dark" ? Moon : Sun;
  return (
    <button className={`btn btn-ghost btn-icon ${className}`} onClick={() => setThemePref(NEXT_THEME[themePref])} title={`${THEME_LABEL[themePref]}. Click to switch.`} aria-label={`${THEME_LABEL[themePref]}. Switch theme`}>
      <Icon size={16} />
    </button>
  );
}

/** Connection status for the language model: a real state indicator, so it earns its dot. */
function ModelStatus() {
  const conn = useConnection();
  const setSettingsOpen = useGita((s) => s.setSettingsOpen);
  // Plain status for readers; provider and model details stay in the tooltip and in Settings.
  const label = conn ? "AI available" : "AI not connected";
  return (
    <button className="btn btn-ghost h-8 gap-2 px-2" onClick={() => setSettingsOpen(true, "model")} title={conn ? `${PROVIDERS[conn.provider].name} · ${conn.model}. Open settings.` : "No language model connected. Answers are composed from the graph. Open settings."} aria-label={`Settings. ${label}`}>
      <span className="relative">
        <Settings size={16} />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--bg)]" style={{ background: conn ? "var(--good)" : "var(--text-4)" }} />
      </span>
      <span className="hidden text-[12.5px] xl:inline">{label}</span>
    </button>
  );
}

export function TopNav() {
  const view = useGita((s) => s.view);
  const setView = useGita((s) => s.setView);
  const chatOpen = useGita((s) => s.chatOpen);
  const dockTab = useGita((s) => s.dockTab);
  const setChatOpen = useGita((s) => s.setChatOpen);
  const setDockTab = useGita((s) => s.setDockTab);
  const setPaletteOpen = useGita((s) => s.setPaletteOpen);
  const setWelcomeOpen = useGita((s) => s.setWelcomeOpen);
  const select = useGita((s) => s.select);
  const askActive = chatOpen && dockTab === "ask";
  const mod = useModKey();

  return (
    <header className="relative z-30 grid h-14 shrink-0 grid-cols-[1fr_auto] items-center gap-3 border-b border-line bg-bg px-3 md:grid-cols-[auto_1fr_auto] md:px-4 xl:grid-cols-[1fr_auto_1fr]">
      <button
        className="flex min-w-0 items-center gap-2.5 justify-self-start rounded-[var(--radius-2)] pr-2"
        onClick={() => (select(null), setView("home"))}
        aria-current={view === "home" ? "page" : undefined}
        aria-label="GitaViśva home"
        title="Home"
      >
        <BrandMark size={26} />
        <span className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-text">GitaViśva</span>
          <span className="deva hidden text-[13px] leading-none text-text-3 lg:inline">गीताविश्व</span>
        </span>
      </button>

      <nav className="hidden justify-self-center md:block" aria-label="Views">
        <div className="seg">
          {VIEWS.map((v) => (
            <button key={v.id} aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)} title={`${v.name} · ${v.sa}. ${v.blurb}`} className="!h-8 !px-3">
              <v.icon size={15} />
              <span>{v.name}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="flex items-center gap-1 justify-self-end">
        <button className="btn btn-ghost btn-icon lg:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search" title={`Search (${mod} K)`}>
          <Search size={17} />
        </button>
        <button className="btn hidden h-8 w-[13.5rem] justify-start gap-2 bg-surface px-2.5 text-text-3 lg:inline-flex" onClick={() => setPaletteOpen(true)} title={`Search verses, ideas and feelings (${mod} K)`}>
          <Search size={15} />
          <span className="flex-1 text-left text-[13px]">Search</span>
          <kbd className="kbd">{mod} K</kbd>
        </button>
        <button
          className="btn hidden h-8 md:inline-flex"
          aria-pressed={askActive}
          onClick={() => (chatOpen && dockTab !== "ask" ? setDockTab("ask") : setChatOpen(!chatOpen))}
          title="Ask a question. Answers are grounded in the graph and lit up on the canvas."
        >
          <MessagesSquare size={15} />
          Ask
        </button>
        <span className="mx-1 hidden h-5 w-px bg-line-2 md:block" />
        <ThemeButton />
        <button className="btn btn-ghost btn-icon hidden md:inline-flex" onClick={() => setWelcomeOpen(true)} title="Guide: what each view does" aria-label="Open the guide">
          <CircleHelp size={16} />
        </button>
        <ModelStatus />
      </div>
    </header>
  );
}

/** Bottom tab bar for phones: the four views plus Ask, always one thumb away. */
export function MobileTabBar() {
  const view = useGita((s) => s.view);
  const setView = useGita((s) => s.setView);
  const chatOpen = useGita((s) => s.chatOpen);
  const dockTab = useGita((s) => s.dockTab);
  const setChatOpen = useGita((s) => s.setChatOpen);
  const setDockTab = useGita((s) => s.setDockTab);
  const askActive = chatOpen && dockTab === "ask";
  const item = "flex flex-1 flex-col items-center justify-center gap-1 pt-1.5 text-[11px] font-medium transition-colors";
  return (
    <nav className="safe-bottom relative z-30 shrink-0 border-t border-line bg-bg md:hidden" aria-label="Views">
      <div className="flex h-14">
        {VIEWS.map((v) => {
          const on = view === v.id && !askActive;
          return (
            <button
              key={v.id}
              className={`${item} ${on ? "text-text" : "text-text-3"}`}
              aria-current={on ? "page" : undefined}
              onClick={() => {
                setView(v.id);
                if (askActive) setChatOpen(false);
              }}
            >
              <v.icon size={20} className={on ? "text-accent-text" : ""} />
              {v.name}
            </button>
          );
        })}
        <button className={`${item} ${askActive ? "text-text" : "text-text-3"}`} aria-pressed={askActive} onClick={() => (chatOpen && dockTab !== "ask" ? setDockTab("ask") : setChatOpen(!chatOpen))}>
          <MessagesSquare size={20} className={askActive ? "text-accent-text" : ""} />
          Ask
        </button>
      </div>
    </nav>
  );
}
