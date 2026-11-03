"use client";
import { useMemo, useRef, useState } from "react";
import { Download, HeartHandshake, LoaderCircle, NotebookPen, Orbit, ShieldCheck, Sparkles, Trash2, Upload } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { useConnection } from "@/lib/store/settingsStore";
import { clearThoughts, deleteThought, exportThoughts, importThoughts, upsertThought } from "@/lib/store/personalStore";
import { bestReason, retrieve, type RagContext } from "@/lib/graphrag/engine";
import { routeText } from "@/lib/graphrag/router";
import { detectCrisis, CRISIS_RESOURCES } from "@/lib/graphrag/safety";
import { streamFromApi } from "@/lib/llm/browser";
import { thoughtNodeId } from "@/lib/graph/graphStore";
import type { EmotionNode, PersonalThought } from "@/lib/types";
import { RichText } from "@/components/chat/RichText";
import { EmptyState, NodeGlyph, Notice, SectionLabel } from "@/components/ui/primitives";

const PROMPTS = [
  "I feel overwhelmed by expectations at work and afraid of letting my family down.",
  "I keep replaying an argument and can't let the anger go.",
  "I don't know whether to leave a stable job for the work I actually love.",
];
const HEAVINESS = ["Light", "Noticeable", "Heavy", "Very heavy", "Overwhelming"];

/** Offline mapping of a reflection onto the Gita's Emotion / LifeDilemma / Verse nodes. */
async function analyze(ctx: RagContext, text: string, intensity: number): Promise<PersonalThought> {
  const has = (id: string) => ctx.graphs.graph.hasNode(id);
  const route = routeText(text, ctx.data.nodes, has);
  const r = await retrieve(ctx, text, { limitVerses: 6 });
  const norm = <T extends { id: string; score: number }>(xs: T[]) => {
    const m = Math.max(0.0001, ...xs.map((x) => x.score));
    return xs.map((x) => ({ id: x.id, score: Number((x.score / m).toFixed(2)) }));
  };
  const emotions = route.emotions.length ? norm(route.emotions).slice(0, 3) : norm(r.emotions).slice(0, 2).map((e) => ({ ...e, score: e.score * 0.6 }));
  const dilemmas = route.dilemmas.length ? norm(route.dilemmas).slice(0, 2) : norm(r.dilemmas).slice(0, 1).map((d) => ({ ...d, score: d.score * 0.6 }));
  const verses = norm(r.verses).slice(0, 4).map((v, i) => ({ ...v, why: bestReason(r.verses[i].reasons) }));
  return { id: crypto.randomUUID(), text, createdAt: Date.now(), intensity, emotions, dilemmas, verses };
}

function offlineReflection(ctx: RagContext, t: PersonalThought): string {
  const n = (id: string) => ctx.graphs.nodeById.get(id);
  const e = t.emotions.map((x) => n(x.id)).filter(Boolean) as EmotionNode[];
  const d = t.dilemmas.map((x) => n(x.id)?.label).filter(Boolean);
  const first = t.verses[0] ? ctx.versesById.get(t.verses[0].id) : undefined;
  const parts: string[] = [];
  if (e.length) parts.push(`What you wrote carries **${e.map((x) => x.label).join("**, **")}**: ${e[0].en.toLowerCase()}. ${e[0].desc}`);
  if (d.length) parts.push(`It echoes a situation the Gita addresses directly: *${d.join("*, *")}*.`);
  if (first) parts.push(`Sit with **[BG ${first.ref}]**: “${(first.translations.en?.[String(ctx.versesDoc.meta.defaults.en)] || "").replace(/\s+/g, " ").slice(0, 220)}…”`);
  return parts.join("\n\n");
}

