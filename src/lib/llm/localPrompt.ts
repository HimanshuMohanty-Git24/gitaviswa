// Prompt shaping for small in-browser models. They ignore long system prompts and wide context windows, so:
// verses first, minimal instructions, an explicit citation format, and a quality gate that can reject rambling.

const MAX_GROUNDS = 1800;

function section(raw: string, title: string): string[] {
  const marker = `## ${title}`;
  const start = raw.indexOf(marker);
  if (start < 0) return [];
  const rest = raw.slice(start + marker.length);
  const end = rest.search(/\n## /);
  return (end < 0 ? rest : rest.slice(0, end))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

function renderVerse(block: string[]): string {
  const ref = block[0]?.match(/^\[BG ([^\]]+)\]/)?.[1] || "";
  const translation = block.find((l) => l.startsWith("Translation (Swami Sivananda):"))?.slice("Translation (Swami Sivananda):".length).trim();
  const alt = block.find((l) => l.startsWith("Translation (Purohit Swami):"))?.slice("Translation (Purohit Swami):".length).trim();
  const why = block.find((l) => l.startsWith("Why retrieved:"))?.slice("Why retrieved:".length).trim();
  const text = translation || alt || "";
  if (!ref || !text) return "";
  return `[BG ${ref}] ${clip(text, 320)}${why ? ` (relevance: ${clip(why, 90)})` : ""}`;
}

function verses(raw: string): string[] {
  const out: string[] = [];
  let block: string[] = [];
  for (const line of section(raw, "Verses")) {
    if (line.startsWith("[BG ")) {
      if (block.length) out.push(renderVerse(block));
      block = [line];
    } else if (block.length) block.push(line);
  }
  if (block.length) out.push(renderVerse(block));
  return out.filter(Boolean);
}

const CONCEPT = /^\[Concept: ([^\]]+)\]\s*(.*)$/;
const EMOTION = /^\[Emotion: ([^\]]+)\]\s*(.*)$/;

/** Compact, verse-first grounding that fits a small model's attention. */
export function compactLocalContext(context?: string): string {
  const raw = (context || "").split(/\n\n# How to answer/i)[0].trim();
  if (!raw) return "";
  const parts: string[] = verses(raw).slice(0, 4);
  for (const line of section(raw, "Concepts (SanskritConcept nodes)")) {
    const m = line.match(CONCEPT);
    if (!m) continue;
    parts.push(`[Concept: ${m[1]}] ${clip(m[2], 180)}`);
    if (parts.length >= 7) break;
  }
  for (const line of section(raw, "Mental states (Emotion nodes)")) {
    const m = line.match(EMOTION);
    if (!m) continue;
    parts.push(`[Emotion: ${m[1]}] ${clip(m[2], 140)}`);
    break;
  }
  return (parts.filter(Boolean).join("\n") || clip(raw, MAX_GROUNDS)).slice(0, MAX_GROUNDS);
}

export function buildLocalChatPrompt(question: string, context?: string): string {
  const grounds = compactLocalContext(context);
  return [
    "You are a warm, plain-spoken guide to the Bhagavad Gita.",
    "Answer in 3 to 5 short sentences of modern English.",
    "Use only the verses and ideas below. Do not invent verses, chapters or quotations.",
    "Cite each verse you use exactly like [BG 2.47]. Do not explain your process, ask questions, or offer further help.",
    grounds ? `\nGrounding:\n${grounds}` : "",
    `\nQuestion: ${question}`,
    "\nAnswer:",
  ].join("\n");
}

/** Non-chat tasks (translate, analyse, explain a path) keep their system prompt, with the same compact material. */
export function buildLocalTaskPrompt(system: string, question: string, context?: string): string {
  const grounds = compactLocalContext(context);
  return `${system}\n\n${grounds ? `Material:\n${grounds}\n\n` : ""}${question}`;
}

const META = /(i am ready|please let me know|let me know if|i need to know|as an ai|i (?:cannot|can't) (?:assist|help)|i hope this helps|i['’]ll try my best|in this response|okay,? (?:i['’]ll|let me|i will) )/i;

/** Why a small model's chat reply should be replaced by the deterministic graph answer, if it should. */
export function ungroundedReason(text: string): string | null {
  const t = text.trim();
  if (t.length < 40) return "The model's reply was too short to use.";
  if (META.test(t)) return "The model drifted into meta-commentary instead of answering.";
  if (!/\[(?:BG|Concept|Emotion)\b/i.test(t)) return "The reply did not cite the retrieved verses.";
  return null;
}
