"use client";
import { Fragment, type ReactNode } from "react";
import { CITATION_RE } from "@/lib/graphrag/citations";
import { CitationChip } from "./SubgraphCitationChips";
import { readTable } from "./markdownTable";

// Minimal, safe Markdown → React (no HTML injection). Supports ### headings, lists, > quotes, **bold**, *italic*,
// `code`, <small>…</small>, simple tables (a real table when there is room, labelled rows on narrow screens), and
// GraphRAG citations rendered as interactive chips.

// Bracketed citations first; bare "BG 2.58" references (models don't always bracket them) are chips too.
const INLINE = new RegExp(`(${CITATION_RE.source})|(\\bBG\\s?\\d{1,2}\\.\\d{1,2}(?:\\s?[-–]\\s?\\d{1,2})?\\b)|(\\*\\*[^*]+\\*\\*)|(\\*[^*\\n]+\\*)|(_[^_\\n]+_)|(\`[^\`]+\`)|(<small>[\\s\\S]*?</small>)`, "g");

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("[")) out.push(<CitationChip key={k} raw={tok} />);
    else if (tok.startsWith("BG")) out.push(<CitationChip key={k} raw={`[${tok}]`} />);
    else if (tok.startsWith("**")) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k} className="rounded bg-sunken px-1 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("<small>")) out.push(<small key={k}>{inline(tok.slice(7, -8), k)}</small>);
    else out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    const k = `l${blocks.length}`;
    blocks.push(
      <Tag key={k}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `${k}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const table = readTable(lines, i);
    if (table) {
      flushPara();
      flushList();
      const k = `t${blocks.length}`;
      blocks.push(
        <div key={k} className="@container my-3">
          <table className="hidden w-full border-collapse text-[0.92em] @min-[30rem]:table">
            <thead>
              <tr>
                {table.header.map((h, c) => (
                  <th key={c} scope="col" className="border-b border-line-2 px-2 py-1.5 text-left align-bottom font-semibold text-text">
                    {inline(h, `${k}-h${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line">
                  {r.map((cell, c) => (
                    <td key={c} className="px-2 py-1.5 align-top">
                      {inline(cell, `${k}-${ri}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-2 @min-[30rem]:hidden">
            {table.rows.map((r, ri) => (
              <dl key={ri} className="rounded-2 border border-line px-3 py-2">
                {r.map((cell, c) => (
                  <div key={c} className="py-0.5">
                    <dt className="text-[0.8em] font-medium text-text-3">{inline(table.header[c] || "", `${k}-s${ri}-${c}h`)}</dt>
                    <dd className="[overflow-wrap:anywhere]">{inline(cell, `${k}-s${ri}-${c}`)}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
        </div>,
      );
      i = table.next - 1;
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    const li = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      blocks.push(<h3 key={`h${blocks.length}`}>{inline(h[1], `h${blocks.length}`)}</h3>);
    } else if (li || ol) {
      flushPara();
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((li || ol)![1]);
    } else if (/^\s{2,}\S/.test(raw) && list) {
      list.items[list.items.length - 1] += " " + line.trim();
    } else if (line.startsWith(">")) {
      flushPara();
      flushList();
      blocks.push(<blockquote key={`q${blocks.length}`}>{inline(line.replace(/^>\s?/, ""), `q${blocks.length}`)}</blockquote>);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <Fragment>{blocks}</Fragment>;
}