function CrisisNotice() {
  return (
    <div className="rounded-3 border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-danger-soft p-4" role="alert">
      <div className="flex items-center gap-2 text-danger">
        <HeartHandshake size={16} />
        <span className="text-[13.5px] font-semibold">Please reach out to someone today</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-text-2">What you are carrying sounds very heavy. A person can help right now:</p>
      <ul className="mt-2 space-y-0.5 text-[13px]">
        {CRISIS_RESOURCES.map((r) => (
          <li key={r.label}>
            <span className="text-text-3">{r.label}: </span>
            <span className="font-semibold text-text">{r.contact}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Reflect (Manas-Darpaṇa): private journalling mapped onto the graph. Entries stay in this browser's IndexedDB. */
export function PersonalMindMapper() {
  const thoughts = useGita((s) => s.thoughts);
  const setThoughts = useGita((s) => s.setThoughts);
  const graphs = useGita((s) => s.graphs);
  const versesById = useGita((s) => s.versesById);
  const select = useGita((s) => s.select);
  const setSettingsOpen = useGita((s) => s.setSettingsOpen);
  const conn = useConnection();
  const [text, setText] = useState("");
  const [intensity, setIntensity] = useState(3);
  const [draft, setDraft] = useState<PersonalThought | null>(null);
  const [busy, setBusy] = useState<"" | "analyze" | "deepen">("");
  const [notice, setNotice] = useState<{ text: string; tone: "neutral" | "danger" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const crisis = detectCrisis(text) || (draft ? detectCrisis(draft.text) : false);

  const reflect = async () => {
    const ctx = useGita.getState().ragContext();
    if (!ctx || !text.trim()) return;
    setBusy("analyze");
    setNotice(null);
    const t = await analyze(ctx, text.trim(), intensity);
    t.reflection = offlineReflection(ctx, t);
    setDraft(t);
    setBusy("");
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  };

  const deepen = async () => {
    const ctx = useGita.getState().ragContext();
    if (!ctx || !draft) return;
    setBusy("deepen");
    const emotionList = ctx.data.nodes.filter((n) => n.type === "Emotion").map((n) => `${n.id} — ${n.label} (${"en" in n ? n.en : ""})`);
    const dilemmaList = ctx.data.nodes.filter((n) => n.type === "LifeDilemma").map((n) => `${n.id} — ${n.label}`);
    const r = await retrieve(ctx, draft.text, { limitVerses: 10 });
    const verseList = r.verses.map((v) => {
      const vv = ctx.versesById.get(v.id)!;
      return `${v.id} — ${(vv.translations.en?.[String(ctx.versesDoc.meta.defaults.en)] || "").replace(/\s+/g, " ").slice(0, 160)}`;
    });
    const context = `Emotion ids:\n${emotionList.join("\n")}\n\nDilemma ids:\n${dilemmaList.join("\n")}\n\nCandidate verses:\n${verseList.join("\n")}\n\nJournal entry:\n${draft.text}`;
    const res = await streamFromApi({ mode: "analyze", question: "Map this journal entry.", context });
    setBusy("");
    if (!res.ok) return setNotice({ text: res.error || "The language model could not deepen this reflection.", tone: "danger" });
    try {
      const j = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1)) as { emotions?: string[]; dilemmas?: string[]; verses?: string[]; reflection?: string };
      const valid = (ids: string[] | undefined) => (ids || []).filter((id) => ctx.graphs.graph.hasNode(id));
      const merge = (base: { id: string; score: number }[], ids: string[]) => {
        const m = new Map(base.map((x) => [x.id, x]));
        ids.forEach((id, i) => m.set(id, { id, score: Math.max(m.get(id)?.score || 0, 0.95 - i * 0.1) }));
        return [...m.values()].sort((a, b) => b.score - a.score).slice(0, 4);
      };
      setDraft({
        ...draft,
        emotions: merge(draft.emotions, valid(j.emotions).filter((id) => id.startsWith("emotion:"))),
        dilemmas: merge(draft.dilemmas, valid(j.dilemmas).filter((id) => id.startsWith("dilemma:"))),
        verses: merge(draft.verses, valid(j.verses).filter((id) => id.startsWith("BG_"))).map((v) => ({ ...v, why: draft.verses.find((x) => x.id === v.id)?.why || "suggested by your language model" })),
        reflection: j.reflection || draft.reflection,
        enrichedBy: `${res.provider} · ${res.model}`,
      });
    } catch {
      setNotice({ text: "The model's reply could not be read, so the offline mapping was kept.", tone: "neutral" });
    }
  };

  const keep = async () => {
    if (!draft) return;
    const list = await upsertThought(draft);
    setThoughts(list);
    setDraft(null);
    setText("");
    setNotice({ text: "Saved. It is stored only in this browser.", tone: "neutral" });
  };

  const remove = async (id: string) => setThoughts(await deleteThought(id));

  const showInGraph = () => {
    const s = useGita.getState();
    if (!s.graphs) return;
    const nodes = new Set<string>();
    const edges = new Set<string>();
    for (const t of s.thoughts) {
      const id = thoughtNodeId(t.id);
      nodes.add(id);
      s.graphs.graph.forEachOutEdge(id, (key, _a, _s, target) => (nodes.add(target), edges.add(key)));
    }
    s.setLayer("PersonalThought", true);
    s.setHighlight({ nodes, edges, label: "My reflections in the graph", source: "manas" });
    s.setView("cosmos");
  };

  const patterns = useMemo(() => {
    const emo = new Map<string, number>();
    const chapters = new Array(18).fill(0) as number[];
    for (const t of thoughts) {
      t.emotions.forEach((e) => emo.set(e.id, (emo.get(e.id) || 0) + e.score));
      t.verses.forEach((v) => {
        const vv = versesById.get(v.id);
        if (vv) chapters[vv.chapter - 1] += 1;
      });
    }
    return { emo: [...emo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6), chapters };
  }, [thoughts, versesById]);
  const maxEmo = Math.max(1, ...patterns.emo.map(([, v]) => v));
  const maxCh = Math.max(1, ...patterns.chapters);

  const nodeChip = (id: string, score?: number) => {
    const n = graphs?.nodeById.get(id);
    if (!n) return null;
    return (
      <button key={id} className="chip" onClick={() => select(id)} title={score !== undefined ? `Match strength ${Math.round(score * 100)}%` : undefined}>
        <NodeGlyph node={n} />
        {n.type === "Verse" ? `BG ${n.ref}` : n.label}
      </button>
    );
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-bg">
      <div className="mx-auto grid max-w-[1120px] gap-x-10 gap-y-8 px-5 pb-20 pt-8 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="reflect-title">
          <h1 id="reflect-title" className="text-[26px] font-semibold tracking-[-0.02em] text-text sm:text-[28px]">
            Reflect
          </h1>
          <p className="mt-1.5 max-w-[56ch] text-[14px] leading-[1.6] text-text-2">Write what is on your mind. GitaViśva maps it to the states of mind, life situations and verses it resembles, so you can sit with what the text says about it.</p>
          <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-text-3">
            <ShieldCheck size={14} className="shrink-0 text-good" />
            Private. Stored only in this browser. Nothing is sent anywhere unless you choose “Deepen”.
          </div>

          <div className="panel mt-6 overflow-hidden focus-within:border-accent-line">
            <label htmlFor="reflect-text" className="sr-only">
              Your reflection
            </label>
            <textarea
              id="reflect-text"
              className="serif block min-h-[180px] w-full resize-y bg-transparent px-5 py-4 text-[17px] leading-[1.65] text-text outline-none placeholder:text-text-3 focus-visible:outline-none"
              placeholder="Write freely. What happened, how it feels, what you are unsure about."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-2 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="text-[12.5px] text-text-3" id="heaviness-label">
                  How heavy does it feel?
                </span>
                <div className="seg" role="radiogroup" aria-labelledby="heaviness-label">
                  {HEAVINESS.map((h, i) => (
                    <button key={h} role="radio" aria-checked={intensity === i + 1} onClick={() => setIntensity(i + 1)} title={h} className="num !px-2.5">
                      {i + 1}
                    </button>
                  ))}
                </div>
                <span className="text-[12.5px] text-text-2">{HEAVINESS[intensity - 1]}</span>
              </div>
              <button className="btn btn-primary" disabled={!text.trim() || !!busy} onClick={reflect}>
                {busy === "analyze" ? <LoaderCircle size={14} className="animate-spin" /> : <NotebookPen size={14} />}
                {busy === "analyze" ? "Mapping" : "Reflect"}
              </button>
            </div>
          </div>
          {!text && !draft && (
            <div className="mt-3">
              <div className="label mb-1.5">Not sure where to start? Try one of these</div>
              <div className="flex flex-col items-start gap-1.5">
                {PROMPTS.map((p) => (
                  <button key={p} className="chip max-w-full whitespace-normal text-left" onClick={() => setText(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {crisis && (
            <div className="mt-5">
              <CrisisNotice />
            </div>
          )}

          {draft && (
            <div ref={resultRef} className="panel mt-6 p-5 sm:p-6" aria-live="polite">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-semibold text-text">What this resembles in the Gita</h2>
                <span className="text-[12px] text-text-3">{draft.enrichedBy ? `Deepened by ${draft.enrichedBy}` : "Mapped offline from the graph"}</span>
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <SectionLabel>States of mind</SectionLabel>
                  <div className="flex flex-wrap gap-1">{draft.emotions.length ? draft.emotions.map((e) => nodeChip(e.id, e.score)) : <span className="text-[12.5px] text-text-3">None clearly detected</span>}</div>
                </div>
                <div>
                  <SectionLabel>Life situations</SectionLabel>
                  <div className="flex flex-wrap gap-1">{draft.dilemmas.length ? draft.dilemmas.map((d) => nodeChip(d.id, d.score)) : <span className="text-[12.5px] text-text-3">None clearly detected</span>}</div>
                </div>
              </div>
              <div className="mt-5">
                <SectionLabel>Verses that speak to it</SectionLabel>
                <ul className="-mx-2.5">
                  {draft.verses.map((v) => {
                    const vv = versesById.get(v.id);
                    return (
                      <li key={v.id}>
                        <button className="row" onClick={() => select(v.id)}>
                          <NodeGlyph kind="verse" className="mt-2" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="shrink-0 text-[13px] font-semibold text-text">BG {vv?.ref}</span>
                              <span className="deva truncate text-[13.5px] !leading-6 text-text-2">{vv?.sanskrit[0]}</span>
                            </span>
                            {v.why && <span className="block text-[12px] leading-4 text-text-3">{v.why}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {draft.reflection && (
                <div className="prose-gita mt-5 border-t border-line pt-5">
                  <RichText text={draft.reflection} />
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button className="btn btn-primary" onClick={keep}>
                  Save reflection
                </button>
                {conn ? (
                  <button className="btn" onClick={deepen} disabled={!!busy} title="Sends this entry to your connected language model for a closer reading">
                    {busy === "deepen" ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {busy === "deepen" ? "Deepening" : "Deepen"}
                  </button>
                ) : (
                  <button className="btn" onClick={() => setSettingsOpen(true)} title="Connect a language model to deepen reflections">
                    <Sparkles size={14} /> Connect a model to deepen
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => setDraft(null)}>
                  Discard
                </button>
              </div>
            </div>
          )}
          {notice && (
            <div className="mt-4">
              <Notice tone={notice.tone}>{notice.text}</Notice>
            </div>
          )}
        </section>

        <aside aria-labelledby="history-title">
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 id="history-title" className="text-[14px] font-semibold text-text">
                Your reflections
              </h2>
              <span className="num text-[12.5px] text-text-3">{thoughts.length}</span>
            </div>
            {thoughts.length === 0 ? (
              <EmptyState icon={<NotebookPen size={18} />} title="Nothing saved yet">
                Saved reflections collect here. Over time you will see which states recur and which chapters keep speaking to you.
              </EmptyState>
            ) : (
              <div className="p-5">
                <section>
                  <SectionLabel>Recurring states of mind</SectionLabel>
                  <ul className="space-y-1.5">
                    {patterns.emo.map(([id, v]) => {
                      const n = graphs?.nodeById.get(id);
                      if (!n || n.type !== "Emotion") return null;
                      return (
                        <li key={id}>
                          <button className="grid w-full grid-cols-[7.5rem_1fr] items-center gap-3 text-left hover:opacity-80" onClick={() => select(id)}>
                            <span className="flex items-center gap-2 truncate text-[12.5px] text-text">
                              <NodeGlyph node={n} />
                              {n.label}
                            </span>
                            <span className="h-1.5 rounded-full" style={{ width: `${Math.max(6, (v / maxEmo) * 100)}%`, background: `var(--n-${n.valence === "healing" ? "healing" : "afflictive"})` }} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section className="mt-6">
                  <SectionLabel>Chapters that speak to you</SectionLabel>
                  <div className="flex h-14 items-end gap-[3px]" role="img" aria-label={`Matched verses per chapter: ${patterns.chapters.map((c, i) => `${i + 1}: ${c}`).join(", ")}`}>
                    {patterns.chapters.map((c, i) => (
                      <button key={i} className="flex-1 rounded-t-[3px] transition-opacity hover:opacity-80" style={{ height: `${Math.max(c ? 8 : 3, (c / maxCh) * 100)}%`, background: c ? "var(--n-chapter)" : "var(--line-2)" }} title={`Chapter ${i + 1}: ${c} matched verses`} aria-label={`Read chapter ${i + 1}`} onClick={() => useGita.getState().openChapter(i + 1)} />
                    ))}
                  </div>
                  <div className="num mt-1 flex justify-between text-[11px] text-text-3">
                    <span>1</span>
                    <span>9</span>
                    <span>18</span>
                  </div>
                </section>
                <button className="btn mt-6 w-full" onClick={showInGraph}>
                  <Orbit size={14} /> See my reflections in the graph
                </button>
              </div>
            )}
            {thoughts.length > 0 && (
              <ul className="max-h-[42vh] divide-y divide-line overflow-y-auto border-t border-line">
                {[...thoughts].reverse().map((t) => (
                  <li key={t.id} className="group px-5 py-3.5">
                    <div className="flex items-center gap-2 text-[12px] text-text-3">
                      <span>{new Date(t.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                      <span>· {HEAVINESS[t.intensity - 1]?.toLowerCase()}</span>
                      <button className="btn btn-ghost btn-icon btn-sm ml-auto opacity-0 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100" onClick={() => remove(t.id)} aria-label="Delete this reflection" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="serif mt-1 line-clamp-3 text-[14.5px] leading-[1.55] text-text-2">{t.text}</p>
                    <div className="mt-2 flex flex-wrap gap-1">{[...t.emotions, ...t.dilemmas, ...t.verses.slice(0, 2)].map((x) => nodeChip(x.id))}</div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-3">
              <button
                className="btn btn-sm"
                disabled={!thoughts.length}
                onClick={() => {
                  const blob = new Blob([exportThoughts(thoughts)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `gitaviswa-reflections-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download size={13} /> Export
              </button>
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                <Upload size={13} /> Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setThoughts(await importThoughts(await f.text()));
                    setNotice({ text: "Backup restored.", tone: "neutral" });
                  } catch (err) {
                    setNotice({ text: (err as Error).message, tone: "danger" });
                  }
                  e.target.value = "";
                }}
              />
              <button
                className="btn btn-sm btn-ghost btn-danger ml-auto"
                disabled={!thoughts.length}
                onClick={async () => {
                  if (!confirm("Delete every reflection stored in this browser? Export a backup first if you want to keep them.")) return;
                  await clearThoughts();
                  setThoughts([]);
                }}
              >
                <Trash2 size={13} /> Delete all
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
