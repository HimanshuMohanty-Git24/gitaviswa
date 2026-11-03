import type { GraphNode } from "@/lib/types";
import { fold, phraseIn } from "./text";

// Everyday-English cues → SanskritConcept ids (deterministic "semantic routing" that works offline).
const CONCEPT_CUES: Record<string, string[]> = {
  dharma: ["dharma", "righteous", "righteousness", "duty", "moral", "ethics", "right thing"],
  svadharma: ["svadharma", "swadharma", "my own path", "calling", "vocation", "purpose", "my nature"],
  karma: ["karma", "action", "actions", "work", "deeds"],
  "nishkama-karma": ["nishkama", "niskama", "detached action", "without expectation", "fruits of action", "results", "outcome", "selfless action"],
  "karma-yoga": ["karma yoga", "karmayoga", "yoga of action", "skill in action"],
  "jnana-yoga": ["jnana yoga", "gyan yoga", "path of knowledge"],
  "bhakti-yoga": ["bhakti yoga", "path of devotion"],
  jnana: ["jnana", "gyan", "knowledge", "wisdom", "understanding"],
  bhakti: ["bhakti", "devotion", "devotee", "love of god", "worship"],
  atman: ["atman", "atma", "soul", "self", "immortal", "eternal self", "true self"],
  brahman: ["brahman", "absolute", "ultimate reality"],
  paramatman: ["paramatma", "supersoul", "supreme self", "inner witness"],
  ishvara: ["ishvara", "god", "lord", "divine"],
  maya: ["maya", "illusion"],
  prakriti: ["prakriti", "nature", "matter"],
  purusha: ["purusha", "consciousness", "spirit"],
  gunas: ["guna", "gunas", "three qualities", "modes of nature"],
  sattva: ["sattva", "sattvic", "goodness", "purity"],
  rajas: ["rajas", "rajasic", "passion"],
  tamas: ["tamas", "tamasic", "inertia", "laziness", "ignorance"],
  sthitaprajna: ["sthitaprajna", "steady wisdom", "stable mind", "steady mind", "sage"],
  samatva: ["samatva", "equanimity", "balance", "even minded", "evenness", "stability"],
  yoga: ["yoga"],
  dhyana: ["dhyana", "meditation", "meditate"],
  abhyasa: ["abhyasa", "practice", "habit", "consistency"],
  vairagya: ["vairagya", "detachment", "dispassion", "letting go", "let go"],
  "indriya-nigraha": ["senses", "sense control", "self control", "self-control", "discipline"],
  manas: ["mind", "thoughts", "mental"],
  buddhi: ["intellect", "discernment", "judgement", "judgment", "decision"],
  yajna: ["yajna", "sacrifice", "offering", "service"],
  tapas: ["tapas", "austerity", "discipline"],
  dana: ["charity", "giving", "donation", "generosity"],
  tyaga: ["tyaga", "renounce", "renunciation of fruits"],
  sannyasa: ["sannyasa", "renunciation", "renounce the world", "monk"],
  moksha: ["moksha", "mukti", "liberation", "freedom", "enlightenment", "salvation"],
  nirvana: ["nirvana"],
  samsara: ["samsara", "cycle of birth", "birth and death"],
  punarjanma: ["rebirth", "reincarnation", "past life", "next life", "afterlife"],
  sharanagati: ["surrender", "refuge", "let god"],
  "ananya-bhakti": ["undivided", "single minded devotion", "one pointed"],
  anugraha: ["grace", "blessing", "mercy"],
  smarana: ["remember", "remembrance", "time of death", "last thoughts"],
  vishvarupa: ["vishvarupa", "vishwaroopa", "cosmic form", "universal form", "virat"],
  vibhuti: ["vibhuti", "glories", "divine manifestations", "opulence"],
  kala: ["time", "destroyer of worlds"],
  avatara: ["avatar", "avatara", "incarnation", "descent", "whenever dharma declines"],
  om: ["om", "aum", "omkar"],
  lokasangraha: ["welfare of the world", "lead by example", "role model", "society"],
  yukta: ["moderation", "balanced life", "sleep", "diet", "eating", "rest"],
  svabhava: ["temperament", "inherent nature", "personality"],
  ahimsa: ["non-violence", "nonviolence", "ahimsa"],
  satya: ["truth", "truthfulness", "honesty", "lying"],
  "daivi-sampat": ["divine qualities", "virtues", "good qualities"],
  "asuri-sampat": ["demonic", "toxic traits", "evil", "arrogance"],
  kshetra: ["field", "body and soul", "knower of the field"],
  akshara: ["imperishable", "eternal"],
  sankhya: ["sankhya", "analysis"],
  vedas: ["veda", "vedas", "scripture", "rituals"],
  "shraddha-traya": ["kinds of faith", "three types of faith"],
  varna: ["caste", "varna"],
  prana: ["breath", "breathing", "pranayama"],
  akarma: ["inaction", "doing nothing"],
  ajnana: ["ignorance"],
};

