// In-browser models: the picker needs friendly, complete facts for every preset, and a sensible default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_ORDER, PROVIDERS, modelLabel } from "../src/lib/llm/providers.ts";
import { buildLocalChatPrompt, compactLocalContext, ungroundedReason } from "../src/lib/llm/localPrompt.ts";

test("in-browser models are ready for an intuitive picker", () => {
  const p = PROVIDERS.ondevice;
  assert.equal(p.local, true);
  assert.equal(PROVIDER_ORDER[0], "ondevice");
  assert.ok(p.models.length >= 4);
  assert.equal(new Set(p.models.map((m) => m.id)).size, p.models.length);
  assert.ok(p.models.some((m) => m.id === p.defaultModel));
  for (const m of p.models) {
    assert.ok(m.label, m.id);
    assert.ok(m.params, m.id);
    assert.ok(m.sizeMB, m.id);
    assert.ok(m.ramMB, m.id);
    assert.ok(m.quality, m.id);
    assert.ok(m.speed, m.id);
    assert.ok(m.bestFor, m.id);
  }
  assert.equal(modelLabel("ondevice", p.defaultModel), p.models.find((m) => m.id === p.defaultModel)?.label);
});

test("hosted providers still have keys and the browser provider has none", () => {
  for (const id of PROVIDER_ORDER) {
    const p = PROVIDERS[id];
    if (p.local) assert.equal(p.envKey, null);
    else if (id === "ollama") assert.equal(p.envKey, null);
    else assert.ok(p.envKey, id);
  }
});

const CONTEXT = [
  "# Retrieved knowledge-graph context (GitaViswa GraphRAG)",
  "",
  "## Concepts (SanskritConcept nodes)",
  "[Concept: Karma] karma — action. The force of action and its fruit.",
  "[Concept: Nishkama karma] niṣkāma karma — action without craving its fruit.",
  "",
  "## Verses",
  "[BG 2.47] — spoken by Kṛṣṇa",
  "  Sanskrit: कर्मण्येवाधिकारस्ते",
  "  IAST: karmaṇy evādhikāras te",
  "  Translation (Swami Sivananda): You have a right to action alone, never to its fruits.",
  "  Why retrieved: directly defines acting without attachment to results",
  "[BG 3.8] — spoken by Kṛṣṇa",
  "  Translation (Swami Sivananda): Perform your obligatory duty, for action is better than inaction.",
  "",
  "## Mental states (Emotion nodes)",
  "[Emotion: Moha] delusion — the mind mistaking the passing for the real.",
  "",
  "# How to answer",
  "Take a side and address the asker's feelings.",
].join("\n");

test("the local prompt is short, verse-first and ignores large-model instructions", () => {
  const prompt = buildLocalChatPrompt("what is karma", CONTEXT);
  assert.match(prompt, /3 to 5 short sentences/);
  assert.match(prompt, /\[BG 2\.47\]/);
  assert.match(prompt, /Question: what is karma/);
  assert.ok(prompt.length < 2600, `prompt too long: ${prompt.length}`);
  assert.doesNotMatch(prompt, /Take a side/);
  assert.doesNotMatch(prompt, /कर्मण्येव/);
  assert.ok(compactLocalContext(CONTEXT).startsWith("[BG 2.47]"));
});

test("rambling or uncited small-model replies are rejected", () => {
  assert.ok(ungroundedReason("Okay, I'll accept the initial assumption that the Gita's response is a guide. I am ready to continue. I need to know what the specific details are."));
  assert.ok(ungroundedReason("Karma is a broad concept that has many meanings in Indian philosophy and daily life."));
  assert.equal(ungroundedReason("Karma means action. The Gita asks you to act without clinging to results [BG 2.47]."), null);
});
