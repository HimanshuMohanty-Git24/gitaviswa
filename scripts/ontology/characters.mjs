// Speaker / Character nodes.
//   (Character)-[:SPOKE]->(Verse)              from uvāca headings (+ curated override for Duryodhana's speech, 1.3–11)
//   (Verse)-[:MENTIONS_CHARACTER {epithet}]->(Character)   from padaccheda glosses (e.g. "pārtha—Arjun, the son of Pritha")

export const CHARACTERS = [
  { id: "krishna", sa: "श्रीकृष्ण", iast: "śrīkṛṣṇa", en: "Sri Krishna", role: "The Divine Teacher, charioteer of Arjuna",
    desc: "Speaker of the Gita — 'Śrī Bhagavān' — revealed as the Supreme Person (15.18) and as the cosmic form (Ch. 11).",
    side: "pandava", gloss: /\b(Shree )?Krishna\b|Lord Krishna/, speakerKey: "भगवान" },
  { id: "arjuna", sa: "अर्जुन", iast: "arjuna", en: "Arjuna", role: "The Seeker, Pandava warrior-prince",
    desc: "Third Pandava, the archer of the Gāṇḍīva. His collapse (Ch. 1) and questions frame the whole dialogue; his last words are 'my delusion is gone' (18.73).",
    side: "pandava", gloss: /\bArjun\b/, speakerKey: "अर्जुन" },
  { id: "sanjaya", sa: "सञ्जय", iast: "sañjaya", en: "Sanjaya", role: "The Narrator, seer by Vyasa's grace",
    desc: "Dhritarashtra's charioteer, granted divine sight by Vyasa to narrate the battle; he closes the Gita in rapture (18.74–78).",
    side: "neutral", gloss: /\bSanjay\b/, speakerKey: "सञ्जय|संजय" },
  { id: "dhritarashtra", sa: "धृतराष्ट्र", iast: "dhṛtarāṣṭra", en: "Dhritarashtra", role: "The Blind King",
    desc: "The blind Kuru king whose single question — 'what did my sons and the sons of Pandu do?' (1.1) — opens the Gita.",
    side: "kaurava", gloss: /\bDhritarashtra\b(?!’s|'s)/, speakerKey: "धृतराष्ट्र" },
  { id: "duryodhana", sa: "दुर्योधन", iast: "duryodhana", en: "Duryodhana", role: "Kaurava crown prince",
    desc: "Eldest son of Dhritarashtra. Surveying the armies, he addresses Drona with anxious bravado (1.3–11).",
    side: "kaurava", gloss: /\bDuryodhan/ },
  { id: "bhishma", sa: "भीष्म", iast: "bhīṣma", en: "Bhishma", role: "Grandsire, Kaurava commander",
    desc: "The grand old man of the Kurus, bound by his vow; his lion-roar and conch begin the battle (1.12).",
    side: "kaurava", gloss: /\bBheeshma\b|grand old man of the Kuru/ },
  { id: "drona", sa: "द्रोण", iast: "droṇa", en: "Dronacharya", role: "Preceptor of both armies",
    desc: "Arjuna's own teacher in arms, now on the opposing side — whom Arjuna asks how he can strike (2.4).",
    side: "kaurava", gloss: /\bDronacharya\b|\bDrona\b/ },
  { id: "karna", sa: "कर्ण", iast: "karṇa", en: "Karna", role: "Kaurava champion, son of the charioteer",
    desc: "The great archer, unknowingly Arjuna's elder brother; seen entering the cosmic mouths in 11.26.",
    side: "kaurava", gloss: /\bKarna?\b/ },
  { id: "bhima", sa: "भीम", iast: "bhīma", en: "Bhima", role: "Second Pandava",
    desc: "The mighty Vṛkodara, who blows the great conch Pauṇḍra (1.15).",
    side: "pandava", gloss: /\bBheem\b/ },
  { id: "yudhishthira", sa: "युधिष्ठिर", iast: "yudhiṣṭhira", en: "Yudhishthira", role: "Eldest Pandava, the Dharma-king",
    desc: "Son of Kunti, who blows the conch Anantavijaya (1.16).",
    side: "pandava", gloss: /\bYudhishthir/ },
  { id: "vyasa", sa: "व्यास", iast: "vyāsa", en: "Ved Vyasa", role: "Composer of the Mahabharata",
    desc: "The sage-poet by whose grace Sanjaya heard this supreme yoga (18.75); Krishna names himself 'Vyāsa among sages' (10.37).",
    side: "neutral", gloss: /\bVed Vyas\b|\bVyas\b/ },
  { id: "vivasvan", sa: "विवस्वान्", iast: "vivasvān", en: "Vivasvan (Sun)", role: "First recipient of the yoga",
    desc: "'I taught this imperishable yoga to Vivasvān; Vivasvān told it to Manu; Manu to Ikṣvāku' (4.1) — the lineage of the teaching.",
    side: "lineage", gloss: /\bVivasvan\b|\bSun-god\b|\bsun-god\b/ },
  { id: "manu", sa: "मनु", iast: "manu", en: "Manu", role: "Progenitor of humankind",
    desc: "Second link in the lineage of the yoga (4.1); the Manus are born of Krishna's mind (10.6).",
    side: "lineage", gloss: /\bManus?\b/ },
  { id: "ikshvaku", sa: "इक्ष्वाकु", iast: "ikṣvāku", en: "Ikshvaku", role: "First king of the Solar dynasty",
    desc: "Third link in the lineage — 'thus handed down in succession, the royal sages knew it' (4.1–2).",
    side: "lineage", gloss: /\bIkshvaku\b/ },
  { id: "drupada", sa: "द्रुपद", iast: "drupada", en: "Drupada & Dhrishtadyumna", role: "Panchala king and his son, the Pandava commander",
    desc: "Duryodhana points out 'the son of Drupada, your wise disciple' who arrayed the Pandava host (1.3).",
    side: "pandava", gloss: /\bDrupad\b|\bDhrishtadyumn/ },
  { id: "abhimanyu", sa: "अभिमन्यु", iast: "abhimanyu", en: "Abhimanyu (Saubhadra)", role: "Son of Arjuna and Subhadra",
    desc: "The mighty-armed son of Subhadra who blows his conch with the Pandava heroes (1.6, 1.18).",
    side: "pandava", gloss: /\bAbhimanyu\b|son of Subhadra/ },
];

/** Who speaks each verse: uvāca heading carries forward until the next heading. */
export const SPEAKER_OVERRIDES = [
  // Sanjaya narrates (1.2) that Duryodhana approached Drona and spoke — 1.3–11 are Duryodhana's words.
  { range: ["1.3", "1.11"], speaker: "duryodhana", narratedBy: "sanjaya" },
  // 1.21 opens with Sanjaya's half-line ("hṛṣīkeśaṃ tadā vākyam idam āha mahīpate") before Arjuna's words;
  // tradition (Arjuna 84 / Sanjaya 41) credits the verse to Sanjaya, the dataset's heading to Arjuna — we record both.
  { range: ["1.21", "1.21"], speaker: "arjuna", narratedBy: "sanjaya" },
];

/** Who each speaker addresses (used for (Character)-[:ADDRESSES]->(Character)). */
export const LISTENERS = {
  krishna: "arjuna",
  arjuna: "krishna",
  sanjaya: "dhritarashtra",
  dhritarashtra: "sanjaya",
  duryodhana: "drona",
};
