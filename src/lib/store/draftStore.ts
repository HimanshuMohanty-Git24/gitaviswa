"use client";
// The unsaved Reflect draft. It lives outside the component, so switching views cannot lose it, and is written to
// IndexedDB shortly after each change (and immediately when the page is hidden), so a reload or restart restores it.
import { create } from "zustand";
import type { DraftLink, ThoughtDraft, ThoughtSuggestions } from "@/lib/types";
import { decide, describeStorageError, draftIsEmpty, newDraft, uid } from "./thoughtModel";
import { loadDraft, saveDraft } from "./personalStore";

/** idle: nothing to keep · pending: latest change not yet written · saved: kept on this device · error: could not be written */
export type DraftPersist = "idle" | "pending" | "saved" | "error";

interface DraftState {
  draft: ThoughtDraft;
  /** The current draft was restored from storage rather than typed in this session. */
  restored: boolean;
  persist: DraftPersist;
  persistError?: string;
  hydrate: () => Promise<void>;
  setText: (text: string) => void;
  setCheckIn: (level: number | undefined) => void;
  /** Attach suggestions to the draft they were computed for; ignored if that draft has since been saved or discarded. */
  setSuggestions: (draftId: string, s: ThoughtSuggestions | undefined) => void;
  /** Keep, decline, or (with no status) undo a decision about one connection. */
  decide: (link: Omit<DraftLink, "status" | "at"> & { status?: DraftLink["status"] }) => void;
  /** Start a fresh, empty draft (after saving or discarding) and forget the stored one. Returns the previous draft. */
  reset: () => Promise<ThoughtDraft>;
  /** Put a previously discarded draft back (Undo). */
  restore: (d: ThoughtDraft) => void;
  flush: () => Promise<void>;
  /** Begin a dated response to a saved thought. Refuses (returns false) rather than replace unsaved writing. */
  startResponse: (thoughtId: string) => boolean;
  /** Turn a response back into a free-standing thought. */
  clearOrigin: () => void;
  /** Bumped when the composer should take focus. */
  focusNonce: number;
  requestFocus: () => void;
  /** Start a note about a verse (or attach the verse to writing already in progress). The verse is the note's origin and a connection the person can change or remove. */
  startVerseNote: (verseId: string, relation?: DraftLink["relation"]) => "new" | "added";
  /** Start a takeaway from an Ask answer: the question and cited sources are its origin (context, not endorsement). Refuses rather than replace unsaved writing. */
  startAskNote: (question: string, citedNodeIds: string[]) => boolean;
  setAiQuote: (quote: { text: string; by: string } | undefined) => void;
}

const DEBOUNCE_MS = 400;
let timer: ReturnType<typeof setTimeout> | null = null;
// Writes run one after another, so an older snapshot can never land after a newer one.
let writes: Promise<void> = Promise.resolve();

