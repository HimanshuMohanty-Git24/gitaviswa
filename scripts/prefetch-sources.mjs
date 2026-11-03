#!/usr/bin/env node
// Warm `.cache/sources/` with every remote source the knowledge-graph build needs.
// `npm run data` calls the same fetchers, so running this first is optional.
import { fetchJson, fetchArchiveItem } from "./lib/net.mjs";
import { SOURCES, ARCHIVE_ITEMS } from "./lib/sources.mjs";

const isArray = (min) => (d) => (Array.isArray(d) && d.length >= min ? true : `expected array ≥ ${min}`);

const jobs = [
  ["verse.json", SOURCES.verses, isArray(700)],
  ["chapters.json", SOURCES.chapters, isArray(18)],
  ["authors.json", SOURCES.authors, isArray(10)],
  ["translation.json", SOURCES.translations, isArray(4000)],
  ["commentary.json", SOURCES.commentaries, isArray(4000)],
];

for (const [name, mirrors, validate] of jobs) {
  await fetchJson(name, mirrors, { validate });
}
for (const item of ARCHIVE_ITEMS) {
  try {
    await fetchArchiveItem(item.id);
  } catch (e) {
    console.warn(`   ! archive.org ${item.id}: ${e.message}`);
  }
}
console.log("✓ all sources cached in .cache/sources");
