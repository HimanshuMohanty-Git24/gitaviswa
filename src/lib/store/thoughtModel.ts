// Pure rules for personal thoughts and drafts: schema migration, draft → saved entry, staleness, connection review,
// backup merge. No browser, React or path-alias imports, so the rules run under `node --test` (see tests/).
import type { ConnectionOrigin, ConnectionRelation, DeletedThought, DraftLink, PersonalConnection, PersonalThought, ThoughtDraft, ThoughtSuggestions } from "../types";

/**
 * Current record schema.
 *   1 — unversioned; always carried an intensity (preselected at 3) and automatic emotion/dilemma/verse links.
 *   2 — optional check-in; intensity kept only as history.
 *   3 — explicit `connections` with status (suggested / accepted / rejected) and origin; automatic links from
 *       schema ≤2 become unreviewed suggestions, because nothing proves the person approved them.
 */
export const THOUGHT_SCHEMA = 3;
export const BACKUP_KIND = "manas-darpan-backup";
export const CHECK_IN_LABELS = ["Light", "Noticeable", "Heavy", "Very heavy", "Overwhelming"] as const;

export const RELATION_LABELS: Record<ConnectionRelation, string> = {
  relates_to: "Relates to",
  asks_about: "I'm asking about",
  questions: "I question or disagree with",
  reminds_me_of: "Reminds me of",
  responds_to: "Responds to",
};
const RELATIONS = Object.keys(RELATION_LABELS) as ConnectionRelation[];
const STATUSES = ["suggested", "accepted", "rejected"] as const;
const ORIGINS: ConnectionOrigin[] = ["user", "local", "ai", "legacy"];

/** Stored data exists but is not a list of entries. Callers must not write over it. */
export class StoredFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoredFormatError";
  }
}

/** RFC 4122 v4 id. `crypto.randomUUID` only exists in secure contexts, so a phone on a LAN http URL needs the fallback. */
export function uid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const links = <T>(x: unknown): T[] => (Array.isArray(x) ? (x.filter((l) => isObj(l) && typeof l.id === "string") as T[]) : []);
export const isCheckIn = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= CHECK_IN_LABELS.length;
export const connectionId = (targetId: string) => `c:${targetId}`;

/** Schema ≤2 automatic links → unreviewed suggestions (never "accepted": no approval history is invented). */
function legacyConnections(raw: Record<string, unknown>, at: number): PersonalConnection[] {
  const out = new Map<string, PersonalConnection>();
  const add = (targetId: string, why?: string) => {
    if (!out.has(targetId)) out.set(targetId, { id: connectionId(targetId), targetId, relation: "relates_to", status: "suggested", origin: "legacy", ...(why ? { why } : {}), createdAt: at });
  };
  for (const e of links<{ id: string }>(raw.emotions)) add(e.id);
  for (const d of links<{ id: string }>(raw.dilemmas)) add(d.id);
  for (const v of links<{ id: string; why?: unknown }>(raw.verses)) add(v.id, typeof v.why === "string" ? v.why : undefined);
  return [...out.values()];
}

function readConnection(x: unknown, fallbackAt: number): PersonalConnection | null {
  if (!isObj(x) || typeof x.targetId !== "string" || !x.targetId) return null;
  return {
    ...(x as unknown as PersonalConnection),
    id: typeof x.id === "string" && x.id ? x.id : connectionId(x.targetId),
    relation: RELATIONS.includes(x.relation as ConnectionRelation) ? (x.relation as ConnectionRelation) : "relates_to",
    status: STATUSES.includes(x.status as (typeof STATUSES)[number]) ? (x.status as PersonalConnection["status"]) : "suggested",
    origin: ORIGINS.includes(x.origin as ConnectionOrigin) ? (x.origin as ConnectionOrigin) : "legacy",
    createdAt: typeof x.createdAt === "number" ? x.createdAt : fallbackAt,
  };
}

/**
 * Normalises one stored record to the current schema. Everything the record carries is kept: a schema-1 intensity
 * stays as history (never promoted to a check-in) and the schema ≤2 link arrays stay as they were. Returns null when
 * the record lacks the essentials — an id, its text and a creation time.
 */
export function migrateThought(raw: unknown): PersonalThought | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id || typeof raw.text !== "string" || typeof raw.createdAt !== "number" || !Number.isFinite(raw.createdAt)) return null;
  const t = { ...raw } as PersonalThought & Record<string, unknown>;
  t.connections = Array.isArray(raw.connections)
    ? raw.connections.map((c) => readConnection(c, raw.createdAt as number)).filter((c): c is PersonalConnection => !!c)
    : legacyConnections(raw, raw.createdAt);
  if (typeof t.v !== "number" || t.v < THOUGHT_SCHEMA) t.v = THOUGHT_SCHEMA;
  if (t.checkIn !== undefined && !isCheckIn(t.checkIn)) delete t.checkIn;
  if (t.revisions !== undefined) {
    const r = Array.isArray(t.revisions) ? t.revisions.filter((x) => isObj(x) && typeof x.text === "string" && typeof x.until === "number") : [];
    if (r.length) t.revisions = r;
    else delete t.revisions;
  }
  return t;
}

