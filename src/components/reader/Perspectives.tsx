"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AudioLines, ChevronDown, Columns2, Languages, LoaderCircle, Pause, Play, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { audio, setCommentaryAfter, useAudio } from "@/lib/store/audioStore";
import { useConnection } from "@/lib/store/settingsStore";
import { loadCommentary } from "@/lib/data/loader";
import { cacheTranslation, getCachedTranslation } from "@/lib/store/personalStore";
import { streamFromApi } from "@/lib/llm/browser";
import { useModal } from "@/lib/hooks/useModal";
import { LANG_NAME, SPOKEN_COMMENTARIES, TRADITIONS, commentatorOf, traditionById, type CommentaryLang, type TraditionId } from "@/lib/commentary/traditions";
import { findExcerpts, matcherFor, regexFor, splitHits, type WordMatcher } from "@/lib/commentary/lens";
import type { CommentaryDoc, CommentaryEntry, Verse } from "@/lib/types";

/**
 * Commentaries as perspectives: the same verse read by different schools (darśanas), side by side.
 * Filter by language and tradition, follow one word of the verse through every commentary, compare up to four,
 * and listen to English and Hindi ones read aloud by the device's voice. Sanskrit-only commentaries can be
 * translated by the connected language model, labelled as an AI draft.
 */

type LangFilter = CommentaryLang | "all";
const LANG_KEY = "gitaviswa:commentary-lang";
const LANG_LABEL: Record<LangFilter, string> = { en: "English", hi: "हिन्दी", sa: "संस्कृत", all: "All" };
const MAX_COMPARE = 4;

const traditionIndex = (e: CommentaryEntry) => TRADITIONS.findIndex((t) => t.id === commentatorOf(e).tradition);
const textClass = (lang: CommentaryLang) => (lang === "en" ? "serif text-[15.5px] leading-[1.65]" : "deva text-[15.5px] leading-[1.95]");

function Highlighted({ text, re }: { text: string; re: RegExp | null }) {
  return (
    <>
      {splitHits(text, re).map((s, i) =>
        s.hit ? (
          <mark key={i} className="rounded-[3px] bg-accent-soft px-0.5 text-text">
            {s.t}
          </mark>
        ) : (
          <span key={i}>{s.t}</span>
        ),
      )}
    </>
  );
}

function Mark({ color }: { color: string }) {
  return <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

/** Listen to one commentary; offer it as the reading after every verse. */
function ListenControls({ e, verse }: { e: CommentaryEntry; verse: Verse }) {
  const state = useAudio((s) => (s.source === "commentary" && s.verseId === verse.id && s.reading?.authorId === e.authorId ? (s.playing ? "playing" : "paused") : null));
  const loadingHere = useAudio((s) => s.source === "commentary" && s.verseId === verse.id && s.loading);
  const after = useAudio((s) => s.commentaryAfter);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (state || !loadingHere) setAsked(false);
  }, [state, loadingHere]);
  const spoken = SPOKEN_COMMENTARIES.some((s) => s.authorId === e.authorId);
  const onListen = () => {
    if (state === "playing" || state === "paused") return audio.toggle();
    setAsked(true);
    void audio.readCommentary(verse.id, e.authorId);
  };
  return (
    <>
      <button className="btn btn-sm" onClick={onListen} aria-label={state === "playing" ? `Pause ${commentatorOf(e).name}` : `Listen to ${commentatorOf(e).name} read aloud`}>
        {asked && loadingHere ? <LoaderCircle size={13} className="animate-spin" /> : state === "playing" ? <Pause size={13} /> : <Play size={13} />}
        {state === "playing" ? "Pause" : state === "paused" ? "Resume" : "Listen"}
      </button>
      {spoken && (
        <button
          className="btn btn-sm"
          aria-pressed={after === e.authorId}
          onClick={() => setCommentaryAfter(after === e.authorId ? null : e.authorId)}
          title="When verses play one at a time, read this commentary aloud after each one"
        >
          <AudioLines size={13} />
          {after === e.authorId ? "Reads after each verse" : "After each verse"}
        </button>
      )}
    </>
  );
}

