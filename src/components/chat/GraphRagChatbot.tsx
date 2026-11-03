"use client";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { ArrowDown, ArrowUp, HeartHandshake, Info, NotebookPen, Square, Trash2, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { useConnection, useSettings } from "@/lib/store/settingsStore";
import { composeOfflineAnswer, retrieve, type Retrieval } from "@/lib/graphrag/engine";
import { embedQuery } from "@/lib/graphrag/search";
import { CRISIS_RESOURCES } from "@/lib/graphrag/safety";
import { askIntent, intentNote, isFollowUp } from "@/lib/graphrag/intent";
import { themeLabel } from "@/lib/graphrag/reflect";
import { useDraft } from "@/lib/store/draftStore";
import { uid as newId } from "@/lib/store/thoughtModel";
import { streamFromApi } from "@/lib/llm/browser";
import { PROVIDERS } from "@/lib/llm/providers";
import { Notice } from "@/components/ui/primitives";
import { RichText } from "./RichText";
import { SubgraphCitationChips } from "./SubgraphCitationChips";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  retrieval?: Retrieval;
  via?: string;
  offline?: boolean;
  crisis?: boolean;
  streaming?: boolean;
  /** what the assistant is doing right now, shown while there is no text yet */
  phase?: "searching" | "writing";
  note?: string;
}

export const useChat = create<{ messages: Msg[]; pending: string | null; set: (fn: (m: Msg[]) => Msg[]) => void }>((set) => ({
  messages: [],
  pending: null,
  set: (fn) => set((s) => ({ messages: fn(s.messages) })),
}));

/** Ask Partha-Sarathi from anywhere in the app. Queued, so it works even before the panel has mounted. */
export function askPartha(q: string) {
  useChat.setState({ pending: q });
  useGita.getState().setChatOpen(true);
}

const SUGGESTIONS: { group: string; items: string[] }[] = [
  { group: "For what you are going through", items: ["I'm anxious about my exam results and can't sleep.", "I lost my father last month. How do I carry this grief?"] },
  { group: "To understand the teaching", items: ["What does the Gita say about anger?", "Who is a sthitaprajña?", "Explain the ladder of fall in 2.62 to 2.63."] },
  { group: "To compare", items: ["Compare BG 2.47 with BG 18.66."] },
];

