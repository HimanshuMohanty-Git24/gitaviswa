// Crisis-language detection. Partha-Sarathi is a contemplative companion, not a clinician: when someone
// signals they may be in danger, the UI surfaces human help first — online or offline, with or without a key.

const CRISIS = [
  /\bkill(ing)? my ?self\b/i, /\bsuicid/i, /\bend(ing)? (it all|my life)\b/i, /\bwant to die\b/i, /\bdon'?t want to (live|be alive)\b/i,
  /\bself[- ]?harm/i, /\bcut(ting)? myself\b/i, /\bno reason to live\b/i, /\bbetter off dead\b/i, /\btake my (own )?life\b/i,
  /आत्महत्या/, /मरना चाहता/, /मरना चाहती/,
];

export function detectCrisis(text: string): boolean {
  return CRISIS.some((re) => re.test(text));
}

export const CRISIS_RESOURCES = [
  { label: "India · Tele-MANAS (24×7, free)", contact: "14416 or 1-800-891-4416" },
  { label: "Worldwide directory of helplines", contact: "findahelpline.com" },
  { label: "If you are in immediate danger", contact: "call your local emergency number" },
];
