/**
 * "One word, many readings": find where each commentary discusses a word of the verse.
 *
 * The word-by-word data (padaccheda) gives stems in the transliteration style of holy-bhagavad-gita.org
 * ("karm", "adhikār", "kṣhetr", "ch" for च, "ṣh" for ष, "ṛi" for ऋ). Sanskrit and Hindi commentaries are in Devanagari,
 * so the stem is converted to Devanagari; English ones transliterate loosely (Gambirananda writes "adhikarah",
 * others "adhikāraḥ"), so the stem becomes a pattern that tolerates missing diacritics and aspiration.
 * Pure functions, unit-tested in tests/lens.test.ts.
 */

const VOWELS: [string, string, string][] = [
  // token, independent, matra
  ["ai", "ऐ", "ै"],
  ["au", "औ", "ौ"],
  ["ṛi", "ऋ", "ृ"],
  ["ṝ", "ॠ", "ॄ"],
  ["ṛ", "ऋ", "ृ"],
  ["ā", "आ", "ा"],
  ["ī", "ई", "ी"],
  ["ū", "ऊ", "ू"],
  ["a", "अ", ""],
  ["i", "इ", "ि"],
  ["u", "उ", "ु"],
  ["e", "ए", "े"],
  ["o", "ओ", "ो"],
];

const CONSONANTS: [string, string, string][] = [
  // token, Devanagari, latin pattern (aspiration and diacritics optional)
  ["kṣh", "क्ष", "k(?:ṣh|sh|ṣ|s)"],
  ["kṣ", "क्ष", "k(?:ṣh|sh|ṣ|s)"],
  ["jñ", "ज्ञ", "(?:jñ|jn|gy)"],
  ["chh", "छ", "(?:chh|ch|c)"],
  ["ch", "च", "(?:chh|ch|c)"],
  ["kh", "ख", "(?:kh|k)"],
  ["gh", "घ", "(?:gh|g)"],
  ["jh", "झ", "(?:jh|j)"],
  ["ṭh", "ठ", "(?:ṭh|th|ṭ|t)"],
  ["ḍh", "ढ", "(?:ḍh|dh|ḍ|d)"],
  ["th", "थ", "(?:ṭh|th|ṭ|t)"],
  ["dh", "ध", "(?:ḍh|dh|ḍ|d)"],
  ["ph", "फ", "(?:ph|p)"],
  ["bh", "भ", "(?:bh|b)"],
  ["śh", "श", "(?:śh|ṣh|sh|ś|ṣ|s)"],
  ["ṣh", "ष", "(?:śh|ṣh|sh|ś|ṣ|s)"],
  ["k", "क", "(?:kh|k)"],
  ["g", "ग", "(?:gh|g)"],
  ["ṅ", "ङ", "[nṇñṅṃṁ]"],
  ["c", "च", "(?:chh|ch|c)"],
  ["j", "ज", "(?:jh|j)"],
  ["ñ", "ञ", "[nṇñṅ]"],
  ["ṭ", "ट", "(?:ṭh|th|ṭ|t)"],
  ["ḍ", "ड", "(?:ḍh|dh|ḍ|d)"],
  ["ṇ", "ण", "[nṇñṅ]"],
  ["t", "त", "(?:ṭh|th|ṭ|t)"],
  ["d", "द", "(?:ḍh|dh|ḍ|d)"],
  ["n", "न", "[nṇñṅ]"],
  ["p", "प", "(?:ph|p)"],
  ["b", "ब", "(?:bh|b)"],
  ["m", "म", "[mṃṁ]"],
  ["y", "य", "y"],
  ["r", "र", "r"],
  ["l", "ल", "[lḷ]"],
  ["ḷ", "ळ", "[lḷ]"],
  ["v", "व", "[vw]"],
  ["w", "व", "[vw]"],
  ["ś", "श", "(?:śh|ṣh|sh|ś|ṣ|s)"],
  ["ṣ", "ष", "(?:śh|ṣh|sh|ś|ṣ|s)"],
  ["s", "स", "(?:śh|ṣh|sh|ś|ṣ|s)"],
  ["h", "ह", "h"],
];

const MARKS: [string, string, string][] = [
  ["ṃ", "ं", "[mṃṁn]"],
  ["ṁ", "ं", "[mṃṁn]"],
  ["ḥ", "ः", "[hḥ]"],
];

const VOWEL_PATTERN: Record<string, string> = { ai: "ai", au: "au", "ṛi": "(?:ṛi|ṛ|ri|r)", "ṝ": "(?:ṝ|ṛ|ri|r)", "ṛ": "(?:ṛi|ṛ|ri|r)", ā: "[aā]", a: "[aā]", ī: "[iī]", i: "[iī]", ū: "[uū]", u: "[uū]", e: "e", o: "o" };

