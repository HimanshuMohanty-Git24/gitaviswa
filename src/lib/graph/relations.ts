import type { NodeLabel, RelationType } from "@/lib/types";

export type RelationGroup = "structure" | "lexical" | "curated" | "personal";

interface RelationMeta {
  verb: string;
  inverse: string;
  group: RelationGroup;
  /** Dijkstra cost for the Sutra Tracer (lower = preferred bridge). */
  pathCost: number;
  /** Signal strength when GraphRAG expands through this relation. */
  rag: number;
}

export const RELATIONS: Record<RelationType, RelationMeta> = {
  BELONGS_TO: { verb: "belongs to", inverse: "contains", group: "structure", pathCost: 3, rag: 0.15 },
  NEXT_VERSE: { verb: "flows into", inverse: "follows", group: "structure", pathCost: 2.5, rag: 0.35 },
  NEXT_CHAPTER: { verb: "leads into", inverse: "follows", group: "structure", pathCost: 3, rag: 0.1 },
  SPOKE: { verb: "speaks", inverse: "is spoken by", group: "structure", pathCost: 7, rag: 0.03 },
  NARRATED: { verb: "narrates", inverse: "is narrated by", group: "structure", pathCost: 7, rag: 0.03 },
  ADDRESSES: { verb: "addresses", inverse: "is addressed by", group: "structure", pathCost: 5, rag: 0.05 },
  MENTIONS_CHARACTER: { verb: "names", inverse: "is named in", group: "lexical", pathCost: 5, rag: 0.08 },
  MENTIONS_CONCEPT: { verb: "speaks of", inverse: "is spoken of in", group: "lexical", pathCost: 1.8, rag: 0.45 },
  DEFINES_CONCEPT: { verb: "defines", inverse: "is defined in", group: "curated", pathCost: 1, rag: 1 },
  EXPOUNDS: { verb: "expounds", inverse: "is expounded in", group: "curated", pathCost: 2.2, rag: 0.25 },
  MENTIONS_STATE: { verb: "names the state of", inverse: "is named in", group: "lexical", pathCost: 1.8, rag: 0.45 },
  DEPICTS_STATE: { verb: "portrays", inverse: "is portrayed in", group: "curated", pathCost: 1.2, rag: 0.8 },
  HEALS: { verb: "heals", inverse: "is healed by", group: "curated", pathCost: 1, rag: 1 },
  CULTIVATES: { verb: "cultivates", inverse: "is cultivated by", group: "curated", pathCost: 1, rag: 0.9 },
  CAUSES_STATE: { verb: "gives rise to", inverse: "arises from", group: "curated", pathCost: 1, rag: 0.9 },
  ANTIDOTE_TO: { verb: "is the antidote to", inverse: "is remedied by", group: "curated", pathCost: 1, rag: 1 },
  ADDRESSES_DILEMMA: { verb: "speaks to", inverse: "is answered by", group: "curated", pathCost: 1, rag: 1 },
  EVOKES_STATE: { verb: "evokes", inverse: "is evoked by", group: "curated", pathCost: 1.2, rag: 0.8 },
  RESOLVED_THROUGH: { verb: "is resolved through", inverse: "resolves", group: "curated", pathCost: 1.2, rag: 0.8 },
  ANSWERS_QUESTION_IN: { verb: "answers the question of", inverse: "is answered by", group: "curated", pathCost: 1, rag: 0.85 },
  ECHOES_VERSE: { verb: "is echoed in", inverse: "echoes", group: "curated", pathCost: 1, rag: 0.8 },
  CULMINATES_IN: { verb: "culminates in", inverse: "is the culmination of", group: "curated", pathCost: 1.3, rag: 0.6 },
  FEELS: { verb: "feels", inverse: "is felt in", group: "personal", pathCost: 1, rag: 1 },
  FACES: { verb: "faces", inverse: "is faced in", group: "personal", pathCost: 1, rag: 1 },
  RESONATES_WITH: { verb: "resonates with", inverse: "resonates with", group: "personal", pathCost: 1, rag: 1 },
  // Personal connections are the person's own: costly as bridges between public ideas, and never used to rank
  // public retrieval (retrieve() also stops at personal nodes so their text can't reach a model's context).
  CONNECTS_TO: { verb: "connects to", inverse: "is connected in", group: "personal", pathCost: 4, rag: 0 },
  ASKS_ABOUT: { verb: "asks about", inverse: "is asked about in", group: "personal", pathCost: 4, rag: 0 },
  QUESTIONS: { verb: "questions", inverse: "is questioned in", group: "personal", pathCost: 4, rag: 0 },
  REMINDS_OF: { verb: "is reminded of", inverse: "comes to mind in", group: "personal", pathCost: 4, rag: 0 },
  RESPONDS_TO: { verb: "responds to", inverse: "has a later response in", group: "personal", pathCost: 4, rag: 0 },
};

export const RELATION_GROUPS: Record<RelationGroup, { label: string; sa: string; hint: string }> = {
  structure: { label: "Structure", sa: "संरचना", hint: "Chapters, reading order and who speaks each verse" },
  lexical: { label: "Word matches", sa: "शब्द", hint: "A Sanskrit term for the idea appears in the verse" },
  curated: { label: "Curated links", sa: "सूत्र", hint: "Dialogues, thematic threads, causal chains and healing relations" },
  personal: { label: "My reflections", sa: "मनस्", hint: "Connections from your saved thoughts (stored locally). Faint lines are suggestions you haven't confirmed." },
};

export interface LabelMeta {
  plural: string;
  sa: string;
  dark: string;
  light: string;
}

// Colours mirror lib/graph/palette.ts (NODE_HEX). Prefer nodeVar()/nodeHex() there for anything theme-aware.
export const LABELS: Record<NodeLabel, LabelMeta> = {
  Chapter: { plural: "Chapters", sa: "अध्याय", dark: "#e3a44b", light: "#9a5a0c" },
  Verse: { plural: "Verses", sa: "श्लोक", dark: "#9c9488", light: "#8f887d" },
  SanskritConcept: { plural: "Concepts", sa: "तत्त्व", dark: "#3987e5", light: "#2a78d6" },
  Emotion: { plural: "Mental states", sa: "भाव", dark: "#d95926", light: "#eb6834" },
  Character: { plural: "Characters", sa: "पात्र", dark: "#ddd6ca", light: "#4a453e" },
  LifeDilemma: { plural: "Life situations", sa: "सङ्कट", dark: "#9085e9", light: "#6250d6" },
  PersonalThought: { plural: "My reflections", sa: "मनस्", dark: "#f4f1eb", light: "#1b1a17" },
};

export const HEALING_DARK = "#199e70";
export const HEALING_LIGHT = "#1baf7a";

export const edgeKey = (e: { type: string; source: string; target: string }) => `${e.type}|${e.source}|${e.target}`;
