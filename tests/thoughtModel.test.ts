// Behavioural checks for the rules that protect personal writing. Run with `npm test` (Node's built-in runner).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  StoredFormatError,
  THOUGHT_SCHEMA,
  addConnection,
  decide,
  editThought,
  moveToTrash,
  readStoredTrash,
  restoreFromTrash,
  searchThoughts,
  draftIsEmpty,
  exportDocument,
  mergeThoughts,
  migrateThought,
  newDraft,
  parseBackup,
  readDraft,
  readStoredThoughts,
  removeConnection,
  reviewConnection,
  suggestionsFresh,
  thoughtFromDraft,
  uid,
  upsertInto,
} from "../src/lib/store/thoughtModel.ts";
import type { PersonalThought, ThoughtDraft, ThoughtSuggestions } from "../src/lib/types.ts";

/** A record exactly as schema-1 Reflect stored it (intensity was always present, preselected at 3). */
const v1 = (id: string, createdAt: number, extra: Record<string, unknown> = {}) => ({
  id,
  text: `entry ${id}`,
  createdAt,
  intensity: 3,
  emotions: [{ id: "emotion:shanti", score: 1 }],
  dilemmas: [],
  verses: [{ id: "BG_5.13", score: 1, why: "BM25 text match" }],
  reflection: "What you wrote carries…",
  ...extra,
});

const suggestions = (forText: string): ThoughtSuggestions => ({
  forText,
  createdAt: 1,
  candidates: [
    { targetId: "emotion:chinta", basis: "expressed", why: "You wrote about feeling “worried”", cue: "worried", score: 1, origin: "local" },
    { targetId: "BG_2.47", basis: "related", why: "Speaks to Fear of Failure", score: 0.9, origin: "local" },
  ],
  reflection: "A reading of A",
});

const draft = (text: string, extra: Partial<ThoughtDraft> = {}): ThoughtDraft => ({ ...newDraft("d-1", 100), text, ...extra });
const keepLink = (d: ThoughtDraft, targetId: string, status: "accepted" | "rejected" = "accepted") => decide(d, { targetId, status, relation: "relates_to", origin: "local" }, 200);

test("schema-1 entries migrate without losing anything, and keep intensity as history rather than a check-in", () => {
  const raw = v1("a", 10, { customField: "kept" });
  const t = migrateThought(raw)!;
  assert.equal(t.v, THOUGHT_SCHEMA);
  assert.equal(t.text, raw.text);
  assert.equal(t.createdAt, 10);
  assert.equal(t.intensity, 3, "historical value is kept");
  assert.equal(t.checkIn, undefined, "a preselected default is never promoted to a self-report");
  assert.deepEqual(t.verses, raw.verses, "the old automatic links stay as history");
  assert.equal(t.reflection, raw.reflection);
  assert.equal((t as unknown as Record<string, unknown>).customField, "kept");
});

test("automatic schema ≤2 links become unreviewed suggestions — no approval is invented", () => {
  const t = migrateThought(v1("a", 10))!;
  assert.deepEqual(
    t.connections.map((c) => [c.targetId, c.status, c.origin]),
    [
      ["emotion:shanti", "suggested", "legacy"],
      ["BG_5.13", "suggested", "legacy"],
    ],
  );
  assert.ok(t.connections.every((c) => c.status !== "accepted"));
});

test("schema-3 connections are read as stored; malformed ones are dropped, unknown values made safe", () => {
  const t = migrateThought({
    id: "x",
    text: "t",
    createdAt: 5,
    v: 3,
    connections: [{ id: "c:BG_2.47", targetId: "BG_2.47", relation: "questions", status: "accepted", origin: "user", createdAt: 6 }, { targetId: "concept:karma", relation: "weird", status: "??" }, { nope: true }],
  })!;
  assert.equal(t.connections.length, 2);
  assert.deepEqual([t.connections[0].relation, t.connections[0].status, t.connections[0].origin], ["questions", "accepted", "user"]);
  assert.deepEqual([t.connections[1].relation, t.connections[1].status], ["relates_to", "suggested"], "unknown status never defaults to accepted");
});

