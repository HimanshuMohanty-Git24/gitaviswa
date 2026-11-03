// What kind of question is this? Used to tell the companion how to open its answer — explain a study question,
// acknowledge only a feeling the person actually expressed. No imports, so it runs under `node --test`.

export type AskIntent = "study" | "personal" | "general";

const FEELINGS = "anxious|worried|scared|afraid|sad|angry|upset|lost|lonely|hurt|stressed|overwhelmed|depressed|confused|guilty|ashamed|hopeless|tired|exhausted|grieving|heartbroken|frustrated|jealous|restless|stuck|happy|grateful|calm|peaceful|excited";
const EXPRESSED = new RegExp(`\\b(i feel|i felt|i'?m feeling|i am feeling|i'?ve been feeling|makes me feel|i'?m (so |very |really |quite )?(${FEELINGS})|i am (so |very |really |quite )?(${FEELINGS})|i (lost|miss) (my|a) )|\\bmujhe\\b|\\bmain (bahut )?(pareshan|udaas|dukhi)\\b`, "i");
const STUDY = /^\s*(explain|what (does|do|is|are|was|were)|who (is|was|are)|define|meaning of|compare|difference between|summari[sz]e|translate|how does|how do .* (verse|chapter|gita|krishna|arjuna)|why does|which verse|tell me about|list)\b|\b(bg\s*)?\d{1,2}\.\d{1,2}\b|\bchapter \d{1,2}\b/i;

export function askIntent(question: string): AskIntent {
  const q = question.replace(/[’`]/g, "'");
  if (EXPRESSED.test(q)) return "personal";
  if (STUDY.test(q)) return "study";
  return "general";
}

/** A short instruction appended to the retrieved context; visible, bounded, and never about the person's inner state. */
export function intentNote(intent: AskIntent): string {
  if (intent === "study") return "This is a study question. Begin by explaining it directly. Do not describe or guess the asker's feelings.";
  if (intent === "personal") return "The person has shared something personal. Acknowledge only what they actually said, tentatively, then offer the Gita's perspective as something to consider, not a verdict.";
  return "Answer the question as asked. Do not describe or guess the asker's feelings unless they stated them.";
}

/** Short, referential questions ("why?", "what about that?") lean on what was just discussed. */
export const isFollowUp = (question: string) => {
  const q = question.trim().toLowerCase();
  return q.split(/\s+/).length <= 7 || /\b(this|that|it|these|those|the verse|the above|you said|earlier)\b/.test(q) || /^(why|how|and|but|so|what about)\b/.test(q);
};