export interface StoredThoughts {
  thoughts: PersonalThought[];
  /** Records this version cannot read. They are written back untouched, never dropped. */
  unreadable: unknown[];
  /** True while any record predates the current schema (used to keep a one-time pre-migration copy). */
  legacy: boolean;
}

/** Interprets the stored value. Missing → empty. Anything other than a list throws, so it is never overwritten. */
export function readStoredThoughts(raw: unknown): StoredThoughts {
  if (raw === undefined || raw === null) return { thoughts: [], unreadable: [], legacy: false };
  if (!Array.isArray(raw)) throw new StoredFormatError("Saved thoughts are stored in a format this version can't read.");
  const thoughts: PersonalThought[] = [];
  const unreadable: unknown[] = [];
  let legacy = false;
  for (const r of raw) {
    if (isObj(r) && !(typeof r.v === "number" && r.v >= THOUGHT_SCHEMA)) legacy = true;
    const t = migrateThought(r);
    if (t) thoughts.push(t);
    else unreadable.push(r);
  }
  thoughts.sort((a, b) => a.createdAt - b.createdAt);
  return { thoughts, unreadable, legacy };
}

/** Insert or replace by id. A repeated save of the same entry keeps its original creation time. */
export function upsertInto(list: PersonalThought[], t: PersonalThought): PersonalThought[] {
  const i = list.findIndex((x) => x.id === t.id);
  if (i < 0) return [...list, t].sort((a, b) => a.createdAt - b.createdAt);
  const next = list.slice();
  next[i] = { ...t, createdAt: list[i].createdAt };
  return next;
}

// ── editing and recoverable deletion ──

/** New wording for a saved thought. The previous wording is kept in `revisions`; connections stay as the person left them. */
export function editThought(t: PersonalThought, text: string, now: number): PersonalThought {
  const next = text.trim();
  if (!next || next === t.text) return t;
  return { ...t, text: next, updatedAt: now, revisions: [...(t.revisions ?? []), { text: t.text, until: now }] };
}

/** Interprets the stored "Recently deleted" list. Missing → empty; anything else than a list throws, so it is never overwritten. */
export function readStoredTrash(raw: unknown): { items: DeletedThought[]; unreadable: unknown[] } {
  if (raw === undefined || raw === null) return { items: [], unreadable: [] };
  if (!Array.isArray(raw)) throw new StoredFormatError("Recently deleted thoughts are stored in a format this version can't read.");
  const items: DeletedThought[] = [];
  const unreadable: unknown[] = [];
  for (const r of raw) {
    const t = isObj(r) ? migrateThought(r.thought) : null;
    if (t && isObj(r) && typeof r.deletedAt === "number") items.push({ thought: t, deletedAt: r.deletedAt });
    else unreadable.push(r);
  }
  return { items: items.sort((a, b) => b.deletedAt - a.deletedAt), unreadable };
}

/** Move entries to "Recently deleted". Nothing is destroyed. */
export function moveToTrash(list: PersonalThought[], trash: DeletedThought[], ids: string[], now: number) {
  const gone = new Set(ids);
  const moved = list.filter((t) => gone.has(t.id)).map((thought) => ({ thought, deletedAt: now }));
  return { list: list.filter((t) => !gone.has(t.id)), trash: [...moved, ...trash.filter((d) => !gone.has(d.thought.id))] };
}

/** Put a deleted entry back, exactly as it was (its connections and dates included). */
export function restoreFromTrash(list: PersonalThought[], trash: DeletedThought[], id: string) {
  const item = trash.find((d) => d.thought.id === id);
  if (!item) return { list, trash };
  return { list: upsertInto(list, item.thought), trash: trash.filter((d) => d.thought.id !== id) };
}

// ── local search over the person's own words ──

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’'`]/g, "");

export interface ThoughtMatch {
  thought: PersonalThought;
  /** A short excerpt around the first match. */
  snippet: string;
  /** Where it matched: the current words, or an earlier wording kept by an edit. */
  in: "text" | "earlier";
}

/**
 * Finds saved thoughts containing every word of the query (or the exact phrase, ranked first). Only the person's own
 * words are searched — current text and earlier wordings — never generated interpretations. Runs locally; nothing is sent.
 */
