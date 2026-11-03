// Deterministic Sanskrit utilities: text cleanup, Devanagari → IAST, prosody (chandas) and lexical stems.

const IND_VOWELS = {
  "अ": "a", "आ": "ā", "इ": "i", "ई": "ī", "उ": "u", "ऊ": "ū", "ऋ": "ṛ", "ॠ": "ṝ", "ऌ": "ḷ", "ॡ": "ḹ",
  "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
};
const MATRAS = {
  "ा": "ā", "ि": "i", "ी": "ī", "ु": "u", "ू": "ū", "ृ": "ṛ", "ॄ": "ṝ", "ॢ": "ḷ", "ॣ": "ḹ",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
};
const CONSONANTS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ṅ",
  "च": "c", "छ": "ch", "ज": "j", "झ": "jh", "ञ": "ñ",
  "ट": "ṭ", "ठ": "ṭh", "ड": "ḍ", "ढ": "ḍh", "ण": "ṇ",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "ळ": "ḻ", "व": "v",
  "श": "ś", "ष": "ṣ", "स": "s", "ह": "h",
};
const OTHERS = { "ं": "ṃ", "ः": "ḥ", "ँ": "m̐", "ऽ": "’", "ॐ": "oṃ", "।": "|", "॥": "||" };
const VIRAMA = "्";
const NUKTA = "़";
const LONG = new Set(["ā", "ī", "ū", "ṝ", "ḹ", "e", "ai", "o", "au"]);
const DIGITS = "०१२३४५६७८९";

export function devanagariToIAST(text) {
  let out = "";
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch];
      let j = i + 1;
      if (chars[j] === NUKTA) j++;
      const nx = chars[j];
      if (nx === VIRAMA) {
        i = j;
      } else if (MATRAS[nx]) {
        out += MATRAS[nx];
        i = j;
      } else {
        out += "a";
        i = j - 1;
      }
    } else if (IND_VOWELS[ch]) out += IND_VOWELS[ch];
    else if (MATRAS[ch]) out += MATRAS[ch];
    else if (OTHERS[ch]) out += OTHERS[ch];
    else if (DIGITS.includes(ch)) out += String(DIGITS.indexOf(ch));
    else if (ch === NUKTA || ch === VIRAMA || ch === "‍" || ch === "‌") continue;
    else out += ch;
  }
  return out;
}

/** Split Devanagari into phonological units: {t:'C'} consonant, {t:'V', long}, {t:'M'} anusvāra/visarga. */
function phonemes(line) {
  const units = [];
  const chars = [...line];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (CONSONANTS[ch]) {
      units.push({ t: "C" });
      let j = i + 1;
      if (chars[j] === NUKTA) j++;
      const nx = chars[j];
      if (nx === VIRAMA) i = j;
      else if (MATRAS[nx]) {
        units.push({ t: "V", long: LONG.has(MATRAS[nx]) });
        i = j;
      } else {
        units.push({ t: "V", long: false });
        i = j - 1;
      }
    } else if (IND_VOWELS[ch]) units.push({ t: "V", long: LONG.has(IND_VOWELS[ch]) });
    else if (ch === "ं" || ch === "ः" || ch === "ँ") units.push({ t: "M" });
    else if (ch === "ॐ") {
      units.push({ t: "V", long: true });
      units.push({ t: "M" });
    }
  }
  return units;
}

/** Guru (G) / Laghu (L) weights for one metrical line. */
export function scan(line) {
  const u = phonemes(line);
  const weights = [];
  for (let i = 0; i < u.length; i++) {
    if (u[i].t !== "V") continue;
    let heavy = u[i].long;
    let k = i + 1;
    if (u[k]?.t === "M") {
      heavy = true;
      k++;
    }
    let cons = 0;
    while (u[k] && u[k].t === "C") {
      cons++;
      k++;
    }
    if (cons >= 2) heavy = true;
    weights.push(heavy ? "G" : "L");
  }
  return weights.join("");
}

/** Classify the chandas of a verse from its metrical lines (uvāca line & verse number removed). */
export function classifyMeter(lines) {
  const scans = lines.map(scan).filter((s) => s.length > 0);
  // Normalise each printed line into pādas.
  const padas = [];
  for (const s of scans) {
    const n = s.length;
    if (n >= 14 && n <= 18) padas.push(s.slice(0, 8), s.slice(8));
    else if (n >= 20 && n <= 26) {
      const half = n >= 23 ? 12 : 11;
      padas.push(s.slice(0, half), s.slice(half));
    } else padas.push(s);
  }
  const lens = padas.map((p) => p.length);
  const total = lens.reduce((a, b) => a + b, 0);
  const all = (pred) => lens.length > 0 && lens.every(pred);
  let name = "Viṣama (irregular)";
  let family = "other";
  if (all((l) => l >= 7 && l <= 9)) {
    family = "anustubh";
    name = padas.length > 4 ? `Anuṣṭubh (Śloka, ${padas.length} pādas)` : "Anuṣṭubh (Śloka)";
  } else if (all((l) => l >= 10 && l <= 12)) {
    const core = padas.map((p) => p.slice(1, 10));
    const tristubhCore = "GLGGLLGLG";
    const n11 = lens.filter((l) => l === 11).length;
    const n12 = lens.filter((l) => l === 12).length;
    if (n12 === 0) {
      family = "tristubh";
      const firsts = padas.map((p) => p[0]);
      const isFamily = core.every((c) => c === tristubhCore);
      if (isFamily && firsts.every((f) => f === "G")) name = "Triṣṭubh — Indravajrā";
      else if (isFamily && firsts.every((f) => f === "L")) name = "Triṣṭubh — Upendravajrā";
      else name = "Triṣṭubh — Upajāti";
    } else if (n11 === 0) {
      family = "jagati";
      name = "Jagatī";
    } else {
      family = "tristubh-jagati";
      name = "Upajāti (Triṣṭubh–Jagatī mixed)";
    }
  }
  return { name, family, syllables: total, padas: padas.length, scansion: padas };
}

