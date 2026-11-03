// Markdown table recognition for RichText. Pure (no imports) so it is testable under `node --test`.

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line) || (line.split("|").length >= 3 && !/^\s*[-*>#]/.test(line));
export const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

/** A table starting at `lines[i]` (header row, separator, body rows), or null. `next` is the first line after it. */
export function readTable(lines: string[], i: number): { header: string[]; rows: string[][]; next: number } | null {
  if (!isTableRow(lines[i] ?? "") || !isTableSeparator(lines[i + 1] ?? "")) return null;
  const header = cells(lines[i]);
  const rows: string[][] = [];
  let j = i + 2;
  for (; j < lines.length && isTableRow(lines[j]) && !isTableSeparator(lines[j]); j++) {
    const r = cells(lines[j]);
    // Pad or trim to the header's width so every cell has a label.
    rows.push(header.map((_, k) => r[k] ?? ""));
  }
  return { header, rows, next: j };
}
