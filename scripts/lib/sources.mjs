// Public, open-source Bhagavad Gita data sources — ordered mirrors per file.
// Primary: gita/gita (The Gita Initiative, Unlicense) — 701 entries (700 canonical + 13.1 Arjuna's question).
// Mirror:  praneshp1org/Bhagavad-Gita-JSON-data — a verbatim re-publication of the same dataset.
// Supplemental per-verse fallback: vedicscriptures/bhagavad-gita (per-śloka JSON with many commentaries).

const GH = (repo, branch, file) => [
  `https://raw.githubusercontent.com/${repo}/${branch}/${file}`,
  `https://github.com/${repo}/raw/${branch}/${file}`,
  `https://cdn.jsdelivr.net/gh/${repo}@${branch}/${file}`,
];

const gitaFile = (file) => [
  ...GH("gita/gita", "main", `data/${file}`),
  ...GH("praneshp1org/Bhagavad-Gita-JSON-data", "main", file),
  ...GH("praneshp1org/Bhagavad-Gita-JSON-data", "master", file),
];

export const SOURCES = {
  verses: gitaFile("verse.json"),
  chapters: gitaFile("chapters.json"),
  translations: gitaFile("translation.json"),
  commentaries: gitaFile("commentary.json"),
  authors: gitaFile("authors.json"),
};

export const VEDIC_SCRIPTURES_SLOK = (c, v) => [
  `https://raw.githubusercontent.com/vedicscriptures/bhagavad-gita/main/slok/bhagavadgita_chapter_${c}_slok_${v}.json`,
  `https://vedicscriptures.github.io/slok/${c}/${v}/`,
];

// Ranges on holy-bhagavad-gita.org where multiple verses share a single composite recitation.
export const VERSE_AUDIO_RANGES = [
  [1, 4, 6], [1, 16, 18], [1, 21, 22], [1, 29, 31], [1, 32, 33],
  [1, 34, 35], [1, 36, 37], [1, 38, 39], [1, 45, 46], [2, 42, 43],
  [3, 1, 2], [3, 20, 21], [4, 29, 30], [5, 8, 9], [5, 27, 28],
  [6, 12, 13], [6, 24, 25], [6, 41, 42], [8, 1, 2], [8, 9, 10],
  [8, 23, 26], [9, 7, 8], [9, 16, 17], [10, 4, 5], [10, 12, 13],
  [10, 16, 17], [11, 10, 11], [11, 26, 27], [11, 28, 29], [11, 41, 42],
  [11, 52, 53], [12, 3, 4], [12, 6, 7], [12, 13, 14], [12, 18, 19],
  [13, 8, 12], [14, 3, 4], [14, 11, 13], [14, 14, 15], [14, 22, 23],
  [14, 24, 25], [15, 3, 4], [16, 1, 3], [16, 13, 15], [16, 19, 20],
  [17, 5, 6], [17, 26, 27], [18, 15, 16], [18, 51, 53],
];

// Per-verse Sanskrit recitation (Swami Mukundananda's holy-bhagavad-gita.org, same 701-verse numbering).
export const VERSE_AUDIO = (c, v) => {
  const match = VERSE_AUDIO_RANGES.find(([ch, start, end]) => ch === c && v >= start && v <= end);
  const part = match
    ? `${String(match[1]).padStart(3, "0")}-${String(match[2]).padStart(3, "0")}`
    : String(v).padStart(3, "0");
  return [
    `https://www.holy-bhagavad-gita.org/media/audios/${String(c).padStart(3, "0")}_${part}.mp3`,
  ];
};

// Chapter-length open recitations on archive.org (fallback for continuous chapter mode).
export const ARCHIVE_ITEMS = [
  { id: "bhagavad-gita-chanting", match: (name, c) => new RegExp(`^\\d+_CHAPTER-${c}\\.mp3$`, "i").test(name) },
  {
    id: "Gita_Chanting",
    match: (name, c) => new RegExp(`^${String(c).padStart(2, "0")}_.*Yog`, "i").test(name),
  },
];

export const SOURCE_CREDITS = [
  { name: "The Gita Initiative — gita/gita", url: "https://github.com/gita/gita", license: "Unlicense" },
  { name: "Bhagavad-Gita-JSON-data (mirror)", url: "https://github.com/praneshp1org/Bhagavad-Gita-JSON-data", license: "see repository" },
  { name: "vedicscriptures/bhagavad-gita (supplemental)", url: "https://github.com/vedicscriptures/bhagavad-gita", license: "GPL-3.0" },
  { name: "Holy Bhagavad Gita (Swami Mukundananda) — verse recitations", url: "https://www.holy-bhagavad-gita.org", license: "streamed from source" },
  { name: "Internet Archive — Bhagavad Gita Chanting", url: "https://archive.org/details/bhagavad-gita-chanting", license: "see item" },
];