/** Clean a raw gita/gita Devanagari verse into {uvacha, lines}. */
/** Repair a source encoding quirk: i-mātrā typed after the virāma ("भक्ितयोगेन" → "भक्तियोगेन"). */
export function repairDevanagari(s) {
  return String(s).replace(/्ि([क-ह])/g, "्$1ि");
}

export function cleanSanskrit(raw) {
  let t = repairDevanagari(String(raw).replace(/\r/g, "")).trim();
  let uvacha = null;
  // Speaker headings only ("तमुवाच हृषीकेशः" in 2.10 is narration, not a heading).
  // "उवाच" after a consonant fuses into a vowel sign: श्रीभगवान् + उवाच → श्रीभगवानुवाच.
  const m = t.match(/^\s*((?:धृतराष्ट्र|सञ्जय|संजय|अर्जुन)\s*उवाच|श्री\s*भगवानुवाच)\s*/);
  if (m) {
    uvacha = m[1].replace(/\s+/g, " ").trim();
    t = t.slice(m[0].length);
  }
  t = t.replace(/[।॥|]{1,2}\s*[\d०-९]+\s*\.\s*[\d०-९]+\s*[।॥|]{1,2}/g, "").trim();
  let lines = t
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const split = [];
  for (const line of lines) {
    const parts = line.split(/।(?!।)/).map((s) => s.trim()).filter(Boolean);
    split.push(...parts);
  }
  lines = split.map((s) => s.replace(/[।॥]+$/g, "").trim()).filter(Boolean);
  // Triṣṭubh verses are printed one pāda per line: daṇḍa after the first half only.
  const halfEvery = lines.length === 4 ? 2 : 1;
  lines = lines.map((s, i) => {
    if (i === lines.length - 1) return s + " ॥";
    return (i + 1) % halfEvery === 0 ? s + " ।" : s;
  });
  return { uvacha, lines };
}

export function cleanTransliteration(raw) {
  const lines = String(raw)
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let uvacha = null;
  if (lines.length && /uvācha\s*$/i.test(lines[0])) uvacha = lines.shift();
  return { uvacha, lines };
}

const STOP = new Set([
  "cha", "eva", "hi", "na", "tu", "api", "iti", "mā", "te", "me", "sa", "saḥ", "tat", "yat", "yaḥ", "tam", "tām", "ca",
  "vā", "atha", "tathā", "yathā", "iva", "ha", "u", "tvam", "aham", "mām", "mayā", "mama", "tava", "tvām", "ye", "tān",
  "sma", "kim", "tadā", "yadā", "yena", "tena", "asya", "ayam", "idam", "etat", "sarva", "sarvam", "ati", "cha eva",
]);
const ENDINGS = [
  "ebhyaḥ", "ābhyām", "ānām", "eṣhu", "ābhiḥ", "aiḥ", "asya", "āya", "ayoḥ", "āṇām", "āṇi", "aṇi", "aṇā", "aṇaḥ",
  "abhiḥ", "ānāṁ", "āsu", "ena", "eṇa", "āni", "ānām", "āt", "āṁ", "aṁ", "am", "aḥ", "āḥ", "ān", "au", "iḥ", "īḥ",
  "uḥ", "ūḥ", "im", "iṁ", "um", "uṁ", "ī", "ā", "e", "i", "u", "o", "a",
];

/** Approximate lexical stem of a padaccheda word (used for "shared root" highlighting). */
export function stemOf(word) {
  let w = String(word)
    .toLowerCase()
    .normalize("NFC")
    .replace(/[’'`.,!?()]/g, "")
    .trim();
  if (!w || STOP.has(w) || w.length < 3) return null;
  for (const e of ENDINGS) {
    if (w.endsWith(e) && w.length - e.length >= 3) {
      w = w.slice(0, -e.length);
      break;
    }
  }
  if (w.length < 3) return null;
  return w;
}

/** Parse Mukundananda-style word meanings ("word—meaning; word—meaning") into padaccheda chips. */
export function parsePadaccheda(raw) {
  const out = [];
  for (const part of String(raw).replace(/\r/g, "").split(";")) {
    const i = part.indexOf("—");
    if (i < 0) continue;
    const w = part.slice(0, i).trim();
    const m = part.slice(i + 1).trim();
    if (!w || !m) continue;
    const comps = w.split(/[-\s]+/).filter(Boolean);
    const stems = [...new Set(comps.map(stemOf).filter(Boolean))];
    out.push({ w, m, k: stems });
  }
  return out;
}

/** Normalised transliteration token (keeps vowel length; strips punctuation). */
export function tokenOf(word) {
  return String(word).toLowerCase().normalize("NFC").replace(/[’'`.,!?()]/g, "").trim();
}