test("missing storage is an empty history; a non-list is a format error, not an empty history", () => {
  assert.deepEqual(readStoredThoughts(undefined), { thoughts: [], unreadable: [], legacy: false });
  assert.throws(() => readStoredThoughts({ thoughts: "corrupt" }), StoredFormatError);
  assert.throws(() => readStoredThoughts("oops"), StoredFormatError);
});

test("records that can't be read are kept aside, not dropped; legacy data is detected", () => {
  const junk = { text: "no id" };
  const r = readStoredThoughts([v1("b", 20), junk, v1("a", 10)]);
  assert.deepEqual(r.thoughts.map((t) => t.id), ["a", "b"], "sorted oldest first");
  assert.deepEqual(r.unreadable, [junk]);
  assert.equal(r.legacy, true);
  assert.equal(readStoredThoughts(r.thoughts).legacy, false, "after migration nothing is legacy");
});

test("analyse A, edit to B, save: B is saved; nothing computed for A is attached to it", () => {
  const d = draft("B, after editing", { suggestions: suggestions("A, as first written") });
  assert.equal(suggestionsFresh(d), false);
  const t = thoughtFromDraft(d, 500);
  assert.equal(t.text, "B, after editing");
  assert.deepEqual(t.connections, []);
  assert.equal(t.reflection, undefined, "the interpretation of A is not kept as an interpretation of B");
});

test("undecided suggestions are never saved; only what the person kept or declined", () => {
  const base = draft("Same words", { suggestions: suggestions("Same words") });
  assert.deepEqual(thoughtFromDraft(base, 500).connections, [], "seeing a suggestion is not endorsing it");
  const decided = keepLink(keepLink(base, "BG_2.47"), "emotion:chinta", "rejected");
  const t = thoughtFromDraft(decided, 500);
  assert.deepEqual(
    t.connections.map((c) => [c.targetId, c.status]),
    [
      ["BG_2.47", "accepted"],
      ["emotion:chinta", "rejected"],
    ],
  );
  assert.equal(t.reflection, "A reading of A", "a fresh interpretation is kept, separately from the text");
});

test("a connection the person kept survives a later edit to the wording", () => {
  const d = { ...keepLink(draft("first wording", { suggestions: suggestions("first wording") }), "BG_2.47"), text: "first wording, corrected" };
  assert.equal(suggestionsFresh(d), false);
  const t = thoughtFromDraft(d, 500);
  assert.deepEqual(t.connections.map((c) => c.targetId), ["BG_2.47"]);
  assert.equal(t.reflection, undefined);
});

test("whitespace around the text does not make suggestions stale", () => {
  assert.equal(suggestionsFresh(draft("  Same words  ", { suggestions: suggestions("Same words") })), true);
});

test("a thought saved with no check-in carries no heaviness at all, and zero connections is complete", () => {
  const t = thoughtFromDraft(draft("Could a city be designed around cooperation?"), 500);
  assert.equal("checkIn" in t, false);
  assert.equal("intensity" in t, false);
  assert.deepEqual(t.connections, []);
  assert.equal(thoughtFromDraft(draft("heavy day", { checkIn: 4 }), 500).checkIn, 4);
});

test("a verse note keeps where it began, separately from any connection", () => {
  const t = thoughtFromDraft(draft("I'm unsure about this one", { origin: { kind: "verse", verseId: "BG_2.47" } }), 500);
  assert.deepEqual(t.origin, { kind: "verse", verseId: "BG_2.47" });
  assert.deepEqual(t.connections, [], "the origin is context, not an endorsement");
});

test("pressing Save twice for one draft yields one entry, keeping the first creation time", () => {
  let list: PersonalThought[] = [];
  list = upsertInto(list, thoughtFromDraft(draft("once"), 500));
  list = upsertInto(list, thoughtFromDraft(draft("once"), 900));
  assert.equal(list.length, 1);
  assert.equal(list[0].createdAt, 500);
  assert.equal(list[0].updatedAt, 900);
});