function CrisisCard() {
  return (
    <div className="rounded-2 border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-danger-soft p-3.5" role="alert">
      <div className="flex items-center gap-2 text-danger">
        <HeartHandshake size={16} />
        <span className="text-[13px] font-semibold">You are not alone</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-text-2">If you are thinking about ending your life or hurting yourself, please reach out to a person right now. You deserve real-time care.</p>
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

function Thinking({ phase }: { phase?: Msg["phase"] }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-text-3" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-3" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
      {phase === "writing" ? "Writing the answer" : "Searching the graph"}
    </div>
  );
}

export function GraphRagChatbot({ onClose }: { onClose: () => void }) {
  const messages = useChat((s) => s.messages);
  const setMessages = useChat((s) => s.set);
  const setHighlight = useGita((s) => s.setHighlight);
  const setSettingsOpen = useGita((s) => s.setSettingsOpen);
  const indexStatus = useGita((s) => s.indexStatus);
  const conn = useConnection();
  const semantic = useSettings((s) => s.semantic);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ready = indexStatus === "ready" || indexStatus === "error";
  const graphs = useGita((s) => s.graphs);
  // Sources of the last answer, carried into a follow-up's retrieval. Shown above the composer and removable.
  const [carry, setCarry] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(false);
  const atBottom = useRef(true);
  const answered = messages.filter((m) => m.role === "assistant" && !m.streaming && m.content).length;

  // Follow the answer only while the reader is at the bottom; never pull them away from text they are reading.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !messages.length) return;
    const last = messages[messages.length - 1];
    if (atBottom.current || (last.role === "assistant" && !last.content)) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setNewBelow(false);
    } else setNewBelow(true);
  }, [messages]);

  // Grow the composer with its content, up to a limit.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [input]);

  const patch = (id: string, p: Partial<Msg>) => setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const send = async (raw?: string) => {
    const q = (raw ?? input).trim();
    const ctx = useGita.getState().ragContext();
    if (!q || busy || !ctx) return;
    setInput("");
    setBusy(true);
    const uid = newId();
    const aid = newId();
    atBottom.current = true;
    const history = useChat.getState().messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { id: uid, role: "user", content: q }, { id: aid, role: "assistant", content: "", streaming: true, phase: "searching" }]);

    // 1–2 · hybrid retrieval + 2-hop traversal, entirely in the browser
    const vector = semantic && ctx.index?.hasVectors ? await embedQuery(q) : null;
    const intent = askIntent(q);
    const extraSeeds = carry.length && isFollowUp(q) ? carry.map((id, i) => ({ id, score: 0.9 - i * 0.15, via: "discussed just before" })) : undefined;
    const retrieval = await retrieve(ctx, q, { vector, extraSeeds });
    setCarry([...retrieval.verses.slice(0, 2).map((v) => v.id), ...retrieval.concepts.slice(0, 1).map((c) => c.id)]);
    // 3 · show on the canvas the subgraph the answer is grounded in
    setHighlight({ nodes: new Set(retrieval.subgraph.nodes), edges: new Set(retrieval.subgraph.edges), label: `Answer to “${q.slice(0, 48)}${q.length > 48 ? "…" : ""}”`, source: "chat" });
    patch(aid, { retrieval, crisis: retrieval.crisis, phase: "writing" });

    const offline = (note?: string) => patch(aid, { content: composeOfflineAnswer(ctx, retrieval), streaming: false, offline: true, via: "Composed from the graph", note });

    if (!conn) {
      offline();
    } else {
      const ac = new AbortController();
      abortRef.current = ac;
      const r = await streamFromApi({ mode: "chat", question: q, context: `${retrieval.context}\n\n# How to answer\n${intentNote(intent)}`, history, signal: ac.signal, onToken: (_t, full) => patch(aid, { content: full }) });
      // Adopt the working model in this browser so the header and later requests skip the retired one.
      if (r.ok && r.fallbackFrom && r.model) useSettings.getState().setModel(conn.provider, r.model);
      if (r.ok && r.text.trim())
        patch(aid, {
          streaming: false,
          via: `${PROVIDERS[conn.provider].name}, ${r.model}`,
          note: r.fallbackFrom ? `“${r.fallbackFrom}” is no longer offered by ${r.provider}, so ${r.model} answered and is now selected in this browser. Update ${PROVIDERS[conn.provider].envModel} in .env (or choose a model in Settings) to make this permanent.` : undefined,
        });
      else if (ac.signal.aborted) patch(aid, { streaming: false, note: "Stopped." });
      else offline(`${PROVIDERS[conn.provider].name} could not be reached (${r.error}). This answer was composed from the graph instead.`);
      abortRef.current = null;
    }
    setBusy(false);
  };

  /** Your own takeaway, in Reflect: the question and cited sources are kept as context (not as your view). */
  const takeaway = (m: Msg) => {
    const i = messages.indexOf(m);
    const question = [...messages.slice(0, i)].reverse().find((x) => x.role === "user")?.content ?? "";
    const cited = [...(m.retrieval?.verses.slice(0, 4).map((v) => v.id) ?? []), ...(m.retrieval?.concepts.slice(0, 2).map((c) => c.id) ?? [])];
    if (!useDraft.getState().startAskNote(question, cited)) return setBlocked(m.id);
    setBlocked(null);
    const g = useGita.getState();
    // On a phone the sheet would cover the composer; the conversation stays, and "Back to the answer" reopens it.
    if (window.matchMedia("(max-width: 767px)").matches) g.setChatOpen(false);
    g.setView("manas");
  };

  // Drain a queued question once the search index is ready (or has failed and we fall back to graph-only).
  const pending = useChat((s) => s.pending);
  useEffect(() => {
    if (!pending || busy || !ready) return;
    useChat.setState({ pending: null });
    send(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busy, ready]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line pl-4 pr-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-5 text-text">Ask</div>
          <div className="truncate text-[12px] text-text-3">{conn ? `${PROVIDERS[conn.provider].name}, ${conn.model}` : "Offline: answers are composed from the graph"}</div>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-icon" title="Clear conversation" aria-label="Clear conversation" onClick={() => (setMessages(() => []), setHighlight(null))}>
            <Trash2 size={15} />
          </button>
        )}
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close Ask">
          <X size={16} />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (atBottom.current) setNewBelow(false);
        }}
      >
        {/* One announcement per finished answer, instead of every streamed token. */}
        <p className="sr-only" role="status">
          {answered ? `Answer ${answered} ready.` : ""}
        </p>
        {!messages.length && (
          <div>
            <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-text">What would you like to understand?</h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.55] text-text-2">Ask about an idea, compare verses, or describe what you are going through. Each answer cites the verses it draws on and lights up that part of the graph.</p>
            {!conn && (
              <div className="mt-4">
                <Notice icon={<Info size={14} />} action={<button className="shrink-0 text-[12px] font-medium text-accent-text hover:underline" onClick={() => setSettingsOpen(true, "model")}>Connect</button>}>
                  No language model is connected, so answers are assembled directly from the graph. Connect one for written answers.
                </Notice>
              </div>
            )}
            <div className="mt-6 space-y-5">
              {SUGGESTIONS.map((g) => (
                <div key={g.group}>
                  <div className="label mb-2">{g.group}</div>
                  <div className="flex flex-col gap-1.5">
                    {g.items.map((s) => (
                      <button key={s} className="rounded-2 border border-line bg-surface-2 px-3 py-2 text-left text-[13px] leading-5 text-text-2 transition-colors hover:border-line-3 hover:text-text disabled:opacity-50" onClick={() => send(s)} disabled={!ready || busy}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {!ready && <div className="mt-4 text-[12px] text-text-3">Preparing search over 701 verses…</div>}
          </div>
        )}
        <div className="space-y-6">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-3 rounded-br-1 bg-surface-3 px-3.5 py-2 text-[14px] leading-[1.5] text-text [overflow-wrap:anywhere]">{m.content}</div>
              </div>
            ) : (
              <div key={m.id}>
                {m.crisis && (
                  <div className="mb-3">
                    <CrisisCard />
                  </div>
                )}
                {m.content ? (
                  <div className="prose-gita min-w-0 [overflow-wrap:anywhere]">
                    <RichText text={m.content} />
                    {m.streaming && <span className="ml-0.5 inline-block h-4 w-[3px] animate-pulse rounded-sm bg-accent align-middle" aria-hidden />}
                  </div>
                ) : (
                  <Thinking phase={m.phase} />
                )}
                {m.note && <p className="mt-2 text-[12px] leading-[1.45] text-text-3">{m.note}</p>}
                {m.retrieval && !m.streaming && <SubgraphCitationChips retrieval={m.retrieval} />}
                {m.via && !m.streaming && <div className="mt-2 text-[11.5px] text-text-4">{m.via}</div>}
                {!m.streaming && m.content && (
                  <div className="mt-2">
                    <button className="btn btn-sm max-sm:h-10" onClick={() => takeaway(m)} title="Write your own takeaway in Reflect. The question and cited sources are kept with it as context.">
                      <NotebookPen size={13} /> Save my takeaway
                    </button>
                    {blocked === m.id && <p className="mt-1.5 text-[12px] leading-4 text-text-3">You have unsaved writing in Reflect. Save or discard it first, so nothing is replaced.</p>}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      {newBelow && (
        <div className="pointer-events-none relative -mt-12 flex justify-center pb-2">
          <button className="btn btn-sm pointer-events-auto bg-surface shadow-[var(--shadow-2)]" onClick={() => (scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), setNewBelow(false))}>
            <ArrowDown size={13} /> New text below
          </button>
        </div>
      )}
      <div className="shrink-0 border-t border-line p-3">
        {carry.length > 0 && messages.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1 text-[12px] text-text-3">
            <span>Follow-ups continue from</span>
            {carry.map((id) => (
              <span key={id} className="chip !min-h-0 max-w-full !py-0">
                <span className="truncate">{themeLabel(graphs?.nodeById.get(id)) || id}</span>
              </span>
            ))}
            <button className="btn btn-ghost btn-icon btn-sm" aria-label="Start the next question fresh" title="Start the next question fresh" onClick={() => setCarry([])}>
              <X size={13} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-3 border border-line-2 bg-bg p-1.5 pl-3 focus-within:border-accent-line focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
          <textarea
            ref={inputRef}
            className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[14px] leading-5 text-text outline-none placeholder:text-text-3 focus-visible:outline-none"
            rows={1}
            placeholder="Ask a question"
            aria-label="Your question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {busy && abortRef.current ? (
            <button className="btn btn-icon h-9 w-9 shrink-0" onClick={() => abortRef.current?.abort()} aria-label="Stop">
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button className="btn btn-primary btn-icon h-9 w-9 shrink-0" onClick={() => send()} disabled={busy || !input.trim() || !ready} aria-label="Send">
              <ArrowUp size={16} />
            </button>
          )}
        </div>
        <p className="mt-2 px-1 text-[11.5px] leading-4 text-text-3">
          A contemplative companion, not a substitute for professional care.{" "}
          {conn ? `Your question, the last few messages and the retrieved verses are sent to ${PROVIDERS[conn.provider].name}. Your saved thoughts are not.` : "Answers are composed in this browser; nothing is sent."}
        </p>
      </div>
    </div>
  );
}
