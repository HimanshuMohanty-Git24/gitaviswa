import { bfsFromNode } from "graphology-traversal";
import type { Chain, Dialogue, GraphData, GraphNode, RelationType, Verse, VersesDoc } from "@/lib/types";
import { RELATIONS } from "@/lib/graph/relations";
import type { GitaGraphs } from "@/lib/graph/graphStore";
import { describeNode } from "@/lib/graph/pathfinder";
import { routeText } from "./router";
import { searchIndex, type SearchIndex } from "./search";
import { detectCrisis } from "./safety";

export interface RagContext {
  graphs: GitaGraphs;
  versesById: Map<string, Verse>;
  versesDoc: VersesDoc;
  data: GraphData;
  index: SearchIndex | null;
}

export interface RankedItem {
  id: string;
  score: number;
  reasons: string[];
}

export interface Retrieval {
  query: string;
  crisis: boolean;
  seeds: { id: string; score: number; via: string }[];
  verses: RankedItem[];
  concepts: RankedItem[];
  emotions: RankedItem[];
  dilemmas: RankedItem[];
  chains: Chain[];
  dialogues: Dialogue[];
  subgraph: { nodes: string[]; edges: string[] };
  searchMode: string;
  timings: { search: number; traverse: number; total: number };
  context: string;
}

const HUB_DEGREE = 60;
const SPEAKER_NAME: Record<string, string> = { krishna: "Śrī Kṛṣṇa", arjuna: "Arjuna", sanjaya: "Sañjaya", dhritarashtra: "Dhṛtarāṣṭra", duryodhana: "Duryodhana" };

/** Separates a relation from its curated explanation in a retrieval reason ("heals Krodha (Anger): …"). */
export const WHY_SEP = ": ";
/** The most explanatory reason: one that carries a curated "why", else the first. */
export const bestReason = (reasons: string[]) => reasons.find((x) => x.includes(WHY_SEP)) || reasons[0];

function reasonFor(g: GitaGraphs, type: RelationType, node: string, other: string, outgoing: boolean, why?: string) {
  const meta = RELATIONS[type];
  const otherLabel = describeNode(g.nodeById.get(other));
  const base = `${outgoing ? meta.verb : meta.inverse} ${otherLabel}`;
  return why ? `${base}${WHY_SEP}${why}` : base;
}

/**
 * Hybrid GraphRAG retrieval.
 *   1. Seeds from deterministic semantic routing (lexicons, explicit refs) + Orama BM25 / hybrid vector search.
 *   2. 2-hop breadth-first expansion over the graph (hubs are reached but not expanded), scoring each node by
 *      the strongest relation that reached it, damped by depth and degree.
 *   3. Rank verses / concepts / states / dilemmas, attach causal chains & dialogues, and cut the induced subgraph
 *      that the UI highlights on the 2D/3D canvas.
 */
