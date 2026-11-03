#!/usr/bin/env node
/**
 * GitaViswa (गीताविश्व) — Bhagavad Gita knowledge-graph compiler.
 *
 *   node scripts/build-gita-knowledge-graph.mjs [--offline] [--no-commentary]
 *
 * Downloads open-source Gita data (with mirrors + resumable cache), then deterministically compiles:
 *   public/data/gita-verses.json        701 verses · Sanskrit · IAST · transliteration · padaccheda · chandas · audio · translations
 *   public/data/gita-graph.json         property graph: 6 static labels (+ client-side PersonalThought), ~25 relation types
 *   public/data/gita-cypher-seed.cypher Neo4j import script
 *   public/data/commentary/BG_c.v.json  per-verse multi-author commentaries (lazy-loaded by the reader)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fetchJson, fetchArchiveItem, fetchMany } from "./lib/net.mjs";
import { SOURCES, VERSE_AUDIO, ARCHIVE_ITEMS, SOURCE_CREDITS, VEDIC_SCRIPTURES_SLOK } from "./lib/sources.mjs";
import { cleanSanskrit, cleanTransliteration, devanagariToIAST, classifyMeter, parsePadaccheda, tokenOf, scan } from "./lib/sanskrit.mjs";
import { verifyGraph } from "./lib/verify.mjs";
import { CONCEPTS, CONCEPT_CATEGORIES } from "./ontology/concepts.mjs";
import { EMOTIONS, CAUSAL_CHAINS, ANTIDOTES } from "./ontology/emotions.mjs";
import { DILEMMAS } from "./ontology/dilemmas.mjs";
import { CHARACTERS, SPEAKER_OVERRIDES, LISTENERS } from "./ontology/characters.mjs";
import { DIALOGUES, THREADS, CHAPTER_THEMES, ANCHORS } from "./ontology/curated.mjs";

const ARGS = new Set(process.argv.slice(2));
const OFFLINE = ARGS.has("--offline");
const SKIP_COMMENTARY = ARGS.has("--no-commentary");
const OUT = path.resolve("public/data");
const VERSION = "1.0.0";
const CHAPTER_VERSE_COUNTS = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78];

const log = (...a) => console.log(...a);
const t0 = Date.now();

// Translators / commentators in the gita/gita dataset, with their interpretive tradition.
const AUTHOR_META = {
  1: { school: "Bhakti-Vedānta", work: "Sādhaka-Sañjīvanī" },
  2: { school: "Advaita Vedānta (Chinmaya)", work: "Commentary" },
  3: { school: "Advaita Vedānta", work: "Ṭīkā on Śaṅkara-bhāṣya" },
  4: { school: "Advaita Vedānta", work: "Bhāṣyotkarṣa-dīpikā" },
  5: { school: "Dvaita Vedānta", work: "Gītā-bhāṣya (Madhva)" },
  6: { school: "Advaita Vedānta", work: "Bhāva-dīpa" },
  7: { school: "Viśiṣṭādvaita Vedānta", work: "Gītā-bhāṣya (Rāmānuja)" },
  8: { school: "Advaita–Bhakti", work: "Subodhinī" },
  9: { school: "Viśiṣṭādvaita Vedānta", work: "Tātparya-candrikā" },
  10: { school: "Kashmir Śaivism", work: "Gītārtha-saṅgraha" },
  11: { school: "Dvaita Vedānta", work: "Prameya-dīpikā" },
  12: { school: "Advaita Vedānta", work: "Gūḍhārtha-dīpikā" },
  13: { school: "Śuddhādvaita (Puṣṭimārga)", work: "Amṛta-taraṅgiṇī" },
  14: { school: "Advaita Vedānta", work: "Gītā-bhāṣya (Śaṅkara)" },
  15: { school: "Śuddhādvaita (Puṣṭimārga)", work: "Tattva-dīpikā" },
  16: { school: "Integral Vedānta (Divine Life Society)", work: "Translation & commentary" },
  17: { school: "Advaita Vedānta (Chinmaya)", work: "Hindi translation" },
  18: { school: "Viśiṣṭādvaita Vedānta", work: "Rāmānuja-bhāṣya in English" },
  19: { school: "Advaita Vedānta", work: "Śaṅkara-bhāṣya in English" },
  20: { school: "Kashmir Śaivism", work: "Abhinavagupta in English" },
  21: { school: "Literary translation", work: "The Geeta" },
};
const DEFAULT_EN = 16; // Swami Sivananda
const DEFAULT_HI = 17; // Swami Tejomayananda

// ── helpers ───────────────────────────────────────────────────────────────────────────────────
const vid = (ref) => `BG_${ref}`;
const cid = (n) => `CH_${n}`;
const nodeRef = (s) => (s.startsWith("e:") ? `emotion:${s.slice(2)}` : s.startsWith("c:") ? `concept:${s.slice(2)}` : s);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const uniq = (a) => [...new Set(a)];

function expand(spec) {
  const [a, b] = spec.split("-");
  const [c, v1] = a.split(".").map(Number);
  if (!b) return [`${c}.${v1}`];
  const v2 = Number(b.includes(".") ? b.split(".")[1] : b);
  const out = [];
  for (let v = v1; v <= v2; v++) out.push(`${c}.${v}`);
  return out;
}

/** Orthographic normalisation: nasal+virāma before a consonant → anusvāra; drop avagraha and spaces-dupes. */
function normDeva(s) {
  return String(s)
    .replace(/ऽ/g, "")
    .replace(/([ङञणनम])्(?=[क-ह]|\s|$)/g, "ं")
    .replace(/[।॥]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTranslation(t) {
  return String(t || "")
    .replace(/\r/g, "")
    .replace(/^\s*[।|]*\s*\d+\s*\.\s*\d+\s*[।|]*\s*/, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseDuration(len) {
  if (len == null) return null;
  const s = String(len);
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

const isArray = (min) => (d) => (Array.isArray(d) && d.length >= min ? true : `expected an array of ≥ ${min} records`);

// ── ① fetch sources ───────────────────────────────────────────────────────────────────────────
log("\n🪷  GitaViswa — compiling the Bhagavad Gita knowledge graph\n");
log("① Fetching open-source data" + (OFFLINE ? " (offline: cache only)" : ""));

const provenance = {};
async function source(name, mirrors, validate, { optional = false } = {}) {
  try {
    const r = await fetchJson(name, mirrors, { offline: OFFLINE, validate });
    provenance[name] = r.source;
    return r.data;
  } catch (e) {
    if (optional) {
      log(`   ! ${name} unavailable — continuing without it (${e.message.split("\n")[0]})`);
      provenance[name] = "unavailable";
      return null;
    }
    throw e;
  }
}

/** Supplemental per-verse fallback (vedicscriptures/bhagavad-gita) used only if the primary dataset is unreachable. */
async function vedicScripturesFallback() {
  log("   ↪ primary verse dataset unreachable — assembling from vedicscriptures per-śloka files");
  const refs = [];
  CHAPTER_VERSE_COUNTS.forEach((n, i) => {
    for (let v = 1; v <= n; v++) refs.push([i + 1, v]);
  });
  const docs = await fetchMany(refs.map(([c, v]) => VEDIC_SCRIPTURES_SLOK(c, v)[0]), { log });
  const verses = [];
  const translations = [];
  const authorKeys = { siva: [16, "english"], purohit: [21, "english"], gambir: [19, "english"], adi: [18, "english"], san: [20, "english"], tej: [17, "hindi"], rams: [1, "hindi"] };
  docs.forEach((d, i) => {
    if (!d) return;
    const [c, v] = refs[i];
    const id = i + 1;
    verses.push({ id, chapter_number: c, verse_number: v, text: d.slok, transliteration: d.transliteration, word_meanings: "" });
    for (const [k, [author_id, lang]] of Object.entries(authorKeys)) {
      const t = d[k]?.et || d[k]?.ht;
      if (t) translations.push({ verse_id: id, author_id, authorName: d[k].author, lang, description: t });
    }
  });
  if (verses.length < 700) throw new Error(`vedicscriptures fallback returned only ${verses.length} verses`);
  provenance["verse.json"] = "vedicscriptures/bhagavad-gita (per-śloka fallback)";
  return { verses, translations };
}

let versesRaw;
let translationsRaw;
try {
  versesRaw = await source("verse.json", SOURCES.verses, isArray(700));
} catch (e) {
  if (OFFLINE) throw e;
  const fb = await vedicScripturesFallback();
  versesRaw = fb.verses;
  translationsRaw = fb.translations;
}
const chaptersRaw = await source("chapters.json", SOURCES.chapters, isArray(18));
const authorsRaw = (await source("authors.json", SOURCES.authors, isArray(5), { optional: true })) || [];
translationsRaw ??= await source("translation.json", SOURCES.translations, isArray(4000));
const commentaryRaw = SKIP_COMMENTARY ? null : await source("commentary.json", SOURCES.commentaries, isArray(1000), { optional: true });

const archive = {};
for (const item of ARCHIVE_ITEMS) {
  try {
    const r = await fetchArchiveItem(item.id, { offline: OFFLINE });
    archive[item.id] = r.data;
  } catch (e) {
    log(`   ! archive.org ${item.id} unavailable (${e.message.split("\n")[0]})`);
  }
}

// ── ② chapters ────────────────────────────────────────────────────────────────────────────────
log("\n② Compiling chapters, verses, prosody and translations");

const chapterAudio = {};
for (const item of ARCHIVE_ITEMS) {
  const meta = archive[item.id];
  if (!meta) continue;
  for (let c = 1; c <= 18; c++) {
    const f = meta.files.find((x) => /\.mp3$/i.test(x.name) && item.match(x.name, c));
    if (!f) continue;
    (chapterAudio[c] ||= []).push({
      url: `https://archive.org/download/${item.id}/${encodeURIComponent(f.name)}`,
      duration: parseDuration(f.length),
      source: `archive.org/${item.id}`,
      title: meta.metadata?.title || item.id,
    });
  }
}

const chapters = [...chaptersRaw]
  .sort((a, b) => a.chapter_number - b.chapter_number)
  .map((c) => ({
    id: cid(c.chapter_number),
    number: c.chapter_number,
    name: c.name,
    iast: devanagariToIAST(c.name),
    transliterated: c.name_transliterated,
    title: c.name_translation,
    meaning: c.name_meaning,
    verseCount: c.verses_count,
    summary: { en: (c.chapter_summary || "").trim(), hi: (c.chapter_summary_hindi || "").trim() },
    audio: chapterAudio[c.chapter_number] || [],
  }));

// ── ③ verses ──────────────────────────────────────────────────────────────────────────────────
const SPEAKER_OF_HEADING = (u) =>
  /धृतराष्ट्र/.test(u) ? "dhritarashtra" : /सञ्जय|संजय/.test(u) ? "sanjaya" : /अर्जुन/.test(u) ? "arjuna" : /भगवान/.test(u) ? "krishna" : null;

const translationsByVerse = new Map();
const authorsSeen = new Map();
for (const t of translationsRaw) {
  const key = t.verse_id ?? t.verseNumber;
  const lang = /hindi/i.test(t.lang) ? "hi" : /sanskrit/i.test(t.lang) ? "sa" : "en";
  const text = cleanTranslation(t.description);
  if (!text) continue;
  if (!translationsByVerse.has(key)) translationsByVerse.set(key, { en: {}, hi: {} });
  (translationsByVerse.get(key)[lang] ||= {})[t.author_id] = text;
  authorsSeen.set(t.author_id, { name: t.authorName, lang, kind: "translation" });
}

const commentaryByVerse = new Map();
if (commentaryRaw) {
  for (const c of commentaryRaw) {
    const key = c.verse_id ?? c.verseNumber;
    const text = cleanTranslation(c.description);
    if (!text) continue;
    const lang = /hindi/i.test(c.lang) ? "hi" : /sanskrit/i.test(c.lang) ? "sa" : "en";
    if (!commentaryByVerse.has(key)) commentaryByVerse.set(key, []);
    commentaryByVerse.get(key).push({ authorId: c.author_id, lang, text });
    const prev = authorsSeen.get(c.author_id);
    authorsSeen.set(c.author_id, { name: c.authorName, lang: prev?.lang || lang, kind: prev ? "both" : "commentary" });
  }
}

let currentSpeaker = null;
const sortedRaw = [...versesRaw].sort((a, b) => a.chapter_number - b.chapter_number || a.verse_number - b.verse_number);
const verses = sortedRaw.map((raw) => {
  const c = raw.chapter_number;
  const v = raw.verse_number;
  const ref = `${c}.${v}`;
  const { uvacha, lines } = cleanSanskrit(raw.text);
  const tr = cleanTransliteration(raw.transliteration || "");
  if (uvacha) currentSpeaker = SPEAKER_OF_HEADING(uvacha) || currentSpeaker;
  const metricLines = lines.map((l) => l.replace(/[।॥]/g, "").trim());
  const meter = classifyMeter(metricLines);
  const syllables = metricLines.reduce((n, l) => n + scan(l).length, 0) + (uvacha ? scan(uvacha).length : 0);
  const tx = translationsByVerse.get(raw.id) || { en: {}, hi: {} };
  const comm = commentaryByVerse.get(raw.id) || [];
  return {
    id: vid(ref),
    ref,
    chapter: c,
    verse: v,
    order: raw.id,
    // 13.1 (Arjuna's question) is found in some recensions but is not counted in the traditional 700.
    canonical: !(c === 13 && v === 1),
    speaker: currentSpeaker,
    uvacha: uvacha ? { sa: uvacha, iast: devanagariToIAST(uvacha), tr: tr.uvacha } : null,
    sanskrit: lines,
    iast: lines.map(devanagariToIAST),
    transliteration: tr.lines,
    padaccheda: parsePadaccheda(raw.word_meanings || ""),
    meter: { name: meter.name, family: meter.family, syllables: meter.syllables, scansion: meter.scansion },
    audio: { verse: VERSE_AUDIO(c, v), chapterFrac: 0, _syllables: syllables },
    translations: tx,
    commentaryAuthors: uniq(comm.map((x) => x.authorId)).sort((a, b) => a - b),
    _commentary: comm,
  };
});

for (const o of SPEAKER_OVERRIDES) {
  const [from, to] = o.range;
  const [c1, v1] = from.split(".").map(Number);
  const [, v2] = to.split(".").map(Number);
  for (const verse of verses) {
    if (verse.chapter === c1 && verse.verse >= v1 && verse.verse <= v2) {
      verse.speaker = o.speaker;
      verse.narratedBy = o.narratedBy;
    }
  }
}

// Approximate start of each verse inside a chapter-length recording (syllable-proportional).
for (const ch of chapters) {
  const vs = verses.filter((v) => v.chapter === ch.number);
  const total = vs.reduce((n, v) => n + v.audio._syllables, 0);
  let acc = 0;
  for (const v of vs) {
    v.audio.chapterFrac = Number((acc / total).toFixed(5));
    acc += v.audio._syllables;
    delete v.audio._syllables;
  }
}

const verseByRef = new Map(verses.map((v) => [v.ref, v]));
const mustVerse = (ref, ctx) => {
  if (!verseByRef.has(ref)) throw new Error(`curated reference ${ref} (${ctx}) does not exist in the dataset`);
  return vid(ref);
};

// Anchor assertions — every curated reference must point at the Sanskrit we think it does.
const anchorErrors = [];
for (const [ref, needle] of Object.entries(ANCHORS)) {
  const v = verseByRef.get(ref);
  const hay = normDeva(v?.sanskrit.join(" ") || "").replace(/\s+/g, "");
  if (!v || !hay.includes(normDeva(needle).replace(/\s+/g, ""))) anchorErrors.push(`${ref} should contain "${needle}"`);
}
if (anchorErrors.length) {
  console.error("✗ anchor verification failed:\n  " + anchorErrors.join("\n  "));
  process.exit(1);
}
log(`   ✓ ${Object.keys(ANCHORS).length} textual anchors verified (curated numbering is sound)`);

const authors = [...authorsSeen.entries()]
  .map(([id, a]) => {
    const fromFile = authorsRaw.find((x) => x.id === Number(id));
    return { id: Number(id), name: fromFile?.name || a.name, lang: a.lang, kind: a.kind, ...(AUTHOR_META[id] || {}) };
  })
  .sort((a, b) => a.id - b.id);

// ── ④ graph ───────────────────────────────────────────────────────────────────────────────────
log("\n③ Building the property graph");

const nodes = [];
const edges = new Map();
function addEdge(type, source, target, props = {}, weight = 1) {
  if (source === target) return;
  const key = `${type}|${source}|${target}`;
  const ex = edges.get(key);
  if (ex) {
    ex.weight = Number(((ex.weight ?? 1) + weight).toFixed(3));
    for (const [k, val] of Object.entries(props)) {
      if (Array.isArray(val)) ex.props[k] = uniq([...(ex.props[k] || []), ...val]);
      else if (ex.props[k] === undefined) ex.props[k] = val;
    }
    return;
  }
  edges.set(key, { source, target, type, weight, props: { ...props } });
}

// Chapters
for (const ch of chapters) {
  nodes.push({
    id: ch.id, type: "Chapter", label: `Chapter ${ch.number}`, number: ch.number, name: ch.name, iast: ch.iast,
    title: ch.title, meaning: ch.meaning, verseCount: ch.verseCount, summary: ch.summary.en.split(/\n/)[0].slice(0, 420),
  });
}
for (let i = 1; i < chapters.length; i++) addEdge("NEXT_CHAPTER", chapters[i - 1].id, chapters[i].id);

// Characters
const charId = (id) => `character:${id}`;
const spokenCount = {};
for (const v of verses) spokenCount[v.speaker] = (spokenCount[v.speaker] || 0) + 1;
for (const ch of CHARACTERS) {
  nodes.push({
    id: charId(ch.id), type: "Character", label: ch.en, sa: ch.sa, iast: ch.iast, role: ch.role, desc: ch.desc, side: ch.side,
    versesSpoken: spokenCount[ch.id] || 0,
  });
}

// Verses
for (const v of verses) {
  const snippet = v.translations.en?.[DEFAULT_EN] || Object.values(v.translations.en || {})[0] || "";
  nodes.push({
    id: v.id, type: "Verse", label: `BG ${v.ref}`, ref: v.ref, chapter: v.chapter, verse: v.verse, speaker: v.speaker,
    canonical: v.canonical, meter: v.meter.family, sa: v.sanskrit[0]?.replace(/[।॥]/g, "").trim(),
    snippet: snippet.length > 180 ? snippet.slice(0, 177).replace(/\s+\S*$/, "") + "…" : snippet,
  });
  addEdge("BELONGS_TO", v.id, cid(v.chapter));
  addEdge("SPOKE", charId(v.speaker), v.id);
  if (v.narratedBy) addEdge("NARRATED", charId(v.narratedBy), v.id);
}
for (let i = 1; i < verses.length; i++) addEdge("NEXT_VERSE", verses[i - 1].id, verses[i].id);

const addresses = {};
for (const v of verses) {
  const to = LISTENERS[v.speaker];
  if (to) addresses[`${v.speaker}>${to}`] = (addresses[`${v.speaker}>${to}`] || 0) + 1;
}
for (const [k, n] of Object.entries(addresses)) {
  const [a, b] = k.split(">");
  addEdge("ADDRESSES", charId(a), charId(b), { verses: n }, n);
}

// Character mentions from padaccheda glosses (epithets: Pārtha, Keśava, Kaunteya…)
const PRONOUN = /^(mām|mayā|mat|mad|me|mama|mayi|aham|ātman|tvam|tvām|tava|te|tvayā|tvat|tvad|asmi)/;
for (const v of verses) {
  for (const p of v.padaccheda) {
    if (/uvācha/.test(p.w)) continue;
    for (const ch of CHARACTERS) {
      if (!ch.gloss.test(p.m)) continue;
      if (ch.id === "krishna" && PRONOUN.test(p.w)) continue;
      if (ch.id === v.speaker) continue; // a speaker naming themself is not a mention
      addEdge("MENTIONS_CHARACTER", v.id, charId(ch.id), { epithets: [p.w] });
    }
  }
}

// Concepts
const conceptId = (id) => `concept:${id}`;
for (const c of CONCEPTS) {
  nodes.push({ id: conceptId(c.id), type: "SanskritConcept", label: cap(c.iast), sa: c.sa, iast: c.iast, en: c.en, category: c.cat, desc: c.desc });
}
const wordsOf = (v) => v.sanskrit.join(" ").replace(/[।॥]/g, " ").split(/\s+/).filter(Boolean);
function lexicalHits(v, deva, pada, gloss) {
  const hits = [];
  if (deva) {
    for (const w of wordsOf(v)) {
      if (deva.test(w) || deva.test(normDeva(w))) hits.push(w);
    }
  }
  if (pada) {
    for (const p of v.padaccheda) {
      for (const tok of p.w.split(/[-\s]+/)) {
        if (pada.test(tokenOf(tok)) && (!gloss || gloss.test(p.m))) hits.push(p.w);
      }
    }
  }
  return uniq(hits);
}
for (const v of verses) {
  for (const c of CONCEPTS) {
    const hits = lexicalHits(v, c.deva, c.pada, c.gloss);
    if (hits.length) addEdge("MENTIONS_CONCEPT", v.id, conceptId(c.id), { terms: hits }, hits.length);
  }
}
for (const c of CONCEPTS) for (const ref of c.defines || []) addEdge("DEFINES_CONCEPT", mustVerse(ref, `concept ${c.id}`), conceptId(c.id));
for (const [n, ids] of Object.entries(CHAPTER_THEMES)) {
  ids.forEach((id, i) => {
    if (!CONCEPTS.find((c) => c.id === id)) throw new Error(`chapter theme ${id} is not a concept`);
    addEdge("EXPOUNDS", cid(Number(n)), conceptId(id), { rank: i + 1 });
  });
}

// Emotions
const emotionId = (id) => `emotion:${id}`;
for (const e of EMOTIONS) {
  nodes.push({
    id: emotionId(e.id), type: "Emotion", label: cap(e.iast), sa: e.sa, iast: e.iast, en: e.en, valence: e.valence, guna: e.guna,
    desc: e.desc, modern: e.modern, lexicon: e.lexicon,
  });
}
for (const v of verses) {
  for (const e of EMOTIONS) {
    const hits = lexicalHits(v, e.deva);
    if (hits.length) addEdge("MENTIONS_STATE", v.id, emotionId(e.id), { terms: hits }, hits.length);
  }
}
for (const e of EMOTIONS) {
  for (const ref of e.depicts || []) addEdge("DEPICTS_STATE", mustVerse(ref, `emotion ${e.id}`), emotionId(e.id));
  for (const ref of e.heals || []) addEdge("HEALS", mustVerse(ref, `emotion ${e.id}`), emotionId(e.id));
  for (const ref of e.cultivates || []) addEdge("CULTIVATES", mustVerse(ref, `emotion ${e.id}`), emotionId(e.id));
}

const known = (id) => nodes.some((n) => n.id === id);
const needNode = (id, ctx) => {
  if (!known(id)) throw new Error(`${ctx}: unknown node ${id}`);
  return id;
};
for (const ch of CAUSAL_CHAINS) {
  if (ch.steps) {
    for (let i = 1; i < ch.steps.length; i++) {
      const verse = ch.stepVerses?.[i - 1] || ch.verses[0];
      mustVerse(verse, `chain ${ch.id}`);
      addEdge("CAUSES_STATE", needNode(nodeRef(ch.steps[i - 1]), ch.id), needNode(nodeRef(ch.steps[i]), ch.id), { chains: [ch.id], verses: [verse], step: i });
    }
  }
  if (ch.fan) for (const f of ch.fan.from) addEdge("CAUSES_STATE", needNode(nodeRef(f), ch.id), needNode(nodeRef(ch.fan.to), ch.id), { chains: [ch.id], verses: [mustVerse(ch.fan.verse, ch.id).slice(3)] });
  if (ch.pairs) for (const [a, b] of ch.pairs) addEdge("CAUSES_STATE", needNode(nodeRef(a), ch.id), needNode(nodeRef(b), ch.id), { chains: [ch.id], verses: [mustVerse(ch.verse, ch.id).slice(3)] });
}
for (const [healer, afflict, ref] of ANTIDOTES) {
  addEdge("ANTIDOTE_TO", needNode(nodeRef(healer), "antidote"), needNode(nodeRef(afflict), "antidote"), { verses: [mustVerse(ref, "antidote").slice(3)] });
}

// Life dilemmas
const dilemmaId = (id) => `dilemma:${id}`;
for (const d of DILEMMAS) {
  nodes.push({ id: dilemmaId(d.id), type: "LifeDilemma", label: d.en, sa: d.sa, desc: d.desc, keywords: d.keywords });
  for (const [ref, why] of d.verses) addEdge("ADDRESSES_DILEMMA", mustVerse(ref, `dilemma ${d.id}`), dilemmaId(d.id), { why });
  for (const e of d.emotions) addEdge("EVOKES_STATE", dilemmaId(d.id), needNode(emotionId(e), d.id));
  for (const c of d.concepts) addEdge("RESOLVED_THROUGH", dilemmaId(d.id), needNode(conceptId(c), d.id));
}

// Dialogues
for (const d of DIALOGUES) {
  const qs = expand(d.q).map((r) => mustVerse(r, `dialogue ${d.id}`));
  const as = expand(d.a).map((r) => mustVerse(r, `dialogue ${d.id}`));
  const anchor = mustVerse(d.anchor, `dialogue ${d.id}`);
  for (const a of as) addEdge("ANSWERS_QUESTION_IN", a, anchor, { dialogues: [d.id] });
  for (const q of qs) if (q !== anchor) addEdge("ANSWERS_QUESTION_IN", as[0], q, { dialogues: [d.id] });
}
// The Gita's arc: Arjuna's surrender in confusion (2.7) is resolved in 18.73.
addEdge("ANSWERS_QUESTION_IN", vid("18.73"), vid("2.7"), { dialogues: ["resolution"] });

// Thematic threads
for (const t of THREADS) {
  const vs = t.verses.map((r) => mustVerse(r, `thread ${t.id}`));
  for (let i = 1; i < vs.length; i++) addEdge("ECHOES_VERSE", vs[i - 1], vs[i], { threads: [t.id] });
  for (let i = 0; i < vs.length - 1; i++) addEdge("CULMINATES_IN", vs[i], vs[vs.length - 1], { threads: [t.id] });
}

const graph = {
  meta: {
    name: "GitaViswa Knowledge Graph",
    version: VERSION,
    generatedAt: new Date().toISOString(),
    numbering: "701 verse nodes: the traditional 700 + 13.1 (Arjuna's question, present in some recensions; canonical=false). Chapter 13 refs follow this numbering.",
    sources: SOURCE_CREDITS,
    provenance,
  },
  schema: {
    nodeLabels: {
      Chapter: "18 adhyāyas", Verse: "701 ślokas", Character: "speakers & persons", SanskritConcept: "philosophical & lexical concepts",
      Emotion: "afflictive and healing mental states", LifeDilemma: "timeless human situations",
      PersonalThought: "private reflections (client-side only, IndexedDB)",
    },
    relations: {
      BELONGS_TO: "Verse → Chapter", NEXT_VERSE: "Verse → Verse (reading order)", NEXT_CHAPTER: "Chapter → Chapter",
      SPOKE: "Character → Verse (uvāca)", NARRATED: "Character → Verse (reported speech)", ADDRESSES: "Character → Character",
      MENTIONS_CHARACTER: "Verse → Character (by name/epithet)", MENTIONS_CONCEPT: "Verse → Concept (lexical match)",
      DEFINES_CONCEPT: "Verse → Concept (curated: defines/expounds)", EXPOUNDS: "Chapter → Concept (primary theme)",
      MENTIONS_STATE: "Verse → Emotion (lexical)", DEPICTS_STATE: "Verse → Emotion (portrays)", HEALS: "Verse → Emotion (remedies)",
      CULTIVATES: "Verse → Emotion (cultivates)", CAUSES_STATE: "Emotion|Concept → Emotion|Concept (causal chain)",
      ANTIDOTE_TO: "Emotion|Concept → Emotion", ADDRESSES_DILEMMA: "Verse → LifeDilemma", EVOKES_STATE: "LifeDilemma → Emotion",
      RESOLVED_THROUGH: "LifeDilemma → Concept", ANSWERS_QUESTION_IN: "Verse → Verse (answer → question)",
      ECHOES_VERSE: "Verse → Verse (thematic progression)", CULMINATES_IN: "Verse → Verse (thematic culmination)",
      FEELS: "PersonalThought → Emotion (client)", FACES: "PersonalThought → LifeDilemma (client)", RESONATES_WITH: "PersonalThought → Verse (client)",
    },
  },
  categories: CONCEPT_CATEGORIES,
  threads: THREADS,
  dialogues: DIALOGUES.map((d) => ({ ...d, qVerses: expand(d.q).map(vid), aVerses: expand(d.a).map(vid), anchor: vid(d.anchor) })),
  chains: CAUSAL_CHAINS.map((c) => ({ id: c.id, title: c.title, summary: c.summary, verses: c.verses.map(vid), steps: (c.steps || c.fan?.from.concat([c.fan.to]) || c.pairs?.flat() || []).map(nodeRef) })),
  nodes,
  edges: [...edges.values()].map((e) => (Object.keys(e.props).length ? e : { source: e.source, target: e.target, type: e.type, weight: e.weight })),
};

// ── ⑤ verify ──────────────────────────────────────────────────────────────────────────────────
const versesDoc = {
  meta: {
    name: "GitaViswa Verses",
    version: VERSION,
    generatedAt: graph.meta.generatedAt,
    numbering: graph.meta.numbering,
    defaults: { en: DEFAULT_EN, hi: DEFAULT_HI },
    sources: SOURCE_CREDITS,
    audioNote: "Per-verse recitations stream from holy-bhagavad-gita.org; chapter recitations from archive.org. chapterFrac is a syllable-proportional estimate of each verse's start within a chapter recording.",
  },
  authors,
  chapters,
  verses: verses.map((v) => Object.fromEntries(Object.entries(v).filter(([k]) => k !== "_commentary"))),
};

const { errors, warnings, stats } = verifyGraph(graph, versesDoc);
if (errors.length) {
  console.error(`✗ integrity verification failed with ${errors.length} error(s):`);
  for (const e of errors.slice(0, 40)) console.error("  " + e);
  process.exit(1);
}
graph.stats = stats;
log(`   ✓ integrity verified: ${stats.nodes} nodes, ${stats.edges} edges, 0 errors${warnings.length ? `, ${warnings.length} warnings` : ""}`);

// ── ⑥ write ───────────────────────────────────────────────────────────────────────────────────
log("\n④ Writing artefacts");
await fs.mkdir(path.join(OUT, "commentary"), { recursive: true });
await fs.writeFile(path.join(OUT, "gita-verses.json"), JSON.stringify(versesDoc));
await fs.writeFile(path.join(OUT, "gita-graph.json"), JSON.stringify(graph));

let commentaryFiles = 0;
if (commentaryRaw) {
  const authorName = Object.fromEntries(authors.map((a) => [a.id, a]));
  for (const v of verses) {
    if (!v._commentary.length) continue;
    const doc = {
      id: v.id,
      ref: v.ref,
      commentaries: v._commentary.map((c) => ({
        authorId: c.authorId, author: authorName[c.authorId]?.name, school: authorName[c.authorId]?.school, lang: c.lang, text: c.text,
      })),
    };
    await fs.writeFile(path.join(OUT, "commentary", `${v.id}.json`), JSON.stringify(doc));
    commentaryFiles++;
  }
}

await fs.writeFile(path.join(OUT, "gita-cypher-seed.cypher"), toCypher(graph, versesDoc));

const size = async (f) => ((await fs.stat(path.join(OUT, f))).size / 1024).toFixed(0) + " KB";
log(`   • gita-verses.json        ${await size("gita-verses.json")}`);
log(`   • gita-graph.json         ${await size("gita-graph.json")}`);
log(`   • gita-cypher-seed.cypher ${await size("gita-cypher-seed.cypher")}`);
log(`   • commentary/             ${commentaryFiles} verse files`);
log("\n   Nodes by label:   " + Object.entries(stats.byLabel).map(([k, v]) => `${k} ${v}`).join(" · "));
log("   Edges by relation: " + Object.entries(stats.byRelation).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
log(`\n✓ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

// ── Cypher ───────────────────────────────────────────────────────────────────────────────────
function cypherValue(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return "[" + v.filter((x) => typeof x !== "object").map(cypherValue).join(", ") + "]";
  return JSON.stringify(String(v));
}
function cypherMap(o) {
  return "{" + Object.entries(o).filter(([, v]) => v !== undefined && (typeof v !== "object" || Array.isArray(v) || v === null)).map(([k, v]) => `${k}: ${cypherValue(v)}`).join(", ") + "}";
}
function toCypher(g, vdoc) {
  const out = [];
  out.push(`// GitaViswa (गीताविश्व) — Neo4j seed · generated ${g.meta.generatedAt}`);
  out.push(`// ${g.stats.nodes} nodes, ${g.stats.edges} relationships. Run in Neo4j Browser or: cypher-shell -f gita-cypher-seed.cypher`);
  out.push("");
  const labels = Object.keys(g.stats.byLabel);
  for (const l of labels) out.push(`CREATE CONSTRAINT ${l.toLowerCase()}_id IF NOT EXISTS FOR (n:${l}) REQUIRE n.id IS UNIQUE;`);
  out.push("");
  const full = new Map(vdoc.verses.map((v) => [v.id, v]));
  const byLabel = {};
  for (const n of g.nodes) {
    const row = { ...n };
    delete row.type;
    if (n.type === "Verse") {
      const v = full.get(n.id);
      Object.assign(row, {
        sanskrit: v.sanskrit.join("\n"), iast: v.iast.join("\n"), transliteration: v.transliteration.join("\n"),
        translation_en: v.translations.en?.[DEFAULT_EN] || "", translation_hi: v.translations.hi?.[DEFAULT_HI] || "",
        meter_name: v.meter.name, audio_url: v.audio.verse[0],
      });
    }
    (byLabel[n.type] ||= []).push(row);
  }
  const BATCH = 200;
  for (const [label, rows] of Object.entries(byLabel)) {
    for (let i = 0; i < rows.length; i += BATCH) {
      out.push(`UNWIND [\n  ${rows.slice(i, i + BATCH).map(cypherMap).join(",\n  ")}\n] AS row\nMERGE (n:${label} {id: row.id}) SET n += row;`);
      out.push("");
    }
  }
  const labelOf = new Map(g.nodes.map((n) => [n.id, n.type]));
  const groups = {};
  for (const e of g.edges) {
    const k = `${e.type}|${labelOf.get(e.source)}|${labelOf.get(e.target)}`;
    (groups[k] ||= []).push({ s: e.source, t: e.target, ...(e.weight !== 1 ? { weight: e.weight } : {}), ...(e.props || {}) });
  }
  for (const [k, rows] of Object.entries(groups)) {
    const [type, sl, tl] = k.split("|");
    for (let i = 0; i < rows.length; i += 500) {
      // `row { .*, s: null, t: null }` copies every property except the endpoint ids (null removes them).
      out.push(`UNWIND [\n  ${rows.slice(i, i + 500).map(cypherMap).join(",\n  ")}\n] AS row\nMATCH (a:${sl} {id: row.s}), (b:${tl} {id: row.t})\nMERGE (a)-[r:${type}]->(b) SET r += row { .*, s: null, t: null };`);
      out.push("");
    }
  }
  return out.join("\n");
}
