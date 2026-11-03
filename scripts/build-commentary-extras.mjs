#!/usr/bin/env node
/**
 * Second commentary pass, run after build-gita-knowledge-graph.mjs (which writes public/data/commentary/ from gita/gita).
 * Adds what the per-śloka vedicscriptures/bhagavad-gita dataset (GPL-3.0; the IIT Kanpur Gita Supersite corpus) has
 * and gita/gita does not, so the reader can compare the classical schools in English and Hindi:
 *
 *   101  Śaṅkara, Gītā-bhāṣya in English        tr. Swami Gambirananda          Advaita Vedānta
 *   102  Śaṅkara, Gītā-bhāṣya in Hindi          tr. Sri Harikrishnadas Goenka   Advaita Vedānta
 *   103  Rāmānuja, Gītā-bhāṣya in English       tr. Swami Adidevananda          Viśiṣṭādvaita Vedānta
 *   104  Abhinavagupta, Gītārtha-saṅgraha (en)  tr. Dr. S. Sankaranarayan       Kashmir Śaivism
 *
 * It also completes existing commentaries where gita/gita's copy is a truncated prefix of the same text (Swami
 * Ramsukhdas in particular), and fills verses gita/gita lacks for an author. Existing text is only ever replaced by a
 * longer text that begins with it, so nothing is lost or reworded.
 *
 * Not included: A.C. Bhaktivedanta Swami Prabhupada's purports (key "prabhu"). They are in the same dataset, but the
 * Bhaktivedanta Book Trust actively enforces its copyright; adding them is the project owner's decision.
 *
 *   node scripts/build-commentary-extras.mjs [--offline]
 * Idempotent: entries it added before are replaced, never duplicated.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fetchAll, readCached, refs } from "./fetch-vedicscriptures.mjs";

const OFFLINE = process.argv.includes("--offline");
const OUT = path.resolve("public/data/commentary");

/** New entries: one per (dataset key, field). */
const EXTRA = [
  { key: "sankar", field: "et", authorId: 101, author: "Sri Shankaracharya", lang: "en", translator: "Swami Gambirananda", school: "Advaita Vedānta", work: "Gītā-bhāṣya" },
  { key: "sankar", field: "ht", authorId: 102, author: "Sri Shankaracharya", lang: "hi", translator: "Sri Harikrishnadas Goenka", school: "Advaita Vedānta", work: "Gītā-bhāṣya" },
  { key: "raman", field: "et", authorId: 103, author: "Sri Ramanujacharya", lang: "en", translator: "Swami Adidevananda", school: "Viśiṣṭādvaita Vedānta", work: "Gītā-bhāṣya" },
  { key: "abhinav", field: "et", authorId: 104, author: "Sri Abhinavgupta", lang: "en", translator: "Dr. S. Sankaranarayan", school: "Kashmir Śaivism", work: "Gītārtha-saṅgraha" },
];

/** gita/gita author id → the same commentary in vedicscriptures, for completing truncated or missing text. */
const SAME = {
  1: ["rams", "hc"], 2: ["chinmay", "hc"], 3: ["anand", "sc"], 4: ["dhan", "sc"], 5: ["madhav", "sc"], 6: ["neel", "sc"], 7: ["raman", "sc"], 8: ["srid", "sc"],
  9: ["venkat", "sc"], 10: ["abhinav", "sc"], 11: ["jaya", "sc"], 12: ["ms", "sc"], 13: ["puru", "sc"], 14: ["sankar", "sc"], 15: ["vallabh", "sc"], 16: ["siva", "ec"],
};
/** Display metadata for authors gita/gita has (used when this pass fills a verse it lacked). */
const BASE = {
  1: ["Swami Ramsukhdas", "hi", "Bhakti-Vedānta"], 2: ["Swami Chinmayananda", "hi", "Advaita Vedānta (Chinmaya)"], 3: ["Sri Anandgiri", "sa", "Advaita Vedānta"],
  4: ["Sri Dhanpati", "sa", "Advaita Vedānta"], 5: ["Sri Madhavacharya", "sa", "Dvaita Vedānta"], 6: ["Sri Neelkanth", "sa", "Advaita Vedānta"],
  7: ["Sri Ramanujacharya", "sa", "Viśiṣṭādvaita Vedānta"], 8: ["Sri Sridhara Swami", "sa", "Advaita–Bhakti"], 9: ["Sri Vedantadeshikacharya Venkatanatha", "sa", "Viśiṣṭādvaita Vedānta"],
  10: ["Sri Abhinavgupta", "sa", "Kashmir Śaivism"], 11: ["Sri Jayatritha", "sa", "Dvaita Vedānta"], 12: ["Sri Madhusudan Saraswati", "sa", "Advaita Vedānta"],
  13: ["Sri Purushottamji", "sa", "Śuddhādvaita (Puṣṭimārga)"], 14: ["Sri Shankaracharya", "sa", "Advaita Vedānta"], 15: ["Sri Vallabhacharya", "sa", "Śuddhādvaita (Puṣṭimārga)"],
  16: ["Swami Sivananda", "en", "Integral Vedānta (Divine Life Society)"],
};
const SOURCE = "vedicscriptures/bhagavad-gita";

