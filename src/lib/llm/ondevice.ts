"use client";
// Lightweight LLMs that run entirely in this browser (Transformers.js, WebGPU or WASM) with weights from the
// Hugging Face Hub. Nothing is sent to a server: the model is downloaded once and kept in the browser cache.
//
// Transformers.js is loaded at runtime from the CDN so the Next.js bundle stays small and no ONNX native
// packages are pulled into the client build. The weights themselves come from huggingface.co.

export interface OnDeviceProgress {
  status: string;
  file?: string;
  name?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export interface Capabilities {
  webgpu: boolean;
  memoryGB: number | null;
  cores: number | null;
}

export type OnDeviceMessage = { role: "system" | "user" | "assistant"; content: string };

interface Tokenizer {
  apply_chat_template?: (messages: OnDeviceMessage[], opts?: Record<string, unknown>) => string | Promise<string>;
}

interface TextGenPipeline {
  (input: string, opts?: Record<string, unknown>): Promise<unknown>;
  tokenizer: Tokenizer;
  dispose?: () => Promise<void>;
}

interface TransformersModule {
  pipeline: (task: "text-generation", model: string, opts?: Record<string, unknown>) => Promise<TextGenPipeline>;
  TextStreamer: new (tokenizer: unknown, opts?: Record<string, unknown>) => unknown;
  env: { allowLocalModels: boolean; useBrowserCache: boolean };
}

const TF_VERSION = "4.3.2";
const TF_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TF_VERSION}`;

let modulePromise: Promise<TransformersModule> | null = null;

function loadTransformers(): Promise<TransformersModule> {
  modulePromise ??= (async () => {
    const spec: string = TF_URL;
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec)) as unknown as TransformersModule;
    mod.env.allowLocalModels = false;
    mod.env.useBrowserCache = true;
    return mod;
  })().catch((e) => {
    modulePromise = null;
    throw new Error(`Could not load the in-browser engine (${(e as Error).message}). One online visit is needed; a hosted provider still works without it.`);
  });
  return modulePromise;
}

let capsPromise: Promise<Capabilities> | null = null;

/** WebGPU, device memory and CPU threads, once per page. */
export function detectCapabilities(): Promise<Capabilities> {
  if (typeof navigator === "undefined") return Promise.resolve({ webgpu: false, memoryGB: null, cores: null });
  capsPromise ??= (async () => {
    const nav = navigator as Navigator & { deviceMemory?: number; gpu?: { requestAdapter: () => Promise<unknown> } };
    let webgpu = false;
    try {
      webgpu = !!nav.gpu && !!(await nav.gpu.requestAdapter());
    } catch {
      webgpu = false;
    }
    return {
      webgpu,
      memoryGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
      cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    };
  })();
  return capsPromise;
}

const pipelines = new Map<string, Promise<TextGenPipeline>>();
let progressSink: ((p: OnDeviceProgress) => void) | null = null;

async function getPipeline(model: string, onProgress?: (p: OnDeviceProgress) => void): Promise<TextGenPipeline> {
  if (typeof window === "undefined") throw new Error("In-browser models can only run in a browser.");
  const hit = pipelines.get(model);
  progressSink = onProgress ?? null;
  if (hit) return hit;

  const tf = await loadTransformers();
  const caps = await detectCapabilities();
  progressSink?.({ status: "initiate" });

  const loading = tf
    .pipeline("text-generation", model, {
      device: caps.webgpu ? "webgpu" : "wasm",
      dtype: caps.webgpu ? "q4f16" : "q4",
      progress_callback: (p: unknown) => progressSink?.(p as OnDeviceProgress),
    })
    .then((pipe) => {
      // Small machines cannot hold two models: free the previous one.
      for (const [id, other] of pipelines) {
        if (id === model) continue;
        pipelines.delete(id);
        other.then((o) => o.dispose?.()).catch(() => {});
      }
      return pipe;
    });

  pipelines.set(model, loading);
  try {
    return await loading;
  } catch (e) {
    pipelines.delete(model);
    throw new Error(`“${model}” could not be loaded (${(e as Error).message}). Try a smaller model or a hosted provider.`);
  }
}

/** Download and warm a model without generating anything (used by the settings test button). */
export async function loadOnDeviceModel(model: string, onProgress?: (p: OnDeviceProgress) => void): Promise<void> {
  await getPipeline(model, onProgress);
}

async function toPrompt(tokenizer: Tokenizer, messages: OnDeviceMessage[]): Promise<string> {
  try {
    const template = tokenizer.apply_chat_template;
    if (typeof template === "function") {
      const out = await template.call(tokenizer, messages, { tokenize: false, add_generation_prompt: true });
      if (typeof out === "string" && out.trim()) return out;
    }
  } catch {
    // fall through to ChatML
  }
  return messages.map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>`).join("\n") + "\n<|im_start|>assistant\n";
}

class StopGeneration extends Error {}