export function searchThoughts(list: PersonalThought[], query: string, limit = 8): ThoughtMatch[] {
  const q = norm(query.trim());
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const out: (ThoughtMatch & { rank: number })[] = [];
  for (const t of list) {
    const sources: [string, ThoughtMatch["in"]][] = [[t.text, "text"], ...(t.revisions ?? []).map((r) => [r.text, "earlier"] as [string, ThoughtMatch["in"]])];
    for (const [text, where] of sources) {
      const n = norm(text);
      if (!words.every((w) => n.includes(w))) continue;
      const phrase = n.indexOf(q);
      const at = phrase >= 0 ? phrase : n.indexOf(words[0]);
      const start = Math.max(0, at - 40);
      const snippet = `${start > 0 ? "…" : ""}${text.slice(start, start + 140).replace(/\s+/g, " ").trim()}${start + 140 < text.length ? "…" : ""}`;
      out.push({ thought: t, snippet, in: where, rank: (phrase >= 0 ? 2 : 1) + (where === "text" ? 0.5 : 0) });
      break;
    }
  }
  return out
    .sort((a, b) => b.rank - a.rank || (b.thought.updatedAt ?? b.thought.createdAt) - (a.thought.updatedAt ?? a.thought.createdAt))
    .slice(0, limit)
    .map(({ thought, snippet, in: where }) => ({ thought, snippet, in: where }));
}

// ── connection review on saved thoughts ──

export const connectionsWith = (t: PersonalThought, status: PersonalConnection["status"]) => t.connections.filter((c) => c.status === status);

/** Keep (accept), reject, or change the relation of one connection. Returns a new thought; the text is never touched. */
export function reviewConnection(t: PersonalThought, targetId: string, change: { status?: PersonalConnection["status"]; relation?: ConnectionRelation }, now: number): PersonalThought {
  return { ...t, updatedAt: now, connections: t.connections.map((c) => (c.targetId === targetId ? { ...c, ...change, updatedAt: now } : c)) };
}

/** Add a connection the person chose themselves (or re-accept an earlier one to the same target). */
export function addConnection(t: PersonalThought, targetId: string, relation: ConnectionRelation, now: number): PersonalThought {
  const rest = t.connections.filter((c) => c.targetId !== targetId);
  return { ...t, updatedAt: now, connections: [...rest, { id: connectionId(targetId), targetId, relation, status: "accepted", origin: "user", createdAt: now }] };
}

/**
 * Remove a connection without touching the thought. A link the person added themselves simply goes; a suggested one
 * is remembered as rejected, so it is not quietly suggested again.
 */
export function removeConnection(t: PersonalThought, targetId: string, now: number): PersonalThought {
  const c = t.connections.find((x) => x.targetId === targetId);
  if (!c) return t;
  if (c.origin === "user") return { ...t, updatedAt: now, connections: t.connections.filter((x) => x.targetId !== targetId) };
  return reviewConnection(t, targetId, { status: "rejected" }, now);
}

// ── drafts ──

export const newDraft = (id: string, now: number): ThoughtDraft => ({ id, text: "", createdAt: now, updatedAt: now });

/** Nothing worth keeping: no words, no check-in, no chosen connections. */
export const draftIsEmpty = (d: ThoughtDraft) => !d.text.trim() && d.checkIn === undefined && !d.links?.some((l) => l.status === "accepted");

/** Suggestions describe the writing only while it is exactly the text they analysed. */
export const suggestionsFresh = (d: ThoughtDraft): d is ThoughtDraft & { suggestions: ThoughtSuggestions } => !!d.suggestions && d.suggestions.forText === d.text.trim();

/** Record (or clear, with status undefined) the person's decision about one target in the composer. */
export function decide(d: ThoughtDraft, link: Omit<DraftLink, "status" | "at"> & { status?: DraftLink["status"] }, now: number): ThoughtDraft {
  const rest = (d.links ?? []).filter((l) => l.targetId !== link.targetId);
  const links = link.status ? [...rest, { ...link, status: link.status, at: now }] : rest;
  return { ...d, links };
}

function readLinks(x: unknown): DraftLink[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out = x
    .filter((l) => isObj(l) && typeof l.targetId === "string" && (l.status === "accepted" || l.status === "rejected"))
    .map((l) => ({
      ...(l as DraftLink),
      relation: RELATIONS.includes(l.relation as ConnectionRelation) ? (l.relation as ConnectionRelation) : "relates_to",
      origin: ORIGINS.includes(l.origin as ConnectionOrigin) ? (l.origin as ConnectionOrigin) : "user",
      at: typeof l.at === "number" ? l.at : 0,
    }));
  return out.length ? out : undefined;
}

