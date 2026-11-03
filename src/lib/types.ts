// Shared domain types for the GitaViswa knowledge graph (mirrors scripts/build-gita-knowledge-graph.mjs output).

export type NodeLabel = "Chapter" | "Verse" | "Character" | "SanskritConcept" | "Emotion" | "LifeDilemma" | "PersonalThought";

export type RelationType =
  | "BELONGS_TO" | "NEXT_VERSE" | "NEXT_CHAPTER" | "SPOKE" | "NARRATED" | "ADDRESSES" | "MENTIONS_CHARACTER"
  | "MENTIONS_CONCEPT" | "DEFINES_CONCEPT" | "EXPOUNDS" | "MENTIONS_STATE" | "DEPICTS_STATE" | "HEALS" | "CULTIVATES"
  | "CAUSES_STATE" | "ANTIDOTE_TO" | "ADDRESSES_DILEMMA" | "EVOKES_STATE" | "RESOLVED_THROUGH" | "ANSWERS_QUESTION_IN"
  | "ECHOES_VERSE" | "CULMINATES_IN" | "FEELS" | "FACES" | "RESONATES_WITH";

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

export interface CommentaryDoc {
  id: string; ref: string;
  commentaries: { authorId: number; author: string; school?: string; lang: "en" | "hi" | "sa"; text: string }[];
}

export interface PersonalThought {
  id: string;
  text: string;
  createdAt: number;
  intensity: number;
  emotions: { id: string; score: number }[];
  dilemmas: { id: string; score: number }[];
  verses: { id: string; score: number; why?: string }[];
  reflection?: string;
  enrichedBy?: string;
}

export type ViewMode = "cosmos" | "darshana" | "adhyayana" | "manas";
