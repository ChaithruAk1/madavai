// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// connectorIcons — BUNDLED brand icons for connectors (the Anthropic-connectors approach:
// icons ship inside the app on light tiles — zero runtime fetching, so they can never
// flicker, rate-limit or disappear offline). SVGs vendored from Simple Icons (CC0) into
// src/assets/connector-icons/; unknown services get a deliberate colored monogram tile.
const files = import.meta.glob("./assets/connector-icons/*.svg", { query: "?url", import: "default", eager: true });
const ICONS = {};
for (const [p, url] of Object.entries(files)) ICONS[p.split("/").pop().replace(".svg", "")] = url;

// keyword (matched against the connector's title/name/id, lowercased) → icon file
const ALIAS = [
  ["google drive", "googledrive"], ["gdrive", "googledrive"], ["drive", "googledrive"],
  ["google calendar", "googlecalendar"], ["calendar", "googlecalendar"],
  ["gmail", "gmail"], ["mail", "gmail"],
  ["github", "github"], ["slack", "slack"], ["notion", "notion"], ["linear", "linear"],
  ["asana", "asana"], ["figma", "figma"], ["jira", "jira"], ["confluence", "confluence"],
  ["postgres", "postgresql"], ["mysql", "mysql"], ["telegram", "telegram"],
  ["discord", "discord"], ["stripe", "stripe"], ["zapier", "zapier"],
  ["airtable", "airtable"], ["trello", "trello"], ["dropbox", "dropbox"],
  ["anthropic", "anthropic"], ["claude", "anthropic"], ["ollama", "ollama"],
];

export function iconUrlFor(text) {
  const t = String(text || "").toLowerCase();
  for (const [kw, slug] of ALIAS) if (t.includes(kw) && ICONS[slug]) return ICONS[slug];
  return null;
}
