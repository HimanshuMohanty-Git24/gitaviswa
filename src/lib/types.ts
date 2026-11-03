// Shared domain types for the GitaViswa knowledge graph (mirrors scripts/build-gita-knowledge-graph.mjs output).

export type NodeLabel = "Chapter" | "Verse" | "Character" | "SanskritConcept" | "Emotion" | "LifeDilemma" | "PersonalThought";

export type RelationType =
  | "BELONGS_TO" | "NEXT_VERSE" | "NEXT_CHAPTER" | "SPOKE" | "NARRATED" | "ADDRESSES" | "MENTIONS_CHARACTER"
  | "MENTIONS_CONCEPT" | "DEFINES_CONCEPT" | "EXPOUNDS" | "MENTIONS_STATE" | "DEPICTS_STATE" | "HEALS" | "CULTIVATES"
  | "CAUSES_STATE" | "ANTIDOTE_TO" | "ADDRESSES_DILEMMA" | "EVOKES_STATE" | "RESOLVED_THROUGH" | "ANSWERS_QUESTION_IN"
  | "ECHOES_VERSE" | "CULMINATES_IN" | "FEELS" | "FACES" | "RESONATES_WITH"
  // personal connections (schema 3); FEELS / FACES / RESONATES_WITH are the retired schema ≤2 personal relations
  | "CONNECTS_TO" | "ASKS_ABOUT" | "QUESTIONS" | "REMINDS_OF" | "RESPONDS_TO";

export interface GraphNodeBase {
  id: string;
  type: NodeLabel;
  label: string;
}
export interface ChapterNode extends GraphNodeBase {
  type: "Chapter"; number: number; name: string; iast: string; title: string; meaning: string; verseCount: number; summary: string;
}
export interface VerseNode extends GraphNodeBase {
  type: "Verse"; ref: string; chapter: number; verse: number; speaker: string; canonical: boolean; meter: string; sa: string; snippet: string;
}
export interface CharacterNode extends GraphNodeBase {
  type: "Character"; sa: string; iast: string; role: string; desc: string; side: string; versesSpoken: number;
}
export interface ConceptNode extends GraphNodeBase {
  type: "SanskritConcept"; sa: string; iast: string; en: string; category: string; desc: string;
}
export interface EmotionNode extends GraphNodeBase {
  type: "Emotion"; sa: string; iast: string; en: string; valence: "afflictive" | "healing"; guna: string; desc: string; modern: string; lexicon: string[];
}
export interface DilemmaNode extends GraphNodeBase {
  type: "LifeDilemma"; sa: string; desc: string; keywords: string[];
}
export interface PersonalThoughtNode extends GraphNodeBase {
  type: "PersonalThought"; text: string; createdAt: number;
}
export type GraphNode = ChapterNode | VerseNode | CharacterNode | ConceptNode | EmotionNode | DilemmaNode | PersonalThoughtNode;

export interface GraphEdge {
  source: string;
  target: string;
  type: RelationType;
  weight?: number;
  props?: Record<string, unknown> & { terms?: string[]; why?: string; threads?: string[]; dialogues?: string[]; chains?: string[]; verses?: string[]; epithets?: string[] };
}

export interface Thread { id: string; title: string; color: string; verses: string[]; note: string }
export interface Dialogue {
  id: string; question: string; asker: string; q: string; a: string; anchor: string; theme: string; qVerses: string[]; aVerses: string[];
}
export interface Chain { id: string; title: string; summary: string; verses: string[]; steps: string[] }

