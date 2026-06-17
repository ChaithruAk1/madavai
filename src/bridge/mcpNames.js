// Pure helpers for the web MCP integration — no browser globals, so they're unit-testable.
// The network calls (/mcp/tools, /mcp/call) and per-session wiring live in webBridge.js.
// MCP on web is opt-in via settings.mcpServers (default empty). See docs/PHASE3-MCP.md.

/** Lowercase to a safe tool-name segment: [a-z0-9-], trimmed, max 24 chars. */
export function mcpSanitize(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "mcp";
}

function hostOf(u) { try { return new URL(u).hostname; } catch { return ""; } }

/** Read configured MCP servers from settings: only valid https servers; default []. */
export function mcpServersFromSettings(s) {
  const list = s && Array.isArray(s.mcpServers) ? s.mcpServers : [];
  return list
    .map((m, i) => (m && typeof m === "object")
      ? { id: mcpSanitize(m.id || hostOf(m.url) || ("s" + i)), url: String(m.url || "").trim(), headers: (m.headers && typeof m.headers === "object") ? m.headers : {} }
      : null)
    .filter((m) => m && /^https:\/\//i.test(m.url));
}

/** Build the OpenAI tool name the model sees: mcp__<server>__<tool>, safe + <=64 chars. */
export function mcpToolName(serverId, tool) {
  return ("mcp__" + mcpSanitize(serverId) + "__" + mcpSanitize(tool)).slice(0, 64);
}

/** Flatten an MCP tool result ({content:[{type:'text',text}]}) to a string for the model. */
export function mcpResultText(result) {
  if (result == null) return "(no result)";
  if (typeof result === "string") return result.slice(0, 24000);
  const c = result.content;
  if (Array.isArray(c)) {
    const t = c.map((x) => (x && typeof x.text === "string") ? x.text : JSON.stringify(x)).join("\n").trim();
    return (t || "(empty)").slice(0, 24000);
  }
  return JSON.stringify(result).slice(0, 24000);
}
