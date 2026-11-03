// How a feeling-word appears in someone's writing: as their own feeling, as something they deny, or only as a topic
// (a question about it, a quotation, someone else's state). A deliberately small heuristic — the interface words its
// suggestions tentatively either way — but it stops "I am not angry; I'm curious about anger" from becoming
// "you feel anger". Input must already be folded with text.ts `fold()`. No imports, so it runs under `node --test`.

export type MentionKind = "expressed" | "negated" | "mentioned";

const NEGATORS = new Set(["not", "no", "never", "nor", "without", "hardly", "barely", "neither", "dont", "doesnt", "didnt", "isnt", "arent", "wasnt", "werent", "cant", "cannot", "wont", "wouldnt", "aint", "nothing"]);
/** Hindi / Hinglish negation usually follows the word it negates ("gussa nahi hai"). */
const AFTER_NEGATORS = new Set(["nahi", "nahin", "nhi", "nahim", "na", "mat"]);
/** The word right before marks it as a subject of study, not a state: "curious about anger", "the concept of fear". */
const TOPIC_MARKERS = new Set(["about", "regarding", "called", "concept", "term", "word", "topic", "define", "defines", "explain", "explains", "meaning", "understand"]);
/** Someone other than the writer is the subject ("my friend is angry", "when you feel anxious", "Arjuna's grief"). */
const OTHERS = new Set(["he", "she", "they", "his", "her", "hers", "their", "theirs", "him", "them", "you", "your", "yours", "friend", "friends", "someone", "somebody", "people", "person", "others", "everyone", "arjuna", "arjunas", "krishna", "duryodhana", "sanjaya", "character", "wo", "woh", "unko", "usko", "unhe"]);
/**
 * An explicit first-person feeling frame that the cue must directly follow ("I feel worried", "I'm so tired",
 * "makes me anxious", "mujhe bahut gussa"). Possessives are deliberately absent: "my friend" is not a feeling, and a
 * bare "I" is not enough ("I wonder what anger is"). When unsure, the word is treated as mentioned, not felt.
 */
const FRAMES = ["i feel", "i felt", "i am", "im", "i m", "i was", "i get", "i got", "ive been", "i have been", "i keep feeling", "makes me", "made me", "making me", "leaves me", "feel", "feeling", "felt", "mujhe", "mujhko", "humein", "hame"];
/** At most one word may sit between frame and cue, and not one that starts a noun phrase ("I am a friend"). */
const NOT_BETWEEN = new Set(["a", "an", "the", "my", "your", "his", "her", "their", "our", "this", "that", "like", "about", "of", "for", "with"]);

const tokens = (s: string) => s.split(/[^a-z0-9]+/).filter(Boolean);
const QUOTE = /["“”«»]/;

function hasFrame(before: string[]): boolean {
  const ends = (words: string[]) => FRAMES.some((f) => ` ${words.join(" ")}`.endsWith(` ${f}`));
  if (ends(before)) return true;
  const last = before[before.length - 1];
  return !!last && !NOT_BETWEEN.has(last) && ends(before.slice(0, -1));
}

function classifyAt(before: string[], after: string[]): MentionKind {
  // Narrow scope on purpose: "not angry", "don't feel angry" are denials; "can't let the anger go" is not.
  if (before.slice(-2).some((w) => NEGATORS.has(w)) || after.slice(0, 2).some((w) => AFTER_NEGATORS.has(w))) return "negated";
  if (TOPIC_MARKERS.has(before[before.length - 1])) return "mentioned";
  if (before.some((w) => OTHERS.has(w))) return "mentioned";
  return hasFrame(before) ? "expressed" : "mentioned";
}

/**
 * Classifies every occurrence of `cue` in `text` (both folded) and combines them: any first-person occurrence makes it
 * "expressed"; if every occurrence is negated it is "negated"; otherwise "mentioned". Null when the cue is absent.
 */
export function classifyMention(text: string, cue: string): MentionKind | null {
  const want = tokens(cue);
  if (!want.length) return null;
  const kinds: MentionKind[] = [];
  // Quoted spans are someone else's words; odd-numbered segments sit inside quotation marks.
  text.split(QUOTE).forEach((segment, si) => {
    const quoted = si % 2 === 1;
    // Clauses end at sentence punctuation or a contrast ("…, but I'm curious about anger").
    for (const clause of segment.split(/[.!?;\n]+|\b(?:but|though|although|however|yet|lekin|par)\b/)) {
      const t = tokens(clause);
      for (let i = 0; i + want.length <= t.length; i++) {
        if (!want.every((w, k) => t[i + k] === w)) continue;
        kinds.push(quoted ? "mentioned" : classifyAt(t.slice(Math.max(0, i - 5), i), t.slice(i + want.length, i + want.length + 3)));
      }
    }
  });
  if (!kinds.length) return null;
  if (kinds.includes("expressed")) return "expressed";
  if (kinds.every((k) => k === "negated")) return "negated";
  return "mentioned";
}

/** Combine the classifications of several cues for the same idea. */
export function combineMentions(kinds: (MentionKind | null)[]): MentionKind | null {
  const k = kinds.filter((x): x is MentionKind => !!x);
  if (!k.length) return null;
  if (k.includes("expressed")) return "expressed";
  if (k.every((x) => x === "negated")) return "negated";
  return "mentioned";
}
