"use client";
import { useEffect, useState } from "react";
import { Cpu, Download, Gauge, Sparkles } from "lucide-react";
import { PROVIDERS, type ModelPreset } from "@/lib/llm/providers";
import { detectCapabilities, type Capabilities } from "@/lib/llm/ondevice";

const INFO = PROVIDERS.ondevice;

function Quality({ value }: { value?: ModelPreset["quality"] }) {
  const n = value ?? 0;
  return (
    <span className="inline-flex items-center gap-0.5" title={`Answer quality: ${n} of 5`} aria-label={`Quality ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? "bg-accent" : "bg-line-3"}`} />
      ))}
    </span>
  );
}

export function OnDeviceModels({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => {
    let alive = true;
    detectCapabilities()
      .then((c) => alive && setCaps(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2 bg-surface-2 px-3 py-2 text-[12px] text-text-3" role="status">
        <span className="inline-flex items-center gap-1.5">
          <Cpu size={13} />
          {!caps ? "Checking this device…" : caps.webgpu ? "WebGPU ready: fast path" : "No WebGPU: CPU mode, slower"}
        </span>
        {caps?.memoryGB != null && <span>{caps.memoryGB} GB memory</span>}
        {caps?.cores != null && <span>{caps.cores} CPU threads</span>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="In-browser model">
        {INFO.models.map((m) => {
          const on = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(m.id)}
              className={`rounded-2 border p-3 text-left transition-colors ${on ? "border-accent-line bg-accent-soft" : "border-line hover:border-line-3 hover:bg-surface-2"}`}
            >
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-text">{m.label}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-text-3">{m.bestFor}</span>
                </span>
                {m.id === INFO.defaultModel && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent-text">Default</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-3">
                <span className="inline-flex items-center gap-1">
                  <Download size={11} /> {m.sizeMB} MB
                </span>
                <span className="inline-flex items-center gap-1">
                  <Cpu size={11} /> ~{m.ramMB} MB RAM
                </span>
                <span className="inline-flex items-center gap-1">
                  <Gauge size={11} /> {m.speed}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Sparkles size={11} /> <Quality value={m.quality} />
                </span>
                {m.webgpu && <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px]">WebGPU</span>}
                {(m.quality ?? 3) <= 2 && <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-text-3">basic prose</span>}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[12px] leading-[1.45] text-text-3">
        Downloaded once into this browser&apos;s cache, then it runs offline on your device. <span className="text-text-2">1B and larger models write noticeably
        better prose</span>; 270–360M models are best for a quick grounded summary and will fall back to the graph-composed answer when they ramble. Keep questions
        short and check the cited verses. Community ONNX builds are hosted on Hugging Face.
      </p>
    </div>
  );
}
