"use client";
// Manas-Darpan persistence — 100% local (IndexedDB via idb-keyval). Nothing here ever leaves the browser.
import { createStore, get, set, del, keys, type UseStore } from "idb-keyval";
import type { PersonalThought } from "@/lib/types";

let store: UseStore | null = null;
const db = () => (store ??= createStore("gitaviswa", "manas"));
const THOUGHTS = "thoughts";

export async function loadThoughts(): Promise<PersonalThought[]> {
  try {
    return ((await get<PersonalThought[]>(THOUGHTS, db())) || []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function saveThoughts(list: PersonalThought[]): Promise<void> {
  await set(THOUGHTS, list, db());
}

export async function upsertThought(t: PersonalThought): Promise<PersonalThought[]> {
  const list = await loadThoughts();
  const i = list.findIndex((x) => x.id === t.id);
  if (i >= 0) list[i] = t;
  else list.push(t);
  await saveThoughts(list);
  return list;
}

export async function deleteThought(id: string): Promise<PersonalThought[]> {
  const list = (await loadThoughts()).filter((t) => t.id !== id);
  await saveThoughts(list);
  return list;
}

export async function clearThoughts(): Promise<void> {
  await del(THOUGHTS, db());
}

export function exportThoughts(list: PersonalThought[]): string {
  return JSON.stringify({ app: "GitaViswa", kind: "manas-darpan-backup", version: 1, exportedAt: new Date().toISOString(), thoughts: list }, null, 2);
}

export async function importThoughts(json: string): Promise<PersonalThought[]> {
  const doc = JSON.parse(json);
  const incoming: PersonalThought[] = Array.isArray(doc) ? doc : doc.thoughts;
  if (!Array.isArray(incoming)) throw new Error("Not a Manas-Darpan backup file.");
  const valid = incoming.filter((t) => t && typeof t.id === "string" && typeof t.text === "string" && typeof t.createdAt === "number");
  const list = await loadThoughts();
  const byId = new Map(list.map((t) => [t.id, t]));
  for (const t of valid) byId.set(t.id, { ...t, emotions: t.emotions ?? [], dilemmas: t.dilemmas ?? [], verses: t.verses ?? [], intensity: t.intensity ?? 3 });
  const merged = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
  await saveThoughts(merged);
  return merged;
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