/** AI translation of a Sanskrit commentary, cached in this browser. */
function AiTranslation({ e, verse }: { e: CommentaryEntry; verse: Verse }) {
  const conn = useConnection();
  const target = useGita((s) => (s.translationLang === "hi" ? "Hindi" : "English"));
  const key = `comm:${verse.id}:${e.authorId}`;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    setText("");
    setErr("");
    getCachedTranslation(key, target).then((t) => live && t && setText(t));
    return () => {
      live = false;
    };
  }, [key, target]);
  if (e.lang !== "sa" || (!conn && !text)) return null;
  const run = async () => {
    setBusy(true);
    setErr("");
    const c = commentatorOf(e);
    const r = await streamFromApi({
      mode: "commentary",
      question: `Translate ${c.name}'s Sanskrit commentary${c.work ? ` (${c.work})` : ""} on Bhagavad Gita ${verse.ref} into ${target}.`,
      context: `Verse ${verse.ref}: ${verse.sanskrit.join(" ")}\n\nCommentary by ${c.name}, ${traditionById(c.tradition).name}:\n${e.text}`,
      onToken: (_t, full) => setText(full),
    });
    if (r.ok && r.text.trim()) await cacheTranslation(key, target, r.text.trim());
    else {
      setText("");
      setErr(r.error || "The translation could not be made.");
    }
    setBusy(false);
  };
  return (
    <div className="mt-3">
      {text ? (
        <div className="rounded-[var(--radius-2)] border border-line bg-surface px-3 py-2.5">
          <div className="text-[11.5px] font-medium text-text-3">AI translation into {target}, a draft: check it against the Sanskrit</div>
          <p className={`mt-1.5 whitespace-pre-line text-text-2 ${target === "Hindi" ? "deva text-[15px] leading-[1.9]" : "serif text-[15px] leading-[1.6]"}`}>{text}</p>
        </div>
      ) : (
        <button className="btn btn-sm" onClick={run} disabled={busy}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Languages size={13} />}
          {busy ? "Translating" : `Translate into ${target} with AI`}
        </button>
      )}
      {err && <p className="mt-1.5 text-[12px] text-danger">{err}</p>}
    </div>
  );
}