test("reviewing connections never touches the thought's text", () => {
  const t = migrateThought(v1("a", 10))!;
  const kept = reviewConnection(t, "BG_5.13", { status: "accepted" }, 50);
  assert.equal(kept.text, t.text);
  assert.equal(kept.connections.find((c) => c.targetId === "BG_5.13")!.status, "accepted");
  const asQuestion = reviewConnection(kept, "BG_5.13", { relation: "questions" }, 60);
  assert.equal(asQuestion.connections.find((c) => c.targetId === "BG_5.13")!.relation, "questions", "a connection can be a question or disagreement");
  const declined = removeConnection(asQuestion, "emotion:shanti", 70);
  assert.equal(declined.connections.find((c) => c.targetId === "emotion:shanti")!.status, "rejected", "a declined suggestion is remembered, not silently re-offered");
  const mine = addConnection(declined, "thought:other", "reminds_me_of", 80);
  assert.deepEqual(mine.connections.at(-1)!.origin, "user");
  const gone = removeConnection(mine, "thought:other", 90);
  assert.equal(gone.connections.some((c) => c.targetId === "thought:other"), false, "removing your own link deletes it");
  assert.equal(gone.text, t.text);
});

test("empty drafts are not kept; a check-in alone is", () => {
  assert.equal(draftIsEmpty(draft("   \n ")), true);
  assert.equal(draftIsEmpty(draft("", { checkIn: 2 })), false);
});

test("stored drafts are validated on restore; suggestions in an older shape are dropped", () => {
  assert.equal(readDraft(undefined), null);
  assert.equal(readDraft({ text: "no id" }), null);
  const old = readDraft({ id: "x", text: "w", suggestions: { forText: "w", emotions: [{ id: "emotion:x", score: 1 }] } })!;
  assert.equal(old.suggestions, undefined);
  const d = readDraft({ id: "x", text: "restored words", updatedAt: 7, checkIn: 9, suggestions: { forText: "restored words", candidates: [{ targetId: "BG_2.47", why: "w" }, { bad: 1 }] }, links: [{ targetId: "BG_2.47", status: "accepted" }, { targetId: "y", status: "maybe" }] })!;
  assert.equal(d.text, "restored words");
  assert.equal(d.updatedAt, 7);
  assert.equal(d.checkIn, undefined, "an out-of-range check-in is dropped");
  assert.equal(d.suggestions?.candidates.length, 1);
  assert.deepEqual(d.links?.map((l) => [l.targetId, l.relation]), [["BG_2.47", "relates_to"]]);
});

test("schema-1 backups still import; their intensity is preserved, not invented", () => {
  const file = JSON.stringify({ app: "GitaViswa", kind: "manas-darpan-backup", version: 1, thoughts: [v1("a", 10), { id: "noIntensity", text: "t", createdAt: 11 }, { broken: true }] });
  const { thoughts, skipped } = parseBackup(file);
  assert.equal(skipped, 1);
  assert.equal(thoughts.find((t) => t.id === "a")!.intensity, 3);
  const bare = thoughts.find((t) => t.id === "noIntensity")!;
  assert.equal(bare.intensity, undefined, "no default heaviness is fabricated on import");
  assert.deepEqual(bare.connections, []);
});

test("invalid backups fail with a readable message", () => {
  assert.throws(() => parseBackup("{not json"), /not valid JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ hello: 1 })), /isn't a GitaViśva reflections backup/);
});

test("export → import round trip keeps text, dates, check-ins, origin, status and provenance", () => {
  const d = keepLink(draft("round trip", { checkIn: 2, origin: { kind: "verse", verseId: "BG_2.47" }, suggestions: suggestions("round trip") }), "BG_2.47");
  const list = [thoughtFromDraft(d, 500)];
  assert.deepEqual(parseBackup(exportDocument(list, "2026-11-03T00:00:00Z")).thoughts, list);
});

test("merging an older backup never overwrites newer writing", () => {
  const local = { ...migrateThought(v1("a", 10))!, text: "edited later", updatedAt: 50 };
  const backupCopy = { ...migrateThought(v1("a", 10))!, text: "original", updatedAt: 20 };
  const fresh = migrateThought(v1("b", 30))!;
  const m = mergeThoughts([local], [backupCopy, fresh]);
  assert.equal(m.merged.find((t) => t.id === "a")!.text, "edited later");
  assert.deepEqual([m.added, m.updated, m.unchanged], [1, 0, 1]);
  const newer = mergeThoughts([local], [{ ...backupCopy, text: "newer elsewhere", updatedAt: 99 }]);
  assert.equal(newer.merged[0].text, "newer elsewhere");
  assert.equal(newer.updated, 1);
});