export const useDraft = create<DraftState>((set, get) => {
  const write = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const d = get().draft;
    const empty = draftIsEmpty(d);
    writes = writes
      .then(() => saveDraft(empty ? null : d))
      .then(
        () => {
          if (get().draft === d) set({ persist: empty ? "idle" : "saved", persistError: undefined });
        },
        (e) => {
          if (get().draft === d) set({ persist: "error", persistError: describeStorageError(e) });
        },
      );
    return writes;
  };
  const change = (draft: ThoughtDraft) => {
    set({ draft, persist: "pending" });
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, DEBOUNCE_MS);
  };

  return {
    draft: newDraft(uid(), Date.now()),
    restored: false,
    persist: "idle",
    focusNonce: 0,

    hydrate: async () => {
      try {
        const d = await loadDraft();
        // Never replace words already typed in this session.
        if (d && !draftIsEmpty(d) && draftIsEmpty(get().draft)) set({ draft: d, restored: true, persist: "saved" });
      } catch (e) {
        set({ persist: "error", persistError: describeStorageError(e) });
      }
    },
    setText: (text) => change({ ...get().draft, text, updatedAt: Date.now() }),
    setCheckIn: (checkIn) => {
      const d = { ...get().draft, updatedAt: Date.now() };
      if (checkIn === undefined) delete d.checkIn;
      else d.checkIn = checkIn;
      change(d);
    },
    setSuggestions: (draftId, suggestions) => {
      const d = { ...get().draft };
      if (d.id !== draftId) return;
      if (suggestions) d.suggestions = suggestions;
      else delete d.suggestions;
      change(d);
    },
    decide: (link) => change(decide(get().draft, link, Date.now())),
    reset: async () => {
      const prev = get().draft;
      if (timer) clearTimeout(timer);
      timer = null;
      set({ draft: newDraft(uid(), Date.now()), restored: false, persist: "idle", persistError: undefined });
      writes = writes.then(() => saveDraft(null)).catch(() => {});
      await writes;
      return prev;
    },
    restore: (d) => change({ ...d, updatedAt: Date.now() }),
    flush: () => (timer ? write() : writes),
    requestFocus: () => set({ focusNonce: get().focusNonce + 1 }),
    startAskNote: (question, citedNodeIds) => {
      if (!draftIsEmpty(get().draft)) return false;
      change({ ...newDraft(uid(), Date.now()), origin: { kind: "ask", question: question.slice(0, 500), citedNodeIds: citedNodeIds.slice(0, 8) } });
      set({ restored: false, focusNonce: get().focusNonce + 1 });
      return true;
    },
    setAiQuote: (quote) => {
      const d = { ...get().draft };
      if (quote) d.aiQuote = quote;
      else delete d.aiQuote;
      change(d);
    },
    startVerseNote: (verseId, relation = "relates_to") => {
      const d = get().draft;
      const now = Date.now();
      const fresh = draftIsEmpty(d);
      if (fresh) change({ ...newDraft(uid(), now), origin: { kind: "verse", verseId }, links: [{ targetId: verseId, status: "accepted", relation, origin: "user", at: now }] });
      else if (!d.links?.some((l) => l.targetId === verseId && l.status === "accepted")) change(decide(d, { targetId: verseId, status: "accepted", relation, origin: "user" }, now));
      set({ restored: fresh ? false : get().restored, focusNonce: get().focusNonce + 1 });
      return fresh ? "new" : "added";
    },
    startResponse: (thoughtId) => {
      if (!draftIsEmpty(get().draft)) return false;
      const now = Date.now();
      change({ ...newDraft(uid(), now), origin: { kind: "thought", thoughtId }, links: [{ targetId: `thought:${thoughtId}`, status: "accepted", relation: "responds_to", origin: "user", at: now }] });
      set({ restored: false, focusNonce: get().focusNonce + 1 });
      return true;
    },
    clearOrigin: () => {
      const d = { ...get().draft };
      const o = d.origin;
      delete d.origin;
      if (o?.kind === "thought") d.links = (d.links ?? []).filter((l) => !(l.targetId === `thought:${o.thoughtId}` && l.relation === "responds_to"));
      change(d);
    },
  };
});

if (typeof window !== "undefined") {
  const flushNow = () => void useDraft.getState().flush();
  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
  // Last resort: if the draft could not be stored, ask before the page goes away with it.
  window.addEventListener("beforeunload", (e) => {
    const s = useDraft.getState();
    if (s.persist === "error" && !draftIsEmpty(s.draft)) e.preventDefault();
  });
}

/** Unsaved edits to saved thoughts, by id. In memory only: they survive closing the panel or switching views. */
export const useThoughtEdits = create<{ edits: Record<string, string>; setEdit: (id: string, text: string | undefined) => void }>((set, get) => ({
  edits: {},
  setEdit: (id, text) => {
    const edits = { ...get().edits };
    if (text === undefined) delete edits[id];
    else edits[id] = text;
    set({ edits });
  },
}));
