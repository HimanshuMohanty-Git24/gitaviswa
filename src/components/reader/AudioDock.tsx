"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, LoaderCircle, Pause, Play, RotateCcw, SkipBack, SkipForward, SlidersHorizontal, X } from "lucide-react";
import { audio, setCommentaryAfter, useAudio } from "@/lib/store/audioStore";
import { useGita } from "@/lib/store/useGitaStore";
import { LANG_NAME, SPOKEN_COMMENTARIES, spokenLabel } from "@/lib/commentary/traditions";

const fmt = (s: number) => (isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1.5">
      <span>
        <span className="block text-[13px] text-text">{label}</span>
        <span className="block text-[12px] leading-4 text-text-3">{hint}</span>
      </span>
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/**
 * Śravaṇa, the recitation player. It appears only once a listening session has started (Listen buttons live on
 * verses and chapters), so it never costs space as an empty, unexplained bar.
 */
export function AudioDock() {
  const a = useAudio();
  const versesDoc = useGita((s) => s.versesDoc);
  const select = useGita((s) => s.select);
  const v = a.verseId ? useGita.getState().versesById.get(a.verseId) : null;
  const ch = versesDoc?.chapters.find((c) => c.number === (v?.chapter ?? a.chapter));
  const reading = a.source === "commentary" ? a.reading : null;
  const frac = reading ? (reading.part + 1) / reading.parts : a.duration ? Math.min(1, a.currentTime / a.duration) : 0;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = !!(a.verseId || a.chapter);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const title = reading && v ? `${reading.name} on BG ${v.ref}` : a.mode === "chapter" && ch ? `Chapter ${ch.number} · ${ch.title}` : v ? `BG ${v.ref}` : "Recitation";
  const sub = a.error ? a.error : reading ? `Commentary in ${LANG_NAME[reading.lang]}, read by this device` : a.source === "commentary" && a.loading ? "Preparing the commentary" : a.mode === "chapter" && v ? `Now at BG ${v.ref}${a.approx ? " (approximate)" : ""}` : v ? v.sanskrit[0] : "";
  const devaSub = !a.error && !reading && a.source !== "commentary" && a.mode !== "chapter";

  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.footer
          key="player"
          className="relative z-30 shrink-0 border-t border-line bg-surface"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          aria-label="Recitation player"
        >
          <div
            className="group absolute inset-x-0 -top-2 flex h-4 cursor-pointer items-center pointer-coarse:-top-3 pointer-coarse:h-6"
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(frac * 100)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") audio.seek(Math.min(1, frac + 0.05));
              if (e.key === "ArrowLeft") audio.seek(Math.max(0, frac - 0.05));
            }}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              audio.seek((e.clientX - r.left) / r.width);
            }}
          >
            <div className="h-[2px] w-full bg-line-2 transition-[height] group-hover:h-1 pointer-coarse:h-1">
              <div className="h-full bg-accent" style={{ width: `${frac * 100}%` }} />
            </div>
          </div>

          <div className="flex h-14 items-center gap-2 px-3 md:gap-3 md:px-4">
            <button className="btn btn-primary btn-icon h-9 w-9 shrink-0 rounded-full" onClick={() => audio.toggle()} aria-label={a.playing ? "Pause" : "Play"}>
              {a.loading ? <LoaderCircle size={16} className="animate-spin" /> : a.playing ? <Pause size={16} /> : <Play size={16} className="translate-x-px" />}
            </button>
            <div className="flex items-center">
              {a.mode !== "chapter" && v && (
                <button className="btn btn-ghost btn-icon" onClick={() => audio.playVerse(v.id)} aria-label={`Replay BG ${v.ref}`} title="Replay this verse">
                  <RotateCcw size={15} />
                </button>
              )}
              <button className="btn btn-ghost btn-icon" onClick={() => audio.prev()} aria-label={a.mode === "chapter" ? "Previous chapter" : "Previous verse"}>
                <SkipBack size={15} />
              </button>
              <button className="btn btn-ghost btn-icon" onClick={() => audio.next()} aria-label={a.mode === "chapter" ? "Next chapter" : "Next verse"}>
                <SkipForward size={15} />
              </button>
            </div>

            <button className="min-w-0 flex-1 rounded-[var(--radius-2)] px-1 text-left" onClick={() => v && select(v.id)} disabled={!v} title={v ? `Open BG ${v.ref}` : undefined}>
              <div className="flex items-center gap-2">
                {a.playing && <AudioLines size={13} className="shrink-0 text-accent-text" />}
                <span className="truncate text-[13px] font-medium text-text">{title}</span>
              </div>
              <div className={`truncate text-[12px] ${a.error ? "text-danger" : "text-text-3"} ${devaSub ? "deva !leading-5" : ""}`}>{sub}</div>
            </button>

            <span className="num hidden text-[12px] text-text-3 md:inline">{reading ? `Part ${reading.part + 1} of ${reading.parts}` : `${fmt(a.currentTime)} / ${fmt(a.duration)}`}</span>
            <div ref={menuRef} className="relative">
              <button className="btn btn-ghost btn-icon" aria-expanded={menu} aria-label="Playback options" onClick={() => setMenu(!menu)}>
                <SlidersHorizontal size={15} />
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.div className="popover absolute bottom-11 right-0 z-[45] w-72 p-3" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.14 }}>
                    <div className="label mb-1.5">Play</div>
                    <div className="seg mb-3 w-full">
                      <button className="flex-1" aria-pressed={a.mode === "verse"} onClick={() => v && audio.playVerse(v.id)}>
                        One verse at a time
                      </button>
                      <button className="flex-1" aria-pressed={a.mode === "chapter"} onClick={() => audio.playChapter(v?.chapter ?? useGita.getState().readerChapter)}>
                        Whole chapter
                      </button>
                    </div>
                    <div className="label mb-1.5">Speed</div>
                    <div className="seg mb-2 w-full">
                      {[0.75, 1, 1.25, 1.5].map((r) => (
                        <button key={r} className="num flex-1" aria-pressed={a.rate === r} onClick={() => audio.setRate(r)}>
                          {r}×
                        </button>
                      ))}
                    </div>
                    <Toggle on={a.autoAdvance} onChange={(autoAdvance) => useAudio.setState({ autoAdvance })} label="Continue automatically" hint="Play the next verse or chapter when one ends" />
                    <Toggle on={a.follow} onChange={(follow) => useAudio.setState({ follow })} label="Follow along" hint="Move the graph camera and reader to the verse being recited" />
                    <label className="mt-2 block border-t border-line pt-2.5">
                      <span className="block text-[13px] text-text">After each verse, read a commentary</span>
                      <span className="block text-[12px] leading-4 text-text-3">Read aloud by this device&apos;s voice, then on to the next verse. One verse at a time only.</span>
                      <select className="field field-sm mt-1.5" value={a.commentaryAfter ?? ""} onChange={(e) => setCommentaryAfter(Number(e.target.value) || null)}>
                        <option value="">No, just the verses</option>
                        {SPOKEN_COMMENTARIES.map((c) => (
                          <option key={c.authorId} value={c.authorId}>
                            {spokenLabel(c.authorId)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {a.sourceLabel && <div className="mt-2 border-t border-line pt-2 text-[11.5px] text-text-3">Source: {a.sourceLabel}</div>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={() => audio.dismiss()} aria-label="Stop and close player" title="Stop and close">
              <X size={16} />
            </button>
          </div>
        </motion.footer>
      )}
    </AnimatePresence>
  );
}