/** Removes streaming `…` reasoning so only the answer reaches the reader. */
class ThinkFilter {
  private inThink = false;
  private buf = "";

  push(piece: string): string {
    this.buf += piece;
    let out = "";
    while (this.buf) {
      if (this.inThink) {
        const end = this.buf.indexOf("</think");
        if (end < 0) {
          this.buf = this.buf.slice(Math.max(0, this.buf.length - 8));
          return out;
        }
        const close = this.buf.indexOf(">", end);
        if (close < 0) return out;
        this.buf = this.buf.slice(close + 1);
        this.inThink = false;
        continue;
      }
      const start = this.buf.indexOf("<think");
      if (start < 0) {
        const keep = Math.min(this.buf.length, 7);
        out += this.buf.slice(0, this.buf.length - keep);
        this.buf = this.buf.slice(this.buf.length - keep);
        return out;
      }
      const open = this.buf.indexOf(">", start);
      if (open < 0) {
        out += this.buf.slice(0, start);
        this.buf = this.buf.slice(start);
        return out;
      }
      out += this.buf.slice(0, start);
      this.buf = this.buf.slice(open + 1);
      this.inThink = true;
    }
    return out;
  }

  flush(): string {
    const rest = this.buf;
    this.buf = "";
    return this.inThink ? "" : rest;
  }
}

const STOP_MARKERS = [
  "\nPlease let me know",
  "\nLet me know if",
  "\nI am ready",
  "\nI need to know",
  "\nI hope this helps",
  "\nHope this helps",
  "\nNote:",
  "\nQ:",
  "\nUser:",
  "\nAs an AI",
  "\nI cannot",
  "\nI'm sorry",
  "\nSorry,",
];

function stopIndex(text: string): number {
  let at = -1;
  for (const marker of STOP_MARKERS) {
    const i = text.indexOf(marker);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  return at;
}

function tidy(text: string): string {
  let t = text.replace(/\s+$/g, "").replace(/^(okay|alright|sure|certainly|of course)\s*[,!.]\s*/i, "");
  if (t && !/[.!?…)"'”’\]]$/.test(t)) {
    const cut = Math.max(t.lastIndexOf("."), t.lastIndexOf("!"), t.lastIndexOf("?"));
    if (cut >= 40) t = t.slice(0, cut + 1);
  }
  return t;
}

export interface GenerateOptions {
  model: string;
  messages: OnDeviceMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  onToken?: (token: string, full: string) => void;
  onProgress?: (p: OnDeviceProgress) => void;
}

/** Stream a completion from the in-browser model. Resolves with the text produced so far. */
export async function generateOnDevice(opts: GenerateOptions): Promise<{ text: string; aborted: boolean }> {
  const tf = await loadTransformers();
  const pipe = await getPipeline(opts.model, opts.onProgress);
  const prompt = await toPrompt(pipe.tokenizer, opts.messages);
  const filter = new ThinkFilter();
  let text = "";
  let aborted = false;

  const streamer = new tf.TextStreamer(pipe.tokenizer as never, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (piece: string) => {
      if (opts.signal?.aborted) {
        aborted = true;
        throw new StopGeneration();
      }
      const clean = filter.push(piece);
      if (clean) {
        text += clean;
        // Small models start offering help or asking questions after the answer; cut there instead of rambling.
        const stop = stopIndex(text);
        if (stop >= 0) {
          text = tidy(text.slice(0, stop));
          opts.onToken?.("", text);
          throw new StopGeneration();
        }
        opts.onToken?.(clean, text);
      }
    },
  });

  try {
    await pipe(prompt, {
      max_new_tokens: opts.maxTokens ?? 320,
      do_sample: (opts.temperature ?? 0.4) > 0,
      temperature: Math.max(0.01, opts.temperature ?? 0.4),
      top_p: 0.9,
      top_k: 40,
      repetition_penalty: 1.12,
      no_repeat_ngram_size: 3,
      streamer,
    });
  } catch (e) {
    if (!(e instanceof StopGeneration) && !opts.signal?.aborted) throw e;
    aborted = true;
  }

  const tail = filter.flush();
  if (tail) text += tail;
  const finalText = tidy(text);
  if (finalText !== text) {
    text = finalText;
    opts.onToken?.("", text);
  }
  return { text, aborted };
}

/** Download, load and round-trip a tiny completion. Returns timings for the settings screen. */
export async function testOnDevice(model: string, onProgress?: (p: OnDeviceProgress) => void): Promise<{ ok: boolean; ms: number; sample?: string; error?: string }> {
  const t0 = performance.now();
  try {
    await loadOnDeviceModel(model, onProgress);
    onProgress?.({ status: "ready" });
    const out = await generateOnDevice({
      model,
      messages: [{ role: "user", content: "Reply with exactly the word: Om" }],
      maxTokens: 16,
      temperature: 0,
    });
    return { ok: true, ms: Math.round(performance.now() - t0), sample: out.text.trim().slice(0, 80) };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: (e as Error).message };
  }
}
