// Unified provider registry. Hosted providers speak the OpenAI-compatible /chat/completions protocol.
// "ondevice" is different: a small Hugging Face model runs inside the visitor's browser (Transformers.js,
// WebGPU or WASM). Nothing is sent anywhere, and no key is needed.

export type ProviderId = "ondevice" | "groq" | "openrouter" | "xai" | "openai" | "ollama";

export interface ModelPreset {
  id: string;
  label: string;
  free?: boolean;
  /** In-browser models: plain-language facts so people can choose without knowing what a parameter is. */
  params?: string;
  sizeMB?: number;
  ramMB?: number;
  quality?: 1 | 2 | 3 | 4 | 5;
  speed?: "fast" | "balanced" | "slow";
  bestFor?: string;
  /** Recommended on a machine with WebGPU. Works on CPU too, just slower. */
  webgpu?: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  tagline: string;
  baseUrl: string;
  envKey: string | null;
  envModel: string;
  envBaseUrl?: string;
  defaultModel: string;
  models: ModelPreset[];
  keyUrl: string;
  keyPrefix?: string;
  /** true → the model runs in the visitor's browser; the server never relays it and no key is needed. */
  local?: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  ondevice: {
    id: "ondevice",
    name: "In this browser",
    tagline: "A small model runs on your device — free, offline, and private",
    baseUrl: "",
    envKey: null,
    envModel: "",
    defaultModel: "onnx-community/Qwen2.5-0.5B-Instruct",
    local: true,
    models: [
      {
        id: "onnx-community/Qwen2.5-0.5B-Instruct",
        label: "Qwen2.5 0.5B",
        params: "0.5B",
        sizeMB: 400,
        ramMB: 900,
        quality: 3,
        speed: "fast",
        bestFor: "Balanced default for most laptops",
        webgpu: true,
      },
      {
        id: "HuggingFaceTB/SmolLM2-360M-Instruct",
        label: "SmolLM2 360M",
        params: "0.36B",
        sizeMB: 270,
        ramMB: 700,
        quality: 2,
        speed: "fast",
        bestFor: "Quickest answers on modest machines",
      },
      {
        id: "onnx-community/gemma-3-270m-it-ONNX",
        label: "Gemma 3 270M",
        params: "0.27B",
        sizeMB: 350,
        ramMB: 800,
        quality: 2,
        speed: "fast",
        bestFor: "Tiny multilingual model, Hindi included",
      },
      {
        id: "onnx-community/Llama-3.2-1B-Instruct",
        label: "Llama 3.2 1B",
        params: "1B",
        sizeMB: 800,
        ramMB: 1600,
        quality: 3,
        speed: "balanced",
        bestFor: "Best English writing for its size",
        webgpu: true,
      },
      {
        id: "onnx-community/Qwen2.5-1.5B-Instruct",
        label: "Qwen2.5 1.5B",
        params: "1.5B",
        sizeMB: 1100,
        ramMB: 2400,
        quality: 4,
        speed: "balanced",
        bestFor: "Highest quality that still fits most laptops",
        webgpu: true,
      },
      {
        id: "onnx-community/Qwen3-0.6B-ONNX",
        label: "Qwen3 0.6B",
        params: "0.6B",
        sizeMB: 500,
        ramMB: 1200,
        quality: 3,
        speed: "fast",
        bestFor: "Thinks step by step before answering",
        webgpu: true,
      },
    ],
    keyUrl: "https://huggingface.co/models?library=transformers.js&p=text-generation",
  },
  groq: {
    id: "groq",
    name: "Groq",
    tagline: "Ultra-fast open models on LPUs",
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    envModel: "GROQ_MODEL",
    // Groq retired the Llama 3.x / Mixtral models in 2026; these are its current chat models.
    defaultModel: "openai/gpt-oss-120b",
    models: [
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B (fastest)" },
      { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B" },
    ],
    keyUrl: "https://console.groq.com/keys",
    keyPrefix: "gsk_",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    tagline: "Hundreds of models, including free ones",
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    envModel: "OPENROUTER_MODEL",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B Instruct", free: true },
      { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B", free: true },
      { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1", free: true },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet (paid)" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini (paid)" },
    ],
    keyUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
  },
  xai: {
    id: "xai",
    name: "xAI Grok",
    tagline: "Grok models from xAI",
    baseUrl: "https://api.x.ai/v1",
    envKey: "XAI_API_KEY",
    envModel: "XAI_MODEL",
    defaultModel: "grok-2-latest",
    models: [
      { id: "grok-2-latest", label: "Grok 2" },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 mini" },
    ],
    keyUrl: "https://console.x.ai",
    keyPrefix: "xai-",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    tagline: "GPT-4o family",
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    envModel: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
  },
  ollama: {
    id: "ollama",
    name: "Local Ollama",
    tagline: "100% free & offline on your machine",
    baseUrl: "http://localhost:11434",
    envKey: null,
    envModel: "OLLAMA_MODEL",
    envBaseUrl: "OLLAMA_BASE_URL",
    defaultModel: "llama3.1",
    models: [
      { id: "llama3.1", label: "Llama 3.1 8B" },
      { id: "llama3.2", label: "Llama 3.2 3B" },
      { id: "qwen2.5", label: "Qwen 2.5 7B" },
      { id: "gemma2", label: "Gemma 2 9B" },
    ],
    keyUrl: "https://ollama.com/download",
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["ondevice", "groq", "openrouter", "xai", "openai", "ollama"];

export const isProviderId = (s: unknown): s is ProviderId => typeof s === "string" && s in PROVIDERS;

/** Human label for a model id (in-browser models have friendly names; API models keep their id). */
export const modelLabel = (p: ProviderId, id: string) => PROVIDERS[p].models.find((m) => m.id === id)?.label || id;

/** The env variable names the settings API is allowed to read & write. */
export const MANAGED_ENV_KEYS = [
  "LLM_PROVIDER",
  ...PROVIDER_ORDER.flatMap((p) => [PROVIDERS[p].envKey, PROVIDERS[p].envModel, PROVIDERS[p].envBaseUrl]).filter((x): x is string => !!x),
  "NEO4J_URI",
  "NEO4J_USER",
  "NEO4J_PASSWORD",
];

export const maskKey = (k: string) => (k.length <= 10 ? "••••" : `${k.slice(0, 4)}…${k.slice(-4)}`);
