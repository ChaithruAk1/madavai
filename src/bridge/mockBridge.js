// Mock implementation of the Bridge contract. Streams fake UiEvents so the
// renderer layout is fully exercised — including a tool call that pauses on a
// permission_request until the UI calls resolvePermission(). Swap this for the
// real `window.brainedge` (Electron preload → SessionManager) with no UI changes.

let seq = 0;
const listeners = new Set();
const pendingPermissions = new Map(); // requestId -> resolve fn

function emit(sessionId, kind, data) {
  const e = { sessionId, seq: seq++, kind, data };
  listeners.forEach((cb) => cb(e));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function streamText(sessionId, text, chunk = 3, delay = 18) {
  const words = text.split(" ");
  for (let i = 0; i < words.length; i += chunk) {
    emit(sessionId, "assistant_delta", { text: words.slice(i, i + chunk).join(" ") + " " });
    await sleep(delay);
  }
}

// Canned "turn" that shows off every event kind.
async function runDemoTurn(sessionId, mode, prompt) {
  emit(sessionId, "init", {
    model: "deepseek/deepseek-v3", cwd: "~/projects/brainedge",
    permissionMode: mode === "cowork" ? "acceptEdits" : "default",
    tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
  });
  await sleep(250);

  await streamText(sessionId, `Sure — let me look at the project structure for your "${prompt}" request first.`);
  emit(sessionId, "assistant_message", { stop_reason: "tool_use" });

  // A safe read tool — auto-approved.
  const t1 = "tool_" + Math.random().toString(36).slice(2, 7);
  emit(sessionId, "tool_use", { id: t1, name: "Grep", input: { pattern: "SessionManager", glob: "**/*.ts" }, auto: true });
  await sleep(600);
  emit(sessionId, "tool_result", { id: t1, name: "Grep", ok: true, output: "main/session-manager.ts:14: export interface SessionManager {\nmain/session-manager.ts:42:   start(req): Promise<SessionHandle>" });
  await sleep(300);

  await streamText(sessionId, "Found it. I'll add the streaming `sendInput` method now.");
  emit(sessionId, "assistant_message", { stop_reason: "tool_use" });

  // A write tool — needs permission in non-cowork modes.
  const t2 = "tool_" + Math.random().toString(36).slice(2, 7);
  const input = { file_path: "main/session-manager.ts", patch: "+  async sendInput(id, text) { /* streamInput */ }" };
  if (mode === "cowork") {
    // acceptEdits → no prompt
    emit(sessionId, "tool_use", { id: t2, name: "Edit", input, auto: true });
    await sleep(500);
    emit(sessionId, "tool_result", { id: t2, name: "Edit", ok: true, output: "Applied 1 edit to session-manager.ts" });
  } else {
    emit(sessionId, "tool_use", { id: t2, name: "Edit", input, auto: false });
    const allowed = await requestPermission(sessionId, t2, "Edit", input);
    if (allowed) {
      await sleep(500);
      emit(sessionId, "tool_result", { id: t2, name: "Edit", ok: true, output: "Applied 1 edit to session-manager.ts" });
    } else {
      emit(sessionId, "permission_denied", { id: t2, name: "Edit", reason: "User declined" });
      await streamText(sessionId, "Understood — I left the file unchanged.");
      emit(sessionId, "result", { subtype: "success", num_turns: 2, duration_ms: 4200, total_cost_usd: 0.004 });
      return;
    }
  }

  await sleep(250);
  await streamText(sessionId, "Done. The method is wired to `Query.streamInput` for multi-turn input.");
  emit(sessionId, "assistant_message", { stop_reason: "end_turn" });
  emit(sessionId, "result", { subtype: "success", num_turns: 3, duration_ms: 6100, total_cost_usd: 0.006 });
}

function requestPermission(sessionId, toolUseId, toolName, input) {
  const requestId = "perm_" + Math.random().toString(36).slice(2, 8);
  emit(sessionId, "permission_request", { requestId, toolName, input, toolUseId });
  return new Promise((resolve) => pendingPermissions.set(requestId, resolve));
}

export const mockBridge = {
  async start(req) {
    const sessionId = "sess_" + Math.random().toString(36).slice(2, 8);
    runDemoTurn(sessionId, req.mode, req.prompt); // fire and forget; streams events
    return { sessionId };
  },
  async sendInput(sessionId, text, _images) {
    runDemoTurn(sessionId, "code", text);
  },
  async interrupt(sessionId) {
    emit(sessionId, "result", { subtype: "interrupted", num_turns: 1, duration_ms: 0, total_cost_usd: 0 });
  },
  async setPermissionMode() {},
  resolvePermission(requestId, result) {
    const resolve = pendingPermissions.get(requestId);
    if (resolve) { pendingPermissions.delete(requestId); resolve(result.behavior === "allow"); }
  },
  onEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); },

  // --- settings stubs (in-memory) so the UI runs in a plain browser ---
  async getSettings() {
    return _mockSettings;
  },
  async saveSettings(next) {
    _mockSettings = next;
    return next;
  },
  async listModels() {
    return ["deepseek/deepseek-v3", "deepseek/deepseek-r1", "moonshotai/kimi-k2"];
  },
  async chooseFolder() {
    return "/Users/demo/projects/sample"; // mock path in browser
  },
  async listSessions() { return []; },
  async getSession() { return null; },
  async deleteSession() { return true; },
  async runSpeedTest() { return { at: Date.now(), prompt: "", results: [] }; },
  async cancelSpeedTest() { return true; },
  async getSpeedTestLast() { return null; },
  async getSpeedTestStatus() { return { running: false, startedAt: 0 }; },
  async getOpenRouterCatalog() { return {}; },
  async openExternal(url) { try { window.open(url, "_blank"); } catch {} return true; },
  async pingProvider() { return true; },
  async saveAccount(a) { _mockSettings.account = { ...(_mockSettings.account || {}), ...a }; return _mockSettings.account; },
  async signOut() { _mockSettings.account = { name: "", email: "", avatar: "", googleLinked: false, anthropicLinked: false }; return true; },
  async googleSignIn() { return { error: "Sign-in runs only in the desktop app." }; },
  async githubSignIn() { return { error: "Sign-in runs only in the desktop app." }; },
  async linkAnthropic() { return { ok: true, note: "Desktop app only." }; },
  async testConnector() {
    return { ok: false, error: "Connectors run only in the desktop app." };
  },
  async listConnectorDirectory() {
    return { items: [
      { name: "demo/notion", title: "Notion", description: "Search and update your Notion workspace", kind: "remote", connector: { name: "Notion", url: "https://mcp.notion.com/mcp", transport: "http", enabled: true }, env: [] },
      { name: "demo/filesystem", title: "Filesystem", description: "Local files in a folder", kind: "npm", connector: { name: "Filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"], env: {}, enabled: true }, env: [] },
    ], stale: false, source: "mock" };
  },
  async listSkills() { return []; },
  async listDir() { return []; },
  async listSaved() { return []; },
  async saveResponse(item) { return { id: "sav_mock", ...item, createdAt: Date.now() }; },
  async updateSaved() { return null; },
  async removeSaved() { return true; },
  async createSkill() { return { error: "Skills run only in the desktop app." }; },
  async importSkillFolder() { return { error: "Desktop app only." }; },
  async importSkillZip() { return { error: "Desktop app only." }; },
  async readSkill() { return null; },
  async setSkillEnabled() { return true; },
  async deleteSkill() { return { ok: true }; },

  // --- projects (in-memory mock) ---
  async listProjects() { return Object.values(_mockProjects); },
  async getProject(id) { return _mockProjects[id] || null; },
  async createProject(name) { const p = { id: "prj_" + Math.random().toString(36).slice(2, 7), name: name || "Untitled", instructions: "", knowledge: [], createdAt: Date.now() }; _mockProjects[p.id] = p; return p; },
  async updateProject(id, patch) { _mockProjects[id] = { ..._mockProjects[id], ...patch }; return _mockProjects[id]; },
  async deleteProject(id) { delete _mockProjects[id]; return true; },
  async addKnowledgeText(projectId, name, content) { const p = _mockProjects[projectId]; p.knowledge.push({ id: "kn_" + Math.random().toString(36).slice(2, 6), name, type: "text", content }); return p; },
  async addKnowledgeFile() { return { error: "Desktop app only." }; },
  async removeKnowledge(projectId, knId) { const p = _mockProjects[projectId]; p.knowledge = p.knowledge.filter((k) => k.id !== knId); return p; },
  async linkProjectFolder() { return { error: "Desktop app only." }; },
  async linkGithub() { return { error: "Desktop app only." }; },
  async pullGithub() { return { ok: true }; },
  async unlinkProjectSource(projectId) { return _mockProjects[projectId]; },
  async listConversations(projectId) { return Object.values(_mockConvs).filter((c) => c.projectId === projectId); },
  async getConversation(id) { return _mockConvs[id] || null; },
  async createConversation(projectId) { const c = { id: "cnv_" + Math.random().toString(36).slice(2, 7), projectId, title: "New conversation", messages: [], updatedAt: Date.now() }; _mockConvs[c.id] = c; return c; },
  async deleteConversation(id) { delete _mockConvs[id]; return true; },

  // --- tasks + Via Mobile (in-memory mock) ---
  async listTasks() { return Object.values(_mockTasks); },
  async createTask() { const t = { id: "tsk_" + Math.random().toString(36).slice(2, 7), name: "New task", prompt: "", target: { type: "chat" }, schedule: { mode: "off", everyMinutes: 60, time: "09:00", weekday: 1 }, lastRun: 0 }; _mockTasks[t.id] = t; return t; },
  async updateTask(id, patch) { _mockTasks[id] = { ..._mockTasks[id], ...patch }; return _mockTasks[id]; },
  async deleteTask(id) { delete _mockTasks[id]; return true; },
  async getRuns() { return []; },
  async runTaskNow() { return { status: "success", output: "(mock run)", at: Date.now() }; },
  async applyMessaging() { return { running: false, status: "desktop app only" }; },
  async messagingStatus() { return { running: false, status: "desktop app only" }; },
  async completeOnce() { return { text: "What would you like this task to do? (adaptive setup runs in the desktop app)" }; },
  async listViaMobile() { return []; },
  async removeViaMobile() { return true; },
  async clearViaMobile() { return true; },
  // Auth (browser/mock dev): pretend the user is in an active trial so the gate doesn't block dev.
  async authSignIn() { return { ok: true }; },
  async authMe() { return { user: { name: "Dev User", email: "dev@brainedge.local", provider: "google" }, admin: true, status: "trialing", daysLeft: 7, subscription: { active: false, plan: null } }; },
  async authSignOut() { return { ok: true }; },
  async billingCheckout() { return { error: "billing not available in browser dev" }; },
  async billingPortal() { return { error: "billing not available in browser dev" }; },
  async track() { return { ok: true }; },
  async adminStats() { return { counts: { total: 3, trialing: 1, active: 1, expired: 1, suspended: 0, paying: 1, comp: 1, active24h: 2, active7d: 3, new7d: 2 }, last7d: { signup: 2, signin: 9, subscribed: 1 }, events: [{ ts: new Date().toISOString(), userId: "dev:dev@brainedge.local", type: "signin", meta: { provider: "dev" } }] }; },
  async adminUsers() { return { users: [{ id: "dev:dev@brainedge.local", name: "Dev User", email: "dev@brainedge.local", provider: "dev", status: "trialing", daysLeft: 7, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), suspended: false, freeAccess: false, subscriptionActive: false, plan: null }] }; },
  async adminAction() { return { ok: true }; },
  // Agent engine (desktop): memory · track record · missions · versions · swarms · webhooks.
  async getAgentMemory() { return { notes: [] }; },
  async setAgentMemory(_id, notes) { return { notes: (notes || []).map((t) => ({ at: Date.now(), text: String(t) })) }; },
  async clearAgentMemory() { return { notes: [] }; },
  async getAgentHistory() { return []; },
  async getAgentStats() { return {}; },
  async getMission() { return null; },
  async exportAgent() { return { error: "Exporting .agent files needs the desktop app." }; },
  async importAgent() { return { error: "Importing .agent files needs the desktop app." }; },
  async snapshotAgentVersion() { return { ok: true, skipped: true }; },
  async listAgentVersions() { return []; },
  async applyWebhooks() { return { running: false, port: 0, error: "desktop app only" }; },
  async webhookStatus() { return { running: false, port: 0, error: "desktop app only" }; },
  async newWebhookToken() { return "mock-token"; },
  async transcribe() { return { error: "Voice transcription needs the desktop app." }; },
  async runSwarm() { return { error: "Swarms need the desktop app." }; },
  async cancelSwarm() { return true; },
  onSwarmEvent() { return () => {}; },
  async getMobileLink() { return null; },
  async setMobileLink(link) { return link || null; },
  async clearMobileLink() { return null; },
  async setKeepAwake(on) { return !!on; },
  async getUsage() {
    return { messages: 42, tokens: 184000, sessions: 6, activeDays: 4, currentStreak: 2, longestStreak: 3, peakHour: "9 PM", favoriteModel: "deepseek/deepseek-chat",
      models: [{ model: "deepseek/deepseek-chat", tokens: 120000, messages: 28 }, { model: "gemini-2.0-flash", tokens: 64000, messages: 14 }], byDay: {} };
  },
};
const _mockProjects = {};
const _mockConvs = {};
const _mockTasks = {};

let _mockSettings = {
  activeProfileId: "p_demo",
  profiles: {
    p_demo: { id: "p_demo", name: "Demo (mock)", kind: "openai", baseUrl: "http://localhost:1234", apiKey: "", model: "deepseek/deepseek-v3" },
  },
};

// In the real app: export const bridge = window.brainedge ?? mockBridge;
export const bridge = mockBridge;
