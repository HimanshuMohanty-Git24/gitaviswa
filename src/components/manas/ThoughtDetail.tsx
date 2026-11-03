"use client";
import { useState } from "react";
import { Check, CornerDownRight, Pencil, Plus, Undo2, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { useDraft, useThoughtEdits } from "@/lib/store/draftStore";
import { upsertThought } from "@/lib/store/personalStore";
import { addConnection, CHECK_IN_LABELS, connectionsWith, describeStorageError, editThought, RELATION_LABELS, removeConnection, reviewConnection } from "@/lib/store/thoughtModel";
import { thoughtNodeId } from "@/lib/graph/graphStore";
import { plainReason, themeLabel } from "@/lib/graphrag/reflect";
import type { ConnectionRelation, PersonalConnection, PersonalThought } from "@/lib/types";
import { NodePicker } from "@/components/graph/NodePicker";
import { RichText } from "@/components/chat/RichText";
import { NodeGlyph, Notice, SectionLabel } from "@/components/ui/primitives";

const ORIGIN_NOTE: Record<PersonalConnection["origin"], string> = {
  user: "Added by you",
  local: "Suggested offline from the graph",
  ai: "Suggested by a language model",
  legacy: "Suggested automatically by an earlier version of Reflect",
};

const date = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const snippet = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export function RelationSelect({ value, onChange, label, disabled }: { value: ConnectionRelation; onChange: (r: ConnectionRelation) => void; label: string; disabled?: boolean }) {
  return (
    <select className="field field-sm !h-8 !w-auto max-w-full !text-[12.5px] max-sm:!h-10" value={value} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.target.value as ConnectionRelation)}>
      {(Object.keys(RELATION_LABELS) as ConnectionRelation[]).map((r) => (
        <option key={r} value={r}>
          {RELATION_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

/**
 * A saved thought in full: the person's words (editable, earlier wordings kept), dates, where it began, later
 * responses, connections kept / suggested / declined, and any generated interpretation, labelled as not theirs.
 */
export function ThoughtDetail({ nodeId }: { nodeId: string }) {
  const thought = useGita((s) => s.thoughts.find((t) => thoughtNodeId(t.id) === nodeId));
  const thoughts = useGita((s) => s.thoughts);
  const graphs = useGita((s) => s.graphs);
  const select = useGita((s) => s.select);
  const setThoughts = useGita((s) => s.setThoughts);
  const edit = useThoughtEdits((s) => (thought ? s.edits[thought.id] : undefined));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ label: string; prev: PersonalThought } | null>(null);
  const [relation, setRelation] = useState<ConnectionRelation>("relates_to");
  const [blocked, setBlocked] = useState(false);
  if (!thought || !graphs) return null;

  const persist = async (next: PersonalThought, undoLabel?: string) => {
    setBusy(true);
    setError(null);
    try {
      setThoughts(await upsertThought(next));
      setUndo(undoLabel ? { label: undoLabel, prev: thought } : null);
      return true;
    } catch (e) {
      setError(`That change wasn't saved. ${describeStorageError(e)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const now = () => Date.now();
  const nameOf = (id: string) => {
    const n = graphs.nodeById.get(id);
    return n ? themeLabel(n) : id.startsWith("thought:") ? "A thought that is no longer saved" : "An item that is no longer available";
  };
  const accepted = connectionsWith(thought, "accepted");
  const suggested = connectionsWith(thought, "suggested");
  const rejected = connectionsWith(thought, "rejected");
  const respondsTo = thought.origin?.kind === "thought" ? thoughts.find((t) => t.id === (thought.origin as { thoughtId: string }).thoughtId) : undefined;
  const verseOrigin = thought.origin?.kind === "verse" ? graphs.nodeById.get(thought.origin.verseId) : undefined;
  const responses = thoughts.filter((t) => t.id !== thought.id && t.connections.some((c) => c.status === "accepted" && c.relation === "responds_to" && c.targetId === nodeId));

  const saveEdit = async () => {
    if (edit === undefined) return;
    const next = editThought(thought, edit, now());
    if (next === thought || (await persist(next, "Your edit was saved. The earlier wording is kept below."))) useThoughtEdits.getState().setEdit(thought.id, undefined);
  };
  const respond = () => {
    if (!useDraft.getState().startResponse(thought.id)) return setBlocked(true);
    const g = useGita.getState();
    g.select(null);
    g.setView("manas");
  };

  // A plain render function (not a nested component), so rows keep keyboard focus across re-renders.
  const target = (c: PersonalConnection, sub?: string) => {
    const n = graphs.nodeById.get(c.targetId);
    return (
      <button className="row min-w-0 flex-1 !px-1.5" onClick={() => n && select(c.targetId, { fly: false })} disabled={!n}>
        {n ? <NodeGlyph node={n} className="mt-1.5" /> : <span className="mt-1.5 h-2 w-2 shrink-0" />}
        <span className="min-w-0 flex-1 text-[13px] leading-5">
          <span className="font-medium text-text [overflow-wrap:anywhere]">{nameOf(c.targetId)}</span>
          {sub && <span className="block text-[12px] leading-4 text-text-3">{sub}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="mt-5 space-y-6" aria-busy={busy}>
      {edit === undefined ? (
        <div>
          <p className="reading whitespace-pre-wrap !text-text [overflow-wrap:anywhere]">{thought.text}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className="btn btn-sm max-sm:h-10" onClick={() => useThoughtEdits.getState().setEdit(thought.id, thought.text)}>
              <Pencil size={13} /> Edit
            </button>
            <button className="btn btn-sm max-sm:h-10" onClick={respond}>
              <CornerDownRight size={13} /> Add a later response
            </button>
          </div>
          {blocked && (
            <div className="mt-2">
              <Notice
                action={
                  <button className="btn btn-sm" onClick={() => (useGita.getState().select(null), useGita.getState().setView("manas"))}>
                    Go to draft
                  </button>
                }
              >
                You have unsaved writing in Reflect. Save or discard it first, so nothing is replaced.
              </Notice>
            </div>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor={`edit-${thought.id}`} className="label mb-1.5 block">
            Edit your words
          </label>
          <textarea id={`edit-${thought.id}`} className="field serif min-h-[160px] w-full resize-y !text-[16px] !leading-[1.6]" value={edit} onChange={(e) => useThoughtEdits.getState().setEdit(thought.id, e.target.value)} disabled={busy} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button className="btn btn-primary btn-sm max-sm:h-10" disabled={busy || !edit.trim()} onClick={saveEdit}>
              <Check size={13} /> Save changes
            </button>
            <button className="btn btn-ghost btn-sm max-sm:h-10" disabled={busy} onClick={() => useThoughtEdits.getState().setEdit(thought.id, undefined)}>
              Cancel
            </button>
            <span className="text-[12px] text-text-3">The current wording will be kept as an earlier version.</span>
          </div>
        </div>
      )}

      <div className="space-y-1 text-[12.5px] leading-5 text-text-3">
        <div>
          Saved {date(thought.createdAt)}
          {thought.revisions?.length ? ` · edited ${date(thought.revisions[thought.revisions.length - 1].until)}` : ""}
        </div>
        {verseOrigin && (
          <div>
            Written from{" "}
            <button className="font-medium text-text-2 underline-offset-2 hover:underline" onClick={() => select(verseOrigin.id, { fly: false })}>
              {themeLabel(verseOrigin)}
            </button>
          </div>
        )}
        {thought.origin?.kind === "thought" && (
          <div>
            A later response to{" "}
            {respondsTo ? (
              <button className="font-medium text-text-2 underline-offset-2 hover:underline" onClick={() => select(thoughtNodeId(respondsTo.id), { fly: false })}>
                your thought from {date(respondsTo.createdAt)}
              </button>
            ) : (
              "a thought that is no longer saved"
            )}
          </div>
        )}
        {thought.checkIn ? (
          <div>You noted it felt {CHECK_IN_LABELS[thought.checkIn - 1].toLowerCase()}.</div>
        ) : thought.intensity ? (
          <div>Earlier check-in: {CHECK_IN_LABELS[thought.intensity - 1]?.toLowerCase() ?? thought.intensity}. Recorded by a previous version of Reflect that preselected “Heavy”, so it may not have been chosen.</div>
        ) : null}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {undo && (
        <Notice
          action={
            <button className="btn btn-sm" disabled={busy} onClick={() => void persist({ ...undo.prev, updatedAt: now() })}>
              <Undo2 size={13} /> Undo
            </button>
          }
        >
          {undo.label}
        </Notice>
      )}

      {thought.revisions && thought.revisions.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer select-none text-[12.5px] font-medium text-text-2 hover:text-text">Earlier wording ({thought.revisions.length})</summary>
          <ol className="mt-2 space-y-3 border-l border-line pl-3">
            {[...thought.revisions].reverse().map((r) => (
              <li key={r.until}>
                <div className="text-[12px] text-text-3">Until {date(r.until)}</div>
                <p className="serif whitespace-pre-wrap text-[14px] leading-[1.55] text-text-2 [overflow-wrap:anywhere]">{r.text}</p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {responses.length > 0 && (
        <section>
          <SectionLabel count={responses.length}>Later responses</SectionLabel>
          <ul className="-mx-1.5 space-y-1">
            {responses.map((t) => (
              <li key={t.id}>
                <button className="row !px-1.5" onClick={() => select(thoughtNodeId(t.id), { fly: false })}>
                  <CornerDownRight size={13} className="mt-1 shrink-0 text-text-3" />
                  <span className="min-w-0 flex-1 text-[13px] leading-5">
                    <span className="block text-[12px] text-text-3">{date(t.createdAt)}</span>
                    <span className="serif text-text-2 [overflow-wrap:anywhere]">{snippet(t.text)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionLabel count={accepted.length}>Your connections</SectionLabel>
        {accepted.length ? (
          <ul className="-mx-1.5 space-y-1">
            {accepted.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-x-2 gap-y-1">
                {target(c, c.origin === "user" ? undefined : `${ORIGIN_NOTE[c.origin]}; you kept it`)}
                <div className="flex items-center gap-1 pl-1.5 max-sm:w-full max-sm:pl-6">
                  <RelationSelect value={c.relation} label={`How this thought relates to ${nameOf(c.targetId)}`} disabled={busy} onChange={(r) => void persist(reviewConnection(thought, c.targetId, { relation: r }, now()))} />
                  <button className="btn btn-ghost btn-icon btn-sm max-sm:h-10 max-sm:w-10" disabled={busy} aria-label={`Remove the connection to ${nameOf(c.targetId)}`} title="Remove connection" onClick={() => void persist(removeConnection(thought, c.targetId, now()), `Connection to ${nameOf(c.targetId)} removed. The thought is unchanged.`)}>
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-5 text-text-3">None yet. It stands on its own, and that is complete.</p>
        )}
      </section>

      {suggested.length > 0 && (
        <section>
          <SectionLabel count={suggested.length}>Suggested, not confirmed</SectionLabel>
          <p className="-mt-1 mb-2 text-[12px] leading-4 text-text-3">Keep the ones that fit. Declined suggestions are remembered so they don&apos;t come back.</p>
          <ul className="-mx-1.5 space-y-1">
            {suggested.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-x-2 gap-y-1">
                {target(c, [plainReason(c.why), ORIGIN_NOTE[c.origin]].filter(Boolean).join(" · "))}
                <div className="flex items-center gap-1 pl-1.5 max-sm:w-full max-sm:pl-6">
                  <button className="btn btn-sm max-sm:h-10" disabled={busy} onClick={() => void persist(reviewConnection(thought, c.targetId, { status: "accepted" }, now()))}>
                    <Check size={13} /> Keep
                  </button>
                  <button className="btn btn-sm btn-ghost max-sm:h-10" disabled={busy} onClick={() => void persist(reviewConnection(thought, c.targetId, { status: "rejected" }, now()), `Marked “${nameOf(c.targetId)}” as not fitting.`)}>
                    Doesn&apos;t fit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionLabel>Add a connection</SectionLabel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <RelationSelect value={relation} onChange={setRelation} label="How the new connection relates" disabled={busy} />
          <div className="min-w-0 flex-1">
            <NodePicker label="Connect this thought to" value={null} placeholder="A verse, idea, feeling or another thought" exclude={(n) => n.id === nodeId} onChange={(id) => id && void persist(addConnection(thought, id, relation, now()))} />
          </div>
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-text-3">
          <Plus size={12} /> Questions and disagreements count too: choose “I question or disagree with”.
        </p>
      </section>

      {rejected.length > 0 && (
        <details className="text-[12.5px] text-text-3">
          <summary className="cursor-pointer select-none hover:text-text-2">Declined suggestions ({rejected.length})</summary>
          <ul className="-mx-1.5 mt-2 space-y-1">
            {rejected.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                {target(c)}
                <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void persist(reviewConnection(thought, c.targetId, { status: "suggested" }, now()))}>
                  Reconsider
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {thought.reflection && (
        <section className="border-t border-line pt-5">
          <SectionLabel>
            {thought.enrichedBy ? `Generated by ${thought.enrichedBy}` : "Generated offline from the graph"} · not your words{thought.revisions?.length ? " · written for an earlier wording" : ""}
          </SectionLabel>
          <div className="prose-gita text-text-3">
            <RichText text={thought.reflection} />
          </div>
        </section>
      )}
    </div>
  );
}
