/** Diacritic-insensitive ASCII folding: "Niṣkāma Karma" → "nishkama karma", "kṣetra" → "kshetra". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ṣ|ś/g, "sh")
    .replace(/ṛ/g, "ri")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/shh/g, "sh")
    .replace(/[’'`]/g, "");
}

export const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);

const STOP = new Set(
  "a an the and or but if then so of to in on at by for with about from as is are was were be been being it its this that these those i me my we our you your he she they them their what which who whom how why when where do does did can could should would will shall may might must not no yes very just than too also into over under again more most some any each other such only own same both few all there here gita bhagavad verse verses chapter krishna arjuna says say said tell explain".split(
    " ",
  ),
);

export function keywords(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Whole-phrase match on folded text with word boundaries. */
export function phraseIn(text: string, phrase: string): boolean {
  const p = fold(phrase).trim();
  if (!p) return false;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(text);
}