test("ids are v4 UUIDs even where crypto.randomUUID is unavailable (plain-http LAN testing)", () => {
  const original = globalThis.crypto.randomUUID;
  try {
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    const id = uid();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(uid(), id);
  } finally {
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: original, configurable: true });
  }
});

test("editing keeps every earlier wording and leaves connections as they were", () => {
  const t = reviewConnection(migrateThought(v1("a", 10))!, "BG_5.13", { status: "accepted" }, 20);
  const once = editThought(t, "  second wording  ", 30);
  const twice = editThought(once, "third wording", 40);
  assert.equal(twice.text, "third wording");
  assert.deepEqual(twice.revisions, [
    { text: "entry a", until: 30 },
    { text: "second wording", until: 40 },
  ]);
  assert.deepEqual(twice.connections, t.connections);
  assert.equal(twice.createdAt, 10, "the original date is kept");
  assert.equal(editThought(twice, "third wording", 50), twice, "no change, no new revision");
  assert.equal(editThought(twice, "   ", 50), twice, "an edit can't blank a thought");
});

test("delete moves to Recently deleted; restore brings back exactly what was there", () => {
  const a = migrateThought(v1("a", 10))!;
  const b = { ...migrateThought(v1("b", 20))!, checkIn: 2, revisions: [{ text: "old", until: 15 }] };
  const gone = moveToTrash([a, b], [], ["b"], 99);
  assert.deepEqual(gone.list.map((t) => t.id), ["a"]);
  assert.deepEqual(gone.trash, [{ thought: b, deletedAt: 99 }]);
  const back = restoreFromTrash(gone.list, gone.trash, "b");
  assert.deepEqual(back.list, [a, b], "text, dates, check-in, history and connections all return");
  assert.deepEqual(back.trash, []);
  const all = moveToTrash([a, b], [], ["a", "b"], 100);
  assert.equal(all.list.length, 0);
  assert.equal(all.trash.length, 2, "deleting everything is recoverable too");
});

test("stored Recently deleted is validated; unreadable items are kept aside", () => {
  assert.deepEqual(readStoredTrash(undefined), { items: [], unreadable: [] });
  assert.throws(() => readStoredTrash({ nope: 1 }), StoredFormatError);
  const r = readStoredTrash([{ thought: v1("a", 10), deletedAt: 5 }, { thought: { text: "no id" }, deletedAt: 6 }]);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].thought.v, THOUGHT_SCHEMA, "deleted schema-1 entries are migrated like any other");
  assert.equal(r.unreadable.length, 1);
});

test("search finds a thought by a distinctive phrase, in current or earlier wording, never in generated text", () => {
  const idea = { ...thoughtFromDraft(draft("Could a city be designed around cooperation rather than competition?"), 500), id: "idea" };
  const edited = editThought({ ...thoughtFromDraft(draft("Patience is waiting."), 600), id: "p" }, "Patience is attention.", 700);
  const withAi = { ...thoughtFromDraft(draft("A quiet evening."), 800), id: "q", reflection: "The model mentions cooperation here." };
  const list = [idea, edited, withAi];
  assert.deepEqual(searchThoughts(list, "designed around COOPERATION").map((m) => m.thought.id), ["idea"], "case-insensitive phrase; generated text is not searched");
  const earlier = searchThoughts(list, "waiting");
  assert.deepEqual([earlier[0].thought.id, earlier[0].in], ["p", "earlier"]);
  assert.equal(searchThoughts(list, "attention patience")[0].thought.id, "p", "all words, any order");
  assert.deepEqual(searchThoughts(list, "x"), [], "single letters are ignored");
  assert.deepEqual(searchThoughts(list.filter((t) => t.id !== "idea"), "cooperation"), [], "a deleted thought no longer matches");
});
