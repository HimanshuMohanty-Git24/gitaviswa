"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Database, Download, ExternalLink, Eye, EyeOff, LoaderCircle, Monitor, Moon, PlugZap, Radio, Search, Sparkles, Sun, Trash2, WifiOff, X } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { useModal } from "@/lib/hooks/useModal";
import { useConnection, useSettings } from "@/lib/store/settingsStore";
import { PROVIDER_ORDER, PROVIDERS, type ProviderId } from "@/lib/llm/providers";
import { Notice } from "@/components/ui/primitives";

type Section = "model" | "search" | "appearance" | "data";
// Everyday settings first; the AI provider, search engine and graph-database integrations are optional extras.
const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Monitor size={15} /> },
  { id: "model", label: "AI (optional)", icon: <Sparkles size={15} /> },
  { id: "search", label: "Search · advanced", icon: <Search size={15} /> },
  { id: "data", label: "Graph data · advanced", icon: <Database size={15} /> },
];

function StatusBadge({ p }: { p: ProviderId }) {
  const env = useSettings((s) => s.env?.providers[p]);
  const key = useSettings((s) => s.keys[p]);
  const base = "inline-flex items-center gap-1.5 text-[11.5px]";
  if (p === "ollama") return <span className={`${base} text-text-3`}>Runs locally, no key</span>;
  if (env?.configured)
    return (
      <span className={`${base} text-good`} title={`${env.source}: ${env.masked}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-good" /> Key found in {env.source}
      </span>
    );
  if (key)
    return (
      <span className={`${base} text-good`}>
        <span className="h-1.5 w-1.5 rounded-full bg-good" /> Key saved in this browser
      </span>
    );
  return <span className={`${base} text-text-3`}>No key yet</span>;
}

function Field({ label, children, hint, htmlFor }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-2 text-[12.5px] font-medium text-text-2">
        {label}
      </label>
      {children}
      {hint && <div className="mt-1.5 text-[12px] leading-4 text-text-3">{hint}</div>}
    </div>
  );
}

function ProviderForm({ p }: { p: ProviderId }) {
  const info = PROVIDERS[p];
  const s = useSettings();
  const env = s.env?.providers[p];
  const [key, setKey] = useState(s.keys[p] || "");
  const [model, setModel] = useState(s.models[p] || env?.model || info.defaultModel);
  const [baseUrl, setBaseUrl] = useState(s.ollamaBaseUrl);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState<{ models: string[]; recommended: string | null } | null>(null);
  const [liveErr, setLiveErr] = useState("");

  useEffect(() => {
    setKey(useSettings.getState().keys[p] || "");
    setModel(useSettings.getState().models[p] || useSettings.getState().env?.providers[p]?.model || PROVIDERS[p].defaultModel);
    setMsg(null);
    setLive(null);
    setLiveErr("");
  }, [p]);

  // Providers retire models: fetch what this key can actually use.
  const loadLive = async () => {
    setLiveErr("");
    const headers: Record<string, string> = {};
    if (key) headers["x-gitaviswa-key"] = key;
    const qs = new URLSearchParams({ provider: p, ...(p === "ollama" ? { baseUrl } : {}) });
    const r = await fetch(`/api/settings/models?${qs}`, { headers }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    if (r.error) setLiveErr(r.error);
    else setLive({ models: r.models, recommended: r.recommended });
  };
  const connected = p === "ollama" || !!key || !!env?.configured;
  useEffect(() => {
    if (connected) loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, connected]);
  const modelMissing = !!live && live.models.length > 0 && !live.models.includes(model);
  const options = [...new Set([...info.models.map((m) => m.id), ...(live?.models || [])])];

  const save = async () => {
    setSaving(true);
    const r = await s.saveProvider(p, { key: info.envKey ? key : undefined, model, baseUrl: p === "ollama" ? baseUrl : undefined, makeDefault: true });
    setSaving(false);
    setMsg({ ok: true, text: r.message });
  };
  const test = async () => {
    setTesting(true);
    setMsg(null);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers["x-gitaviswa-key"] = key;
    const res = await fetch("/api/settings/test", { method: "POST", headers, body: JSON.stringify({ provider: p, model, baseUrl: p === "ollama" ? baseUrl : undefined }) }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setTesting(false);
    setMsg(res.ok ? { ok: true, text: `Connected. ${info.name} replied in ${res.latencyMs} ms using ${res.model}.${res.fallbackFrom ? ` “${res.fallbackFrom}” is retired, so ${res.model} was used instead.` : ""}` } : { ok: false, text: res.error || "The test request failed." });
    if (res.ok && res.fallbackFrom) setModel(res.model);
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-[17px] font-semibold text-text">{info.name}</h3>
          <StatusBadge p={p} />
        </div>
        <p className="mt-0.5 text-[13px] text-text-3">{info.tagline}</p>
      </div>

      {env?.configured && info.envKey && (
        <Notice tone="accent" icon={<Check size={14} />}>
          {info.envKey} was found in <code className="text-text">{env.source}</code> ({env.masked}), so there is nothing to type. A key entered below overrides it in this browser only.
        </Notice>
      )}

      {info.envKey && (
        <Field
          label="API key"
          htmlFor={`key-${p}`}
          hint={
            <a href={info.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
              Get a {info.name} key <ExternalLink size={11} />
            </a>
          }
        >
          <div className="flex gap-1.5">
            <input id={`key-${p}`} className="field font-mono !text-[12.5px]" type={show ? "text" : "password"} placeholder={env?.configured ? "Using the key from your .env file" : `${info.keyPrefix || ""}…`} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
            <button type="button" className="btn btn-icon h-9 w-9 shrink-0" onClick={() => setShow(!show)} aria-label={show ? "Hide key" : "Show key"}>
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
      )}

      {p === "ollama" && (
        <Field label="Ollama address" htmlFor="ollama-url" hint={`Run \`ollama serve\` and \`ollama pull ${model}\`. Everything stays on this machine.`}>
          <input id="ollama-url" className="field font-mono !text-[12.5px]" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
      )}

      <Field
        label={
          <>
            Model
            {live && <span className="font-normal text-text-3">{live.models.length} available to this key</span>}
            {connected && (
              <button type="button" className="ml-auto font-normal text-text-3 hover:text-text" onClick={loadLive}>
                Refresh list
              </button>
            )}
          </>
        }
        htmlFor={`model-${p}`}
        hint={liveErr ? `The live model list could not be loaded: ${liveErr}` : undefined}
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          <select className="field" value={options.includes(model) ? model : ""} onChange={(e) => e.target.value && setModel(e.target.value)} aria-label="Choose a model">
            <option value="">Custom model id</option>
            {options.map((id) => {
              const preset = info.models.find((m) => m.id === id);
              const off = live && live.models.length > 0 && !live.models.includes(id);
              return (
                <option key={id} value={id}>
                  {preset?.label || id}
                  {preset?.free ? " (free)" : ""}
                  {off ? " (unavailable)" : ""}
                </option>
              );
            })}
          </select>
          <input id={`model-${p}`} className="field font-mono !text-[12.5px]" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model id" />
        </div>
      </Field>
      {modelMissing && (
        <Notice tone="danger">
          “{model}” is not offered by {info.name} for this key.{" "}
          {live?.recommended && (
            <button type="button" className="font-medium text-accent-text underline" onClick={() => setModel(live.recommended!)}>
              Use {live.recommended}
            </button>
          )}
        </Notice>
      )}
      {p === "openrouter" && (
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-text-2">Free models</div>
          <div className="flex flex-wrap gap-1.5">
            {info.models
              .filter((m) => m.free)
              .map((m) => (
                <button type="button" key={m.id} className="chip" aria-pressed={model === m.id} onClick={() => setModel(m.id)}>
                  {m.label}
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-5">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Save and use
        </button>
        <button type="button" className="btn" onClick={test} disabled={testing || (!!info.envKey && !key && !env?.configured)}>
          {testing ? <LoaderCircle size={14} className="animate-spin" /> : <PlugZap size={14} />} {testing ? "Testing" : "Test connection"}
        </button>
        {info.envKey && (s.keys[p] || env?.source === ".env.local") && (
          <button type="button" className="btn btn-ghost btn-danger ml-auto" onClick={async () => (await s.forgetKey(p), setKey(""), setMsg({ ok: true, text: "Key removed from this browser and from .env.local." }))}>
            <Trash2 size={14} /> Remove key
          </button>
        )}
      </div>
      {msg && <p className={`text-[12.5px] leading-[1.45] ${msg.ok ? "text-good" : "text-danger"}`} role="status">{msg.text}</p>}
      <details className="group text-[12.5px] text-text-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-text-2 hover:text-text">
          <ChevronDown size={14} className="-rotate-90 transition-transform group-open:rotate-0" /> How keys are stored
        </summary>
        <p className="mt-2 pl-5 leading-5">
          A saved key is kept in this browser&apos;s local storage. When GitaViśva runs on your own machine it is also written to <code className="text-text-2">.env.local</code> (ignored by git) so it survives restarts. Keys are never sent back to the browser from the server. {s.env && !s.env.writable && s.env.reason ? `Here: ${s.env.reason}` : ""}
        </p>
      </details>
    </form>
  );
}

function ModelSection() {
  const active = useSettings((s) => s.active);
  const setActive = useSettings((s) => s.setActive);
  const conn = useConnection();
  const [tab, setTab] = useState<ProviderId>(active || "groq");
  return (
    <div>
      <h2 className="text-[18px] font-semibold text-text">Language model</h2>
      <p className="mt-1 max-w-[60ch] text-[13.5px] leading-[1.55] text-text-2">GitaViśva works fully offline. Connecting a model adds written answers in Ask, explanations of paths, deeper reflections and translations into more languages.</p>
      <div className="mt-3">
        {conn ? (
          <Notice tone="accent" icon={<Check size={14} />}>
            In use: <span className="font-medium text-text">{PROVIDERS[conn.provider].name}</span>, {conn.model}
          </Notice>
        ) : (
          <Notice icon={<WifiOff size={14} />}>Offline mode. Answers are assembled directly from the graph.</Notice>
        )}
      </div>

      <div className="mt-6 text-[12.5px] font-medium text-text-2">Provider</div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Provider">
        {PROVIDER_ORDER.map((p) => (
          <button key={p} role="radio" aria-checked={tab === p} className={`rounded-2 border px-3 py-2.5 text-left transition-colors ${tab === p ? "border-accent-line bg-accent-soft" : "border-line hover:border-line-3 hover:bg-surface-2"}`} onClick={() => setTab(p)}>
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-medium text-text">{PROVIDERS[p].name}</span>
              {active === p && <span className="ml-auto text-[11px] font-medium text-accent-text">In use</span>}
            </div>
            <div className="mt-0.5">
              <StatusBadge p={p} />
            </div>
          </button>
        ))}
        <button role="radio" aria-checked={!active} className={`rounded-2 border px-3 py-2.5 text-left transition-colors ${!active ? "border-accent-line bg-accent-soft" : "border-line hover:border-line-3 hover:bg-surface-2"}`} onClick={() => setActive(null)}>
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-text">
            <WifiOff size={13} /> No model
            {!active && <span className="ml-auto text-[11px] font-medium text-accent-text">In use</span>}
          </div>
          <div className="mt-0.5 text-[11.5px] text-text-3">Offline answers from the graph</div>
        </button>
      </div>
      <div className="mt-6 rounded-3 border border-line p-4 sm:p-5">
        <ProviderForm p={tab} />
      </div>
    </div>
  );
}

function SearchSection() {
  const index = useGita((s) => s.index);
  const semantic = useSettings((s) => s.semantic);
  const setSemantic = useSettings((s) => s.setSemantic);
  return (
    <div>
      <h2 className="text-[18px] font-semibold text-text">Search</h2>
      <p className="mt-1 max-w-[60ch] text-[13.5px] leading-[1.55] text-text-2">Search and Ask both run in this browser over {index?.docCount ?? "every"} documents: the Sanskrit, transliteration, five translations, word glosses and every concept.</p>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-3 border border-line p-4 hover:bg-surface-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={semantic} onChange={(e) => setSemantic(e.target.checked)} />
        <span>
          <span className="block text-[13.5px] font-medium text-text">Match by meaning as well as words</span>
          <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-text-3">
            {index?.hasVectors ? `Combines keyword search with semantic vectors (all-MiniLM-L6-v2, ${index.dim} dimensions) computed on this machine.` : "Keyword search is active. Run `npm run data:embeddings` once to add semantic vectors."}
          </span>
        </span>
      </label>
    </div>
  );
}

function AppearanceSection() {
  const themePref = useGita((s) => s.themePref);
  const setThemePref = useGita((s) => s.setThemePref);
  return (
    <div>
      <h2 className="text-[18px] font-semibold text-text">Appearance</h2>
      <p className="mt-1 text-[13.5px] text-text-2">One theme applies across every view.</p>
      <div className="seg mt-5" role="radiogroup" aria-label="Theme">
        {(
          [
            ["auto", "System", <Monitor key="m" size={14} />],
            ["dark", "Dark", <Moon key="d" size={14} />],
            ["light", "Light", <Sun key="l" size={14} />],
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} role="radio" aria-checked={themePref === id} onClick={() => setThemePref(id)} className="!px-4">
            {icon} {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DataSection() {
  const env = useSettings((s) => s.env);
  const graphs = useGita((s) => s.graphs);
  const [uri, setUri] = useState("");
  const [user, setUser] = useState("neo4j");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });
  const sync = async () => {
    setState({ busy: true });
    const r = await fetch("/api/neo4j", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uri: uri || undefined, user, password: password || undefined }) }).then((x) => x.json()).catch((e) => ({ ok: false, error: String(e) }));
    setState(r.ok ? { busy: false, ok: true, text: `Merged ${r.nodes} nodes and ${r.relationships} relationships in ${(r.ms / 1000).toFixed(1)} s.` } : { busy: false, ok: false, text: r.error });
  };
  return (
    <div>
      <h2 className="text-[18px] font-semibold text-text">Data</h2>
      <p className="mt-1 max-w-[60ch] text-[13.5px] leading-[1.55] text-text-2">
        The graph has {graphs?.graph.order.toLocaleString() ?? "857"} nodes and {graphs?.graph.size.toLocaleString() ?? "5,350"} relationships. Export it to a Neo4j database to query it with Cypher.
      </p>
      <form
        className="mt-5 space-y-3 rounded-3 border border-line p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          sync();
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-text">Sync to Neo4j</span>
          {env?.neo4j.configured && <span className="text-[11.5px] text-good">NEO4J_URI found in .env</span>}
        </div>
        <Field label="Connection URI" htmlFor="neo-uri">
          <input id="neo-uri" className="field font-mono !text-[12.5px]" placeholder={env?.neo4j.uri || "neo4j://localhost:7687"} value={uri} onChange={(e) => setUri(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="User" htmlFor="neo-user">
            <input id="neo-user" className="field" value={user} onChange={(e) => setUser(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="neo-pass">
            <input id="neo-pass" className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" className="btn btn-primary" disabled={state.busy}>
            {state.busy ? <LoaderCircle size={14} className="animate-spin" /> : <Radio size={14} />} {state.busy ? "Syncing" : "Sync now"}
          </button>
          <a className="btn" href="/data/gita-cypher-seed.cypher" download>
            <Download size={14} /> Download Cypher seed
          </a>
        </div>
        {state.text && <p className={`text-[12.5px] ${state.ok ? "text-good" : "text-danger"}`} role="status">{state.text}</p>}
      </form>
    </div>
  );
}

export function ByokSettingsModal() {
  const open = useGita((s) => s.settingsOpen);
  const setOpen = useGita((s) => s.setSettingsOpen);
  const [section, setSection] = useState<Section>("appearance");
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModal(open, overlayRef, dialogRef, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    useSettings.getState().loadEnv();
    const want = useGita.getState().settingsSection;
    setSection(SECTIONS.some((x) => x.id === want) ? (want as Section) : "appearance");
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={overlayRef} className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] backdrop-blur-[2px] sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            className="popover flex h-[92dvh] w-full max-w-[900px] flex-col overflow-hidden rounded-b-none sm:h-[min(720px,88dvh)] sm:rounded-b-[var(--radius-3)]"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-5 pr-2">
              <h1 className="text-[15px] font-semibold text-text">Settings</h1>
              <button className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} aria-label="Close settings">
                <X size={16} />
              </button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 md:w-[210px] md:flex-col md:border-b-0 md:border-r md:p-3" aria-label="Settings sections">
                {SECTIONS.map((s) => (
                  <button key={s.id} className={`flex shrink-0 items-center gap-2.5 rounded-2 px-3 py-2 text-left text-[13px] transition-colors ${section === s.id ? "bg-surface-3 font-medium text-text" : "text-text-2 hover:bg-surface-3 hover:text-text"}`} aria-current={section === s.id ? "page" : undefined} onClick={() => setSection(s.id)}>
                    <span className={section === s.id ? "text-accent-text" : "text-text-3"}>{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </nav>
              <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
                {section === "model" && <ModelSection />}
                {section === "search" && <SearchSection />}
                {section === "appearance" && <AppearanceSection />}
                {section === "data" && <DataSection />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
