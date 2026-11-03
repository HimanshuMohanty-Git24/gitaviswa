// Reflect's offline connection suggestions. Every candidate carries a plain reason the person can check:
// a word they used, a verse they named, or a curated graph relation from one of those to a verse. Verses that only
// share wording are kept apart and labelled as such, and a feeling is never attributed to the writer unless they
// stated it themselves (see mentions.ts).
import type { ConnectionCandidate, GraphNode, RelationType, ThoughtSuggestions } from "@/lib/types";
import { neighbors } from "@/lib/graph/graphStore";
import type { RagContext } from "./engine";
import { routeText } from "./router";
import { searchIndex } from "./search";
import { fold, keywords } from "./text";
import { classifyMention, combineMentions } from "./mentions";

/** How a verse relates to a theme, in reading language ("heals" and "antidote" stay out of personal suggestions). */
const VERSE_VIA: Partial<Record<RelationType, { phrase: string; rank: number }>> = {
  ADDRESSES_DILEMMA: { phrase: "Speaks to", rank: 1 },
  DEFINES_CONCEPT: { phrase: "Explains", rank: 1 },
  HEALS: { phrase: "Offers a perspective on", rank: 0.95 },
  CULTIVATES: { phrase: "Speaks of", rank: 0.9 },
  DEPICTS_STATE: { phrase: "Portrays", rank: 0.8 },
  MENTIONS_STATE: { phrase: "Names", rank: 0.4 },
  MENTIONS_CONCEPT: { phrase: "Mentions", rank: 0.4 },
};

export function themeLabel(n: GraphNode | undefined): string {
  if (!n) return "";
  if (n.type === "Verse") return `BG ${n.ref}`;
  if (n.type === "Emotion" || n.type === "SanskritConcept") return `${n.label} (${n.en.toLowerCase()})`;
  if (n.type === "PersonalThought") return `“${n.label}”`;
  return n.label;
}

/**
 * A stored reason in reading language. Older entries carry retrieval wording ("BM25 text match", "heals Kāma");
 * mechanics are dropped and "heals" becomes "offers a perspective on".
 */
export function plainReason(why: string | undefined): string {
  if (!why || /BM25|semantic|text match/i.test(why)) return "";
  return why
    .replace(/^heals /, "Offers a perspective on ")
    .replace(/^is the antidote to /, "Offers another view of ")
    .replace(/^referenced directly$/, "You referred to this verse")
    .replace(/^you mentioned /, "Your words mention ")
    .replace(/^(situation|concept) cue /, "Your words touch on ");
}

const MAX_THEMES = 4;
const MAX_RELATED_VERSES = 4;
const MAX_WORD_VERSES = 3;

