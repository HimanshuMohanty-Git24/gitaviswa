// Offline Devanagari → regional Indic script transliteration (Brahmic blocks share the ISCII-derived layout,
// so most characters map by a fixed code-point offset; gaps are patched per script).

export type RegionalScript = "odia" | "bengali" | "gujarati" | "tamil" | "telugu" | "kannada" | "malayalam";

export const SCRIPT_INFO: Record<RegionalScript, { name: string; native: string; lang: string; offset: number; font: string }> = {
  bengali: { name: "Bengali", native: "বাংলা", lang: "Bengali", offset: 0x0980 - 0x0900, font: "var(--font-indic)" },
  gujarati: { name: "Gujarati", native: "ગુજરાતી", lang: "Gujarati", offset: 0x0a80 - 0x0900, font: "var(--font-indic)" },
  odia: { name: "Odia", native: "ଓଡ଼ିଆ", lang: "Odia", offset: 0x0b00 - 0x0900, font: "var(--font-indic)" },
  tamil: { name: "Tamil", native: "தமிழ்", lang: "Tamil", offset: 0x0b80 - 0x0900, font: "var(--font-indic)" },
  telugu: { name: "Telugu", native: "తెలుగు", lang: "Telugu", offset: 0x0c00 - 0x0900, font: "var(--font-indic)" },
  kannada: { name: "Kannada", native: "ಕನ್ನಡ", lang: "Kannada", offset: 0x0c80 - 0x0900, font: "var(--font-indic)" },
  malayalam: { name: "Malayalam", native: "മലയാളം", lang: "Malayalam", offset: 0x0d00 - 0x0900, font: "var(--font-indic)" },
};

/** Languages offered for on-demand (LLM) meaning translation; Marathi shares Devanagari script. */
export const TRANSLATION_LANGS = [
  { id: "en", name: "English", native: "English" },
  { id: "hi", name: "Hindi", native: "हिन्दी" },
  { id: "mr", name: "Marathi", native: "मराठी" },
  { id: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
  { id: "bn", name: "Bengali", native: "বাংলা" },
  { id: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { id: "ta", name: "Tamil", native: "தமிழ்" },
  { id: "te", name: "Telugu", native: "తెలుగు" },
  { id: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { id: "ml", name: "Malayalam", native: "മലയാളം" },
];

// Devanagari code points whose straight offset lands on an unassigned slot → replacement in the target script.
const PATCH: Partial<Record<RegionalScript, Record<string, string>>> = {
  bengali: { "व": "ব", "ळ": "ল", "ॐ": "ওঁ", "ॅ": "", "ऍ": "এ" },
  gujarati: { "ॐ": "ૐ" },
  odia: { "ॐ": "ଓଁ", "व": "ବ" },
  telugu: { "ॐ": "ఓం" },
  kannada: { "ॐ": "ಓಂ" },
  malayalam: { "ॐ": "ഓം" },
  tamil: { "ॐ": "ஓம்", "ऋ": "ரு", "ॠ": "ரூ", "ं": "ம்", "ँ": "ம்", "ऽ": "’", "ॄ": "்ரூ", "ृ": "்ரு" },
};

// Tamil lacks aspirated & voiced stops: write the base letter with a Grantha-style superscript (²³⁴).
const TAMIL_STOPS: Record<string, [string, string]> = {
  "ख": ["க", "²"], "ग": ["க", "³"], "घ": ["க", "⁴"],
  "छ": ["ச", "²"], "झ": ["ஜ", "²"],
  "ठ": ["ட", "²"], "ड": ["ட", "³"], "ढ": ["ட", "⁴"],
  "थ": ["த", "²"], "द": ["த", "³"], "ध": ["த", "⁴"],
  "फ": ["ப", "²"], "ब": ["ப", "³"], "भ": ["ப", "⁴"],
};

// Vowel signs & virāma only — anusvāra/visarga follow the superscript ("ப⁴ம்", not "பம்⁴").
const isCombining = (ch: string) => /[ा-्ॢॣ]/.test(ch);
const SHARED = new Set(["।", "॥", " ", "\n", "‌", "‍"]);

export function transliterate(text: string, script: RegionalScript): string {
  const info = SCRIPT_INFO[script];
  const patch = PATCH[script] || {};
  const chars = [...text];
  let out = "";
  let pendingSup = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (script === "tamil" && TAMIL_STOPS[ch]) {
      const [base, sup] = TAMIL_STOPS[ch];
      out += base;
      pendingSup = sup;
    } else if (patch[ch] !== undefined) {
      out += patch[ch];
    } else {
      const cp = ch.codePointAt(0)!;
      if (cp >= 0x0900 && cp <= 0x097f && !SHARED.has(ch)) {
        const mapped = String.fromCodePoint(cp + info.offset);
        out += mapped;
      } else out += ch;
    }
    // The superscript follows the whole syllable (after vowel signs / virama), never inside it.
    if (pendingSup && !(chars[i + 1] && isCombining(chars[i + 1]))) {
      out += pendingSup;
      pendingSup = "";
    }
  }
  return out;
}

export const isRegionalScript = (s: string): s is RegionalScript => s in SCRIPT_INFO;
