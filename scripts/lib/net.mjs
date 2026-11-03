// Resilient source fetching for flaky / throttled networks.
//
// Strategy per source file:
//   1. Re-use a validated copy from `.cache/sources/` (so re-runs are instant and offline-capable).
//   2. Small files  → whole-file gzip download, JSON-validated.
//   3. Large files  → parallel HTTP Range download (per-connection throttling is common on raw.githubusercontent),
//                     every chunk length-checked and persisted, so an interrupted run resumes where it stopped.
//   4. Each mirror is tried in order; the first payload that parses AND passes `validate` wins.

import fs from "node:fs/promises";
import path from "node:path";

export const CACHE_DIR = path.resolve(".cache/sources");
const RANGE_THRESHOLD = 4 * 1024 * 1024; // above this, prefer ranged parallel download
const CHUNK = 512 * 1024;
const CONCURRENCY = 16;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function withTimeout(url, init = {}, ms = 120_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error(`timeout after ${ms}ms`)), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

async function probeLength(url) {
  try {
    const res = await withTimeout(url, { method: "HEAD", headers: { "Accept-Encoding": "identity" } }, 30_000);
    if (!res.ok) return { ok: false, status: res.status };
    const len = Number(res.headers.get("content-length") || 0);
    const ranges = (res.headers.get("accept-ranges") || "").includes("bytes");
    return { ok: true, len, ranges };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fetchWhole(url, log) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await withTimeout(url, { headers: { "Accept-Encoding": "gzip, br" } }, 300_000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      log(`      ↻ attempt ${attempt} failed (${e.message}); retrying…`);
      await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

async function fetchRanged(url, total, partsDir, log) {
  await fs.mkdir(partsDir, { recursive: true });
  const n = Math.ceil(total / CHUNK);
  let done = 0;
  let next = 0;
  const started = Date.now();

  async function getChunk(i) {
    const file = path.join(partsDir, String(i).padStart(5, "0"));
    const start = i * CHUNK;
    const end = Math.min(total, start + CHUNK) - 1;
    const want = end - start + 1;
    try {
      const st = await fs.stat(file);
      if (st.size === want) return; // resumed
    } catch {}
    let lastErr;
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        const res = await withTimeout(url, { headers: { Range: `bytes=${start}-${end}`, "Accept-Encoding": "identity" } }, 180_000);
        if (res.status !== 206) throw new Error(`expected 206, got ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length !== want) throw new Error(`short chunk ${buf.length}/${want}`);
        await fs.writeFile(file, buf);
        return;
      } catch (e) {
        lastErr = e;
        await sleep(1000 * attempt);
      }
    }
    throw new Error(`chunk ${i} failed: ${lastErr?.message}`);
  }

  async function worker() {
    while (next < n) {
      const i = next++;
      await getChunk(i);
      done++;
      if (done % 8 === 0 || done === n) {
        const secs = (Date.now() - started) / 1000;
        log(`      ⇣ ${done}/${n} chunks · ${((done * CHUNK) / 1024 / 1024).toFixed(1)} MB · ${secs.toFixed(0)}s`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, n) }, worker));

  const bufs = [];
  for (let i = 0; i < n; i++) bufs.push(await fs.readFile(path.join(partsDir, String(i).padStart(5, "0"))));
  const all = Buffer.concat(bufs);
  if (all.length !== total) throw new Error(`assembled ${all.length} bytes, expected ${total}`);
  return all;
}

/**
 * Fetch a JSON document from the first healthy mirror.
 * @param {string} name       cache file name
 * @param {string[]} mirrors  ordered list of URLs
 * @param {{offline?: boolean, validate?: (data:any)=>boolean|string, log?: (s:string)=>void}} opts
 */
export async function fetchJson(name, mirrors, { offline = false, validate = () => true, log = console.log } = {}) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, name);

  const check = (data) => {
    const r = validate(data);
    if (r !== true) throw new Error(typeof r === "string" ? r : "validation failed");
    return data;
  };

  if (await exists(cacheFile)) {
    try {
      const data = check(JSON.parse(await fs.readFile(cacheFile, "utf8")));
      log(`   ✓ ${name} (cached)`);
      return { data, source: "cache:" + cacheFile };
    } catch (e) {
      log(`   ! cached ${name} invalid (${e.message}); refetching`);
    }
  }
  if (offline) throw new Error(`${name}: not in cache and --offline was given`);

  const errors = [];
  for (const url of mirrors) {
    try {
      log(`   ⇣ ${name} ← ${url}`);
      const probe = await probeLength(url);
      if (!probe.ok && probe.status === 404) throw new Error("404");
      let buf;
      let partsDir = null;
      if (probe.ok && probe.len > RANGE_THRESHOLD && probe.ranges) {
        log(`      ${(probe.len / 1024 / 1024).toFixed(1)} MB → parallel ranged download (${CONCURRENCY} streams)`);
        partsDir = path.join(CACHE_DIR, "parts", name + "-" + Buffer.from(url).toString("base64url").slice(-16));
        buf = await fetchRanged(url, probe.len, partsDir, log);
      } else {
        buf = await fetchWhole(url, log);
      }
      const data = check(JSON.parse(buf.toString("utf8")));
      await fs.writeFile(cacheFile, buf);
      // Only this file's chunks — other downloads may be resuming in sibling directories.
      if (partsDir) await fs.rm(partsDir, { recursive: true, force: true }).catch(() => {});
      log(`   ✓ ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
      return { data, source: url };
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
      log(`   ✗ ${url}: ${e.message}`);
    }
  }
  throw new Error(`All mirrors failed for ${name}:\n  ${errors.join("\n  ")}`);
}

/** Fetch many small JSON documents with bounded concurrency (used by the per-verse supplemental source). */
export async function fetchMany(urls, { concurrency = 12, log = console.log } = {}) {
  const out = new Array(urls.length);
  let i = 0;
  let done = 0;
  async function worker() {
    while (i < urls.length) {
      const k = i++;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const res = await withTimeout(urls[k], { headers: { "Accept-Encoding": "gzip" } }, 60_000);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          out[k] = await res.json();
          break;
        } catch {
          await sleep(800 * attempt);
        }
      }
      if (++done % 50 === 0) log(`      ⇣ ${done}/${urls.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

/** Fetch archive.org item metadata (for chapter-length recitation mirrors). */
export async function fetchArchiveItem(id, { offline = false, log = console.log } = {}) {
  return fetchJson(`archive-${id}.json`, [`https://archive.org/metadata/${id}`], {
    offline,
    log,
    validate: (d) => (Array.isArray(d?.files) ? true : "no files[]"),
  });
}
