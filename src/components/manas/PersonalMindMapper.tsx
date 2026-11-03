"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BookOpen, Check, ChevronDown, Copy, CornerDownRight, MessagesSquare, Search, Waypoints, Download, HeartHandshake, Link2, LoaderCircle, NotebookPen, Orbit, RotateCw, ShieldCheck, Sparkles, Trash2, TriangleAlert, Undo2, Upload, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { useDraft } from "@/lib/store/draftStore";
import { useConnection } from "@/lib/store/settingsStore";
import { exportStoredRaw, exportThoughts, importThoughts, purgeDeleted, restoreThoughts, trashThoughts, upsertThought } from "@/lib/store/personalStore";
import { CHECK_IN_LABELS, connectionsWith, describeStorageError, searchThoughts, suggestionsFresh, thoughtFromDraft, uid } from "@/lib/store/thoughtModel";
import { retrieve } from "@/lib/graphrag/engine";
import { offlinePerspective, suggestConnections, themeLabel } from "@/lib/graphrag/reflect";
import { detectCrisis, CRISIS_RESOURCES } from "@/lib/graphrag/safety";
import { streamFromApi, type StreamResult } from "@/lib/llm/browser";
import { PROVIDERS } from "@/lib/llm/providers";
import { thoughtNodeId } from "@/lib/graph/graphStore";
import type { ConnectionCandidate, ConnectionOrigin, DraftLink } from "@/lib/types";
import { RichText } from "@/components/chat/RichText";
import { NodePicker } from "@/components/graph/NodePicker";
import { EmptyState, NodeGlyph, Notice, SectionLabel } from "@/components/ui/primitives";
import { RelationSelect } from "./ThoughtDetail";
import { useChat } from "@/components/chat/GraphRagChatbot";

/** Ways to begin a note about a verse. Each sets how the note relates to the verse; disagreeing is as valid as agreeing. */
const VERSE_PROMPTS: { label: string; starter: string; relation: DraftLink["relation"] }[] = [
  { label: "I understand this as…", starter: "I understand this as ", relation: "relates_to" },
  { label: "I disagree, or I'm unsure…", starter: "I'm not sure about this, because ", relation: "questions" },
  { label: "This reminds me of…", starter: "This reminds me of ", relation: "reminds_me_of" },
];

const EXAMPLES = [
  { kind: "An idea", text: "Could a city be designed around cooperation rather than competition?" },
  { kind: "Gratitude", text: "I'm grateful for the long walk with my father this evening. We hardly spoke, and it was enough." },
  { kind: "A question about a verse", text: "In BG 2.47, how can effort matter if I am not supposed to care about the results?" },
  { kind: "Something difficult", text: "I keep replaying an argument and can't let the anger go." },
];

