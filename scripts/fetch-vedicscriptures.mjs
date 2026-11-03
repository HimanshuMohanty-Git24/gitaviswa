#!/usr/bin/env node
// Download all 701 per-śloka files of vedicscriptures/bhagavad-gita (GPL-3.0) into .cache/sources/vedicscriptures/.
// Resumable: a file already on disk that parses and names its verse is kept. Bounded concurrency, retries with
// backoff, and every payload validated before it is written (raw.githubusercontent throttles per connection).
//   node scripts/fetch-vedicscriptures.mjs [--concurrency 10]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE_DIR } from "./lib/net.mjs";
import { VEDIC_SCRIPTURES_SLOK } from "./lib/sources.mjs";

export const VS_DIR = path.join(CACHE_DIR, "vedicscriptures");
export const CHAPTER_VERSE_COUNTS = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78];

export const refs = () => CHAPTER_VERSE_COUNTS.flatMap((n, i) => Array.from({ length: n }, (_, v) => [i + 1, v + 1]));
export const vsFile = (c, v) => path.join(VS_DIR, `${c}_${v}.json`);

/** A payload is good when it parses and is the verse we asked for. */
export function validSlok(d, c, v) {
  return !!d && typeof d === "object" && Number(d.chapter) === c && Number(d.verse) === v && typeof d.slok === "string";
}

export async function readCached(c, v) {
  try {
    const d = JSON.parse(await fs.readFile(vsFile(c, v), "utf8"));
    return validSlok(d, c, v) ? d : null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOne(c, v) {
  for (const url of VEDIC_SCRIPTURES_SLOK(c, v)) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 90_000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = JSON.parse(await res.text());
        if (!validSlok(d, c, v)) throw new Error("unexpected payload");
        return d;
      } catch {
        await sleep(700 * attempt);
      } finally {
        clearTimeout(t);
      }
    }
  }
  return null;
}

/** Make sure every verse is cached. Returns the refs still missing (empty when complete). */
export async function fetchAll({ concurrency = 10, offline = false, log = console.log } = {}) {
  await fs.mkdir(VS_DIR, { recursive: true });
  const all = refs();
  const todo = [];
  for (const [c, v] of all) if (!(await readCached(c, v))) todo.push([c, v]);
  if (!todo.length || offline) return todo.map(([c, v]) => `${c}.${v}`);
  log(`vedicscriptures: ${all.length - todo.length}/${all.length} cached, fetching ${todo.length} (concurrency ${concurrency})`);
  let k = 0;
  let done = 0;
  const failed = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (k < todo.length) {
        const [c, v] = todo[k++];
        const d = await fetchOne(c, v);
        if (d) await fs.writeFile(vsFile(c, v), JSON.stringify(d));
        else failed.push(`${c}.${v}`);
        if (++done % 50 === 0) log(`   ⇣ ${done}/${todo.length}`);
      }
    }),
  );
  return failed;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const i = process.argv.indexOf("--concurrency");
  const failed = await fetchAll({ concurrency: i > 0 ? Number(process.argv[i + 1]) || 10 : 10 });
  if (failed.length) {
    console.log(`✗ ${failed.length} verses failed: ${failed.slice(0, 20).join(", ")}${failed.length > 20 ? " …" : ""}. Run again to resume.`);
    process.exitCode = 1;
  } else console.log("✓ all verses cached");
}
