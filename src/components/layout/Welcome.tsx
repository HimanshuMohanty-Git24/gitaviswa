"use client";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, MessagesSquare, ShieldCheck, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { useModKey } from "@/lib/hooks/useMedia";
import { BrandMark } from "@/components/sacred/SacredMotifs";
import { VIEWS } from "./views";

/** First-run guide (and the "?" help). Explains the four views and Ask in plain language, then gets out of the way. */
export function Welcome() {
  const open = useGita((s) => s.welcomeOpen);
  const setOpen = useGita((s) => s.setWelcomeOpen);
  const setView = useGita((s) => s.setView);
  const setChatOpen = useGita((s) => s.setChatOpen);
  const graphs = useGita((s) => s.graphs);
  const mod = useModKey();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const go = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            className="popover relative flex max-h-[92dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-b-none sm:rounded-b-[var(--radius-3)]"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <button className="btn btn-ghost btn-icon absolute right-3 top-3" onClick={() => setOpen(false)} aria-label="Close guide">
              <X size={16} />
            </button>
            <div className="overflow-y-auto px-6 pb-6 pt-7 sm:px-8">
              <BrandMark size={34} />
              <h2 id="welcome-title" className="mt-4 text-[22px] font-semibold tracking-[-0.015em] text-text">
                The Bhagavad Gita as a knowledge graph
              </h2>
              <p className="mt-2 max-w-[54ch] text-[14px] leading-[1.6] text-text-2">
                Every one of the {graphs ? graphs.graph.order.toLocaleString() : "857"} points in GitaViśva is a verse, an idea, a state of mind or a life situation, and the {graphs ? graphs.graph.size.toLocaleString() : "5,350"} lines between them say how they relate. There are four ways in.
              </p>

              <ul className="mt-5 divide-y divide-line overflow-hidden rounded-[var(--radius-3)] border border-line">
                {VIEWS.map((v) => (
                  <li key={v.id}>
                    <button className="group flex w-full items-start gap-3.5 bg-surface-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-3" onClick={() => go(() => setView(v.id))}>
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-2)] border border-line-2 bg-surface text-accent-text">
                        <v.icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="text-[14px] font-semibold text-text">{v.name}</span>
                          <span className="text-[12px] text-text-3">{v.sa}</span>
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-5 text-text-2">{v.blurb}</span>
                      </span>
                      <ArrowRight size={15} className="mt-2 shrink-0 text-text-4 transition-transform group-hover:translate-x-0.5 group-hover:text-text-2" />
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    className="group flex w-full items-start gap-3.5 bg-surface-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-3"
                    onClick={() => go(() => setChatOpen(true))}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-2)] border border-line-2 bg-surface text-accent-text">
                      <MessagesSquare size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[14px] font-semibold text-text">Ask</span>
                        <span className="text-[12px] text-text-3">Pārtha-Sārathi</span>
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-5 text-text-2">
                        Available from every view. Ask about an idea, compare verses, or describe what you are going through. Each answer shows the part of the graph it drew on.
                      </span>
                    </span>
                    <ArrowRight size={15} className="mt-2 shrink-0 text-text-4 transition-transform group-hover:translate-x-0.5 group-hover:text-text-2" />
                  </button>
                </li>
              </ul>

              <div className="mt-5 flex items-start gap-2 text-[12.5px] leading-5 text-text-3">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-good" />
                <span>Everything works offline. Your reflections never leave this browser, and a language model is optional: connect one in Settings for written answers.</span>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button className="btn btn-primary btn-lg" onClick={() => go(() => setView("cosmos"))}>
                  Start exploring
                </button>
                <span className="text-[12.5px] text-text-3">
                  Search anything with <kbd className="kbd">{mod} K</kbd>
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
