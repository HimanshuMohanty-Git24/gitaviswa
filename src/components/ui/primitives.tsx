"use client";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { GraphNode } from "@/lib/types";
import { KIND_META, kindVar, nodeKind, type NodeKind } from "@/lib/graph/palette";

/** The mark for a node kind, matching its shape in the 3D cosmos (solid, ring or hub). */
export function NodeGlyph({ node, kind, className = "" }: { node?: GraphNode; kind?: NodeKind; className?: string }) {
  const k = kind ?? (node ? nodeKind(node) : "verse");
  return <span aria-hidden className={`glyph ${className}`} data-shape={KIND_META[k].shape} style={{ color: kindVar(k) }} />;
}

/** Shared header for dock panels and sheets: title block on the left, actions and close on the right. */
export function PanelHeader({ eyebrow, title, actions, onClose, closeLabel = "Close" }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="label truncate">{eyebrow}</div>}
        <div className="truncate text-[14px] font-semibold leading-5 text-text">{title}</div>
      </div>
      {actions}
      {onClose && (
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <X size={16} />
        </button>
      )}
    </header>
  );
}

export function SectionLabel({ children, count, className = "" }: { children: ReactNode; count?: number; className?: string }) {
  return (
    <div className={`label mb-2 flex items-center gap-1.5 ${className}`}>
      <span>{children}</span>
      {count !== undefined && <span className="num text-text-4">{count}</span>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-3)] border border-line-2 bg-surface-2 text-text-3">{icon}</div>}
      <div className="text-[14px] font-semibold text-text">{title}</div>
      {children && <div className="mt-1 max-w-[36ch] text-[13px] leading-5 text-text-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Inline notice for contextual guidance (offline mode, privacy, retired models). */
export function Notice({ icon, children, tone = "neutral", action }: { icon?: ReactNode; children: ReactNode; tone?: "neutral" | "accent" | "danger"; action?: ReactNode }) {
  const toneCls =
    tone === "accent" ? "border-accent-line bg-accent-soft text-text-2" : tone === "danger" ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-danger-soft text-text-2" : "border-line bg-surface-2 text-text-2";
  return (
    <div className={`flex items-start gap-2.5 rounded-[var(--radius-2)] border px-3 py-2.5 text-[12.5px] leading-[1.45] ${toneCls}`}>
      {icon && <span className={`mt-px ${tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent-text" : "text-text-3"}`}>{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
