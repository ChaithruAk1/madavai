// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
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
  { key: "memory",    label: "Cross-chat memory",    desc: "BrainEdge remembers durable facts about the user across conversations.", map: ["userMemory", "enabled"] },
  { key: "studio",    label: "Studio",               desc: "The Studio launcher — build web pages, documents, games and diagrams from a prompt." },
  { key: "terminal",  label: "Terminal",             desc: "The in-app terminal panel." },
  { key: "scheduler", label: "Scheduler",            desc: "Scheduled tasks, agent triggers and webhooks screen." },
  { key: "viamobile", label: "Via Mobile",           desc: "Control BrainEdge from your phone over Telegram." },
];

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
