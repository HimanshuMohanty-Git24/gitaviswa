import type { CommentaryEntry } from "@/lib/types";

/**
 * The interpretive traditions (darśanas / sampradāyas) the bundled commentaries come from, with a neutral one-line
 * account of how each reads the Gita. Commentator ids follow public/data/commentary: 1 to 16 from gita/gita, 101 to 104
 * the English and Hindi translations added by scripts/build-commentary-extras.mjs.
 */
export type TraditionId = "advaita" | "vishishtadvaita" | "dvaita" | "shuddhadvaita" | "kashmir-shaiva" | "modern";

export interface Tradition {
  id: TraditionId;
  name: string;
  /** Chip label. */
  short: string;
  /** Founding teacher and period, for orientation. */
  teacher: string;
  /** How this school reads the Gita, in plain words. */
  lens: string;
  /** CSS colour for the tradition's mark (reuses node-kind tokens so both themes stay legible). */
  color: string;
}

export const TRADITIONS: Tradition[] = [
  {
    id: "advaita",
    name: "Advaita Vedānta",
    short: "Advaita",
    teacher: "Śaṅkara, 8th century",
    lens: "Non-dual: the Self and Brahman are one and the world of many is appearance. The Gita leads from selfless work, which purifies the mind, to the knowledge that frees.",
    color: "var(--n-concept)",
  },
  {
    id: "vishishtadvaita",
    name: "Viśiṣṭādvaita Vedānta",
    short: "Viśiṣṭādvaita",
    teacher: "Rāmānuja, 11th to 12th century",
    lens: "Qualified non-dual: souls and the world are real and form the body of God, Nārāyaṇa. Work and knowledge serve devotion, and the Gita's heart is surrender to him.",
    color: "var(--n-healing)",
  },
  {
    id: "dvaita",
    name: "Dvaita Vedānta",
    short: "Dvaita",
    teacher: "Madhva, 13th century",
    lens: "Dualist: God, souls and matter are eternally distinct. Kṛṣṇa as Viṣṇu is supreme, and freedom comes through devotion and his grace.",
    color: "var(--n-afflictive)",
  },
  {
    id: "shuddhadvaita",
    name: "Śuddhādvaita (Puṣṭimārga)",
    short: "Śuddhādvaita",
    teacher: "Vallabha, 15th to 16th century",
    lens: "Pure non-dual: the world is a real expression of Kṛṣṇa, not an illusion. The path is loving devotion nourished by his grace (puṣṭi).",
    color: "var(--n-dilemma)",
  },
  {
    id: "kashmir-shaiva",
    name: "Kashmir Śaivism",
    short: "Kashmir Śaiva",
    teacher: "Abhinavagupta, 10th to 11th century",
    lens: "Tantric Śaiva non-dualism: everything is the free consciousness of Śiva, and freedom is recognising it. Abhinavagupta often reads verses for their inner, yogic sense.",
    color: "var(--n-chapter)",
  },
  {
    id: "modern",
    name: "Modern teachers",
    short: "Modern",
    teacher: "20th century",
    lens: "Teachers writing for today's readers, mostly within Vedānta: practical, devotional and close to daily life.",
    color: "var(--n-character)",
  },
];

export const traditionById = (id: TraditionId) => TRADITIONS.find((t) => t.id === id)!;

export interface Commentator {
  tradition: TraditionId;
  /** Display name with diacritics. */
  name: string;
  work?: string;
  /** Translator, when the text shown is a translation of the original commentary. */
  translator?: string;
  note?: string;
}

export const COMMENTATORS: Record<number, Commentator> = {
  1: { tradition: "modern", name: "Swami Rāmsukhdās", work: "Sādhaka-sañjīvanī", note: "Devotional Vedānta, Gita Press" },
  2: { tradition: "modern", name: "Swami Chinmayānanda", work: "Commentary", note: "Advaita, Chinmaya Mission" },
  3: { tradition: "advaita", name: "Ānandagiri", work: "Ṭīkā on Śaṅkara's bhāṣya" },
  4: { tradition: "advaita", name: "Dhanapati", work: "Bhāṣyotkarṣa-dīpikā" },
  5: { tradition: "dvaita", name: "Madhva", work: "Gītā-bhāṣya" },
  6: { tradition: "advaita", name: "Nīlakaṇṭha", work: "Bhāva-dīpa" },
  7: { tradition: "vishishtadvaita", name: "Rāmānuja", work: "Gītā-bhāṣya" },
  8: { tradition: "advaita", name: "Śrīdhara Svāmī", work: "Subodhinī", note: "Advaita with a strong devotional turn" },
  9: { tradition: "vishishtadvaita", name: "Vedānta Deśika", work: "Tātparya-candrikā, on Rāmānuja" },
  10: { tradition: "kashmir-shaiva", name: "Abhinavagupta", work: "Gītārtha-saṅgraha" },
  11: { tradition: "dvaita", name: "Jayatīrtha", work: "Prameya-dīpikā, on Madhva" },
  12: { tradition: "advaita", name: "Madhusūdana Sarasvatī", work: "Gūḍhārtha-dīpikā" },
  13: { tradition: "shuddhadvaita", name: "Puruṣottama", work: "Amṛta-taraṅgiṇī" },
  14: { tradition: "advaita", name: "Śaṅkara", work: "Gītā-bhāṣya" },
  15: { tradition: "shuddhadvaita", name: "Vallabha", work: "Tattva-dīpikā" },
  16: { tradition: "modern", name: "Swami Śivānanda", work: "Commentary", note: "Vedānta and yoga, Divine Life Society" },
  101: { tradition: "advaita", name: "Śaṅkara", work: "Gītā-bhāṣya", translator: "Swami Gambirananda" },
  102: { tradition: "advaita", name: "Śaṅkara", work: "Gītā-bhāṣya", translator: "Harikrishnadas Goenka" },
  103: { tradition: "vishishtadvaita", name: "Rāmānuja", work: "Gītā-bhāṣya", translator: "Swami Adidevananda" },
  104: { tradition: "kashmir-shaiva", name: "Abhinavagupta", work: "Gītārtha-saṅgraha", translator: "Dr. S. Sankaranarayan" },
};

export type CommentaryLang = CommentaryEntry["lang"];
export const LANG_NAME: Record<CommentaryLang, string> = { en: "English", hi: "Hindi", sa: "Sanskrit" };

/** What to show for an entry, falling back to the data file's own fields for ids this table doesn't know. */
export function commentatorOf(e: CommentaryEntry): Commentator {
  const known = COMMENTATORS[e.authorId];
  if (known) return { ...known, translator: e.translator || known.translator };
  return { tradition: "modern", name: e.author.replace(/^(Sri|Swami|Shri|Dr\.) /, ""), work: e.work, translator: e.translator };
}

/** Commentaries that read aloud well after a verse, for the player's menu: English and Hindi only. */
export const SPOKEN_COMMENTARIES: { authorId: number; lang: "en" | "hi" }[] = [
  { authorId: 16, lang: "en" },
  { authorId: 101, lang: "en" },
  { authorId: 103, lang: "en" },
  { authorId: 104, lang: "en" },
  { authorId: 1, lang: "hi" },
  { authorId: 2, lang: "hi" },
  { authorId: 102, lang: "hi" },
];

export const spokenLabel = (authorId: number) => {
  const c = COMMENTATORS[authorId];
  const lang = SPOKEN_COMMENTARIES.find((s) => s.authorId === authorId)?.lang;
  return c ? `${c.name}${lang ? `, ${LANG_NAME[lang]}` : ""}` : `Commentary ${authorId}`;
};
