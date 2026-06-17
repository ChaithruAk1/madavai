// Madav — WEB CAPABILITY MANIFEST (single source of capability truth on web).
//
// Replaces scattered `bridge.x && ...` guards with ONE canonical map of what works on web and
// what to tell the user when it doesn't. The renderer reads this for honest messaging so a
// feature can never silently degrade (the P0 trap in WEB-VS-DESKTOP.md). Statuses mirror the
// parity matrix; this file is the authoritative source going forward. See WEB-PARITY-PLAN.md §3.

export const WEB_STATUS = {
  PARITY: "parity",                  // full functional parity on web
  SERVICE: "service",                // reachable via a managed 3rd-party service (may be "coming")
  PARTIAL: "partial",                // works but reduced vs desktop
  DESKTOP_ONLY: "desktop-only",      // inherently local; not available on web
  BROWSER_LIMITED: "browser-limited",// depends on browser support (e.g. File System Access)
};

const STATUS_VALUES = new Set(Object.values(WEB_STATUS));

// id -> { status, label, message }. `message` shown to the user when the capability is not at
// full parity; PARITY entries may have an empty message.
export const CAPABILITIES = {
  "chat.basic":          { status: WEB_STATUS.PARITY,          label: "Chat",                      message: "" },
  "chat.toolLoop":       { status: WEB_STATUS.PARTIAL,         label: "Chat tools (search/image)", message: "Web chat tools are limited until the shared core lands." },
  "exec.python":         { status: WEB_STATUS.PARITY,          label: "Python (data work)",        message: "" },
  "exec.shell":          { status: WEB_STATUS.DESKTOP_ONLY,    label: "Terminal / shell",          message: "A system shell is desktop-only; the web uses sandboxed Python." },
  "projects.folder":     { status: WEB_STATUS.BROWSER_LIMITED, label: "Folder-linked Projects",    message: "Folder access needs Chrome or Edge and isn't available in this browser." },
  "projects.fileOutput": { status: WEB_STATUS.PARTIAL,         label: "Generated files",           message: "Generated files download in the browser instead of opening in a desktop app." },
  "file.openInApp":      { status: WEB_STATUS.DESKTOP_ONLY,    label: "Open in native app",        message: "Opening files directly in Excel or Word needs the desktop app; the web downloads them." },
  "team.memberTools":    { status: WEB_STATUS.PARTIAL,         label: "Team member tools",         message: "Web team members are text-only until the shared core lands." },
  "research.deep":       { status: WEB_STATUS.PARTIAL,         label: "Deep research",             message: "Web uses a single web search; multi-source research is on the way." },
  "skills.authoring":    { status: WEB_STATUS.PARTIAL,         label: "Skill authoring",           message: "Web ships built-in skills; authoring and import are desktop-only for now." },
  "mcp.connectors":      { status: WEB_STATUS.SERVICE,         label: "MCP connectors",            message: "Connectors run via a managed service (coming to web)." },
  "automation.browser":  { status: WEB_STATUS.SERVICE,         label: "Browser automation",        message: "Runs via a managed browser service (coming to web)." },
  "automation.desktop":  { status: WEB_STATUS.DESKTOP_ONLY,    label: "Native desktop automation", message: "Controlling local apps needs the desktop app." },
  "tasks.scheduled":     { status: WEB_STATUS.SERVICE,         label: "Scheduled tasks",           message: "Scheduled runs use a managed runner; the desktop app runs them locally." },
  "comms.messaging":     { status: WEB_STATUS.SERVICE,         label: "Telegram / mobile",         message: "Runs via a managed bot service; the desktop app runs it locally." },
  "voice.transcribe":    { status: WEB_STATUS.SERVICE,         label: "Voice input",               message: "Web uses the browser mic; managed transcription is on the way." },
  "qa.selfHeal":         { status: WEB_STATUS.DESKTOP_ONLY,    label: "Self-test / Repair Bay",    message: "Maintenance tooling is desktop-only." },
};

export function getCapability(id) {
  return CAPABILITIES[id] || null;
}

export function webStatus(id) {
  const c = CAPABILITIES[id];
  return c ? c.status : "unknown";
}

/** True when the user can actually use this on web (anything except a hard desktop-only). */
export function isAvailableOnWeb(id) {
  const s = webStatus(id);
  return s === WEB_STATUS.PARITY || s === WEB_STATUS.SERVICE || s === WEB_STATUS.PARTIAL || s === WEB_STATUS.BROWSER_LIMITED;
}

/** The user-facing note for why a capability is reduced/unavailable on web ("" when at parity). */
export function webMessage(id) {
  const c = CAPABILITIES[id];
  return c ? c.message : "";
}

export function isValidStatus(status) {
  return STATUS_VALUES.has(status);
}

export const CAPABILITY_IDS = Object.keys(CAPABILITIES);