type Tok = { kind: "v" | "c" | "m"; t: string; deva: string; matra?: string; latin: string };

function tokenize(stem: string): Tok[] {
  const s = stem.normalize("NFC").toLowerCase();
  const out: Tok[] = [];
  let i = 0;
  outer: while (i < s.length) {
    for (const [t, ind, matra] of VOWELS)
      if (s.startsWith(t, i)) {
        out.push({ kind: "v", t, deva: ind, matra, latin: VOWEL_PATTERN[t] });
        i += t.length;
        continue outer;
      }
    for (const [t, deva, latin] of CONSONANTS)
      if (s.startsWith(t, i)) {
        out.push({ kind: "c", t, deva, latin });
        i += t.length;
        continue outer;
      }
    for (const [t, deva, latin] of MARKS)
      if (s.startsWith(t, i)) {
        out.push({ kind: "m", t, deva, latin });
        i += t.length;
        continue outer;
      }
    i++; // anything else (apostrophes, hyphens) is ignored
  }
  return out;
}

/** "karm" → "कर्म", "adhikār" → "अधिकार", "kṣhetr" → "क्षेत्र". A final consonant keeps its inherent vowel. */
export function stemToDeva(stem: string): string {
  let out = "";
  let afterConsonant = false;
  for (const tok of tokenize(stem)) {
    if (tok.kind === "v") {
      out += afterConsonant ? tok.matra : tok.deva;
      afterConsonant = false;
    } else if (tok.kind === "c") {
      if (afterConsonant) out += "्";
      out += tok.deva;
      afterConsonant = true;
    } else {
      out += tok.deva;
      afterConsonant = false;
    }
  }
  return out;
}

/** A regex source matching the stem at the start of a word in loosely transliterated English text. */
export function latinStemPattern(stem: string): string {
  return tokenize(stem)
    .map((t) => t.latin)
    .join("");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface WordMatcher {
  deva: RegExp | null;
  latin: RegExp | null;
}

/** Matchers for a word of the verse, from its longest stem. Particles without a stem (eva, te, mā) get none. */
export function matcherFor(stems: string[]): WordMatcher {
  const stem = [...stems].sort((a, b) => b.length - a.length)[0];
  if (!stem || stem.length < 2) return { deva: null, latin: null };
  const deva = stemToDeva(stem);
  const latin = latinStemPattern(stem);
  return {
    deva: deva.length >= 2 ? new RegExp(escapeRe(deva), "g") : null,
    latin: latin ? new RegExp(`(?<![\\p{L}\\p{M}])${latin}`, "giu") : null,
  };
}

export const isDevanagari = (lang: string) => lang === "sa" || lang === "hi";

export function regexFor(m: WordMatcher, lang: string): RegExp | null {
  const re = isDevanagari(lang) ? m.deva : m.latin;
  return re ? new RegExp(re.source, re.flags) : null;
}

/** Text split into plain and matched runs, for highlighting. */
export function splitHits(text: string, re: RegExp | null): { t: string; hit: boolean }[] {
  if (!re) return [{ t: text, hit: false }];
  const out: { t: string; hit: boolean }[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let last = 0;
  for (const m of text.matchAll(g)) {
    const i = m.index ?? 0;
    if (i < last) continue; // inside a hit already extended to its word's end
    // Extend the hit to the end of the word, so "karm" lights up "karmaṇi".
    let j = i + m[0].length;
    while (j < text.length && /[\p{L}\p{M}]/u.test(text[j])) j++;
    if (i > last) out.push({ t: text.slice(last, i), hit: false });
    out.push({ t: text.slice(i, j), hit: true });
    last = j;
  }
  if (last < text.length) out.push({ t: text.slice(last), hit: false });
  return out;
}

/** Up to `max` short passages (a sentence, trimmed around the hit when long) where the word is discussed. */
export function findExcerpts(text: string, re: RegExp | null, max = 2, width = 240): string[] {
  if (!re) return [];
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;।॥])\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    const g = new RegExp(re.source, re.flags.replace("g", ""));
    const m = g.exec(s);
    if (!m) continue;
    if (s.length <= width) out.push(s.trim());
    else {
      const start = Math.max(0, m.index - Math.floor(width / 3));
      const end = Math.min(s.length, start + width);
      out.push(`${start > 0 ? "… " : ""}${s.slice(start, end).trim()}${end < s.length ? " …" : ""}`);
    }
    if (out.length >= max) break;
  }
  return out;
}
