import fs from "node:fs/promises";
import path from "node:path";

export const ENV_LOCAL = ".env.local";

function parse(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out.set(m[1], v);
  }
  return out;
}

export async function readEnvFile(name: string): Promise<Map<string, string>> {
  try {
    return parse(await fs.readFile(path.join(process.cwd(), name), "utf8"));
  } catch {
    return new Map();
  }
}

/** Where a variable comes from: ".env.local", ".env", "environment" or null. */
export async function envSources(): Promise<(key: string) => string | null> {
  const local = await readEnvFile(ENV_LOCAL);
  const base = await readEnvFile(".env");
  return (key: string) => {
    if (local.get(key)) return ENV_LOCAL;
    if (base.get(key)) return ".env";
    if (process.env[key]) return "environment";
    return null;
  };
}

const SAFE_VALUE = /^[^\s"'`\\$#]{1,400}$/;
export const isSafeEnvValue = (v: string) => SAFE_VALUE.test(v);

/**
 * Upsert (or, with null, remove) variables in .env.local — preserving every other line and comment —
 * and mirror the change into process.env so the running server uses it immediately.
 */
export async function upsertEnvLocal(updates: Record<string, string | null>): Promise<string> {
  const file = path.join(process.cwd(), ENV_LOCAL);
  let lines: string[];
  try {
    lines = (await fs.readFile(file, "utf8")).split(/\r?\n/);
  } catch {
    lines = ["# GitaViswa — written by the Agni-Kunda settings modal. Git-ignored. Never commit this file.", ""];
  }
  const pending = new Map(Object.entries(updates));
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && pending.has(m[1])) {
      const v = pending.get(m[1]);
      pending.delete(m[1]);
      if (v !== null && v !== undefined) out.push(`${m[1]}=${v}`);
      continue;
    }
    out.push(line);
  }
  for (const [k, v] of pending) if (v !== null && v !== undefined) out.push(`${k}=${v}`);
  while (out.length > 1 && out[out.length - 1] === "" && out[out.length - 2] === "") out.pop();
  const text = out.join("\n").replace(/\n*$/, "\n");
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text, { mode: 0o600 });
  await fs.rename(tmp, file);
  for (const [k, v] of Object.entries(updates)) {
    if (v === null) delete process.env[k];
    else process.env[k] = v;
  }
  return ENV_LOCAL;
}
