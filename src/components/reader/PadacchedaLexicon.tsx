"use client";
import { useMemo, useState } from "react";
import { useGita } from "@/lib/store/useGitaStore";
import type { Verse } from "@/lib/types";

/** Word-by-word padaccheda. Hover a word to light up every verse sharing its stem; click to pin and list them. */
export function PadacchedaLexicon({ verse }: { verse: Verse }) {
  const versesDoc = useGita((s) => s.versesDoc);
  const setHoverStem = useGita((s) => s.setHoverStem);
  const select = useGita((s) => s.select);
  const [pinned, setPinned] = useState<string | null>(null);

  const stemIndex = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const v of versesDoc?.verses || []) for (const p of v.padaccheda) for (const k of p.k) m.set(k, [...(m.get(k) || []), v.id]);
    for (const [k, ids] of m) m.set(k, [...new Set(ids)]);
    return m;
  }, [versesDoc]);

  if (!verse.padaccheda.length) return <p className="text-[13px] text-text-3">The source has no word-by-word analysis for this verse.</p>;
  const pinnedVerses = pinned ? (stemIndex.get(pinned) || []).filter((id) => id !== verse.id) : [];

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-1.5">
        {verse.padaccheda.map((p, i) => {
          const k = p.k[0];
          const n = k ? (stemIndex.get(k)?.length || 1) - 1 : 0;
          const active = !!pinned && p.k.includes(pinned);
          return (
            <button
              key={i}
              className={`rounded-[var(--radius-2)] border px-2.5 py-2 text-left transition-colors ${active ? "border-accent-line bg-accent-soft" : "border-line bg-surface-2 hover:border-line-3"}`}
              onMouseEnter={() => setHoverStem(k || null)}
              onMouseLeave={() => setHoverStem(null)}
              onFocus={() => setHoverStem(k || null)}
              onBlur={() => setHoverStem(null)}
              aria-pressed={active}
              onClick={() => {
                const next = active ? null : k || null;
                setPinned(next);
                useGita.getState().setHighlight(next ? { nodes: new Set(stemIndex.get(next) || []), edges: new Set(), label: `Verses sharing the stem “${next}”`, source: "stem" } : null);
              }}
              title={k ? `Stem “${k}”: appears in ${n} other verse${n === 1 ? "" : "s"}. Click to list them.` : undefined}
            >
              <div className="serif text-[14.5px] italic leading-tight text-text">{p.w}</div>
              <div className="mt-0.5 text-[12px] leading-4 text-text-2">{p.m}</div>
              {n > 0 && <div className="num mt-1 text-[11px] text-text-3">in {n} more</div>}
            </button>
          );
        })}
      </div>
      {pinned && (
        <div className="mt-3 rounded-[var(--radius-2)] border border-line bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12.5px] text-text-2">
              <span className="serif italic text-text">{pinned}</span> appears in {pinnedVerses.length} other verses
            </span>
            <button className="text-[12px] text-text-3 hover:text-text" onClick={() => (setPinned(null), useGita.getState().setHighlight(null))}>
              Clear
            </button>
          </div>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
            {pinnedVerses.map((id) => (
              <button key={id} className="chip num" onClick={() => select(id)}>
                {id.replace("BG_", "")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