export async function retrieve(
  ctx: RagContext,
  query: string,
  opts: { vector?: number[] | null; extraSeeds?: { id: string; score: number; via: string }[]; limitVerses?: number } = {},
): Promise<Retrieval> {
  const t0 = performance.now();
  const g = ctx.graphs;
  const has = (id: string) => g.graph.hasNode(id);
  const route = routeText(query, ctx.data.nodes, has);

  const seeds = new Map<string, { id: string; score: number; via: string }>();
  const addSeed = (id: string, score: number, via: string) => {
    if (!has(id) || score <= 0) return;
    const s = seeds.get(id);
    if (s) s.score += score * 0.7;
    else seeds.set(id, { id, score, via });
  };
  const norm = <T extends { score: number }>(arr: T[]) => {
    const max = Math.max(1, ...arr.map((r) => r.score));
    return arr.map((r) => ({ ...r, s: r.score / max }));
  };

  route.verses.forEach((id) => addSeed(id, 3, "referenced directly"));
  route.chapters.forEach((c) => addSeed(`CH_${c}`, 1.2, "chapter referenced"));
  norm(route.emotions).forEach((r) => addSeed(r.id, 1.6 * r.s + 0.4, `you mentioned “${r.cues[0]}”`));
  norm(route.dilemmas).forEach((r) => addSeed(r.id, 1.6 * r.s + 0.4, `situation cue “${r.cues[0]}”`));
  norm(route.concepts).forEach((r) => addSeed(r.id, 1.3 * r.s + 0.3, `concept cue “${r.cues[0]}”`));
  route.characters.forEach((r) => addSeed(r.id, 0.4, `names ${r.cues[0]}`));
  opts.extraSeeds?.forEach((s) => addSeed(s.id, s.score, s.via));

  let searchMode = "graph-only";
  let searchMs = 0;
  if (ctx.index) {
    const { hits, mode, ms } = await searchIndex(ctx.index, query, { limit: 14, vector: opts.vector });
    searchMode = mode;
    searchMs = ms;
    hits.forEach((h, rank) => addSeed(h.id, (h.kind === "verse" ? 1.1 : 0.85) / (1 + rank * 0.3), mode === "hybrid" ? "semantic + BM25 match" : mode === "devanagari" ? "Sanskrit text match" : "BM25 text match"));
  }

  // ── Step 2 · 2-hop traversal ────────────────────────────────────────────────────────────────
  const t1 = performance.now();
  const scores = new Map<string, { score: number; reasons: string[] }>();
  const credit = (id: string, s: number, reason: string) => {
    const r = scores.get(id) || { score: 0, reasons: [] };
    r.score += s;
    if (r.reasons.length < 4 && !r.reasons.includes(reason)) r.reasons.push(reason);
    scores.set(id, r);
  };

  // Personal thoughts are walls: they never shape public retrieval, and their text (via a reason such as
  // "connects to <thought>") can never end up in a context that is sent to a language model.
  const personal = (id: string) => g.nodeById.get(id)?.type === "PersonalThought";
  for (const seed of seeds.values()) {
    if (personal(seed.id)) continue;
    credit(seed.id, seed.score, seed.via);
    const depthOf = new Map<string, number>();
    bfsFromNode(g.path, seed.id, (node, _attr, depth) => {
      if (depth > 0 && personal(node)) return true;
      depthOf.set(node, depth);
      if (depth >= 2) return true;
      if (depth >= 1 && g.path.degree(node) > HUB_DEGREE) return true;
      return false;
    });
    for (const [node, d] of depthOf) {
      if (d === 0) continue;
      let best = 0;
      let bestType: RelationType | null = null;
      let bestOther = "";
      let bestOutgoing = true;
      let bestWhy: string | undefined;
      g.graph.forEachEdge(node, (_key, attr, source, target) => {
        const other = source === node ? target : source;
        if (depthOf.get(other) !== d - 1) return;
        const w = RELATIONS[attr.type].rag;
        if (w > best) {
          best = w;
          bestType = attr.type;
          bestOther = other;
          bestOutgoing = source === node;
          bestWhy = typeof attr.props?.why === "string" ? attr.props.why : undefined;
        }
      });
      if (!bestType) continue;
      const damp = 1 + Math.log10(1 + g.path.degree(node)) * 0.35;
      credit(node, (seed.score * best * (d === 1 ? 0.6 : 0.22)) / damp, reasonFor(g, bestType, node, bestOther, bestOutgoing, d === 1 ? bestWhy : undefined));
    }
  }
  const traverseMs = performance.now() - t1;

  const ranked = (type: GraphNode["type"], n: number) =>
    [...scores.entries()]
      .filter(([id]) => g.nodeById.get(id)?.type === type)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, n)
      .map(([id, r]) => ({ id, score: Number(r.score.toFixed(3)), reasons: r.reasons }));

  let verses = ranked("Verse", opts.limitVerses ?? 7);
  for (const id of route.verses.slice().reverse()) {
    if (!verses.some((v) => v.id === id)) verses = [{ id, score: 99, reasons: ["referenced directly"] }, ...verses].slice(0, Math.max(opts.limitVerses ?? 7, route.verses.length));
  }
  const concepts = ranked("SanskritConcept", 4);
  const emotions = ranked("Emotion", 4);
  const dilemmas = ranked("LifeDilemma", 3);

  const focus = new Set([...verses, ...concepts, ...emotions, ...dilemmas].map((x) => x.id));
  const chains = ctx.data.chains
    .map((c) => ({ c, overlap: c.steps.filter((s) => focus.has(s)).length + c.verses.filter((v) => focus.has(v)).length * 1.5 }))
    .filter((x) => x.overlap >= 1.5)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 2)
    .map((x) => x.c);
  const dialogues = ctx.data.dialogues.filter((d) => verses.some((v) => d.anchor === v.id || d.qVerses.includes(v.id) || d.aVerses.slice(0, 3).includes(v.id))).slice(0, 2);

  const nodeSet = new Set<string>([...focus, ...[...seeds.values()].sort((a, b) => b.score - a.score).slice(0, 6).map((s) => s.id)]);
  for (const c of chains) c.steps.forEach((s) => nodeSet.add(s));
  const edgesOut: string[] = [];
  for (const id of nodeSet) {
    if (!has(id)) continue;
    g.graph.forEachOutEdge(id, (key, attr, _s, target) => {
      if (nodeSet.has(target) && attr.type !== "NEXT_VERSE") edgesOut.push(key);
    });
  }

  const result: Retrieval = {
    query,
    crisis: detectCrisis(query),
    seeds: [...seeds.values()].sort((a, b) => b.score - a.score).slice(0, 10),
    verses,
    concepts,
    emotions,
    dilemmas,
    chains,
    dialogues,
    subgraph: { nodes: [...nodeSet].filter(has), edges: edgesOut },
    searchMode,
    timings: { search: searchMs, traverse: traverseMs, total: performance.now() - t0 },
    context: "",
  };
  result.context = buildContext(ctx, result);
  return result;
}

