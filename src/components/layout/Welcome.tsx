"use client";
import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, ChevronDown, MessagesSquare, NotebookPen, ShieldCheck, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { useDraft } from "@/lib/store/draftStore";
import { useModKey } from "@/lib/hooks/useMedia";
import { useModal } from "@/lib/hooks/useModal";
import { BrandMark } from "@/components/sacred/SacredMotifs";
import { VIEWS } from "./views";

/**
 * First-run guide (and the brand / "?" help). Leads with what a person can do — keep a thought, understand one
 * verse, ask — and keeps the tour of the graph views as a secondary "other ways in".
 */
export function Welcome() {
  const open = useGita((s) => s.welcomeOpen);
  const setOpen = useGita((s) => s.setWelcomeOpen);
  const setView = useGita((s) => s.setView);
  const setChatOpen = useGita((s) => s.setChatOpen);
  const mod = useModKey();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  useModal(open, overlayRef, dialogRef, () => setOpen(false), firstRef);

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const paths = [
    {
      icon: NotebookPen,
      title: "Save a thought",
      blurb: "A feeling, a question, or an idea. Keep it in your own words; connections to the Gita are optional.",
      run: () => {
        setView("manas");
        useDraft.getState().requestFocus();
      },
    },
    {
      icon: BookOpen,
      title: "Understand one verse",
      blurb: "A five-minute start: one famous verse, its setting, a plain explanation, and room for your own view.",
      run: () => useGita.getState().openLesson(true),
    },
    {
      icon: MessagesSquare,
      title: "Ask a question",
      blurb: "About an idea, a verse or a comparison. Answers show the verses they draw on.",
      run: () => setChatOpen(true),
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            className="popover relative flex max-h-[92dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-b-none sm:rounded-b-[var(--radius-3)]"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <button className="btn btn-ghost btn-icon absolute right-3 top-3 max-sm:h-11 max-sm:w-11" onClick={() => setOpen(false)} aria-label="Close guide">
              <X size={16} />
            </button>
            <div className="overflow-y-auto px-6 pb-6 pt-7 sm:px-8">
              <BrandMark size={34} />
              <h2 id="welcome-title" className="mt-4 pr-8 text-[22px] font-semibold tracking-[-0.015em] text-text">
                A place for your thoughts, with the Gita alongside
              </h2>
              <p className="mt-2 max-w-[52ch] text-[14px] leading-[1.6] text-text-2">Keep what is on your mind, learn one idea at a time, or ask. The Gita is there to explore when you want it; nothing has to connect to it.</p>

              <ul className="mt-5 space-y-2">
                {paths.map((p, i) => (
                  <li key={p.title}>
                    <button ref={i === 0 ? firstRef : undefined} className="group flex w-full items-start gap-3.5 rounded-[var(--radius-3)] border border-line bg-surface-2 px-4 py-3.5 text-left transition-colors hover:border-accent-line hover:bg-surface-3" onClick={() => go(p.run)}>
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-2)] border border-line-2 bg-surface text-accent-text">
                        <p.icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-text">{p.title}</span>
                        <span className="mt-0.5 block text-[13px] leading-5 text-text-2">{p.blurb}</span>
                      </span>
                      <ArrowRight size={15} className="mt-2.5 shrink-0 text-text-4 transition-transform group-hover:translate-x-0.5 group-hover:text-text-2" />
                    </button>
                  </li>
                ))}
              </ul>

              <details className="group mt-4 rounded-[var(--radius-3)] border border-line">
                <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-[13px] font-medium text-text-2 hover:text-text">
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                  Other ways in: the whole Gita as a graph, lineage, the full reader
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {VIEWS.map((v) => (
                    <li key={v.id}>
                      <button className="group/v flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-3" onClick={() => go(() => setView(v.id))}>
                        <v.icon size={15} className="mt-0.5 shrink-0 text-text-3" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="text-[13.5px] font-semibold text-text">{v.name}</span>
                            <span className="text-[12px] text-text-3">{v.sa}</span>
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-5 text-text-2">{v.blurb}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>

              <div className="mt-5 flex items-start gap-2 text-[12.5px] leading-5 text-text-3">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-good" />
                <span>
                  Your thoughts are saved on this device, in this browser; they don&apos;t sync to other devices (use Export to move them). Reading, search and suggestions work without a language model. AI features are optional and send only the text you choose to the provider shown.
                </span>
              </div>
              <div className="mt-4 text-[12.5px] text-text-3">
                Search anything with <kbd className="kbd">{mod} K</kbd>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