export interface Routed {
  id: string;
  score: number;
  cues: string[];
}

export interface RouteResult {
  emotions: Routed[];
  dilemmas: Routed[];
  concepts: Routed[];
  characters: Routed[];
  verses: string[];
  chapters: number[];
}

const sortTop = (m: Map<string, Routed>, n: number) => [...m.values()].sort((a, b) => b.score - a.score).slice(0, n);

/**
 * Deterministic semantic routing: maps free text (questions, journal entries) onto Emotion, LifeDilemma,
 * SanskritConcept and Character nodes using curated lexicons, plus explicit verse/chapter references.
 */
export function routeText(text: string, nodes: GraphNode[], verseExists: (id: string) => boolean): RouteResult {
  const t = " " + fold(text) + " ";
  const emotions = new Map<string, Routed>();
  const dilemmas = new Map<string, Routed>();
  const concepts = new Map<string, Routed>();
  const characters = new Map<string, Routed>();
  const bump = (m: Map<string, Routed>, id: string, s: number, cue: string) => {
    const r = m.get(id) || { id, score: 0, cues: [] };
    r.score += s;
    if (!r.cues.includes(cue)) r.cues.push(cue);
    m.set(id, r);
  };

  for (const n of nodes) {
    if (n.type === "Emotion") {
      for (const cue of n.lexicon) if (phraseIn(t, cue)) bump(emotions, n.id, 1 + cue.split(" ").length * 0.4, cue);
      if (phraseIn(t, n.iast) || phraseIn(t, n.label)) bump(emotions, n.id, 2.5, n.iast);
      for (const w of n.en.split(/[^A-Za-z]+/).filter((w) => w.length > 3)) if (phraseIn(t, w)) bump(emotions, n.id, 1.2, w.toLowerCase());
    } else if (n.type === "LifeDilemma") {
      for (const cue of n.keywords) if (phraseIn(t, cue)) bump(dilemmas, n.id, 1 + cue.split(" ").length * 0.4, cue);
    } else if (n.type === "SanskritConcept") {
      const id = n.id.slice("concept:".length);
      if (phraseIn(t, n.iast) || phraseIn(t, n.label)) bump(concepts, n.id, 2.5, n.iast);
      for (const cue of CONCEPT_CUES[id] || []) if (phraseIn(t, cue)) bump(concepts, n.id, 1 + cue.split(" ").length * 0.3, cue);
    } else if (n.type === "Character") {
      const first = fold(n.label.split(/[ (&]/)[0]);
      if (first.length > 3 && phraseIn(t, first)) bump(characters, n.id, 1, first);
    }
  }

  const verses: string[] = [];
  const refRe = /(?:^|[^\d])(\d{1,2})\s*[.:]\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?(?!\d)/g;
  for (const m of text.matchAll(refRe)) {
    const c = Number(m[1]);
    const a = Number(m[2]);
    const b = m[3] ? Number(m[3]) : a;
    if (c < 1 || c > 18) continue;
    for (let v = a; v <= Math.min(b, a + 12); v++) {
      const id = `BG_${c}.${v}`;
      if (verseExists(id) && !verses.includes(id)) verses.push(id);
    }
  }
  const chapters = [...text.matchAll(/chapter\s+(\d{1,2})/gi)].map((m) => Number(m[1])).filter((c) => c >= 1 && c <= 18);

  return {
    emotions: sortTop(emotions, 5),
    dilemmas: sortTop(dilemmas, 4),
    concepts: sortTop(concepts, 6),
    characters: sortTop(characters, 3),
    verses,
    chapters,
  };
}
