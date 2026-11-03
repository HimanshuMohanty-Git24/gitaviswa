"use client";
// Manas-Darpan persistence — 100% local (IndexedDB via idb-keyval). Nothing here ever leaves the browser.
import { createStore, get, set, del, keys, type UseStore } from "idb-keyval";
import type { DeletedThought, PersonalThought, ThoughtDraft } from "@/lib/types";
import { exportDocument, mergeThoughts, moveToTrash, parseBackup, readDraft, readStoredThoughts, readStoredTrash, restoreFromTrash, upsertInto } from "./thoughtModel";

let store: UseStore | null = null;
const db = () => (store ??= createStore("gitaviswa", "manas"));
const THOUGHTS = "thoughts";
/** "Recently deleted": entries stay here, restorable, until the person empties it. */
const TRASH = "thoughts:deleted";
const DRAFT = "draft";
/** One-time copy of the entries exactly as they were before the first versioned write. A recovery net; the app never reads it. */
const PRE_V2_COPY = "thoughts:before-v2";

export interface ThoughtLoad {
  thoughts: PersonalThought[];
  /** Stored records this version could not read; they are preserved as they are. */
  unreadable: number;
  /** Recently deleted, newest first. Absent when this operation didn't read it. */
  trash?: DeletedThought[];
}

/** Reads every saved thought. Rejects when storage can't be read, so a failure is never mistaken for an empty history. */
export async function loadThoughts(): Promise<ThoughtLoad> {
  const { thoughts, unreadable } = readStoredThoughts(await get(THOUGHTS, db()));
  let trash: DeletedThought[] = [];
  try {
    trash = readStoredTrash(await get(TRASH, db())).items;
  } catch {
    // An unreadable trash must not hide the history; trash operations will report the problem instead.
  }
  return { thoughts, unreadable: unreadable.length, trash };
}

type State = { list: PersonalThought[]; trash: DeletedThought[] };

/**
 * Read–modify–write of the entries and "Recently deleted" inside one IndexedDB transaction, so overlapping saves
 * (or two tabs) cannot drop each other's entries, a delete can't half-happen, and a failed read aborts instead of
 * writing a shorter list. Unreadable records are written back untouched.
 */
function transact(change: (s: State) => State): Promise<ThoughtLoad> {
  return db()("readwrite", (os) =>
    new Promise<ThoughtLoad>((resolve, reject) => {
      const tx = os.transaction;
      let out: ThoughtLoad | null = null;
      tx.oncomplete = () => (out ? resolve(out) : reject(new Error("The save did not complete.")));
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("The save was interrupted."));
      const fail = (e: unknown) => {
        reject(e);
        tx.abort();
      };
      const req = os.get(THOUGHTS);
      req.onsuccess = () => {
        const treq = os.get(TRASH);
        treq.onsuccess = () => {
          try {
            const raw = req.result;
            const { thoughts, unreadable, legacy } = readStoredThoughts(raw);
            // The trash is parsed strictly only when this change actually touches it.
            let trashState: { items: DeletedThought[]; unreadable: unknown[] } | null = null;
            let trashError: unknown = null;
            try {
              trashState = readStoredTrash(treq.result);
            } catch (e) {
              trashError = e;
            }
            const before = trashState?.items ?? [];
            const next = change({ list: thoughts, trash: before });
            if (next.trash !== before) {
              if (trashError) throw trashError;
              os.put([...next.trash, ...(trashState?.unreadable ?? [])], TRASH);
            }
            if (legacy) {
              const copy = os.get(PRE_V2_COPY);
              copy.onsuccess = () => {
                if (copy.result === undefined) os.put({ savedAt: Date.now(), thoughts: raw }, PRE_V2_COPY);
              };
            }
            os.put([...next.list, ...unreadable], THOUGHTS);
            out = { thoughts: next.list, unreadable: unreadable.length, ...(trashState ? { trash: next.trash } : {}) };
          } catch (e) {
            fail(e);
          }
        };
      };
    }),
  );
}
const mutate = (change: (list: PersonalThought[]) => PersonalThought[]) => transact((s) => ({ ...s, list: change(s.list) }));

export const upsertThought = (t: PersonalThought) => mutate((list) => upsertInto(list, t));

/** Moves entries to "Recently deleted". Nothing is destroyed until the person empties it. */
export const trashThoughts = (ids: string[]) => transact((s) => moveToTrash(s.list, s.trash, ids, Date.now()));
export const restoreThoughts = (ids: string[]) => transact((s) => ids.reduce((acc, id) => restoreFromTrash(acc.list, acc.trash, id), s));
/** The only permanent deletion: of one item, or (no id) everything in "Recently deleted". */
export const purgeDeleted = (id?: string) => transact((s) => ({ ...s, trash: id ? s.trash.filter((d) => d.thought.id !== id) : [] }));

export function exportThoughts(list: PersonalThought[]): string {
  return exportDocument(list, new Date().toISOString());
}

/** Exactly what is stored, for recovery when it can't be read as entries. */
export async function exportStoredRaw(): Promise<string> {
  return JSON.stringify({ app: "GitaViswa", kind: "manas-darpan-raw", exportedAt: new Date().toISOString(), stored: (await get(THOUGHTS, db())) ?? null }, null, 2);
}

/** Merges a backup file into what is stored. Validation happens before anything is written. */
export async function importThoughts(json: string) {
  const { thoughts: incoming, skipped } = parseBackup(json);
  let counts = { added: 0, updated: 0, unchanged: 0 };
  const load = await mutate((list) => {
    const m = mergeThoughts(list, incoming);
    counts = { added: m.added, updated: m.updated, unchanged: m.unchanged };
    return m.merged;
  });
  return { ...load, ...counts, skipped };
}

// ── the unsaved draft ──
export async function loadDraft(): Promise<ThoughtDraft | null> {
  return readDraft(await get(DRAFT, db()));
}
export async function saveDraft(d: ThoughtDraft | null): Promise<void> {
  if (d) await set(DRAFT, d, db());
  else await del(DRAFT, db());
}

// ── on-demand regional translations (LLM output cached once generated) ──
const trKey = (verseId: string, lang: string) => `tr:${verseId}:${lang}`;
export async function getCachedTranslation(verseId: string, lang: string): Promise<string | undefined> {
  try {
    return await get<string>(trKey(verseId, lang), db());
  } catch {
    return undefined;
  }
}
export async function cacheTranslation(verseId: string, lang: string, text: string): Promise<void> {
  await set(trKey(verseId, lang), text, db());
}
export async function countCachedTranslations(): Promise<number> {
  try {
    return (await keys(db())).filter((k) => String(k).startsWith("tr:")).length;
  } catch {
    return 0;
  }
}
