// Focus view: a fair, readable selection of a node's connections and a layout that keeps kinds together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { egoPositions, pickEgo, type EgoCandidate } from "../src/lib/graph/ego.ts";

const many = (n: number, type: string, group: EgoCandidate["group"], outgoing = true): EgoCandidate[] => Array.from({ length: n }, (_, i) => ({ id: `${type}-${i}`, type, group, outgoing, degree: n - i }));

test("one huge kind does not crowd out the others (Kṛṣṇa: 574 spoken verses, 43 mentions, 2 conversations)", () => {
  const pick = pickEgo([...many(574, "SPOKE", "structure"), ...many(43, "MENTIONS_CHARACTER", "lexical", false), ...many(2, "ADDRESSES", "structure")], 40);
  assert.equal(pick.members.length, 40);
  assert.equal(pick.total, 619);
  const shown = Object.fromEntries(pick.kinds.map((k) => [k.type, k.shown]));
  assert.equal(shown.ADDRESSES, 2, "small kinds are shown in full");
  assert.ok(shown.SPOKE >= 15 && shown.MENTIONS_CHARACTER >= 15, JSON.stringify(shown));
  assert.deepEqual(pick.kinds.map((k) => k.total), [43, 574, 2], "word matches rank before structure");
});

test("within a kind the best-connected come first; members stay grouped by kind", () => {
  const pick = pickEgo([...many(5, "HEALS", "curated"), ...many(5, "MENTIONS_STATE", "lexical")], 4);
  assert.deepEqual(pick.members.map((m) => m.id), ["HEALS-0", "HEALS-1", "MENTIONS_STATE-0", "MENTIONS_STATE-1"]);
});

test("a neighbour joined by two relations is counted once, under its most meaningful relation", () => {
  const pick = pickEgo([
    { id: "BG_2.47", type: "MENTIONS_CONCEPT", group: "lexical", outgoing: false, degree: 9 },
    { id: "BG_2.47", type: "DEFINES_CONCEPT", group: "curated", outgoing: false, degree: 9 },
  ]);
  assert.equal(pick.total, 1);
  assert.equal(pick.members[0].type, "DEFINES_CONCEPT");
});

test("fewer neighbours than the cap shows them all; none is valid", () => {
  assert.equal(pickEgo(many(3, "ECHOES_VERSE", "curated"), 40).members.length, 3);
  assert.deepEqual(pickEgo([], 40), { members: [], total: 0, kinds: [] });
});

test("layout surrounds the centre at a readable distance, finite and distinct", () => {
  const c: [number, number, number] = [100, 20, -50];
  const pts = egoPositions(c, 40);
  assert.equal(pts.length, 40);
  const d = pts.map((p) => Math.hypot(p[0] - c[0], (p[1] - c[1]) / 0.72, p[2] - c[2]));
  assert.ok(d.every((x) => Math.abs(x - d[0]) < 1e-6 && x > 100), "all on one (flattened) sphere");
  assert.equal(new Set(pts.map((p) => p.map((v) => v.toFixed(2)).join())).size, 40);
  assert.deepEqual(egoPositions(c, 1).length, 1);
});