export interface GraphData {
  meta: { name: string; version: string; generatedAt: string; numbering: string; sources: { name: string; url: string; license: string }[] };
  schema: { nodeLabels: Record<string, string>; relations: Record<string, string> };
  categories: Record<string, string>;
  threads: Thread[];
  dialogues: Dialogue[];
  chains: Chain[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { nodes: number; edges: number; byLabel: Record<string, number>; byRelation: Record<string, number> };
}

export interface Author { id: number; name: string; lang: "en" | "hi" | "sa"; kind: "translation" | "commentary" | "both"; school?: string; work?: string }

export interface ChapterAudio { url: string; duration: number | null; source: string; title: string }
export interface Chapter {
  id: string; number: number; name: string; iast: string; transliterated: string; title: string; meaning: string; verseCount: number;
  summary: { en: string; hi: string }; audio: ChapterAudio[];
}

export interface PadaWord { w: string; m: string; k: string[] }

export interface Verse {
  id: string; ref: string; chapter: number; verse: number; order: number; canonical: boolean;
  speaker: string; narratedBy?: string;
  uvacha: { sa: string; iast: string; tr: string | null } | null;
  sanskrit: string[]; iast: string[]; transliteration: string[];
  padaccheda: PadaWord[];
  meter: { name: string; family: string; syllables: number; scansion: string[] };
  audio: { verse: string[]; chapterFrac: number };
  translations: { en: Record<string, string>; hi: Record<string, string> };
  commentaryAuthors: number[];
}

export interface VersesDoc {
  meta: { name: string; version: string; generatedAt: string; numbering: string; defaults: { en: number; hi: number }; audioNote: string };
  authors: Author[];
  chapters: Chapter[];
  verses: Verse[];
}

export interface CommentaryEntry {
  authorId: number; author: string; school?: string; lang: "en" | "hi" | "sa"; text: string;
  /** Present when the text is a translation of the original commentary. */
  translator?: string; work?: string;
  /** Dataset the text came from, when not gita/gita. */
  source?: string;
  /** The commentator did not comment on this verse (the text is the dataset's note saying so). */
  none?: boolean;
  /** The commentator treats this verse under another one, e.g. "BG_10.42". */
  seeAlso?: string;
}

export interface CommentaryDoc {
  id: string; ref: string;
  commentaries: CommentaryEntry[];
}

/** How a thought relates to something. Chosen by the person; suggestions default to "relates_to". */
export type ConnectionRelation = "relates_to" | "asks_about" | "questions" | "reminds_me_of" | "responds_to";
export type ConnectionStatus = "suggested" | "accepted" | "rejected";
/** user: chosen by the person · local: suggested offline from the graph · ai: suggested by a language model ·
 *  legacy: made automatically by schema ≤2 Reflect and never explicitly reviewed. */
export type ConnectionOrigin = "user" | "local" | "ai" | "legacy";

export interface PersonalConnection {
  id: string;
  /** Graph node id: a verse (BG_2.47), concept, state, situation, or another thought (thought:<id>). */
  targetId: string;
  relation: ConnectionRelation;
  status: ConnectionStatus;
  origin: ConnectionOrigin;
  /** Plain-language reason it was suggested. */
  why?: string;
  createdAt: number;
  updatedAt?: number;
}

/** Where the writing began. Context, not an endorsement of any meaning. */
export type ThoughtOrigin = { kind: "free" } | { kind: "verse"; verseId: string } | { kind: "ask"; question: string; citedNodeIds: string[] } | { kind: "thought"; thoughtId: string };

type LegacyLink = { id: string; score: number; why?: string };

export interface PersonalThought {
  id: string;
  /** Record schema version. Absent on entries saved before versioning (schema 1). */
  v?: number;
  /** The person's own words as saved — always the source of truth; suggestions never rewrite it. */
  text: string;
  createdAt: number;
  updatedAt?: number;
  /** Optional self-reported heaviness, 1–5. Present only when the person chose one. */
  checkIn?: number;
  /** Heaviness recorded by schema-1 Reflect, which preselected 3 ("Heavy"). Kept as history, never read as a choice. */
  intensity?: number;
  /** Connections with status and provenance (schema 3). Zero is a complete, valid thought. */
  connections: PersonalConnection[];
  origin?: ThoughtOrigin;
  /** Schema ≤2 automatic mapping, kept unchanged as history; migrated into `connections` as unreviewed suggestions. */
  emotions?: { id: string; score: number }[];
  dilemmas?: { id: string; score: number }[];
  verses?: LegacyLink[];
  /** Generated interpretation (offline or AI), separate from the person's words. */
  reflection?: string;
  enrichedBy?: string;
  /** Earlier wordings, oldest first, each with the time it was replaced. Editing never discards writing. */
  revisions?: { text: string; until: number }[];
}

/** A thought in "Recently deleted": restorable until the person empties it. */
export interface DeletedThought {
  thought: PersonalThought;
  deletedAt: number;
}

/** What made a candidate plausible: the person named or expressed it, the graph relates it, an AI proposed it, or only shared wording. */
export type CandidateBasis = "expressed" | "named" | "related" | "ai" | "words";

export interface ConnectionCandidate {
  targetId: string;
  basis: CandidateBasis;
  /** Plain-language reason, shown to the person. */
  why: string;
  /** The person's own word that matched, when there was one. */
  cue?: string;
  score: number;
  origin: "local" | "ai";
}

/** Suggested connections, bound to the exact text they were computed from. */
export interface ThoughtSuggestions {
  /** The trimmed text that was analysed. Once the writing differs, these are stale. */
  forText: string;
  createdAt: number;
  candidates: ConnectionCandidate[];
  reflection?: string;
  enrichedBy?: string;
}

/** A decision the person made in the composer. Kept connections survive later edits to the wording. */
export interface DraftLink {
  targetId: string;
  status: "accepted" | "rejected";
  relation: ConnectionRelation;
  origin: ConnectionOrigin;
  why?: string;
  at: number;
}

/** Unsaved writing, kept on this device while the person composes. Its id becomes the saved entry's id. */
export interface ThoughtDraft {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  checkIn?: number;
  origin?: ThoughtOrigin;
  suggestions?: ThoughtSuggestions;
  links?: DraftLink[];
  /** An answer the person chose to keep beside their own words (e.g. from Ask). Saved as generated material, never as their text. */
  aiQuote?: { text: string; by: string };
}

/** "home" is the front page at `/`; the others are the four tools (`?view=`). */
export type ViewMode = "home" | "cosmos" | "darshana" | "adhyayana" | "manas";
