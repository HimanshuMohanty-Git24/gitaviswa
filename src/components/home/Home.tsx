"use client";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, BookOpen, Library, MessagesSquare, NotebookPen, Pause, Play, Search, Settings, ShieldCheck, Sparkles, Waypoints, CircleHelp } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { audio, useAudio } from "@/lib/store/audioStore";
import { useDraft } from "@/lib/store/draftStore";
import { getReadingPosition, type ReadingPosition } from "@/lib/store/readingPosition";
import { askPartha } from "@/components/chat/GraphRagChatbot";
import { BrandMark } from "@/components/sacred/SacredMotifs";
import { Picture } from "./Picture";
import { GraphPreview } from "./GraphPreview";
import { ARISE, GRAPH_COUNTS_FALLBACK, HOME_TRANSLATOR, LADDER, SAMPLE_QUESTIONS, SCENES, SITUATIONS, SPOTLIGHT } from "./homeContent";

/**
 * The front page: what GitaViśva is, told through the Gita's own arc (the chariot between the armies, Arjuna's
 * collapse, the teaching, the universal form, the resolve) with a door into each tool at the moment it fits.
 * It paints without waiting for the verse data; the few parts that need it (the live graph, recitation) fill in.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const go = {
  explore: (id?: string) => {
    const s = useGita.getState();
    s.setView("cosmos");
    if (id) s.select(id);
  },
  lesson: () => useGita.getState().openLesson(true),
  chapter: (n: number) => useGita.getState().openChapter(n),
  read: () => useGita.getState().setView("adhyayana"),
  verseInReader: (id: string) => {
    const s = useGita.getState();
    s.openChapter(Number(id.slice(3).split(".")[0]));
    s.select(id, { fly: false });
  },
  lineage: (id: string) => useGita.getState().focusLineage(id),
  chain: (id: string) => useGita.getState().openChain(id),
  reflect: () => {
    useGita.getState().setView("manas");
    useDraft.getState().requestFocus();
  },
};

function useResume() {
  const [pos, setPos] = useState<ReadingPosition | null>(null);
  useEffect(() => setPos(getReadingPosition()), []);
  return pos;
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.8, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

const PAD = "px-5 sm:px-8 lg:px-12";

// ── Hero: the chariot at dusk ───────────────────────────────────────────────────────────────────────
function Hero({ scroller }: { scroller: RefObject<HTMLDivElement | null> }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll({ container: scroller });
  const drift = useTransform(scrollY, [0, 900], [0, reduce ? 0 : 150]);
  const resume = useResume();
  const item = (delay: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, delay, ease: EASE } });
  return (
    <section data-theme="dark" aria-labelledby="home-title" className="home-hero relative isolate flex min-h-full flex-col overflow-hidden bg-[#140b06]">
      <motion.div className="absolute inset-0 -z-10" style={{ y: drift }}>
        <motion.div className="h-full w-full" initial={{ scale: 1.07 }} animate={{ scale: 1 }} transition={{ duration: 2.6, ease: EASE }}>
          <Picture
            art="hero"
            alternate={{ media: "(max-aspect-ratio: 1/1)", art: "heroPortrait" }}
            sizes="100vw"
            priority
            alt="Krishna drives Arjuna's chariot, drawn by four white horses, across an empty plain at sunset. The two armies wait as faint lines on the horizon."
            className="home-hero-img h-full w-full object-cover"
          />
        </motion.div>
      </motion.div>
      <div aria-hidden className="home-hero-scrim absolute inset-0 -z-10" />

      <div className={`relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-start pb-12 pt-10 sm:pt-14 md:justify-center md:pb-20 ${PAD}`}>
        <div className="max-w-[40rem]">
          <motion.p lang="sa" className="deva text-[17px] leading-none text-[#ebb468] md:text-[19px]" {...item(0.1)}>
            श्रीमद्भगवद्गीता
          </motion.p>
          <motion.h1 id="home-title" className="serif mt-4 text-[clamp(2.35rem,6vw,4.5rem)] font-medium leading-[1.04] tracking-[-0.022em] text-[#f5efe6]" {...item(0.22)}>
            Before the battle, a&nbsp;conversation.
          </motion.h1>
          <motion.p className="mt-5 max-w-[31rem] text-[15.5px] leading-7 text-[#ddd3c5] md:text-[17px]" {...item(0.36)}>
            Read all 701 verses of the Bhagavad Gita, see how its ideas connect, and bring your own questions to it.
          </motion.p>
          <motion.div className="mt-8 flex flex-wrap gap-3" {...item(0.5)}>
            <button className="btn btn-primary btn-lg max-sm:flex-1" onClick={() => go.explore()}>
              Explore the graph
              <ArrowRight size={16} />
            </button>
            {resume ? (
              <button className="btn btn-lg home-glass max-sm:flex-1" onClick={go.read}>
                <BookOpen size={16} />
                Continue at BG {resume.verse.slice(3)}
              </button>
            ) : (
              <button className="btn btn-lg home-glass max-sm:flex-1" onClick={go.lesson}>
                <BookOpen size={16} />
                Start with one verse
              </button>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ── Arjuna's crisis: fight or flight ────────────────────────────────────────────────────────────────
function Crossroads() {
  return (
    <section aria-labelledby="crossroads-title" className={`py-20 md:py-28 ${PAD}`}>
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-7">
          <figure className="overflow-hidden rounded-[var(--radius-3)] border border-line-2 bg-surface shadow-[0_40px_90px_-50px_rgba(20,10,0,0.7)]">
            <Picture
              art="fightOrFlight"
              sizes="(min-width: 1024px) 56vw, 100vw"
              alt="A poster titled Fight or Flight: Arjuna kneels in his chariot with folded hands before Krishna on the battlefield, with Sanskrit verses 2.47 and 4.7 on either side."
              className="block h-auto w-full"
            />
          </figure>
        </Reveal>
        <Reveal className="lg:col-span-5" delay={0.1}>
          <h2 id="crossroads-title" className="serif text-balance text-[clamp(1.9rem,3.5vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.015em] text-text">
            The Gita begins with someone who wants to walk away.
          </h2>
          <p className="mt-5 max-w-[34rem] text-[16px] leading-7 text-text-2">Between two armies, Arjuna puts down his bow and says he will not fight. Krishna&apos;s answer to that one frozen moment is the whole Gita.</p>
          <blockquote className="mt-7 border-l-2 border-accent-line pl-4">
            <p lang="sa" className="deva text-[16.5px] leading-8 text-text-2">
              {ARISE.sa}
            </p>
            <p className="serif mt-1 text-[17px] italic leading-7 text-text">“{ARISE.en}”</p>
            <footer className="mt-2 text-[12.5px] text-text-3">
              BG {ARISE.ref}, translated by {HOME_TRANSLATOR}
            </footer>
          </blockquote>

          <h3 className="mt-10 text-[15px] font-semibold text-text">What are you facing?</h3>
          <p className="mt-1 text-[13.5px] text-text-3">Each opens the verses that speak to it.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SITUATIONS.map((s) => (
              <button key={s.id} className="chip !min-h-9 !rounded-[var(--radius-2)] !px-3 !text-[13px]" onClick={() => go.explore(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <button className="btn mt-5" onClick={go.reflect}>
            <NotebookPen size={14} />
            Write about your own
          </button>
        </Reveal>
      </div>
    </section>
  );
}

// ── The verse most people know (and others) ─────────────────────────────────────────────────────────
function VerseSpotlight() {
  const [i, setI] = useState(0);
  const v = SPOTLIGHT[i];
  const ready = useGita((s) => s.status === "ready");
  const playing = useAudio((s) => s.verseId === v.id && s.playing);
  const loading = useAudio((s) => s.verseId === v.id && s.loading);
  return (
    <section aria-labelledby="verse-title" className={`relative isolate overflow-hidden py-20 md:py-28 ${PAD}`}>
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_50%_42%,var(--accent-soft),transparent_70%)]" />
      <div className="mx-auto max-w-4xl text-center">
        <h2 id="verse-title" className="text-[14px] font-medium text-text-3">
          {i === 0 ? "The verse most people know" : "A line people carry with them"}
        </h2>
        <div className="mt-8 min-h-[25rem] sm:min-h-[23rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.figure key={v.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
              <p lang="sa" className="deva text-[clamp(1.35rem,3.6vw,2.6rem)] leading-[1.75] text-text">
                {v.sa.map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </p>
              <p className="serif mt-3 text-[14px] italic leading-6 text-text-3 md:text-[15.5px]">
                {v.iast.map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </p>
              <blockquote className="serif mx-auto mt-8 max-w-[36ch] text-[clamp(1.15rem,2.2vw,1.55rem)] leading-[1.45] text-text">“{v.en}”</blockquote>
              <figcaption className="mt-4 text-[13px] text-text-3">
                Bhagavad Gita {v.ref}, translated by {HOME_TRANSLATOR}
              </figcaption>
              <p className="mx-auto mt-6 max-w-[40ch] text-balance text-[15px] font-medium leading-6 text-accent-text">
                <span className="sr-only">In short: </span>
                {v.gloss}
              </p>
            </motion.figure>
          </AnimatePresence>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button className="btn" disabled={!ready} onClick={() => (playing ? audio.toggle() : audio.playVerse(v.id))} aria-label={playing ? `Pause the recitation of ${v.ref}` : `Listen to ${v.ref} recited`}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? "Pause" : loading ? "Loading" : "Listen"}
          </button>
          <button className="btn" onClick={() => go.lineage(v.id)}>
            <Waypoints size={14} />
            See what it connects to
          </button>
          {i === 0 ? (
            <button className="btn btn-primary" onClick={go.lesson}>
              <BookOpen size={14} />
              Start with one verse
            </button>
          ) : (
            <button className="btn" onClick={() => go.verseInReader(v.id)}>
              <BookOpen size={14} />
              Read it in its chapter
            </button>
          )}
        </div>
        <div className="mt-12">
          <div className="text-[13px] text-text-3" id="more-lines">
            More lines people carry with them
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-labelledby="more-lines">
            {SPOTLIGHT.map((s, k) => (
              <button key={s.id} className="chip !min-h-9 !rounded-[var(--radius-2)] !px-3 !text-[13px]" aria-pressed={k === i} onClick={() => setI(k)}>
                <span className="num text-text-3">{s.ref}</span>
                {s.theme}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Chapter 11 and the live graph ───────────────────────────────────────────────────────────────────
function GraphSection() {
  const stats = useGita((s) => s.graphData?.stats);
  const by = (stats?.byLabel ?? GRAPH_COUNTS_FALLBACK) as Record<string, number>;
  const edges = stats?.edges ?? GRAPH_COUNTS_FALLBACK.edges;
  const rows: { label: string; n: number; colors: string[] }[] = [
    { label: "Chapters", n: by.Chapter, colors: ["var(--n-chapter)"] },
    { label: "Verses", n: by.Verse, colors: ["var(--n-verse)"] },
    { label: "Sanskrit ideas", n: by.SanskritConcept, colors: ["var(--n-concept)"] },
    { label: "States of mind", n: by.Emotion, colors: ["var(--n-afflictive)", "var(--n-healing)"] },
    { label: "Life situations", n: by.LifeDilemma, colors: ["var(--n-dilemma)"] },
    { label: "Characters", n: by.Character, colors: ["var(--n-character)"] },
  ];
  return (
    <section aria-labelledby="graph-title" className="pb-20 md:pb-28">
      <div className={`mx-auto max-w-7xl ${PAD}`}>
        <Reveal>
          <h2 id="graph-title" className="serif max-w-[24ch] text-balance text-[clamp(1.9rem,3.8vw,3rem)] font-medium leading-[1.08] tracking-[-0.015em] text-text">
            In chapter 11, Arjuna asks to see everything at&nbsp;once.
          </h2>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-7 text-text-2">Explore does that for the text itself: every verse, idea, state of mind and life situation on one map, with the threads between them.</p>
        </Reveal>
      </div>
      <Reveal className="mt-10">
        <div data-theme="dark" className="relative overflow-hidden bg-[#08070b]">
          <Picture
            art="cosmicWide"
            alternate={{ media: "(max-width: 767px)", art: "cosmic" }}
            sizes="100vw"
            alt="Krishna's universal form fills a night sky: countless faces and arms, galaxies inside his body, above Arjuna's small chariot on the plain."
            className="block aspect-[16/10] w-full object-cover md:aspect-[21/9]"
          />
        </div>
      </Reveal>
      <div className={`relative mx-auto mt-8 max-w-7xl md:-mt-14 ${PAD}`}>
        <Reveal>
          <div className="panel grid overflow-hidden shadow-[var(--shadow-3)] lg:grid-cols-12">
            <div className="border-t border-line p-6 md:p-8 lg:col-span-4 lg:border-r lg:border-t-0">
              <h3 className="text-[15px] font-semibold text-text">What is on the map</h3>
              <dl className="mt-5 grid grid-cols-3 gap-x-4 gap-y-5 lg:grid-cols-2 lg:gap-x-6">
                {rows.map((r) => (
                  <div key={r.label}>
                    <dt className="flex items-center gap-2 text-[12.5px] text-text-3">
                      <span className="flex -space-x-0.5">
                        {r.colors.map((c) => (
                          <span key={c} className="h-2 w-2 rounded-full ring-1 ring-[var(--surface)]" style={{ background: c }} />
                        ))}
                      </span>
                      {r.label}
                    </dt>
                    <dd className="num mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] text-text">{r.n}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-[13.5px] leading-6 text-text-2">
                <span className="num font-semibold text-text">{edges.toLocaleString("en")}</span> connections between them: which verse defines an idea, which state heals another, which verses answer which questions.
              </p>
              <p className="mt-4 text-[12.5px] leading-5 text-text-3">Point at the map, or tap on a phone. Drag sideways to turn it.</p>
            </div>
            <div className="order-first h-[23rem] bg-[radial-gradient(ellipse_at_50%_45%,var(--accent-soft),transparent_70%)] sm:h-[27rem] lg:order-none lg:col-span-8 lg:h-[31rem]">
              <GraphPreview onOpen={go.explore} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── The arc: chapters 1, 2 and 18 ───────────────────────────────────────────────────────────────────
function Arc() {
  const resume = useResume();
  const chapters = useGita((s) => s.versesDoc?.chapters);
  return (
    <section aria-labelledby="arc-title" className="py-20 md:py-28">
      <div className={`mx-auto max-w-7xl ${PAD}`}>
        <Reveal>
          <h2 id="arc-title" className="serif max-w-[22ch] text-balance text-[clamp(1.9rem,3.6vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.015em] text-text">
            Eighteen chapters, from doubt to resolve.
          </h2>
          <p className="mt-4 max-w-[48ch] text-[16px] leading-7 text-text-2">Read it in order, with the Sanskrit, transliteration, several translations, classical commentaries and recitation for every verse.</p>
        </Reveal>
      </div>
      <ol className={`home-rail mx-auto mt-10 flex max-w-7xl snap-x snap-mandatory gap-5 overflow-x-auto pb-6 lg:grid lg:grid-cols-4 lg:items-start lg:overflow-visible ${PAD}`}>
        {SCENES.map((s, k) => (
          <li key={s.chapter} className={`w-[82vw] max-w-[21rem] shrink-0 snap-start lg:w-auto lg:max-w-none ${k === 1 ? "lg:mt-14" : ""}`}>
            <Reveal delay={k * 0.08}>
              <button className="group block w-full text-left" onClick={() => go.chapter(s.chapter)}>
                <div className="overflow-hidden rounded-[var(--radius-3)] border border-line bg-[#140b06]">
                  <Picture art={s.image} sizes="(min-width: 1024px) 24vw, 82vw" alt={s.alt} className="block aspect-[4/3] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                </div>
                <div className="mt-4 text-[12.5px] text-accent-text">
                  Chapter {s.chapter} · {s.name}
                </div>
                <h3 className="serif mt-1 text-[21px] font-medium leading-7 text-text">{s.title}</h3>
                <p className="serif mt-2 text-[15px] italic leading-6 text-text-2">“{s.quote}”</p>
                <p className="mt-2 text-[12px] text-text-3">
                  {s.excerpt ? "From " : ""}BG {s.ref}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-text group-hover:text-accent-text">
                  Read chapter {s.chapter}
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </Reveal>
          </li>
        ))}
        <li className="w-[82vw] max-w-[21rem] shrink-0 snap-start lg:mt-14 lg:w-auto lg:max-w-none">
          <Reveal delay={0.24}>
            <div className="rounded-[var(--radius-3)] border border-line bg-surface p-5">
              <h3 className="serif text-[21px] font-medium leading-7 text-text">All eighteen</h3>
              <p className="mt-1 text-[13.5px] leading-5 text-text-3">Pick any chapter. Read remembers where you stopped.</p>
              <div className="mt-4 grid grid-cols-6 gap-1.5">
                {Array.from({ length: 18 }, (_, n) => n + 1).map((n) => {
                  const c = chapters?.find((x) => x.number === n);
                  return (
                    <button key={n} className="btn btn-sm num !px-0" onClick={() => go.chapter(n)} title={c ? `Chapter ${n}: ${c.meaning}` : `Chapter ${n}`} aria-label={c ? `Chapter ${n}, ${c.meaning}` : `Chapter ${n}`}>
                      {n}
                    </button>
                  );
                })}
              </div>
              <button className={`btn mt-5 w-full ${resume ? "btn-primary" : ""}`} onClick={resume ? go.read : () => go.chapter(1)}>
                <BookOpen size={14} />
                {resume ? `Continue at BG ${resume.verse.slice(3)}` : "Begin at chapter 1"}
              </button>
            </div>
          </Reveal>
        </li>
      </ol>
    </section>
  );
}

// ── Other ways in ───────────────────────────────────────────────────────────────────────────────────
function WaysIn() {
  return (
    <section aria-labelledby="ways-title" className={`pb-20 md:pb-28 ${PAD}`}>
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <h2 id="ways-title" className="serif text-balance text-[clamp(1.9rem,3.6vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.015em] text-text">
            Come in however suits you.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-6">
          {/* First lesson: the painting carries this tile. */}
          <Reveal className="md:col-span-4">
            <div data-theme="dark" className="relative isolate flex flex-col overflow-hidden rounded-[var(--radius-3)] border border-line bg-[#140b06] md:h-full md:min-h-[22rem] md:flex-row">
              <Picture art="setting" sizes="(min-width: 768px) 60vw, 100vw" alt="Krishna stands in the chariot and speaks with an open hand to Arjuna, who sits with his head in his hand." className="block aspect-[3/2] w-full object-cover [object-position:70%_40%] md:absolute md:inset-0 md:-z-10 md:aspect-auto md:h-full" />
              <div aria-hidden className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-[#0d0703]/90 via-[#0d0703]/55 to-transparent md:block" />
              <div className="max-w-[24rem] p-6 md:my-auto md:p-8">
                <h3 className="serif text-[24px] font-medium leading-8 text-[#f5efe6]">Your first five minutes</h3>
                <p className="mt-2 text-[14.5px] leading-6 text-[#ddd3c5]">A short lesson on 2.47: the setting, the verse, what it means in plain words, and an example from everyday life.</p>
                <button className="btn btn-primary mt-5" onClick={go.lesson}>
                  <BookOpen size={14} />
                  Start with one verse
                </button>
              </div>
            </div>
          </Reveal>

          {/* Reflect: the lamp. */}
          <Reveal className="md:col-span-2 md:row-span-2" delay={0.08}>
            <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-3)] border border-line bg-surface">
              <div data-theme="dark" className="bg-[#120a05]">
                <Picture art="lamp" sizes="(min-width: 768px) 30vw, 100vw" alt="An oil lamp burns beside a blank palm-leaf manuscript and a peacock feather on a dark wooden table." className="block aspect-[5/4] w-full object-cover [object-position:50%_75%] md:aspect-square" />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="serif text-[22px] font-medium leading-7 text-text">Write what is on your mind</h3>
                <p className="mt-2 text-[14px] leading-6 text-text-2">Reflect suggests the states, situations and verses your words touch. You keep the ones that fit. Everything stays in this browser.</p>
                <div className="mt-auto pt-5">
                  <button className="btn" onClick={go.reflect}>
                    <NotebookPen size={14} />
                    Write a thought
                  </button>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Lineage: a real chain from the graph. */}
          <Reveal className="md:col-span-2" delay={0.12}>
            <div className="flex h-full flex-col rounded-[var(--radius-3)] border border-line bg-surface p-6">
              <h3 className="serif text-[22px] font-medium leading-7 text-text">Follow one thing to the next</h3>
              <p className="mt-2 text-[14px] leading-6 text-text-2">Verses 2.62 and 2.63 trace how brooding becomes ruin. Lineage lays chains like this out step by step.</p>
              <ol className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1.5" aria-label="The ladder of fall">
                {LADDER.steps.map((s, k) => (
                  <li key={s.id} className="flex items-center gap-1">
                    <span className="chip !text-[12px]" style={{ borderColor: "color-mix(in srgb, var(--n-afflictive) 40%, transparent)" }}>
                      {s.label}
                    </span>
                    {k < LADDER.steps.length - 1 && <ArrowRight size={11} className="text-text-4" aria-hidden />}
                  </li>
                ))}
              </ol>
              <div className="mt-auto pt-5">
                <button className="btn" onClick={() => go.chain(LADDER.id)}>
                  <Waypoints size={14} />
                  Open the ladder of fall
                </button>
              </div>
            </div>
          </Reveal>

          {/* Ask. */}
          <Reveal className="md:col-span-2" delay={0.16}>
            <div className="flex h-full flex-col rounded-[var(--radius-3)] border border-accent-line bg-accent-soft p-6">
              <h3 className="serif text-[22px] font-medium leading-7 text-text">Ask the text</h3>
              <p className="mt-2 text-[14px] leading-6 text-text-2">Answers are built from the verses and show which ones they draw on.</p>
              <div className="mt-4 flex flex-col items-start gap-2">
                {SAMPLE_QUESTIONS.map((q) => (
                  <button key={q} className="btn h-auto min-h-8 whitespace-normal py-1.5 text-left !text-text" onClick={() => askPartha(q)}>
                    <MessagesSquare size={14} className="shrink-0" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ── What it promises ────────────────────────────────────────────────────────────────────────────────
function TrustStrip() {
  const items = [
    { icon: ShieldCheck, title: "Your thoughts stay with you", body: "Reflections are saved on this device, in this browser. They don't sync anywhere; export them when you want to move them." },
    { icon: Sparkles, title: "AI is optional", body: "Reading, search, the graph and suggestions all work without a language model. If you connect one, only the text you choose is sent." },
    { icon: Library, title: "Built on open texts", body: "Sanskrit, translations and commentaries come from open datasets, chiefly the Gita Initiative's gita/gita. Recitations stream from holy-bhagavad-gita.org." },
  ];
  return (
    <section aria-labelledby="promise-title" className={`pb-20 md:pb-28 ${PAD}`}>
      <div className="mx-auto grid max-w-7xl gap-10 border-t border-line pt-12 lg:grid-cols-12">
        <h2 id="promise-title" className="serif text-[clamp(1.6rem,2.6vw,2.1rem)] font-medium leading-[1.15] text-text lg:col-span-4">
          Free to use, private by default.
        </h2>
        <ul className="grid gap-8 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-3">
          {items.map((it) => (
            <li key={it.title}>
              <it.icon size={18} className="text-accent-text" aria-hidden />
              <h3 className="mt-3 text-[15px] font-semibold text-text">{it.title}</h3>
              <p className="mt-1.5 text-[14px] leading-6 text-text-2">{it.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Closing: the chariot at dusk, again ─────────────────────────────────────────────────────────────
function Closing() {
  return (
    <section data-theme="dark" aria-labelledby="closing-title" className="relative isolate overflow-hidden bg-[#120a05]">
      <Picture art="dusk" sizes="100vw" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover [object-position:80%_60%]" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b0603]/85 via-[#0b0603]/45 to-transparent" />
      <div className={`mx-auto max-w-7xl py-24 md:py-32 ${PAD}`}>
        <Reveal>
          <h2 id="closing-title" className="serif max-w-[17ch] text-balance text-[clamp(2rem,4.4vw,3.4rem)] font-medium leading-[1.06] tracking-[-0.02em] text-[#f5efe6]">
            Begin anywhere. Every verse leads to the rest.
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <button className="btn btn-primary btn-lg max-sm:flex-1" onClick={() => go.explore()}>
              Explore the graph
              <ArrowRight size={16} />
            </button>
            <button className="btn btn-lg home-glass max-sm:flex-1" onClick={go.lesson}>
              <BookOpen size={16} />
              Start with one verse
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  const s = useGita.getState;
  return (
    <footer className={`py-10 ${PAD}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark size={22} />
          <span className="text-[14px] font-semibold text-text">GitaViśva</span>
          <span className="deva text-[13px] leading-none text-text-3">गीताविश्व</span>
        </div>
        <nav aria-label="More" className="flex flex-wrap gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => s().setWelcomeOpen(true)}>
            <CircleHelp size={14} />
            Guide
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => s().setPaletteOpen(true)}>
            <Search size={14} />
            Search
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => s().setSettingsOpen(true)}>
            <Settings size={14} />
            Settings
          </button>
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-7xl text-[12.5px] leading-5 text-text-3">
        The paintings on this page were made with AI image generation, in the manner of Pahari miniature painting. Translations quoted here are by {HOME_TRANSLATOR}; the reader offers several others.
      </p>
    </footer>
  );
}

export default function Home() {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div ref={scroller} className="home-root absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain">
      <Hero scroller={scroller} />
      <Crossroads />
      <VerseSpotlight />
      <GraphSection />
      <Arc />
      <WaysIn />
      <TrustStrip />
      <Closing />
      <Footer />
    </div>
  );
}