function download(name: string, body: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const when = (ms: number) => {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/** Reads `{ id, why }` items or bare ids from a model reply, keeping only ids that exist in the graph. */
function readIds(x: unknown, has: (id: string) => boolean): { id: string; why?: string }[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((i) => (typeof i === "string" ? { id: i } : i && typeof i === "object" && typeof (i as { id?: unknown }).id === "string" ? { id: (i as { id: string }).id, why: typeof (i as { why?: unknown }).why === "string" ? (i as { why: string }).why : undefined } : null))
    .filter((i): i is { id: string; why?: string } => !!i && has(i.id));
}

function CrisisNotice() {
  return (
    <div className="rounded-3 border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-danger-soft p-4" role="alert">
      <div className="flex items-center gap-2 text-danger">
        <HeartHandshake size={16} />
        <span className="text-[13.5px] font-semibold">Please reach out to someone today</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-text-2">What you are carrying sounds very heavy. A person can help right now:</p>
      <ul className="mt-2 space-y-0.5 text-[13px]">
        {CRISIS_RESOURCES.map((r) => (
          <li key={r.label}>
            <span className="text-text-3">{r.label}: </span>
            <span className="font-semibold text-text">{r.contact}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Optional, initially unanswered. Words rather than numbers; arrow keys move between choices. */
function CheckIn({ value, onChange, disabled }: { value?: number; onChange: (v?: number) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const n = CHECK_IN_LABELS.length;
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const j = (i + step + n) % n;
    onChange(j + 1);
    refs.current[j]?.focus();
  };
  return (
    <div>
      <div id="checkin-label" className="text-[12.5px] text-text-3">
        If this weighs on you, how much? <span className="text-text-4">Optional</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <div role="radiogroup" aria-labelledby="checkin-label" className="seg flex-wrap">
          {CHECK_IN_LABELS.map((label, i) => (
            <button
              key={label}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="radio"
              aria-checked={value === i + 1}
              tabIndex={i === (value ? value - 1 : 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(i + 1)}
              onKeyDown={(e) => onKey(e, i)}
              className="max-sm:!h-10"
            >
              {label}
            </button>
          ))}
        </div>
        {value !== undefined && (
          <button className="btn btn-ghost btn-sm max-sm:h-10" onClick={() => onChange(undefined)} disabled={disabled}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

type SaveState = { state: "idle" } | { state: "saving" } | { state: "saved"; id: string; kept: number; response: boolean } | { state: "error"; message: string };

/** Reflect (Manas-Darpaṇa): keep a thought in your own words; optionally choose how it connects to the Gita. Stored only in this browser's IndexedDB. */
export function PersonalMindMapper() {
  const thoughts = useGita((s) => s.thoughts);
  const thoughtsStatus = useGita((s) => s.thoughtsStatus);
  const thoughtsError = useGita((s) => s.thoughtsError);
  const thoughtsUnreadable = useGita((s) => s.thoughtsUnreadable);
  const trash = useGita((s) => s.trash);
  const setThoughts = useGita((s) => s.setThoughts);
  const graphs = useGita((s) => s.graphs);
  const versesById = useGita((s) => s.versesById);
  const select = useGita((s) => s.select);
  const setSettingsOpen = useGita((s) => s.setSettingsOpen);
  const conn = useConnection();
  const draft = useDraft((s) => s.draft);
  const persist = useDraft((s) => s.persist);
  const persistError = useDraft((s) => s.persistError);
  const restored = useDraft((s) => s.restored);
  const focusNonce = useDraft((s) => s.focusNonce);
  const [deleted, setDeleted] = useState<{ ids: string[]; label: string } | null>(null);
  const [trashNotice, setTrashNotice] = useState<string | null>(null);
  const [find, setFind] = useState("");
  // Custody: when the last backup was made, and whether the browser agreed not to evict this site's storage.
  const [lastBackup, setLastBackup] = useState<{ at: number; count: number } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("gitaviswa:last-backup") || "null");
    } catch {
      return null;
    }
  });
  const [persisted, setPersisted] = useState<"unknown" | "yes" | "no" | "denied">("unknown");
  useEffect(() => {
    navigator.storage?.persisted?.().then((p) => setPersisted(p ? "yes" : "no"), () => {});
  }, []);
  const [busy, setBusy] = useState<"" | "analyze" | "deepen">("");
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const [notice, setNotice] = useState<{ text: string; tone: "neutral" | "danger" } | null>(null);
  const [discarded, setDiscarded] = useState<typeof draft | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(() => useDraft.getState().draft.checkIn !== undefined);
  const [copied, setCopied] = useState(false);
  const [newRelation, setNewRelation] = useState<DraftLink["relation"]>("relates_to");
  const savingRef = useRef(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const text = draft.text;
  const hasText = !!text.trim();
  const saving = save.state === "saving";
  const s = draft.suggestions;
  const stale = !!s && !suggestionsFresh(draft);
  const crisis = detectCrisis(text) || (s ? detectCrisis(s.forText) : false);
  const links = draft.links ?? [];
  // A response's link to the earlier thought is shown in the banner above the composer, not with the other connections.
  const responseTo = draft.origin?.kind === "thought" ? draft.origin.thoughtId : null;
  const earlier = responseTo ? thoughts.find((t) => t.id === responseTo) : undefined;
  const verseOrigin = draft.origin?.kind === "verse" ? versesById.get(draft.origin.verseId) : undefined;
  const askOrigin = draft.origin?.kind === "ask" ? draft.origin : undefined;
  // The answer the takeaway came from (still in this session's conversation), for "keep beside your note".
  const answer = useChat((s) => {
    if (!askOrigin) return undefined;
    const i = s.messages.map((m) => m.role === "user" && m.content === askOrigin.question).lastIndexOf(true);
    return i >= 0 ? s.messages.slice(i + 1).find((m) => m.role === "assistant" && !m.streaming && m.content) : undefined;
  });
  const kept =links.filter((l) => l.status === "accepted" && !(responseTo && l.relation === "responds_to" && l.targetId === thoughtNodeId(responseTo)));
  const statusOf = (id: string) => links.find((l) => l.targetId === id)?.status;
  const nameOf = (id: string) => themeLabel(graphs?.nodeById.get(id)) || id;

  // Leaving the view: write the latest keystrokes now rather than after the debounce.
  useEffect(() => () => void useDraft.getState().flush(), []);
  useEffect(() => {
    if (focusNonce) textRef.current?.focus();
  }, [focusNonce]);

  const onType = (value: string) => {
    if (save.state === "saved") setSave({ state: "idle" });
    setDiscarded(null);
    setCopied(false);
    useDraft.getState().setText(value);
  };

  const relationOf = (id: string) => links.find((l) => l.targetId === id)?.relation ?? "relates_to";
  /** Keep, decline, or (status undefined) undo a decision. A kept link keeps the relation the person chose. */
  const decide = (c: { targetId: string; why?: string; origin?: ConnectionOrigin; relation?: DraftLink["relation"] }, status?: DraftLink["status"]) =>
    useDraft.getState().decide({ targetId: c.targetId, status, relation: c.relation ?? relationOf(c.targetId), origin: c.origin ?? "user", ...(c.why ? { why: c.why } : {}) });

  const findConnections = async () => {
    const ctx = useGita.getState().ragContext();
    const d = useDraft.getState().draft;
    const forText = d.text.trim();
    if (!ctx || !forText) return;
    setBusy("analyze");
    setNotice(null);
    try {
      const sug = await suggestConnections(ctx, forText);
      sug.reflection = offlinePerspective(ctx, sug) || undefined;
      useDraft.getState().setSuggestions(d.id, sug);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    } catch {
      setNotice({ text: "Connections couldn't be looked up just now. Your writing is unaffected and can still be saved.", tone: "neutral" });
    } finally {
      setBusy("");
    }
  };

  const deepen = async () => {
    const ctx = useGita.getState().ragContext();
    const d = useDraft.getState().draft;
    const base = d.suggestions;
    if (!ctx || !base || !suggestionsFresh(d)) return;
    setBusy("deepen");
    let res: StreamResult;
    try {
      const list = (type: string) => ctx.data.nodes.filter((n) => n.type === type).map((n) => `${n.id} — ${n.label}${"en" in n ? ` (${n.en})` : ""}`);
      const r = await retrieve(ctx, base.forText, { limitVerses: 10 });
      const verseIds = [...new Set([...base.candidates.filter((c) => c.targetId.startsWith("BG_")).map((c) => c.targetId), ...r.verses.map((v) => v.id)])].slice(0, 12);
      const verseList = verseIds.map((id) => `${id} — ${(ctx.versesById.get(id)?.translations.en?.[String(ctx.versesDoc.meta.defaults.en)] || "").replace(/\s+/g, " ").slice(0, 160)}`);
      const context = `Emotion ids:\n${list("Emotion").join("\n")}\n\nDilemma ids:\n${list("LifeDilemma").join("\n")}\n\nConcept ids:\n${list("SanskritConcept").join("\n")}\n\nCandidate verses:\n${verseList.join("\n")}\n\nThe person's note:\n${base.forText}`;
      res = await streamFromApi({ mode: "analyze", question: "Suggest where this note might meet the Gita.", context });
    } catch {
      res = { ok: false, text: "", error: "The language model couldn't be reached. Your writing and the offline suggestions are unchanged." };
    } finally {
      setBusy("");
    }
    if (!res.ok) return setNotice({ text: res.error || "The language model could not explore this note.", tone: "danger" });
    try {
      const j = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1)) as Record<string, unknown>;
      const has = (id: string) => ctx.graphs.graph.hasNode(id) && !id.startsWith("thought:");
      const themes = [...readIds(j.themes, has), ...readIds(j.emotions, has), ...readIds(j.dilemmas, has)].filter((x) => !x.id.startsWith("BG_"));
      const verses = readIds(j.verses, has).filter((x) => x.id.startsWith("BG_"));
      const existing = new Set(base.candidates.map((c) => c.targetId));
      const added: ConnectionCandidate[] = [...themes.slice(0, 3), ...verses.slice(0, 3)]
        .filter((x) => !existing.has(x.id))
        .map((x) => ({ targetId: x.id, basis: "ai", why: x.why || "Suggested by your language model", score: 0.5, origin: "ai" }));
      // Still bound to the text that was sent: if the writing changed meanwhile, these show as out of date.
      useDraft.getState().setSuggestions(d.id, { ...base, candidates: [...base.candidates, ...added], reflection: typeof j.reflection === "string" && j.reflection.trim() ? j.reflection : base.reflection, enrichedBy: `${res.provider} · ${res.model}` });
    } catch {
      setNotice({ text: "The model's reply could not be read, so the offline suggestions were kept.", tone: "neutral" });
    }
  };

  /** Saves exactly what is in the composer now. One entry per draft, however many times Save is pressed. */
  const keep = async () => {
    if (savingRef.current) return;
    const d = useDraft.getState().draft;
    if (!d.text.trim()) return;
    savingRef.current = true;
    setSave({ state: "saving" });
    setNotice(null);
    try {
      const t = thoughtFromDraft(d, Date.now());
      setThoughts(await upsertThought(t));
      if (useDraft.getState().draft === d) void useDraft.getState().reset();
      // Anything changed mid-save becomes a separate new draft, so it can't overwrite the entry just saved.
      else useDraft.setState({ draft: { ...useDraft.getState().draft, id: uid() } });
      setCheckInOpen(false);
      setSave({ state: "saved", id: t.id, kept: connectionsWith(t, "accepted").filter((c) => c.relation !== "responds_to").length, response: t.origin?.kind === "thought" });
    } catch (e) {
      setSave({ state: "error", message: describeStorageError(e) });
    } finally {
      savingRef.current = false;
    }
  };

  const discard = async () => {
    setSave({ state: "idle" });
    setCheckInOpen(false);
    setDiscarded(await useDraft.getState().reset());
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(useDraft.getState().draft.text);
      setCopied(true);
    } catch {
      textRef.current?.focus();
      textRef.current?.select();
    }
  };

  // The small map first: the thought in the middle, its few connections around it. The whole graph stays one click away.
  const openSaved = (id: string) => useGita.getState().focusLineage(thoughtNodeId(id));

  /** Deleting moves to "Recently deleted" and offers Undo; nothing is destroyed until that list is emptied. */
  const remove = async (ids: string[], label: string) => {
    setTrashNotice(null);
    try {
      setThoughts(await trashThoughts(ids));
      const sel = useGita.getState().selectedId;
      if (sel && ids.some((id) => thoughtNodeId(id) === sel)) select(null);
      setDeleted({ ids, label });
    } catch (e) {
      setTrashNotice(`Nothing was deleted. ${describeStorageError(e)}`);
    }
  };
  const restore = async (ids: string[]) => {
    setTrashNotice(null);
    try {
      setThoughts(await restoreThoughts(ids));
      setDeleted(null);
    } catch (e) {
      setTrashNotice(`That wasn't restored. ${describeStorageError(e)}`);
    }
  };
  const purge = async (id?: string) => {
    if (!confirm(id ? "Delete this thought permanently? This can't be undone." : `Permanently delete all ${trash.length} recently deleted thoughts? This can't be undone. Export a backup first if you might want them.`)) return;
    try {
      setThoughts(await purgeDeleted(id));
      setDeleted(null);
    } catch (e) {
      setTrashNotice(`Nothing was deleted. ${describeStorageError(e)}`);
    }
  };

  const showInGraph = () => {
    const s = useGita.getState();
    if (!s.graphs) return;
    const nodes = new Set<string>();
    const edges = new Set<string>();
    for (const t of s.thoughts) {
      const id = thoughtNodeId(t.id);
      nodes.add(id);
      s.graphs.graph.forEachOutEdge(id, (key, _a, _s, target) => (nodes.add(target), edges.add(key)));
    }
    s.setLayer("PersonalThought", true);
    s.setHighlight({ nodes, edges, label: "My reflections in the graph", source: "manas" });
    s.setView("cosmos");
  };

  // Summaries count only connections the person kept. A theme "recurs" only when it is in two or more thoughts.
  const patterns = useMemo(() => {
    const themes = new Map<string, number>();
    const chapters = new Array(18).fill(0) as number[];
    let withKept = 0;
    for (const t of thoughts) {
      const ids = new Set(connectionsWith(t, "accepted").map((c) => c.targetId));
      if (ids.size) withKept++;
      for (const id of ids) {
        const v = versesById.get(id);
        if (v) chapters[v.chapter - 1] += 1;
        else if (!id.startsWith("thought:")) themes.set(id, (themes.get(id) || 0) + 1);
      }
    }
    return { recurring: [...themes.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6), chapters, withKept };
  }, [thoughts, versesById]);
  const maxCh = Math.max(1, ...patterns.chapters);
  const changedSince = lastBackup ? thoughts.filter((t) => (t.updatedAt ?? t.createdAt) > lastBackup.at).length : thoughts.length;
  const toReview = thoughts.reduce((n, t) => n + connectionsWith(t, "suggested").length, 0);

  const nodeChip = (id: string) => {
    const n = graphs?.nodeById.get(id);
    if (!n) return null;
    return (
      <button key={id} className="chip min-w-0 max-w-full" onClick={() => select(id)}>
        <NodeGlyph node={n} />
        <span className="truncate">{n.type === "Verse" ? `BG ${n.ref}` : n.label}</span>
      </button>
    );
  };

  const candidateRow = (c: ConnectionCandidate) => {
    const n = graphs?.nodeById.get(c.targetId);
    if (!n) return null;
    const st = statusOf(c.targetId);
    const v = n.type === "Verse" ? versesById.get(n.id) : undefined;
    return (
      <li key={c.targetId} className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <button className="row min-w-0 flex-1 !px-1.5" onClick={() => select(c.targetId)}>
          <NodeGlyph node={n} className="mt-1.5" />
          <span className="min-w-0 flex-1 text-[13px] leading-5">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-medium text-text">{n.type === "Verse" ? `BG ${n.ref}` : themeLabel(n)}</span>
              {v && <span className="deva truncate text-[13px] !leading-6 text-text-3">{v.sanskrit[0]}</span>}
            </span>
            <span className="block text-[12px] leading-4 text-text-3">
              {c.why}
              {c.origin === "ai" ? " · suggested by AI" : ""}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1 pl-1.5 max-sm:w-full max-sm:pl-6">
          <button className="btn btn-sm max-sm:h-10" aria-pressed={st === "accepted"} onClick={() => decide(c, st === "accepted" ? undefined : "accepted")} aria-label={`${st === "accepted" ? "Kept" : "Keep"}: ${nameOf(c.targetId)}`}>
            {st === "accepted" ? (
              <>
                <Check size={13} /> Kept
              </>
            ) : (
              "Keep"
            )}
          </button>
          <button className="btn btn-sm btn-ghost max-sm:h-10" onClick={() => decide(c, "rejected")} aria-label={`Doesn't fit: ${nameOf(c.targetId)}`}>
            Doesn&apos;t fit
          </button>
        </div>
      </li>
    );
  };

  const shown = (s?.candidates ?? []).filter((c) => statusOf(c.targetId) !== "rejected");
  const themeCands = shown.filter((c) => c.basis !== "words" && !c.targetId.startsWith("BG_"));
  const verseCands = shown.filter((c) => c.basis !== "words" && c.targetId.startsWith("BG_"));
  const wordCands = shown.filter((c) => c.basis === "words");
  const declined = (s?.candidates ?? []).filter((c) => statusOf(c.targetId) === "rejected");
  const noClear = !!s && !themeCands.length && !verseCands.length;
  const readyToList = thoughtsStatus === "ready";
  // Newest first; a search narrows to your own words that match (current or earlier wording).
  const shownThoughts = find.trim() ? searchThoughts(thoughts, find, thoughts.length).map((m) => m.thought) : [...thoughts].reverse();

  return (
    <div className="absolute inset-0 overflow-y-auto bg-bg">
      <div className="mx-auto grid max-w-[1120px] gap-x-10 gap-y-8 px-5 pb-20 pt-8 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="reflect-title" className="min-w-0">
          <h1 id="reflect-title" className="text-[26px] font-semibold tracking-[-0.02em] text-text sm:text-[28px]">
            Reflect
          </h1>
          <p className="mt-1.5 max-w-[56ch] text-[14px] leading-[1.6] text-text-2">Keep a thought in your own words: a feeling, a question, an idea. Save it as it is, or look for where it might meet the Gita.</p>
          <div className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-5 text-text-3">
            <ShieldCheck size={14} className="mt-[3px] shrink-0 text-good" />
            Saved on this device, in this browser. Nothing is sent anywhere unless you choose “Explore with AI”.
          </div>

          <div className="panel mt-6 overflow-hidden focus-within:border-accent-line">
            {responseTo && (
              <div className="flex items-start gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-[12.5px] leading-5 text-text-2">
                <CornerDownRight size={14} className="mt-[3px] shrink-0 text-text-3" />
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {earlier ? (
                    <>
                      A later response to your thought from {new Date(earlier.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}:{" "}
                      <button className="serif text-left text-text underline-offset-2 hover:underline" onClick={() => select(thoughtNodeId(earlier.id), { fly: false })}>
                        “{earlier.text.length > 120 ? `${earlier.text.slice(0, 120).trimEnd()}…` : earlier.text}”
                      </button>
                    </>
                  ) : (
                    "A later response to a thought that is no longer saved."
                  )}
                </div>
                <button className="btn btn-ghost btn-icon btn-sm max-sm:h-10 max-sm:w-10" aria-label="Make this a separate thought, not a response" title="Not a response" onClick={() => useDraft.getState().clearOrigin()} disabled={saving}>
                  <X size={14} />
                </button>
              </div>
            )}
            {askOrigin && (
              <div className="border-b border-line bg-surface-2 px-4 py-2.5 text-[12.5px] leading-5 text-text-2">
                <div className="flex items-start gap-2">
                  <MessagesSquare size={14} className="mt-[3px] shrink-0 text-text-3" />
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    Your takeaway from the question <span className="serif text-text">“{askOrigin.question.length > 140 ? `${askOrigin.question.slice(0, 140).trimEnd()}…` : askOrigin.question}”</span>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm max-sm:h-10 max-sm:w-10" aria-label="Not a takeaway from that question" title="Not from that question" disabled={saving} onClick={() => (useDraft.getState().clearOrigin(), useDraft.getState().setAiQuote(undefined))}>
                    <X size={14} />
                  </button>
                </div>
                {askOrigin.citedNodeIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
                    <span className="text-text-3">Sources in the answer · tap to connect:</span>
                    {askOrigin.citedNodeIds.map((id) =>
                      statusOf(id) === "accepted" ? (
                        <span key={id} className="chip" aria-label={`Connected: ${nameOf(id)}`}>
                          <Check size={12} /> {nameOf(id)}
                        </span>
                      ) : (
                        <button key={id} className="chip max-sm:min-h-10" onClick={() => decide({ targetId: id, origin: "ai", why: "Cited in the answer you took this from" }, "accepted")}>
                          + {nameOf(id)}
                        </button>
                      ),
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
                  {answer && (
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!draft.aiQuote} disabled={saving} onChange={(e) => useDraft.getState().setAiQuote(e.target.checked ? { text: answer.content, by: `Ask · ${answer.via ?? "composed from the graph"}` } : undefined)} />
                      Keep the answer beside my note, labelled as generated
                    </label>
                  )}
                  <button className="font-medium text-text-2 underline-offset-2 hover:underline" onClick={() => useGita.getState().setChatOpen(true)}>
                    Back to the answer
                  </button>
                </div>
              </div>
            )}
            {verseOrigin && (
              <div className="border-b border-line bg-surface-2 px-4 py-2.5 text-[12.5px] leading-5 text-text-2">
                <div className="flex items-start gap-2">
                  <BookOpen size={14} className="mt-[3px] shrink-0 text-text-3" />
                  <div className="min-w-0 flex-1">
                    A note on{" "}
                    <button className="font-medium text-text underline-offset-2 hover:underline" onClick={() => select(verseOrigin.id, { fly: false })}>
                      BG {verseOrigin.ref}
                    </button>
                    . The verse stays recorded as where this began; how it connects is up to you.
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm max-sm:h-10 max-sm:w-10" aria-label={`This note isn't about BG ${verseOrigin.ref}`} title="Not about this verse" disabled={saving} onClick={() => (useDraft.getState().clearOrigin(), decide({ targetId: verseOrigin.id }, undefined))}>
                    <X size={14} />
                  </button>
                </div>
                {!hasText && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                    {VERSE_PROMPTS.map((p) => (
                      <button key={p.label} className="chip max-sm:min-h-10" onClick={() => (onType(p.starter), decide({ targetId: verseOrigin.id, relation: p.relation, origin: "user" }, "accepted"), textRef.current?.focus())}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <label htmlFor="reflect-text" className="sr-only">
              {responseTo ? "Your later response" : "Your thought"}
            </label>
            <textarea
              ref={textRef}
              id="reflect-text"
              className="serif block min-h-[180px] w-full resize-y bg-transparent px-5 py-4 text-[17px] leading-[1.65] text-text outline-none placeholder:text-text-3 focus-visible:outline-none"
              placeholder={responseTo ? "What do you see now? What feels the same, or different?" : "Write anything: what happened, a question, an idea, something you are grateful for."}
              value={text}
              readOnly={saving}
              aria-describedby="draft-status"
              onChange={(e) => onType(e.target.value)}
            />
            {kept.length > 0 && (
              <div className="border-t border-line px-4 py-3">
                <div className="label mb-1.5">Connections you&apos;re keeping</div>
                <ul className="space-y-1.5">
                  {kept.map((l) => (
                    <li key={l.targetId} className="flex flex-wrap items-center gap-1.5">
                      <RelationSelect value={l.relation} label={`How this thought relates to ${nameOf(l.targetId)}`} disabled={saving} onChange={(r) => decide({ ...l, relation: r }, "accepted")} />
                      <button className="chip min-w-0 max-w-full" onClick={() => select(l.targetId)}>
                        {graphs?.nodeById.get(l.targetId) && <NodeGlyph node={graphs.nodeById.get(l.targetId)} />}
                        <span className="truncate">{nameOf(l.targetId)}</span>
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm max-sm:h-10 max-sm:w-10" disabled={saving} aria-label={`Stop keeping the connection to ${nameOf(l.targetId)}`} title="Remove" onClick={() => decide(l, undefined)}>
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {checkInOpen && (
              <div id="checkin" className="border-t border-line px-4 py-3">
                <CheckIn value={draft.checkIn} onChange={(v) => useDraft.getState().setCheckIn(v)} disabled={saving} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface-2 px-4 py-3">
              <button className="btn btn-ghost btn-sm -ml-2 max-sm:h-10" aria-expanded={checkInOpen} aria-controls="checkin" onClick={() => setCheckInOpen((o) => !o)}>
                {draft.checkIn ? `Feels: ${CHECK_IN_LABELS[draft.checkIn - 1].toLowerCase()}` : "How it feels (optional)"}
                <ChevronDown size={13} className={`transition-transform ${checkInOpen ? "rotate-180" : ""}`} />
              </button>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <button className="btn max-sm:h-11" disabled={!hasText || !!busy || saving} onClick={findConnections}>
                  {busy === "analyze" ? <LoaderCircle size={14} className="animate-spin" /> : <Link2 size={14} />}
                  {busy === "analyze" ? "Looking" : "Find connections"}
                </button>
                <button className="btn btn-primary max-sm:h-11" disabled={!hasText || saving} onClick={keep}>
                  {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                  {saving ? "Saving" : "Save thought"}
                </button>
              </div>
            </div>
          </div>

          <div id="draft-status" className="mt-2 flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] leading-5 text-text-3">
            {persist === "error" ? (
              <span className="flex min-w-0 items-start gap-1.5 text-danger" role="alert">
                <TriangleAlert size={13} className="mt-[3px] shrink-0" />
                <span>
                  This draft can&apos;t be kept on this device. {persistError} {hasText && "Copy it somewhere safe before closing the page."}
                </span>
              </span>
            ) : !hasText ? (
              <span>Drafts are kept on this device as you write.</span>
            ) : persist === "pending" ? (
              <span>Keeping draft on this device…</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Check size={13} className="shrink-0 text-good" />
                {restored ? `Unsaved draft restored · last edited ${when(draft.updatedAt)}` : `Draft kept on this device · ${when(draft.updatedAt)}`}
              </span>
            )}
            {hasText && (
              <span className="ml-auto flex items-center gap-1">
                {persist === "error" && (
                  <button className="btn btn-ghost btn-sm" onClick={copyText}>
                    <Copy size={13} /> {copied ? "Copied" : "Copy text"}
                  </button>
                )}
                <button className="btn btn-ghost btn-sm max-sm:h-10" onClick={discard} disabled={saving}>
                  Discard draft
                </button>
              </span>
            )}
          </div>

          {save.state === "saved" && (
            <div className="mt-3" role="status">
              <Notice tone="accent" icon={<Check size={14} />}>
                <div>
                  <span className="font-semibold text-text">Saved on this device.</span> {save.response ? "As a later response; the earlier thought and its date are unchanged." : save.kept ? `With ${save.kept === 1 ? "the connection" : `the ${save.kept} connections`} you kept.` : "No connections attached; it stands on its own."}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button className="btn btn-sm" onClick={() => openSaved(save.id)}>
                    <Waypoints size={13} /> See it on your map
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => (setSave({ state: "idle" }), textRef.current?.focus())}>
                    Write another
                  </button>
                </div>
              </Notice>
            </div>
          )}
          {save.state === "error" && (
            <div className="mt-3" role="alert">
              <Notice tone="danger" icon={<TriangleAlert size={14} />}>
                <div>
                  <span className="font-semibold text-text">This thought wasn&apos;t saved.</span> Your writing is still here. {save.message}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button className="btn btn-sm" onClick={keep} disabled={!hasText}>
                    <RotateCw size={13} /> Try again
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={copyText}>
                    <Copy size={13} /> {copied ? "Copied" : "Copy text"}
                  </button>
                </div>
              </Notice>
            </div>
          )}
          {discarded && !hasText && (
            <div className="mt-3" role="status">
              <Notice
                action={
                  <button className="btn btn-sm" onClick={() => (useDraft.getState().restore(discarded), setCheckInOpen(discarded.checkIn !== undefined), setDiscarded(null))}>
                    <Undo2 size={13} /> Undo
                  </button>
                }
              >
                Draft discarded.
              </Notice>
            </div>
          )}

          {!hasText && !s && save.state !== "saved" && (
            <div className="mt-4">
              <div className="label mb-1.5">Not sure where to start? Try one of these</div>
              <div className="flex flex-col items-start gap-1.5">
                {EXAMPLES.map((p) => (
                  <button key={p.kind} className="chip max-w-full flex-col items-start gap-0 whitespace-normal py-1.5 text-left" onClick={() => onType(p.text)}>
                    <span className="text-[11px] text-text-3">{p.kind}</span>
                    <span>{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {crisis && (
            <div className="mt-5">
              <CrisisNotice />
            </div>
          )}

          {s && (
            <div ref={resultRef} className="panel mt-6 p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-semibold text-text">Possible connections</h2>
                <span className="text-[12px] text-text-3">{s.enrichedBy ? `Offline and with ${s.enrichedBy}` : "Suggested offline from the graph"}</span>
              </div>
              <p className="sr-only" role="status">
                {stale ? "These suggestions are for an earlier version of your writing." : noClear ? "No clear connection found." : `${themeCands.length + verseCands.length} possible connections found.`}
              </p>
              {stale ? (
                <div className="mt-3">
                  <Notice
                    tone="accent"
                    action={
                      <button className="btn btn-sm" onClick={findConnections} disabled={!!busy || !hasText || saving}>
                        Update
                      </button>
                    }
                  >
                    You&apos;ve changed your writing since these were suggested. Connections you kept stay; the rest may no longer fit.
                  </Notice>
                </div>
              ) : (
                !noClear && <p className="mt-1.5 text-[12.5px] leading-5 text-text-3">Suggestions, not conclusions. Keep the ones that fit; only what you keep is saved with your thought.</p>
              )}
              <div className={stale ? "opacity-60" : undefined}>
                {noClear && <p className="mt-4 text-[14px] leading-6 text-text-2">No clear connection found. That&apos;s fine: a thought doesn&apos;t need one to be worth keeping.</p>}
                {themeCands.length > 0 && (
                  <section className="mt-5">
                    <SectionLabel>Themes in your words</SectionLabel>
                    <ul className="-mx-1.5 space-y-1">{themeCands.map(candidateRow)}</ul>
                  </section>
                )}
                {verseCands.length > 0 && (
                  <section className="mt-5">
                    <SectionLabel>Verses that may speak to it</SectionLabel>
                    <ul className="-mx-1.5 space-y-1">{verseCands.map(candidateRow)}</ul>
                  </section>
                )}
                {wordCands.length > 0 && (
                  <details className="mt-5">
                    <summary className="cursor-pointer select-none text-[12.5px] font-medium text-text-2 hover:text-text">Verses that share some wording ({wordCands.length})</summary>
                    <p className="mt-1.5 text-[12px] leading-4 text-text-3">Shared words can be a coincidence. Open one before deciding whether it fits.</p>
                    <ul className="-mx-1.5 mt-2 space-y-1">{wordCands.map(candidateRow)}</ul>
                  </details>
                )}
                {declined.length > 0 && (
                  <details className="mt-4 text-[12.5px] text-text-3">
                    <summary className="cursor-pointer select-none hover:text-text-2">Marked as not fitting ({declined.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {declined.map((c) => (
                        <li key={c.targetId} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">{nameOf(c.targetId)}</span>
                          <button className="btn btn-sm btn-ghost" onClick={() => decide(c, undefined)}>
                            Undo
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <section className="mt-5">
                  <SectionLabel>Or choose one yourself</SectionLabel>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <RelationSelect value={newRelation} onChange={setNewRelation} label="How the new connection relates" disabled={saving} />
                    <div className="min-w-0 flex-1">
                      <NodePicker label="Connect this thought to" value={null} placeholder="A verse, idea, feeling or another thought" onChange={(id) => id && decide({ targetId: id, origin: "user", relation: newRelation }, "accepted")} />
                    </div>
                  </div>
                </section>
                {s.reflection && (
                  <div className="mt-5 border-t border-line pt-5">
                    <SectionLabel>{s.enrichedBy ? `A perspective, generated by ${s.enrichedBy}` : "A perspective, composed offline"} · not your words</SectionLabel>
                    <div className="prose-gita">
                      <RichText text={s.reflection} />
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {conn ? (
                  <button className="btn" onClick={deepen} disabled={!!busy || stale || saving}>
                    {busy === "deepen" ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {busy === "deepen" ? "Exploring" : "Explore with AI"}
                  </button>
                ) : (
                  <button className="btn" onClick={() => setSettingsOpen(true, "model")}>
                    <Sparkles size={14} /> Connect a model to explore with AI
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => useDraft.getState().setSuggestions(draft.id, undefined)} disabled={saving}>
                  {kept.length ? "Done" : "No connection for now"}
                </button>
              </div>
              {conn && (
                <p className="mt-2 text-[12px] leading-5 text-text-3">
                  Explore with AI sends this text to {PROVIDERS[conn.provider].name} ({conn.model}){conn.via === "local" ? ", running on your own machine" : ""}. Your other saved thoughts are not sent.
                </p>
              )}
            </div>
          )}
          {notice && (
            <div className="mt-4">
              <Notice tone={notice.tone}>{notice.text}</Notice>
            </div>
          )}
        </section>

        <aside aria-labelledby="history-title" className="min-w-0">
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 id="history-title" className="text-[14px] font-semibold text-text">
                Your saved thoughts
              </h2>
              {readyToList && <span className="num text-[12.5px] text-text-3">{thoughts.length}</span>}
            </div>
            {thoughtsStatus === "error" ? (
              <div className="px-5 py-6" role="alert">
                <div className="flex items-center gap-2 text-danger">
                  <TriangleAlert size={15} />
                  <span className="text-[14px] font-semibold">Your saved thoughts couldn&apos;t be loaded</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-5 text-text-2">Nothing has been deleted or changed. {thoughtsError}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <button className="btn btn-sm" onClick={() => void useGita.getState().reloadThoughts()}>
                    <RotateCw size={13} /> Try again
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={async () => {
                      try {
                        download(`gitaviswa-stored-reflections-${new Date().toISOString().slice(0, 10)}.json`, await exportStoredRaw());
                      } catch (e) {
                        setNotice({ text: `The stored data couldn't be read for download either. ${describeStorageError(e)}`, tone: "danger" });
                      }
                    }}
                  >
                    <Download size={13} /> Download what&apos;s stored
                  </button>
                </div>
              </div>
            ) : thoughtsStatus === "loading" ? (
              <div className="px-5 py-8 text-center text-[13px] text-text-3" role="status">
                Loading your saved thoughts…
              </div>
            ) : thoughts.length === 0 ? (
              <EmptyState icon={<NotebookPen size={18} />} title="Nothing saved yet">
                Saved thoughts collect here, with or without a connection to the Gita.
              </EmptyState>
            ) : (
              <div className="p-5">
                {toReview > 0 && (
                  <p className="mb-4 text-[12.5px] leading-5 text-text-3">
                    {toReview === 1 ? "1 suggested connection hasn't" : `${toReview} suggested connections haven't`} been confirmed. Open a thought to keep or decline them.
                  </p>
                )}
                {patterns.recurring.length > 0 && (
                  <section className="mb-6">
                    <SectionLabel>Themes you&apos;ve connected more than once</SectionLabel>
                    <ul className="space-y-1">
                      {patterns.recurring.map(([id, n]) => {
                        const node = graphs?.nodeById.get(id);
                        if (!node) return null;
                        return (
                          <li key={id}>
                            <button className="flex w-full items-center gap-2 text-left text-[12.5px] text-text hover:opacity-80" onClick={() => select(id)}>
                              <NodeGlyph node={node} />
                              <span className="min-w-0 flex-1 truncate">{themeLabel(node)}</span>
                              <span className="num text-text-3">{n} thoughts</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                {patterns.chapters.some(Boolean) && (
                  <section className="mb-6">
                    <SectionLabel>Chapters of verses you&apos;ve connected</SectionLabel>
                    <div className="flex h-14 items-end gap-[3px]" role="img" aria-label={`Verses you kept, by chapter: ${patterns.chapters.map((c, i) => `${i + 1}: ${c}`).join(", ")}`}>
                      {patterns.chapters.map((c, i) => (
                        <button key={i} className="flex-1 rounded-t-[3px] transition-opacity hover:opacity-80" style={{ height: `${Math.max(c ? 8 : 3, (c / maxCh) * 100)}%`, background: c ? "var(--n-chapter)" : "var(--line-2)" }} title={`Chapter ${i + 1}: ${c} kept verse connection${c === 1 ? "" : "s"}`} aria-label={`Read chapter ${i + 1}`} onClick={() => useGita.getState().openChapter(i + 1)} />
                      ))}
                    </div>
                    <div className="num mt-1 flex justify-between text-[11px] text-text-3">
                      <span>1</span>
                      <span>9</span>
                      <span>18</span>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-4 text-text-3">From connections you kept, in {patterns.withKept} of {thoughts.length} thoughts.</p>
                  </section>
                )}
                <button className="btn w-full" onClick={showInGraph}>
                  <Orbit size={14} /> See my thoughts in the graph
                </button>
              </div>
            )}
            {readyToList && thoughtsUnreadable > 0 && (
              <div className="border-t border-line px-5 py-3">
                <Notice icon={<TriangleAlert size={13} />}>
                  {thoughtsUnreadable === 1 ? "One stored item" : `${thoughtsUnreadable} stored items`} couldn&apos;t be read by this version and {thoughtsUnreadable === 1 ? "was" : "were"} left untouched.
                </Notice>
              </div>
            )}
            {(deleted || trashNotice) && (
              <div className="border-t border-line px-5 py-3" role="status">
                {trashNotice ? (
                  <Notice tone="danger">{trashNotice}</Notice>
                ) : (
                  deleted && (
                    <Notice
                      action={
                        <button className="btn btn-sm max-sm:h-10" onClick={() => void restore(deleted.ids)}>
                          <Undo2 size={13} /> Undo
                        </button>
                      }
                    >
                      {deleted.label}
                    </Notice>
                  )
                )}
              </div>
            )}
            {readyToList && thoughts.length > 1 && (
              <div className="border-t border-line px-4 py-2.5">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
                  <input type="search" className="field field-sm !pl-8 max-sm:!h-10" placeholder="Search your thoughts" aria-label="Search your saved thoughts" value={find} onChange={(e) => setFind(e.target.value)} />
                </div>
                {find.trim() && <p className="mt-1.5 text-[12px] text-text-3" role="status">{shownThoughts.length ? `${shownThoughts.length} of ${thoughts.length} thoughts` : `No saved thought contains “${find.trim()}”.`} Searched on this device only.</p>}
              </div>
            )}
            {readyToList && shownThoughts.length > 0 && (
              <ul className="max-h-[42vh] divide-y divide-line overflow-y-auto border-t border-line">
                {shownThoughts.map((t) => {
                  const pending = connectionsWith(t, "suggested").length;
                  return (
                    <li key={t.id} className="group px-5 py-3.5">
                      <div className="flex items-center gap-2 text-[12px] text-text-3">
                        <span>{new Date(t.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                        {t.checkIn && <span>· {CHECK_IN_LABELS[t.checkIn - 1].toLowerCase()}</span>}
                        <button className="btn btn-ghost btn-icon btn-sm ml-auto opacity-0 focus-visible:opacity-100 group-hover:opacity-100 max-md:h-10 max-md:w-10 max-md:opacity-100" onClick={() => remove([t.id], "Thought moved to Recently deleted.")} aria-label="Delete this thought (it can be restored)" title="Delete (can be restored)">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <button className="serif mt-1 block w-full text-left text-[14.5px] leading-[1.55] text-text-2 hover:text-text" onClick={() => select(thoughtNodeId(t.id), { fly: false })} aria-label={`Open this thought: ${t.text.slice(0, 80)}`}>
                        <span className="line-clamp-3">{t.text}</span>
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {connectionsWith(t, "accepted").map((c) => nodeChip(c.targetId))}
                        {pending > 0 && (
                          <button className="text-[12px] text-text-3 underline-offset-2 hover:text-text-2 hover:underline" onClick={() => select(thoughtNodeId(t.id), { fly: false })}>
                            {pending} to review
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {readyToList && trash.length > 0 && (
              <details className="border-t border-line px-5 py-3">
                <summary className="cursor-pointer select-none text-[12.5px] font-medium text-text-2 hover:text-text">Recently deleted ({trash.length})</summary>
                <p className="mt-1.5 text-[12px] leading-4 text-text-3">Kept on this device until you delete them permanently.</p>
                <ul className="mt-2 divide-y divide-line">
                  {trash.map((d) => (
                    <li key={d.thought.id} className="py-2.5">
                      <div className="text-[12px] text-text-3">Deleted {new Date(d.deletedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
                      <p className="serif mt-0.5 line-clamp-2 text-[14px] leading-[1.5] text-text-2 [overflow-wrap:anywhere]">{d.thought.text}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button className="btn btn-sm max-sm:h-10" onClick={() => void restore([d.thought.id])}>
                          <Undo2 size={13} /> Restore
                        </button>
                        <button className="btn btn-sm btn-ghost btn-danger max-sm:h-10" onClick={() => void purge(d.thought.id)}>
                          Delete permanently
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-sm btn-ghost btn-danger mt-1" onClick={() => void purge()}>
                  Empty recently deleted
                </button>
              </details>
            )}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-3">
              <button className="btn btn-sm" disabled={!readyToList || !thoughts.length} onClick={() => {
                  download(`gitaviswa-reflections-${new Date().toISOString().slice(0, 10)}.json`, exportThoughts(thoughts));
                  const b = { at: Date.now(), count: thoughts.length };
                  setLastBackup(b);
                  try {
                    localStorage.setItem("gitaviswa:last-backup", JSON.stringify(b));
                  } catch {}
                }}>
                <Download size={13} /> Export
              </button>
              <button className="btn btn-sm" disabled={thoughtsStatus === "loading"} onClick={() => fileRef.current?.click()}>
                <Upload size={13} /> Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const r = await importThoughts(await f.text());
                    setThoughts(r);
                    const parts = [`${r.added} added`, r.updated ? `${r.updated} updated` : "", r.unchanged ? `${r.unchanged} already here` : ""].filter(Boolean);
                    setNotice({ text: `Backup restored: ${parts.join(", ")}.${r.skipped ? ` ${r.skipped} item${r.skipped === 1 ? "" : "s"} in the file couldn't be read and ${r.skipped === 1 ? "was" : "were"} skipped.` : ""}`, tone: "neutral" });
                  } catch (err) {
                    const name = (err as Error).name;
                    setNotice({ text: name === "Error" ? (err as Error).message : `The backup wasn't restored. ${describeStorageError(err)}`, tone: "danger" });
                  }
                  e.target.value = "";
                }}
              />
              <button
                className="btn btn-sm btn-ghost btn-danger ml-auto"
                disabled={!readyToList || !thoughts.length}
                onClick={() => {
                  if (!confirm(`Move all ${thoughts.length} saved thoughts to Recently deleted? You can restore them from there until you empty it.`)) return;
                  void remove(
                    thoughts.map((t) => t.id),
                    `All ${thoughts.length} thoughts moved to Recently deleted.`,
                  );
                }}
              >
                <Trash2 size={13} /> Delete all
              </button>
            </div>
            {readyToList && thoughts.length > 0 && (
              <div className="border-t border-line px-5 py-3 text-[12px] leading-5 text-text-3">
                <p>
                  {lastBackup ? `Last backup ${new Date(lastBackup.at).toLocaleDateString(undefined, { dateStyle: "medium" })}${changedSince ? ` · ${changedSince} saved or changed since` : " · up to date"}.` : "No backup yet: these thoughts exist only in this browser."} Backups are plain, unencrypted files. To move to another device, export here and import there.
                </p>
                {persisted === "no" && (
                  <button className="mt-1 font-medium text-text-2 underline-offset-2 hover:underline" onClick={async () => setPersisted((await navigator.storage.persist().catch(() => false)) ? "yes" : "denied")}>
                    Ask this browser not to clear them automatically
                  </button>
                )}
                {persisted === "yes" && <p className="mt-1">This browser has agreed not to clear them automatically. Clearing site data yourself still removes them.</p>}
                {persisted === "denied" && <p className="mt-1">The browser didn&apos;t agree to keep them permanently, so a regular backup matters.</p>}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
