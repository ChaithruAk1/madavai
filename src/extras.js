// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Extras — the feature switchboard (Settings → Extras, visible to Creator/Complimentary
// accounts only). Each entry is a feature the owner can turn on/off for this install.
//
// Storage: simple flags live in settings.extras[key] (absent = the feature's default,
// which is ON for everything). Entries with a `map` are unified views over an EXISTING
// engine switch (e.g. agentBrowser.enabled) so there is exactly ONE source of truth.
// Engine-side (.cjs) gates can't import this ESM file — they read the same contract
// directly: `(cfg.extras || {}).<key> !== false`. Keep the two in sync.

export const EXTRAS = [
  { key: "sage",      label: "Sage helper",          desc: "The floating in-app guide (Sage/Sara) that answers questions about the app on every screen." },
  { key: "voice",     label: "Voice input",          desc: "Microphone buttons in the chat composer and in Sage — speak instead of typing." },
  { key: "imagegen",  label: "Image generation",     desc: "The create_image tool in chats and agent missions (uses the selected model; needs an image-capable model)." },
  { key: "office",    label: "Office file creation", desc: "Real spreadsheets, Word docs, PowerPoint decks and PDFs built in chat (officedoc cards)." },
  { key: "browser",   label: "Agent Browser",        desc: "Agents drive a real browser window to research and act on live sites.", map: ["agentBrowser", "enabled"] },
  { key: "memory",    label: "Cross-chat memory",    desc: "Madav remembers durable facts about the user across conversations.", map: ["userMemory", "enabled"] },
  { key: "desktop",   label: "Desktop control",      desc: "Agents operate native Windows applications (open, read, click, type) with app allowlists and credential-field refusal." },
  { key: "research",  label: "Deep Research",        desc: "Multi-source web research with cited reports (deep_research tool)." },
  { key: "studio",    label: "Studio",               desc: "The Studio launcher — build web pages, documents, games and diagrams from a prompt." },
  { key: "terminal",  label: "Terminal",             desc: "The in-app terminal panel." },
  { key: "scheduler", label: "Scheduler",            desc: "Scheduled tasks, agent triggers and webhooks screen." },
  { key: "viamobile", label: "Via Mobile",           desc: "Control Madav from your phone over Telegram." },
  { key: "edgetrader", label: "EdgeTrader analysis pack", desc: "The built-in stock-analysis skills (equity analysis, adversarial debate, verdict format) used by the EdgeTrader agent team. Information, not financial advice." },
];

// Which features exist in THIS build (two-channel installers: scripts/build-features.mjs
// writes VITE_FEAT_<KEY>=0 for excluded features before a public build; dev/admin = all true).
// Display-only map — the actual code-dropping happens via per-file consts (Vite folds those).
export const FEAT_BUILT = {
  sage: import.meta.env.VITE_FEAT_SAGE !== "0",
  voice: import.meta.env.VITE_FEAT_VOICE !== "0",
  imagegen: import.meta.env.VITE_FEAT_IMAGEGEN !== "0",
  office: import.meta.env.VITE_FEAT_OFFICE !== "0",
  browser: import.meta.env.VITE_FEAT_BROWSER !== "0",
  memory: import.meta.env.VITE_FEAT_MEMORY !== "0",
  desktop: import.meta.env.VITE_FEAT_DESKTOP !== "0",
  research: import.meta.env.VITE_FEAT_RESEARCH !== "0",
  studio: import.meta.env.VITE_FEAT_STUDIO !== "0",
  terminal: import.meta.env.VITE_FEAT_TERMINAL !== "0",
  scheduler: import.meta.env.VITE_FEAT_SCHEDULER !== "0",
  viamobile: import.meta.env.VITE_FEAT_VIAMOBILE !== "0",
  edgetrader: import.meta.env.VITE_FEAT_EDGETRADER !== "0",
};

// Is a feature on? (absent/undefined = ON; only an explicit false turns it off)
export function extraOn(cfg, key) {
  if (!cfg) return true; // settings not loaded yet — never hide features on a flash
  const def = EXTRAS.find((e) => e.key === key);
  if (def && def.map) {
    const grp = cfg[def.map[0]];
    return !grp || grp[def.map[1]] !== false;
  }
  const x = cfg.extras || {};
  return x[key] !== false;
}

// Return the NEXT settings object with the flag applied (caller persists it).
export function setExtra(cfg, key, on) {
  const def = EXTRAS.find((e) => e.key === key);
  if (def && def.map) return { ...cfg, [def.map[0]]: { ...(cfg[def.map[0]] || {}), [def.map[1]]: !!on } };
  return { ...cfg, extras: { ...(cfg.extras || {}), [key]: !!on } };
}