function CommentaryCard({ e, verse, matcher, inCompare, canCompare, onCompare }: { e: CommentaryEntry; verse: Verse; matcher: WordMatcher | null; inCompare: boolean; canCompare: boolean; onCompare: () => void }) {
  const c = commentatorOf(e);
  const t = traditionById(c.tradition);
  const [open, setOpen] = useState(false);
  const re = matcher ? regexFor(matcher, e.lang) : null;
  const excerpts = useMemo(() => (re ? findExcerpts(e.text, re, 2) : []), [e.text, re]);
  const long = e.text.length > (e.lang === "en" ? 460 : 340);
  const lensMiss = !!matcher && !excerpts.length;
  return (
    <article className={`rounded-[var(--radius-3)] border bg-surface-2 p-3.5 ${inCompare ? "border-accent-line" : "border-line"}`} aria-label={`${c.name}, ${t.name}, ${LANG_NAME[e.lang]}`}>
      <header className="flex items-start gap-2.5">
        <Mark color={t.color} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-5 text-text">
            {c.name}
            <span className="font-normal text-text-3"> in {LANG_NAME[e.lang]}</span>
          </div>
          <div className="text-[12px] leading-4 text-text-3">
            {t.name}
            {c.work ? `, ${c.work}` : ""}
            {c.translator ? `. Translated by ${c.translator}` : ""}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm shrink-0" aria-pressed={inCompare} disabled={!inCompare && !canCompare} onClick={onCompare} title={inCompare ? "Remove from the comparison" : canCompare ? "Add to the comparison" : `Up to ${MAX_COMPARE} at a time`}>
          <Columns2 size={13} />
          Compare
        </button>
      </header>

      <div className="mt-2.5 text-text-2">
        {matcher && !open ? (
          lensMiss ? (
            <p className="text-[13px] text-text-3">This comment doesn&apos;t use the word directly.</p>
          ) : (
            <ul className="space-y-2">
              {excerpts.map((x, i) => (
                <li key={i} className={`border-l-2 border-accent-line pl-3 ${textClass(e.lang)}`}>
                  <Highlighted text={x} re={re} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className={`whitespace-pre-line ${textClass(e.lang)} ${open || !long ? "" : "line-clamp-6"}`}>
            <Highlighted text={e.text} re={re} />
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {(long || matcher) && (
          <button className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? "Show less" : matcher ? "Whole commentary" : "Read all"}
          </button>
        )}
        <ListenControls e={e} verse={verse} />
      </div>
      <AiTranslation e={e} verse={verse} />
    </article>
  );
}

function CompareDialog({ verse, entries, matcher, onClose, onRemove }: { verse: Verse; entries: CommentaryEntry[]; matcher: WordMatcher | null; onClose: () => void; onRemove: (id: number) => void }) {
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModal(true, overlay, dialog, onClose, closeRef);
  const enAuthor = useGita((s) => s.enAuthor);
  const translation = verse.translations.en?.[String(enAuthor)] || Object.values(verse.translations.en)[0];
  return createPortal(
    <div ref={overlay} className="fixed inset-0 z-50 flex bg-[rgba(8,6,4,0.62)] md:p-6" onMouseDown={(ev) => ev.target === overlay.current && onClose()}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="compare-title" className="panel mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden max-md:rounded-none">
        <header className="flex items-start gap-3 border-b border-line px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1">
            <h2 id="compare-title" className="text-[15px] font-semibold text-text">
              BG {verse.ref}, read {entries.length} ways
            </h2>
            <p lang="sa" className="deva mt-1 text-[15px] leading-7 text-text-2">
              {verse.sanskrit.join(" ")}
            </p>
            {translation && <p className="serif mt-0.5 text-[14px] leading-6 text-text-3">{translation}</p>}
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-icon shrink-0" onClick={onClose} aria-label="Close the comparison">
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ ["--cols" as string]: Math.min(entries.length, 4) }}>
            {entries.map((e) => {
              const c = commentatorOf(e);
              const t = traditionById(c.tradition);
              const re = matcher ? regexFor(matcher, e.lang) : null;
              return (
                <section key={e.authorId} className="min-w-0 rounded-[var(--radius-3)] border border-line bg-surface-2 p-4" aria-label={`${c.name}, ${t.name}`}>
                  <div className="flex items-start gap-2.5">
                    <Mark color={t.color} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold text-text">
                        {c.name}
                        <span className="font-normal text-text-3"> in {LANG_NAME[e.lang]}</span>
                      </div>
                      <div className="text-[12px] leading-4 text-text-3">
                        {t.name}
                        {c.translator ? `. Translated by ${c.translator}` : ""}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-icon btn-sm shrink-0" onClick={() => onRemove(e.authorId)} aria-label={`Remove ${c.name} from the comparison`}>
                      <X size={13} />
                    </button>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-5 text-text-3">{t.lens}</p>
                  <p className={`mt-3 whitespace-pre-line text-text-2 ${textClass(e.lang)}`}>
                    <Highlighted text={e.text} re={re} />
                  </p>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Perspectives({ verse }: { verse: Verse }) {
  const select = useGita((s) => s.select);
  const translationLang = useGita((s) => s.translationLang);
  const [doc, setDoc] = useState<CommentaryDoc | null | undefined>(undefined);
  const [lang, setLangState] = useState<LangFilter>(() => {
    try {
      const v = localStorage.getItem(LANG_KEY) as LangFilter | null;
      if (v && v in LANG_LABEL) return v;
    } catch {}
    return translationLang === "hi" ? "hi" : "en";
  });
  const [trad, setTrad] = useState<TraditionId | "all">("all");
  const [word, setWord] = useState<number | null>(null);
  const [compare, setCompare] = useState<number[]>([]);
  const [comparing, setComparing] = useState(false);
  // Removing every column inside the comparison closes it.
  useEffect(() => {
    if (!compare.length) setComparing(false);
  }, [compare.length]);
  const setLang = (l: LangFilter) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  };

  useEffect(() => {
    let live = true;
    setDoc(undefined);
    setWord(null);
    setCompare([]);
    loadCommentary(verse.id).then((d) => live && setDoc(d));
    return () => {
      live = false;
    };
  }, [verse.id]);

  const all = useMemo(() => doc?.commentaries ?? [], [doc]);
  const readable = useMemo(() => all.filter((e) => !e.none && !e.seeAlso), [all]);
  const counts = useMemo(() => ({ en: readable.filter((e) => e.lang === "en").length, hi: readable.filter((e) => e.lang === "hi").length, sa: readable.filter((e) => e.lang === "sa").length, all: readable.length }), [readable]);
  const effLang: LangFilter = lang === "all" || counts[lang] ? lang : ((["en", "hi", "sa"] as const).find((l) => counts[l]) ?? "all");
  const inLang = useMemo(() => readable.filter((e) => effLang === "all" || e.lang === effLang), [readable, effLang]);
  const tradCounts = useMemo(() => {
    const m = new Map<TraditionId, number>();
    for (const e of inLang) m.set(commentatorOf(e).tradition, (m.get(commentatorOf(e).tradition) ?? 0) + 1);
    return m;
  }, [inLang]);
  const effTrad = trad !== "all" && tradCounts.get(trad) ? trad : "all";
  const shown = useMemo(() => inLang.filter((e) => effTrad === "all" || commentatorOf(e).tradition === effTrad).sort((a, b) => traditionIndex(a) - traditionIndex(b) || a.authorId - b.authorId), [inLang, effTrad]);

  const words = useMemo(() => verse.padaccheda.map((p, i) => ({ ...p, i })).filter((p) => p.k.some((k) => k.length >= 3)), [verse]);
  const matcher = useMemo(() => (word !== null && verse.padaccheda[word] ? matcherFor(verse.padaccheda[word].k) : null), [word, verse]);
  const mentions = useMemo(() => (matcher ? shown.filter((e) => findExcerpts(e.text, regexFor(matcher, e.lang), 1).length).length : 0), [matcher, shown]);

  const present = new Set(readable.map((e) => commentatorOf(e).name));
  const silent = [...new Set(all.filter((e) => e.none).map((e) => commentatorOf(e).name))].filter((n) => !present.has(n));
  const crossRefs = [...new Map(all.filter((e) => e.seeAlso).map((e) => [`${commentatorOf(e).name}|${e.seeAlso}`, { name: commentatorOf(e).name, to: e.seeAlso! }])).values()];
  const traditionsHere = TRADITIONS.filter((t) => readable.some((e) => commentatorOf(e).tradition === t.id));

  if (doc === undefined)
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading commentaries">
        <div className="skeleton h-8 w-full" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  if (!doc || !readable.length)
    return (
      <p className="text-[13px] leading-5 text-text-3">
        Commentary for this verse isn&apos;t available right now. If you are offline, it appears once the verse has been opened with a connection.
        {process.env.NODE_ENV !== "production" && " (Developer: run npm run data to bundle commentaries.)"}
      </p>
    );

  const toggleCompare = (id: number) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX_COMPARE ? [...c, id] : c));
  const compareEntries = compare.map((id) => readable.find((e) => e.authorId === id)).filter((e): e is CommentaryEntry => !!e);
  const tradInfo = effTrad !== "all" ? traditionById(effTrad) : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="label mb-1.5">
          {readable.length} commentaries from {traditionsHere.length} traditions
        </div>
        <div className="seg w-full" role="radiogroup" aria-label="Commentary language">
          {(["en", "hi", "sa", "all"] as LangFilter[]).map((l) => (
            <button key={l} role="radio" aria-checked={effLang === l} disabled={l !== "all" && !counts[l]} className={`flex-1 ${l === "hi" || l === "sa" ? "deva !text-[13px]" : ""}`} onClick={() => setLang(l)}>
              {LANG_LABEL[l]}
              <span className="num text-[11px] text-text-3">{counts[l]}</span>
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Traditions" className="flex flex-wrap gap-1.5">
        <button className="chip shrink-0" aria-pressed={effTrad === "all"} onClick={() => setTrad("all")}>
          All traditions
        </button>
        {TRADITIONS.filter((t) => tradCounts.get(t.id)).map((t) => (
          <button key={t.id} className="chip shrink-0" aria-pressed={effTrad === t.id} onClick={() => setTrad(effTrad === t.id ? "all" : t.id)}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
            {t.short}
            <span className="num text-text-3">{tradCounts.get(t.id)}</span>
          </button>
        ))}
      </div>

      {tradInfo ? (
        <div className="rounded-[var(--radius-2)] border border-line bg-surface px-3 py-2.5">
          <div className="text-[13px] font-semibold text-text">{tradInfo.name}</div>
          <div className="text-[12px] text-text-3">{tradInfo.teacher}</div>
          <p className="mt-1 text-[13px] leading-5 text-text-2">{tradInfo.lens}</p>
        </div>
      ) : (
        <details className="group rounded-[var(--radius-2)] border border-line bg-surface px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-text-2">
            <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
            How these traditions read the Gita
          </summary>
          <ul className="mt-2 space-y-2.5 pb-1">
            {traditionsHere.map((t) => (
              <li key={t.id} className="flex gap-2.5">
                <Mark color={t.color} />
                <div>
                  <div className="text-[13px] font-semibold text-text">
                    {t.name} <span className="font-normal text-text-3">({t.teacher})</span>
                  </div>
                  <p className="text-[12.5px] leading-5 text-text-2">{t.lens}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {words.length > 0 && (
        <div>
          <div className="text-[13px] font-medium text-text">One word, many readings</div>
          <p className="text-[12px] leading-4 text-text-3">Pick a word of the verse to see how each commentary takes it up.</p>
          <div role="group" aria-label="Words of the verse" className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {words.map((w) => (
              <button key={w.i} className="chip shrink-0 !py-1" aria-pressed={word === w.i} onClick={() => setWord(word === w.i ? null : w.i)} title={w.m}>
                <span className="serif italic text-text">{w.w}</span>
                <span className="text-text-3">{w.m}</span>
              </button>
            ))}
          </div>
          {matcher && word !== null && (
            <p className="mt-2 text-[12.5px] text-text-2" role="status">
              <span className="serif italic text-text">{verse.padaccheda[word].w}</span> is taken up in {mentions} of the {shown.length} commentaries shown.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {shown.map((e) => (
          <CommentaryCard key={e.authorId} e={e} verse={verse} matcher={matcher} inCompare={compare.includes(e.authorId)} canCompare={compare.length < MAX_COMPARE} onCompare={() => toggleCompare(e.authorId)} />
        ))}
      </div>

      {effLang === "sa" && <p className="text-[12px] leading-5 text-text-3">Sanskrit commentaries are read aloud with a Hindi voice, which approximates the pronunciation.</p>}
      {(silent.length > 0 || crossRefs.length > 0) && (
        <div className="space-y-1 border-t border-line pt-3 text-[12.5px] leading-5 text-text-3">
          {crossRefs.map((x) => (
            <p key={`${x.name}${x.to}`}>
              {x.name} discusses this verse together with{" "}
              <button className="font-medium text-accent-text hover:underline" onClick={() => select(x.to, { fly: false })}>
                BG {x.to.slice(3)}
              </button>
              .
            </p>
          ))}
          {silent.length > 0 && <p>No comment on this verse from {silent.join(", ")}.</p>}
        </div>
      )}

      {compare.length > 0 && (
        <div className="sticky bottom-2 z-10 flex items-center gap-2 rounded-[var(--radius-3)] border border-line-2 bg-surface p-2 shadow-[var(--shadow-2)]">
          <span className="min-w-0 flex-1 px-1.5 text-[12.5px] text-text-2">{compare.length === 1 ? "Pick one more to compare" : `${compare.length} chosen to compare`}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setCompare([])}>
            Clear
          </button>
          <button className="btn btn-primary btn-sm" disabled={compare.length < 2} onClick={() => setComparing(true)}>
            <Columns2 size={13} />
            Compare
          </button>
        </div>
      )}
      {comparing && compareEntries.length >= 1 && <CompareDialog verse={verse} entries={compareEntries} matcher={matcher} onClose={() => setComparing(false)} onRemove={(id) => setCompare((c) => c.filter((x) => x !== id))} />}
    </div>
  );
}