/** A stored draft, or null if it is unusable. Suggestions in an older shape are dropped (they can be recomputed). */
export function readDraft(raw: unknown): ThoughtDraft | null {
  if (!isObj(raw) || typeof raw.id !== "string" || !raw.id || typeof raw.text !== "string") return null;
  const now = Date.now();
  const d: ThoughtDraft = {
    id: raw.id,
    text: raw.text,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
  };
  if (isCheckIn(raw.checkIn)) d.checkIn = raw.checkIn;
  if (isObj(raw.origin) && typeof raw.origin.kind === "string") d.origin = raw.origin as unknown as ThoughtDraft["origin"];
  const s = raw.suggestions;
  if (isObj(s) && typeof s.forText === "string" && Array.isArray(s.candidates))
    d.suggestions = {
      ...(s as unknown as ThoughtSuggestions),
      candidates: s.candidates.filter((c) => isObj(c) && typeof c.targetId === "string" && typeof c.why === "string") as ThoughtSuggestions["candidates"],
      createdAt: typeof s.createdAt === "number" ? s.createdAt : now,
    };
  const l = readLinks(raw.links);
  if (l) d.links = l;
  const q = raw.aiQuote;
  if (isObj(q) && typeof q.text === "string" && typeof q.by === "string") d.aiQuote = { text: q.text, by: q.by };
  return d;
}

/**
 * The entry to save: always the latest text. Connections are exactly what the person decided (kept ones survive
 * later edits, because they are the person's choice). Undecided suggestions are not saved, and a generated
 * interpretation comes along only if it was produced for exactly this text.
 */
export function thoughtFromDraft(d: ThoughtDraft, now: number): PersonalThought {
  const fresh = suggestionsFresh(d) ? d.suggestions : undefined;
  const t: PersonalThought = {
    id: d.id,
    v: THOUGHT_SCHEMA,
    text: d.text.trim(),
    createdAt: now,
    updatedAt: now,
    connections: (d.links ?? []).map((l) => ({ id: connectionId(l.targetId), targetId: l.targetId, relation: l.relation, status: l.status, origin: l.origin, ...(l.why ? { why: l.why } : {}), createdAt: now })),
  };
  if (d.checkIn !== undefined) t.checkIn = d.checkIn;
  if (d.origin && d.origin.kind !== "free") t.origin = d.origin;
  if (fresh?.reflection) t.reflection = fresh.reflection;
  if (fresh?.enrichedBy) t.enrichedBy = fresh.enrichedBy;
  if (!t.reflection && d.aiQuote?.text) {
    t.reflection = d.aiQuote.text;
    t.enrichedBy = d.aiQuote.by;
  }
  return t;
}

// ── backups ──

export function exportDocument(list: PersonalThought[], exportedAt: string): string {
  return JSON.stringify({ app: "GitaViswa", kind: BACKUP_KIND, version: 2, schema: THOUGHT_SCHEMA, exportedAt, thoughts: list }, null, 2);
}

/** Reads a backup file (current or older schema). Throws a readable message for anything that isn't one. */
export function parseBackup(json: string): { thoughts: PersonalThought[]; skipped: number } {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new Error("This file isn't a readable backup (it is not valid JSON). Nothing was changed.");
  }
  const list = Array.isArray(doc) ? doc : isObj(doc) ? doc.thoughts : undefined;
  if (!Array.isArray(list)) throw new Error("This file isn't a GitaViśva reflections backup. Nothing was changed.");
  const thoughts = list.map(migrateThought).filter((t): t is PersonalThought => !!t);
  return { thoughts, skipped: list.length - thoughts.length };
}

const editedAt = (t: PersonalThought) => t.updatedAt ?? t.createdAt;

/** Merge a backup into what is stored. Same id: the more recently edited version wins, so an old backup never overwrites newer writing. */
export function mergeThoughts(existing: PersonalThought[], incoming: PersonalThought[]) {
  const byId = new Map(existing.map((t) => [t.id, t]));
  let added = 0;
  let updated = 0;
  for (const t of incoming) {
    const cur = byId.get(t.id);
    if (!cur) {
      byId.set(t.id, t);
      added++;
    } else if (editedAt(t) > editedAt(cur)) {
      byId.set(t.id, t);
      updated++;
    }
  }
  return { merged: [...byId.values()].sort((a, b) => a.createdAt - b.createdAt), added, updated, unchanged: incoming.length - added - updated };
}

/** Plain-language storage failure, for people rather than developers. */
export function describeStorageError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === "StoredFormatError") return (e as Error).message;
  if (name === "QuotaExceededError") return "This browser is out of storage space for GitaViśva.";
  if (name === "InvalidStateError" || name === "SecurityError" || name === "UnknownError" || name === "NotFoundError")
    return "This browser's storage isn't available right now. Private browsing or blocked site data can cause this.";
  if (typeof indexedDB === "undefined") return "This browser doesn't offer the storage GitaViśva uses.";
  return "The browser's storage didn't respond as expected.";
}
