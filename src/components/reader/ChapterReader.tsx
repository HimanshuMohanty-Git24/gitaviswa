"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ALargeSmall, ArrowLeft, ArrowRight, AudioLines, BookOpen, Orbit, Pause, Play } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { audio, useAudio } from "@/lib/store/audioStore";
import { isRegionalScript } from "@/lib/indic/scripts";
import { getReadingPosition, lessonDoneAt, setReadingPosition } from "@/lib/store/readingPosition";
import { ScriptPicker, verseLines } from "./VerseExplorer";
import { Lesson } from "./Lesson";

function TranslatorSelect() {
  const versesDoc = useGita((s) => s.versesDoc);
  const enAuthor = useGita((s) => s.enAuthor);
  const setAuthors = useGita((s) => s.setAuthors);
  const sample = versesDoc?.verses[0];
  const authors = (versesDoc?.authors || []).filter((a) => sample?.translations.en?.[String(a.id)]);
  return (
    <select className="field field-sm !w-auto max-w-[14rem]" aria-label="English translation" value={enAuthor} onChange={(e) => setAuthors(Number(e.target.value))}>
      {authors.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

/** Reading options on small screens: script and translator live in one popover behind an “Aa” button. */
function ReadingOptions() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button className="btn btn-icon" aria-label="Reading options" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ALargeSmall size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="popover absolute right-0 top-10 z-[45] w-[min(20rem,calc(100vw-1.5rem))] space-y-4 p-4" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}>
            <div>
              <div className="label mb-1.5">Script</div>
              <ScriptPicker />
            </div>
            <div>
              <div className="label mb-1.5">Translation</div>
              <TranslatorSelect />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Read (Adhyayana): chapter-by-chapter reading, synchronised with the recitation player. */
export function ChapterReader() {
  const versesDoc = useGita((s) => s.versesDoc);
  const chapterNo = useGita((s) => s.readerChapter);
  const openChapter = useGita((s) => s.openChapter);
  const select = useGita((s) => s.select);
  const selectedId = useGita((s) => s.selectedId);
  const script = useGita((s) => s.script);
  const enAuthor = useGita((s) => s.enAuthor);
  const audioVerse = useAudio((s) => s.verseId);
  const audioMode = useAudio((s) => s.mode);
  const audioChapter = useAudio((s) => s.chapter);
  const playing = useAudio((s) => s.playing);
  const lessonOpen = useGita((s) => s.lessonOpen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [lessonDone] = useState(lessonDoneAt);
  const ch = versesDoc?.chapters.find((c) => c.number === chapterNo);
  const verses = versesDoc?.verses.filter((v) => v.chapter === chapterNo) || [];
  const chapterPlaying = playing && audioMode === "chapter" && audioChapter === chapterNo;

  useEffect(() => {
    if (!audioVerse || !useAudio.getState().follow) return;
    document.getElementById(`reader-${audioVerse}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [audioVerse]);
  // Showing a chapter continues at the last verse read in it; a chapter you have not been reading starts at its top.
  // (Derived from the saved position, not a "first mount" flag, so it also holds when effects run twice.)
  useEffect(() => {
    setSummaryOpen(false);
    const pos = getReadingPosition();
    const target = pos?.chapter === chapterNo ? document.getElementById(`reader-${pos.verse}`) : null;
    // Braces matter: Chromium's scrollTo may return a Promise, which React would treat as a cleanup function.
    if (target) target.scrollIntoView({ block: "start" });
    else {
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [chapterNo, lessonOpen]);
  // Remember the first verse in view (throttled to one check per frame).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || lessonOpen) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const top = el.getBoundingClientRect().top + 64;
        const first = [...el.querySelectorAll<HTMLElement>("article[id^='reader-']")].find((a) => a.getBoundingClientRect().bottom > top);
        if (first) setReadingPosition(chapterNo, first.id.slice("reader-".length));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [chapterNo, lessonOpen]);

  if (!versesDoc || !ch) return null;
  const prevCh = versesDoc.chapters.find((c) => c.number === ch.number - 1);
  const nextCh = versesDoc.chapters.find((c) => c.number === ch.number + 1);
  const lineCls = script === "deva" ? "deva text-[20px] leading-[1.8] sm:text-[21px]" : isRegionalScript(script) ? "indic text-[18px]" : "serif text-[17px] italic leading-[1.6]";

  return (
    <div className="absolute inset-0 flex bg-bg">
      <nav className="hidden w-[248px] shrink-0 overflow-y-auto border-r border-line py-3 lg:block" aria-label="Chapters">
        <div className="label px-5 pb-2">Chapters</div>
        <ol>
          {versesDoc.chapters.map((c) => {
            const on = c.number === chapterNo;
            return (
              <li key={c.number}>
                <button onClick={() => openChapter(c.number)} aria-current={on ? "page" : undefined} className={`flex w-full items-baseline gap-3 px-5 py-2 text-left transition-colors ${on ? "bg-surface-3" : "hover:bg-surface-2"}`}>
                  <span className={`num w-5 shrink-0 text-right text-[12px] ${on ? "font-semibold text-accent-text" : "text-text-3"}`}>{c.number}</span>
                  <span className="min-w-0">
                    <span className={`block truncate text-[13.5px] ${on ? "font-medium text-text" : "text-text-2"}`}>{c.title}</span>
                    <span className="deva block truncate text-[12px] !leading-5 text-text-3">{c.name}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Container query: inline reading controls only when the toolbar itself is wide enough (the dock may be open). */}
        <div className="@container z-[1] flex h-12 shrink-0 items-center gap-2 border-b border-line bg-bg px-3 sm:px-5">
          <select className="field field-sm !w-auto min-w-0 max-w-[60%] lg:hidden" aria-label="Chapter" value={chapterNo} onChange={(e) => openChapter(Number(e.target.value))}>
            {versesDoc.chapters.map((c) => (
              <option key={c.number} value={c.number}>
                {c.number}. {c.title}
              </option>
            ))}
          </select>
          <div className="hidden items-center gap-2 @min-[680px]:flex">
            <ScriptPicker compact nowrap />
            <TranslatorSelect />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="@min-[680px]:hidden">
              <ReadingOptions />
            </div>
            <button className="btn" aria-pressed={chapterPlaying} onClick={() => (chapterPlaying ? audio.toggle() : audio.playChapter(ch.number))} title="Listen to the whole chapter">
              {chapterPlaying ? <Pause size={14} /> : <Play size={14} />}
              <span className="hidden sm:inline">{chapterPlaying ? "Pause" : "Listen"}</span>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {lessonOpen ? (
            <Lesson onClose={() => useGita.getState().openLesson(false)} />
          ) : (
          <div className="mx-auto max-w-[720px] px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
            <header>
              <div className="label">
                Chapter {ch.number} of 18 · {ch.verseCount} verses
              </div>
              <h1 className="serif mt-2 text-[32px] font-semibold leading-[1.15] tracking-[-0.01em] text-text sm:text-[38px]">{ch.title}</h1>
              <div className="deva mt-1 text-[19px] text-text-2">{ch.name}</div>
              <div className="serif mt-0.5 text-[16px] italic text-text-3">{ch.meaning}</div>
              <div className="mt-5">
                <p className={`reading ${summaryOpen ? "" : "line-clamp-4"}`}>{ch.summary.en}</p>
                <button className="mt-1 text-[13px] font-medium text-text-2 hover:text-text" onClick={() => setSummaryOpen(!summaryOpen)} aria-expanded={summaryOpen}>
                  {summaryOpen ? "Show less" : "Read the full summary"}
                </button>
              </div>
              <div className="mt-6 flex flex-wrap gap-1.5">
                <button className="btn" onClick={() => audio.playVerse(`BG_${ch.number}.1`)} title="Recite one verse at a time from the start of the chapter">
                  <AudioLines size={14} /> Recite verse by verse
                </button>
                <button className="btn" onClick={() => (useGita.getState().setView("cosmos"), select(`CH_${ch.number}`))} title="See this chapter in the 3D graph">
                  <Orbit size={14} /> See in graph
                </button>
              </div>
              <button className="group mt-6 flex w-full items-start gap-3 rounded-3 border border-accent-line bg-accent-soft px-4 py-3.5 text-left transition-colors hover:bg-surface-2" onClick={() => useGita.getState().openLesson(true)}>
                <BookOpen size={17} className="mt-0.5 shrink-0 text-accent-text" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-text">{lessonDone ? "Revisit: effort, without being ruled by the outcome" : "New to the Gita? Start with one idea"}</span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-text-2">BG 2.47: its setting, a plain explanation, an example, and your own view. About five minutes.</span>
                </span>
                <ArrowRight size={15} className="mt-1 shrink-0 text-text-3 transition-transform group-hover:translate-x-0.5" />
              </button>
            </header>

            <div className="mt-12 border-t border-line pt-6">
              {verses.map((v) => {
                const active = v.id === audioVerse;
                const sel = v.id === selectedId;
                const lines = verseLines(v, script);
                return (
                  <article
                    id={`reader-${v.id}`}
                    key={v.id}
                    aria-current={sel ? "true" : undefined}
                    onClick={() => select(v.id, { fly: false })}
                    className={`group relative -mx-3 grid cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2.5 rounded-3 px-3 py-5 transition-colors min-[380px]:grid-cols-[2.75rem_minmax(0,1fr)] min-[380px]:gap-x-3 sm:-mx-5 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:px-5 ${sel ? "bg-accent-soft" : "hover:bg-surface-2"}`}
                  >
                    {(sel || active) && <span className="absolute bottom-4 left-0 top-4 w-[2px] rounded-full bg-accent" aria-hidden />}
                    <div className="flex flex-col items-start gap-2 pt-1">
                      <button className={`num rounded-1 text-[13px] font-medium ${sel || active ? "text-accent-text" : "text-text-3 group-hover:text-text-2"}`} onClick={(e) => (e.stopPropagation(), select(v.id, { fly: false }))} aria-label={`Open BG ${v.ref}`}>
                        {v.ref}
                      </button>
                      <button
                        className={`btn btn-ghost btn-icon btn-sm -ml-1.5 ${active && playing ? "" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-60"}`}
                        onClick={(e) => (e.stopPropagation(), active ? audio.toggle() : audio.playVerse(v.id))}
                        aria-label={active && playing ? `Pause ${v.ref}` : `Listen to ${v.ref}`}
                      >
                        {active && playing ? <AudioLines size={14} className="text-accent-text" /> : <Play size={13} />}
                      </button>
                    </div>
                    <div className="min-w-0">
                      {(v.uvacha || !v.canonical) && (
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-text-3">
                          {v.uvacha && <span className="deva !leading-5">{v.uvacha.sa}</span>}
                          {!v.canonical && <span className="chip !min-h-0 !py-0 text-[11px]">Not in the traditional 700</span>}
                        </div>
                      )}
                      <div className={`${lineCls} text-text [overflow-wrap:anywhere]`}>
                        {lines.map((l, i) => (
                          <div key={i}>{l}</div>
                        ))}
                      </div>
                      {script === "deva" && <div className="serif mt-1.5 text-[14px] italic leading-[1.55] text-text-3 [overflow-wrap:anywhere]">{v.iast.join(" ")}</div>}
                      <p className={`serif mt-3 text-[16.5px] leading-[1.65] [overflow-wrap:anywhere] ${sel ? "text-text" : "text-text-2"}`}>{v.translations.en?.[String(enAuthor)]}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <nav className="mt-12 grid gap-2 border-t border-line pt-6 sm:grid-cols-2" aria-label="Chapter navigation">
              {prevCh ? (
                <button className="group rounded-3 border border-line p-4 text-left transition-colors hover:border-line-3 hover:bg-surface-2" onClick={() => openChapter(prevCh.number)}>
                  <span className="label flex items-center gap-1.5">
                    <ArrowLeft size={13} /> Previous chapter
                  </span>
                  <span className="mt-1 block text-[14px] font-medium text-text">
                    {prevCh.number}. {prevCh.title}
                  </span>
                </button>
              ) : (
                <span className="hidden sm:block" />
              )}
              {nextCh && (
                <button className="group rounded-3 border border-line p-4 text-right transition-colors hover:border-line-3 hover:bg-surface-2" onClick={() => openChapter(nextCh.number)}>
                  <span className="label flex items-center justify-end gap-1.5">
                    Next chapter <ArrowRight size={13} />
                  </span>
                  <span className="mt-1 block text-[14px] font-medium text-text">
                    {nextCh.number}. {nextCh.title}
                  </span>
                </button>
              )}
            </nav>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