/** Same cleaning as the main build: drop the leading "2.47" / "।।2.47।।" reference, tidy whitespace. */
function clean(t) {
  return String(t || "")
    .replace(/\r/g, "")
    .replace(/^\s*[।|]*\s*\d+\s*\.\s*\d+\s*[।|]*\s*/, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const norm = (s) => s.replace(/\s+/g, " ").trim();

async function main() {
  const missing = await fetchAll({ offline: OFFLINE, concurrency: 10 });
  if (missing.length === refs().length) {
    console.log(`commentary extras: no vedicscriptures cache${OFFLINE ? " (offline)" : ""}; skipped. Run scripts/fetch-vedicscriptures.mjs.`);
    return;
  }
  if (missing.length) console.log(`   ! ${missing.length} verses not cached; they keep gita/gita commentary only`);

  const stats = { added: Object.fromEntries(EXTRA.map((e) => [e.authorId, 0])), completed: {}, filled: {}, files: 0, created: 0 };
  for (const [c, v] of refs()) {
    const d = await readCached(c, v);
    if (!d) continue;
    const id = `BG_${c}.${v}`;
    const file = path.join(OUT, `${id}.json`);
    let doc;
    try {
      doc = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      doc = { id, ref: `${c}.${v}`, commentaries: [] };
      stats.created++;
    }
    const extraIds = new Set(EXTRA.map((e) => e.authorId));
    const list = doc.commentaries.filter((x) => !extraIds.has(x.authorId));

    // Complete truncated text, fill missing authors.
    for (const [aid, [key, field]] of Object.entries(SAME)) {
      const theirs = clean(d[key]?.[field]);
      if (theirs.length < 20) continue;
      const i = list.findIndex((x) => x.authorId === Number(aid));
      if (i < 0) {
        const [author, lang, school] = BASE[aid];
        list.push({ authorId: Number(aid), author, school, lang, text: theirs, source: SOURCE });
        stats.filled[aid] = (stats.filled[aid] || 0) + 1;
        continue;
      }
      const ours = list[i].text;
      if (theirs.length > ours.length * 1.1 && norm(theirs).startsWith(norm(ours).slice(0, Math.max(40, norm(ours).length - 2)))) {
        list[i] = { ...list[i], text: theirs, source: SOURCE };
        stats.completed[aid] = (stats.completed[aid] || 0) + 1;
      }
    }

    for (const e of EXTRA) {
      const text = clean(d[e.key]?.[e.field]);
      if (text.length < 20) continue;
      list.push({ authorId: e.authorId, author: e.author, school: e.school, lang: e.lang, text, translator: e.translator, work: e.work, source: SOURCE });
      stats.added[e.authorId]++;
    }
    // Placeholders in both datasets ("did not comment on this sloka", "No commentary.") and cross-references
    // ("See Comment under 10.42") are tagged so the reader can say so plainly and link, instead of showing filler.
    for (let i = 0; i < list.length; i++) {
      const rest = { ...list[i] };
      delete rest.none;
      delete rest.seeAlso;
      const t = rest.text.replace(/\s+/g, " ");
      const see = t.length < 120 ? t.match(/see\s+com+ent(?:ary)?\s+under\s+(\d+)\.(\d+)/i) : null;
      if (see) list[i] = { ...rest, seeAlso: `BG_${see[1]}.${see[2]}` };
      else if (t.length < 160 && /did not comment|^[\s\d.।|–-]*no commentary|no such translation is available/i.test(t)) list[i] = { ...rest, none: true };
      else list[i] = rest;
    }
    list.sort((a, b) => a.authorId - b.authorId);
    await fs.writeFile(file, JSON.stringify({ ...doc, commentaries: list }));
    stats.files++;
  }
  console.log(`✓ commentary extras: ${stats.files} verse files (${stats.created} new)`);
  for (const e of EXTRA) console.log(`   + ${String(e.authorId).padEnd(4)} ${e.author}, ${e.lang}, tr. ${e.translator}: ${stats.added[e.authorId]} verses`);
  for (const [aid, n] of Object.entries(stats.completed)) console.log(`   ↑ ${String(aid).padEnd(4)} ${BASE[aid][0]}: completed ${n} truncated commentaries`);
  for (const [aid, n] of Object.entries(stats.filled)) console.log(`   ◦ ${String(aid).padEnd(4)} ${BASE[aid][0]}: filled ${n} missing verses`);
}

await main();