function verseBlock(ctx: RagContext, id: string, reasons: string[]) {
  const v = ctx.versesById.get(id);
  if (!v) return "";
  const def = String(ctx.versesDoc.meta.defaults.en);
  const en = v.translations.en?.[def] || Object.values(v.translations.en || {})[0] || "";
  const alt = v.translations.en?.["21"];
  const speaker = SPEAKER_NAME[v.speaker] || v.speaker;
  return [
    `[BG ${v.ref}] — spoken by ${speaker}${v.canonical ? "" : " (non-canonical verse found in some recensions)"}`,
    `  Sanskrit: ${v.sanskrit.join(" ")}`,
    `  IAST: ${v.iast.join(" ")}`,
    `  Translation (Swami Sivananda): ${en.replace(/\s+/g, " ").slice(0, 600)}`,
    alt ? `  Translation (Purohit Swami): ${alt.replace(/\s+/g, " ").slice(0, 400)}` : "",
    reasons.length ? `  Why retrieved: ${reasons.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildContext(ctx: RagContext, r: Retrieval): string {
  const n = (id: string) => ctx.graphs.nodeById.get(id);
  const out: string[] = ["# Retrieved knowledge-graph context (GitaViswa GraphRAG)"];
  if (r.emotions.length) {
    out.push("\n## Mental states (Emotion nodes)");
    for (const e of r.emotions) {
      const x = n(e.id);
      if (x?.type === "Emotion") out.push(`[Emotion: ${x.label}] ${x.sa} — ${x.en} (${x.valence}). ${x.desc} Modern parallel: ${x.modern}.`);
    }
  }
  if (r.dilemmas.length) {
    out.push("\n## Life situations (LifeDilemma nodes)");
    for (const d of r.dilemmas) {
      const x = n(d.id);
      if (x?.type === "LifeDilemma") out.push(`[Dilemma: ${x.label}] ${x.desc}`);
    }
  }
  if (r.concepts.length) {
    out.push("\n## Concepts (SanskritConcept nodes)");
    for (const c of r.concepts) {
      const x = n(c.id);
      if (x?.type === "SanskritConcept") out.push(`[Concept: ${x.label}] ${x.sa} — ${x.en}. ${x.desc}`);
    }
  }
  out.push("\n## Verses");
  for (const v of r.verses) out.push(verseBlock(ctx, v.id, v.reasons));
  if (r.chains.length) {
    out.push("\n## Causal chains");
    for (const c of r.chains) out.push(`${c.title} (${c.verses.map((v) => v.replace("BG_", "BG ")).join(", ")}): ${c.summary} Steps: ${c.steps.map((s) => n(s)?.label || s).join(" → ")}.`);
  }
  if (r.dialogues.length) {
    out.push("\n## Dialogue structure");
    for (const d of r.dialogues) out.push(`Question at ${d.anchor.replace("BG_", "BG ")} (${d.asker}): “${d.question}” → answered in BG ${d.a}. ${d.theme}`);
  }
  return out.join("\n");
}

const PRACTICE: Record<string, string> = {
  "concept:nishkama-karma": "Before your next task, name the part you control (the effort) and consciously release the part you don't (the result). Do the work as an offering.",
  "concept:samatva": "When praise or blame, gain or loss arrives today, pause one breath and say inwardly: “this, too, comes and goes.”",
  "concept:abhyasa": "Sit for five minutes. Each time attention wanders, notice and gently bring it back. The returning *is* the practice.",
  "concept:vairagya": "Pick one small craving today and simply watch it rise and fall without feeding it.",
  "concept:dhyana": "Find a quiet seat, keep the spine steady, and rest attention on the breath, “like a lamp in a windless place.”",
  "concept:indriya-nigraha": "Notice the first flicker of a craving and wait ten slow breaths before acting. The ladder of 2.62 breaks at its first rung.",
  "concept:atman": "Write down one quality of the person you love that was never merely physical. The Gita locates what is real beyond the body.",
  "concept:yukta": "For one week, audit sleep, food, work and rest. The Gita prescribes moderation, not heroics.",
  "concept:sharanagati": "Act fully on what is yours to do, then consciously hand over what is not yours to carry.",
  "concept:svadharma": "List the work that feels natural to you even when it is hard. That is the seed of svadharma.",
  "concept:bhakti": "Offer one ordinary act today with love: “a leaf, a flower, a fruit, a little water.”",
  "concept:jnana": "Ask of the thing that troubles you: what here is changing, and what in me is only witnessing the change?",
  "concept:karma-yoga": "Choose one duty you've been avoiding and do it for its own sake, as skilfully as you can.",
  "emotion:krodha": "When anger rises, trace it back one step: which desire was just blocked?",
  "emotion:chanchalata": "Give the mind one anchor, the breath at the nostrils, and return to it without scolding yourself.",
  "emotion:shoka": "Let grief be held, not hurried. Read 2.20 slowly, aloud, once a day this week.",
  "emotion:bhaya": "Name the fear precisely, then name the one action within your control. Do only that.",
  "emotion:samshaya": "Cut one doubt with one small, concrete action today.",
};

/** Zero-key answer composed deterministically from the retrieved subgraph (works fully offline). */
export function composeOfflineAnswer(ctx: RagContext, r: Retrieval): string {
  const n = (id: string) => ctx.graphs.nodeById.get(id);
  const lines: string[] = [];
  const topE = r.emotions.map((e) => n(e.id)).find((x) => x?.type === "Emotion" && x.valence === "afflictive");
  const topD = r.dilemmas[0] ? n(r.dilemmas[0].id) : undefined;
  const topC = r.concepts[0] ? n(r.concepts[0].id) : undefined;

  if (topE?.type === "Emotion") {
    lines.push(`What you describe resonates with **${topE.label}** (${topE.sa}), ${topE.en.toLowerCase()} [Emotion: ${topE.label}]. ${topE.desc}`);
  } else if (topD?.type === "LifeDilemma") {
    lines.push(`This touches a situation the Gita addresses directly: **${topD.label}** [Dilemma: ${topD.label}]. ${topD.desc}`);
  } else if (topC?.type === "SanskritConcept") {
    lines.push(`**${topC.label}** (${topC.sa}), *${topC.en}* [Concept: ${topC.label}]. ${topC.desc}`);
  } else {
    lines.push("Here is what the knowledge graph surfaces for your question.");
  }
  if (topD?.type === "LifeDilemma" && topE) lines.push(`It also maps onto **${topD.label}** [Dilemma: ${topD.label}].`);

  lines.push("\n### What the Gita offers");
  const def = String(ctx.versesDoc.meta.defaults.en);
  for (const v of r.verses.slice(0, 4)) {
    const verse = ctx.versesById.get(v.id);
    if (!verse) continue;
    const t = (verse.translations.en?.[def] || "").replace(/\s+/g, " ");
    const short = t.length > 260 ? t.slice(0, 257).replace(/\s+\S*$/, "") + "…" : t;
    const why = bestReason(v.reasons);
    lines.push(`- **[BG ${verse.ref}]** *${verse.iast[0]?.replace(/[|]/g, "").trim()}*: “${short}”${why ? `\n  <small>${why}</small>` : ""}`);
  }

  const chain = r.chains[0];
  if (chain) {
    lines.push(`\n### The inner mechanics: ${chain.title}`);
    lines.push(`${chain.summary}`);
    lines.push(chain.steps.map((s) => n(s)?.label || s).join(" → "));
  }

  const practiceKey = [...r.concepts.map((c) => c.id), ...r.emotions.map((e) => e.id)].find((id) => PRACTICE[id]);
  if (practiceKey) {
    const p = n(practiceKey);
    lines.push(`\n### A contemplation for today`);
    lines.push(`${PRACTICE[practiceKey]}${p && p.type === "SanskritConcept" ? ` [Concept: ${p.label}]` : ""}`);
  }
  lines.push(
    `\n<small>Composed offline from ${r.subgraph.nodes.length} connected points in ${r.timings.total.toFixed(0)} ms. Connect a language model in Settings for a written answer.</small>`,
  );
  return lines.join("\n");
}