export async function suggestConnections(ctx: RagContext, text: string): Promise<ThoughtSuggestions> {
  const g = ctx.graphs;
  const has = (id: string) => g.graph.hasNode(id);
  const route = routeText(text, ctx.data.nodes, has);
  const folded = fold(text);
  const out: ConnectionCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: ConnectionCandidate) => {
    if (seen.has(c.targetId) || !has(c.targetId)) return;
    seen.add(c.targetId);
    out.push(c);
  };

  // 1 · verses the person named
  for (const id of route.verses) push({ targetId: id, basis: "named", why: "You referred to this verse", score: 1, origin: "local" });

  // 2 · themes in their own words: states of mind, situations, concepts. Denied ones are dropped; only a feeling the
  //     writer states in the first person is described as theirs.
  const themes: ConnectionCandidate[] = [];
  const addThemes = (rs: { id: string; score: number; cues: string[] }[], kind: "emotion" | "dilemma" | "concept") => {
    const max = Math.max(0.0001, ...rs.map((x) => x.score));
    for (const r of rs) {
      const kinds = r.cues.map((c) => classifyMention(folded, fold(c)));
      const how = combineMentions(kinds);
      if (how === "negated" || !has(r.id)) continue;
      // Quote the word that decided it: the expressed one, else one that wasn't denied.
      const cue = r.cues[kinds.indexOf(how === "expressed" ? "expressed" : "mentioned")] ?? r.cues[0];
      const expressed = kind === "emotion" && how === "expressed";
      const why = expressed ? `You wrote about feeling “${cue}”` : kind === "dilemma" ? `Your words touch on “${cue}”` : `Your words mention “${cue}”`;
      themes.push({ targetId: r.id, basis: expressed ? "expressed" : "named", why, cue, score: Number((r.score / max).toFixed(2)), origin: "local" });
    }
  };
  addThemes(route.emotions.slice(0, 3), "emotion");
  addThemes(route.dilemmas.slice(0, 2), "dilemma");
  addThemes(route.concepts.slice(0, 3), "concept");
  const kept = themes.sort((a, b) => Number(b.basis === "expressed") - Number(a.basis === "expressed") || b.score - a.score).slice(0, MAX_THEMES);
  kept.forEach(push);

  // 3 · verses one curated step from those themes, each with the relation and its curated note as the reason
  const related: ConnectionCandidate[] = [];
  for (const th of kept) {
    const node = g.nodeById.get(th.targetId);
    const via = neighbors(g, th.targetId, (x) => !x.outgoing && x.node.type === "Verse" && !!VERSE_VIA[x.type])
      .map((x) => ({ x, rank: VERSE_VIA[x.type]!.rank + (typeof x.props?.why === "string" ? 0.05 : 0) }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 2);
    for (const { x, rank } of via) {
      const note = typeof x.props?.why === "string" ? `: ${x.props.why}` : "";
      related.push({ targetId: x.id, basis: "related", why: `${VERSE_VIA[x.type]!.phrase} ${themeLabel(node)}${note}`, score: Number((rank * th.score).toFixed(2)), origin: "local" });
    }
  }
  related.sort((a, b) => b.score - a.score).slice(0, MAX_RELATED_VERSES * 2).forEach((c) => {
    if (out.filter((o) => o.basis === "related").length < MAX_RELATED_VERSES) push(c);
  });

  // 4 · verses that only share wording: explained by the shared words, and shown apart from the rest
  if (ctx.index) {
    const { hits, mode } = await searchIndex(ctx.index, text, { kinds: ["verse"], limit: 8 });
    const mine = new Set(keywords(text));
    let n = 0;
    for (const h of hits) {
      if (n >= MAX_WORD_VERSES || seen.has(h.id)) continue;
      const v = ctx.versesById.get(h.id);
      if (!v) continue;
      const theirs = new Set(keywords([...Object.values(v.translations.en || {}), ...v.padaccheda.map((p) => p.m)].join(" ")));
      const shared = [...mine].filter((w) => theirs.has(w)).slice(0, 3);
      if (!shared.length && mode !== "hybrid") continue;
      push({ targetId: h.id, basis: "words", why: shared.length ? `Shares the word${shared.length > 1 ? "s" : ""} ${shared.map((w) => `“${w}”`).join(", ")}` : "Similar in wording or meaning", score: 0.2, origin: "local" });
      n++;
    }
  }

  return { forText: text, createdAt: Date.now(), candidates: out };
}

/**
 * A short, tentative perspective composed from the candidates. It describes the text's themes; it does not tell the
 * person what they feel, unless they said so, and it never presents a verse as an instruction.
 */
export function offlinePerspective(ctx: RagContext, s: ThoughtSuggestions): string {
  const node = (id: string) => ctx.graphs.nodeById.get(id);
  const parts: string[] = [];
  const felt = s.candidates.find((c) => c.basis === "expressed");
  const themes = s.candidates.filter((c) => (c.basis === "named" || c.basis === "expressed") && !c.targetId.startsWith("BG_") && c !== felt);
  const f = felt && node(felt.targetId);
  if (f && f.type === "Emotion") parts.push(`You wrote about feeling “${felt.cue}”. A word the Gita uses for something close to it is **${f.label}**, ${f.en.toLowerCase()}.`);
  if (themes.length) parts.push(`${f ? "Your words also touch on" : "Your words touch on"} ${themes.slice(0, 3).map((c) => `**${themeLabel(node(c.targetId))}**`).join(", ")}.`);
  const verse = s.candidates.find((c) => c.targetId.startsWith("BG_") && c.basis !== "words");
  const v = verse && ctx.versesById.get(verse.targetId);
  if (v) {
    const en = (v.translations.en?.[String(ctx.versesDoc.meta.defaults.en)] || "").replace(/\s+/g, " ").trim();
    parts.push(`One passage to read alongside it is **[BG ${v.ref}]**: “${en.length > 220 ? `${en.slice(0, 220).trimEnd()}…` : en}” It is one moment in a longer dialogue, so it reads best in its chapter.`);
  }
  return parts.join("\n\n");
}
