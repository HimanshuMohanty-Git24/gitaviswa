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

// Per-verse Sanskrit recitation (Swami Mukundananda's holy-bhagavad-gita.org, same 701-verse numbering).
export const VERSE_AUDIO = (c, v) => [
  `https://www.holy-bhagavad-gita.org/media/audios/${String(c).padStart(3, "0")}_${String(v).padStart(3, "0")}.mp3`,
];

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
