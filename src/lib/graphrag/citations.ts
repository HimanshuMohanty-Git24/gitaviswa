import type { GraphNode } from "@/lib/types";
import { fold } from "./text";

export interface Citation {
  raw: string;
  label: string;
  kind: "verse" | "concept" | "emotion" | "dilemma" | "character" | "chapter" | "unknown";
  ids: string[];
}

/** Matches [BG 2.47], [BG 2.55-72], [Concept: Nishkama Karma], [Emotion: Vishada], [Dilemma: …], [Character: …], [Chapter 2] */
export const CITATION_RE = /\[(BG\s*\d{1,2}\.\d{1,2}(?:\s*[-–]\s*\d{1,2})?|(?:Concept|Emotion|State|Dilemma|Character|Chapter)\s*:?\s*[^\]\n]{1,64})\]/g;

export function resolveCitation(raw: string, nodes: GraphNode[], verseExists: (id: string) => boolean): Citation {
  const inner = raw.replace(/^\[|\]$/g, "").trim();
  const bg = inner.match(/^BG\s*(\d{1,2})\.(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/i);
  if (bg) {
    const c = Number(bg[1]);
    const a = Number(bg[2]);
    const b = bg[3] ? Number(bg[3]) : a;
    const ids: string[] = [];
    for (let v = a; v <= Math.min(b, a + 30); v++) if (verseExists(`BG_${c}.${v}`)) ids.push(`BG_${c}.${v}`);
    return { raw, label: `BG ${c}.${a}${b !== a ? `–${b}` : ""}`, kind: ids.length ? "verse" : "unknown", ids };
  }
  const ch = inner.match(/^Chapter\s*:?\s*(\d{1,2})/i);
  if (ch) return { raw, label: `Chapter ${ch[1]}`, kind: "chapter", ids: [`CH_${Number(ch[1])}`] };

  const m = inner.match(/^(Concept|Emotion|State|Dilemma|Character)\s*:?\s*(.+)$/i);
  if (!m) return { raw, label: inner, kind: "unknown", ids: [] };
  const want = m[1].toLowerCase();
  const type = want === "concept" ? "SanskritConcept" : want === "emotion" || want === "state" ? "Emotion" : want === "dilemma" ? "LifeDilemma" : "Character";
  const kind = (type === "SanskritConcept" ? "concept" : type === "Emotion" ? "emotion" : type === "LifeDilemma" ? "dilemma" : "character") as Citation["kind"];
  const name = fold(m[2].replace(/\(.*?\)/g, "")).trim();
  const pool = nodes.filter((n) => n.type === type);
  const score = (n: GraphNode) => {
    const names = [n.label, "iast" in n ? n.iast : "", "en" in n ? n.en : "", n.id.split(":")[1] || ""].map((x) => fold(String(x)).replace(/-/g, " "));
    if (names.some((x) => x === name)) return 3;
    if (names.some((x) => x && (x.startsWith(name) || name.startsWith(x)))) return 2;
    if (names.some((x) => x && (x.includes(name) || name.includes(x)))) return 1;
    return 0;
  };
  const best = pool.map((n) => [n, score(n)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])[0];
  return best ? { raw, label: best[0].label, kind, ids: [best[0].id] } : { raw, label: m[2].trim(), kind: "unknown", ids: [] };
}

export function extractCitations(text: string, nodes: GraphNode[], verseExists: (id: string) => boolean): Citation[] {
  const seen = new Map<string, Citation>();
  for (const m of text.matchAll(CITATION_RE)) {
    if (!seen.has(m[0])) seen.set(m[0], resolveCitation(m[0], nodes, verseExists));
  }
  return [...seen.values()];
}
