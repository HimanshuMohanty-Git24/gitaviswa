import type { CommentaryEntry } from "@/lib/types";

/**
 * Preparing commentary text to be read aloud by the device's own voice (Web Speech). Pure, unit-tested.
 * Browsers cut off or stall very long utterances, so text is read in sentence-sized chunks.
 */

/** The text a voice should read: no word-by-word gloss lists, no stray Devanagari in English, no verse numbers. */
export function speechText(e: Pick<CommentaryEntry, "text" | "lang">): string {
  let t = e.text.replace(/\r/g, "");
  if (e.lang === "en") {
    // Swami Sivananda opens with a word-by-word gloss ("कर्मणि in work? एव only? …") before "Commentary".
    const k = t.search(/\bCommentary\b/);
    if (k > 0 && k < t.length * 0.7) t = t.slice(k + "Commentary".length);
    t = t
      .replace(/[ऀ-ॿ]+/g, " ") // Devanagari inside English text would be read as noise
      .replace(/\?(?=\s+[a-z(])/g, ",") // the source uses "?" where the print edition had dashes
      .replace(/\[[^\]]*\]/g, " ");
  } else {
    t = t.replace(/--+/g, ", ").replace(/।।/g, "।");
  }
  return t
    .replace(/^\s*[।|]*\s*\d+\s*\.\s*\d+\s*[।|]*\s*/, "")
    .replace(/\b\d+\.\d+\b/g, (m) => m.replace(".", " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into chunks of at most `max` characters, preferring sentence ends, then commas, then spaces. */
export function chunkText(text: string, max = 220): string[] {
  const sentences = text.split(/(?<=[.!?;।॥])\s+/).filter((s) => s.trim());
  const out: string[] = [];
  const push = (s: string) => {
    if (s.length <= max) return void out.push(s);
    const parts = s.split(/(?<=[,:])\s+/);
    let cur = "";
    for (const p of parts) {
      if ((cur + " " + p).trim().length <= max) cur = (cur + " " + p).trim();
      else {
        if (cur) out.push(cur);
        if (p.length <= max) cur = p;
        else {
          // No punctuation to break on: cut at spaces.
          let rest = p;
          while (rest.length > max) {
            const cut = rest.lastIndexOf(" ", max);
            const at = cut > max * 0.5 ? cut : max;
            out.push(rest.slice(0, at).trim());
            rest = rest.slice(at).trim();
          }
          cur = rest;
        }
      }
    }
    if (cur) out.push(cur);
  };
  let acc = "";
  for (const s of sentences) {
    const next = acc ? `${acc} ${s}` : s;
    if (next.length <= max) acc = next;
    else {
      if (acc) out.push(acc);
      acc = "";
      if (s.length <= max) acc = s;
      else push(s);
    }
  }
  if (acc) out.push(acc);
  return out.filter((c) => c.trim().length > 0);
}

export interface VoiceLike {
  lang: string;
  name: string;
  localService?: boolean;
}

/** Best available voice: Indian English for English, Hindi for Hindi and Sanskrit (Devanagari). Natural voices first. */
export function pickVoice<V extends VoiceLike>(voices: V[], lang: "en" | "hi" | "sa"): V | null {
  const natural = (v: V) => /natural|neural|online|enhanced|premium/i.test(v.name);
  const rank = (list: V[]) => [...list].sort((a, b) => Number(natural(b)) - Number(natural(a)))[0] ?? null;
  const by = (re: RegExp) => voices.filter((v) => re.test(v.lang.replace("_", "-")));
  if (lang === "en") return rank(by(/^en-IN/i)) || rank(by(/^en-GB/i)) || rank(by(/^en/i));
  if (lang === "sa") return rank(by(/^sa/i)) || rank(by(/^hi/i)) || rank(by(/^mr/i));
  return rank(by(/^hi/i));
}
