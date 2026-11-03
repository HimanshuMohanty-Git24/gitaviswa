"use client";
import { useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { fold } from "@/lib/graphrag/text";
import { typeName } from "@/lib/graph/palette";
import type { GraphNode } from "@/lib/types";
import { NodeGlyph } from "@/components/ui/primitives";

const nodeTitle = (n: GraphNode) => (n.type === "Verse" ? `BG ${n.ref}` : n.type === "Chapter" ? `Chapter ${n.number}: ${n.title}` : n.label);
const nodeSub = (n: GraphNode) => (n.type === "Verse" ? n.snippet : "en" in n ? n.en : n.type === "Character" ? n.role : n.type === "LifeDilemma" ? n.desc : "");

/** Accessible combobox over every node (verse references, labels, IAST, English names). */
export function NodePicker({ value, onChange, placeholder, label, exclude }: { value: string | null; onChange: (id: string | null) => void; placeholder: string; label: string; exclude?: (n: GraphNode) => boolean }) {
  const graphs = useGita((s) => s.graphs);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const index = useMemo(() => {
    if (!graphs) return [];
    // A saved thought is findable by any phrase in it, not only its short label.
    return [...graphs.nodeById.values()].map((n) => ({ n, key: fold(`${nodeTitle(n)} ${"iast" in n ? n.iast : ""} ${"en" in n ? n.en : ""} ${n.type === "Verse" ? n.ref : ""} ${n.type === "PersonalThought" ? n.text : ""}`) }));
  }, [graphs]);

  const results = useMemo(() => {
    const t = fold(q.trim());
    if (!t) return [];
    const ref = t.match(/^(?:bg\s*)?(\d{1,2})[.:\s](\d{1,2})$/);
    if (ref) {
      const hit = graphs?.nodeById.get(`BG_${Number(ref[1])}.${Number(ref[2])}`);
      if (hit && !exclude?.(hit)) return [hit];
    }
    return index
      .filter((x) => x.key.includes(t) && !exclude?.(x.n))
      .sort((a, b) => (a.n.type === "Verse" ? 1 : 0) - (b.n.type === "Verse" ? 1 : 0) || a.key.indexOf(t) - b.key.indexOf(t))
      .slice(0, 8)
      .map((x) => x.n);
  }, [q, index, graphs, exclude]);

  const choose = (id: string) => {
    onChange(id);
    setQ("");
    setOpen(false);
  };

  const selected = value ? graphs?.nodeById.get(value) : null;
  if (selected) {
    return (
      <div className="field flex items-center gap-2 !px-2.5" aria-label={label}>
        <NodeGlyph node={selected} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-text">{nodeTitle(selected)}</span>
        <span className="hidden text-[11.5px] text-text-3 sm:inline">{typeName(selected)}</span>
        <button
          className="btn btn-ghost btn-icon btn-sm -mr-1"
          onClick={() => {
            onChange(null);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          aria-label={`Clear ${label}`}
        >
          <X size={14} />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
      <input
        ref={inputRef}
        className="field !pl-8 !text-[13px]"
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter" && results[cursor]) {
            e.preventDefault();
            choose(results[cursor].id);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && q.trim() && (
        <div id={listId} role="listbox" className="popover absolute left-0 right-0 top-full z-[45] mt-1 max-h-72 overflow-auto p-1">
          {results.length ? (
            results.map((n, i) => (
              <button key={n.id} role="option" aria-selected={i === cursor} className="row" data-active={i === cursor} onMouseEnter={() => setCursor(i)} onMouseDown={(e) => (e.preventDefault(), choose(n.id))}>
                <NodeGlyph node={n} className="mt-1.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] text-text">{nodeTitle(n)}</span>
                    <span className="shrink-0 text-[11px] text-text-3">{typeName(n)}</span>
                  </span>
                  <span className="block truncate text-[12px] text-text-3">{nodeSub(n)}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2.5 text-[12.5px] text-text-3">No match. Try a verse number like 6.35, or a word like “fear”.</div>
          )}
        </div>
      )}
    </div>
  );
}

export { nodeTitle, nodeSub };
