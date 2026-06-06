// SessionManager (main process).
//  - chat mode  → direct streaming transport (providers.cjs)
//  - cowork/code → agent transport (agent-transport.cjs, Claude Agent SDK)
// Both emit normalized UiEvents via emit().
const { streamChat } = require("./providers.cjs");
const { runAgentTurn } = require("./agent-transport.cjs");
const { runOpenAIAgentTurn } = require("./agent-openai.cjs");
const settings = require("./settings.cjs");
const store = require("./projects-store.cjs");
const sstore = require("./sessions-store.cjs");
const usage = require("./usage-store.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");

let seq = 0;
const AGENT_MODES = new Set(["cowork", "code"]);

const cleanImgs = (images) => (Array.isArray(images) ? images.filter((im) => im && im.dataUrl) : []);
const parseDataUrl = (u) => { const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(u || ""); return m ? { mime: m[1], b64: m[2] } : null; };

// Inline multimodal content for the no-tool chat completion path (single request, no Read tool).
function inlineContent(userText, images, kind) {
  const imgs = cleanImgs(images);
  if (!imgs.length) return userText;
  const textPart = userText ? [{ type: "text", text: userText }] : [];
  if (kind === "anthropic") {
    return [...textPart, ...imgs.map((im) => { const p = parseDataUrl(im.dataUrl); return p ? { type: "image", source: { type: "base64", media_type: p.mime, data: p.b64 } } : null; }).filter(Boolean)];
  }
  return [...textPart, ...imgs.map((im) => ({ type: "image_url", image_url: { url: im.dataUrl } }))];
}

// For agent/SDK paths that take a plain-text prompt but have a file-reading tool:
// write the pasted images to temp files and point the agent at them.
function materializeImages(images) {
  const imgs = cleanImgs(images);
  if (!imgs.length) return "";
  const dir = path.join(os.tmpdir(), "brainedge-images");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const paths = [];
  imgs.forEach((im, i) => {
    const p = parseDataUrl(im.dataUrl);
    if (!p) return;
    const ext = (p.mime.split("/")[1] || "png").replace("+xml", "");
    const file = path.join(dir, `paste-${Date.now()}-${i}.${ext}`);
    try { fs.writeFileSync(file, Buffer.from(p.b64, "base64")); paths.push(file); } catch {}
  });
  if (!paths.length) return "";
  return `\n\n[The user attached ${paths.length} image(s). Use your Read tool to view them at:\n${paths.map((p) => `- ${p}`).join("\n")}]`;
}

class SessionManager {
  constructor(emit) {
    this.rawEmit = emit;                 // (uiEvent) => void
    this.sessions = new Map();           // sessionId -> { mode, cwd, history, controller, sdkSessionId }
    this.permissions = new Map();        // requestId -> resolve(PermissionResult)
    this.holds = new Map();              // sessionId -> SDK Query (for interrupt)
  }

  _send(sessionId, kind, data) {
    if (this._curTurn) {
      if (kind === "assistant_delta") { this._curTurn.replyChars += ((data && data.text) || "").length; this._curTurn.replyText += (data && data.text) || ""; }
      else if (kind === "result") { usage.append({ ...this._curTurn, at: Date.now() }); this._persistTurn(sessionId); this._curTurn = null; }
      else if (kind === "error") { this._persistTurn(sessionId); this._curTurn = null; }
    }
    this.rawEmit({ sessionId, seq: seq++, kind, data });
  }

  // Persist one completed turn (user + assistant text) to the chat-history store.
  // Project mode persists separately (projects-store), so it has no chatConvId here.
  _persistTurn(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s || !s.chatConvId || !this._curTurn) return;
    const conv = sstore.getSession(s.chatConvId);
    if (!conv) return;
    const u = (this._curTurn.userText || "").trim();
    const a = (this._curTurn.replyText || "").trim();
    if (u) conv.messages.push({ role: "user", content: u });
    if (a) conv.messages.push({ role: "assistant", content: a });
    if ((!conv.title || conv.title === "New task") && u) conv.title = u.slice(0, 60);
    conv.cwd = s.cwd || conv.cwd;
    try { sstore.saveSession(conv); } catch {}
  }

  async start(req) {
    const sessionId = "sess_" + Math.random().toString(36).slice(2, 9);
    const s = { mode: req.mode, cwd: req.cwd, history: [], controller: null, sdkSessionId: null, permMode: req.permissionMode || "default" };
    if (req.mode === "project") {
      s.projectId = req.projectId;
      s.conversationId = req.conversationId;
      const conv = store.getConversation(req.conversationId);
      s.history = [{ role: "system", content: "" }, ...((conv && conv.messages) || [])]; // index 0 reserved for project system
    } else {
      // Persisted chat history for Let's Talk / Collaborate / Build.
      let conv = req.conversationId ? sstore.getSession(req.conversationId) : null;
      if (!conv) conv = sstore.createSession(req.mode, req.cwd);
      s.chatConvId = conv.id;
      if (req.projectId) s.projectId = req.projectId; // Cowork task scoped to a project
      // Seed the model context from saved messages so reopened chats continue coherently.
      if (conv.messages && conv.messages.length) s.history = conv.messages.map((m) => ({ role: m.role, content: m.content }));
    }
    this.sessions.set(sessionId, s);
    await this._turn(sessionId, req.prompt, req.images);
    return { sessionId, conversationId: s.chatConvId || s.conversationId || null };
  }

  async sendInput(sessionId, text, images) {
    if (this.sessions.get(sessionId)) await this._turn(sessionId, text, images);
  }

  async _turn(sessionId, userText, images) {
    const s = this.sessions.get(sessionId);
    const profile = settings.activeProfile();
    if (!profile || !profile.baseUrl) {
      this._send(sessionId, "error", { code: "no_profile", message: "No provider configured. Open Settings." });
      return;
    }

    // Anthropic subscription mode: bill the user's Claude plan via `claude login`
    // creds (no API key). Only the SDK path can carry those, so we route ALL
    // anthropic turns through the Agent SDK and skip the API-key requirement.
    const subMode = profile.kind === "anthropic" && !!settings.load().anthropicUseSubscription;

    // Diagnostic: shows in the [ELECTRON] terminal exactly which profile is active.
    const keyLen = (profile.apiKey || "").length;
    console.log(`[brainedge] turn → provider="${profile.name}" kind=${profile.kind} model="${profile.model}" baseUrl=${profile.baseUrl} keyLen=${keyLen} sub=${subMode}`);

    // Clear guard instead of a cryptic upstream 401.
    const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(profile.baseUrl || "");
    if (!isLocal && keyLen === 0 && !subMode) {
      this._send(sessionId, "error", {
        code: "no_key",
        message: `No API key on the ACTIVE provider "${profile.name}". Open Settings, click "${profile.name}", paste its key, and make sure it's the one selected in the top-bar model picker.`,
      });
      return;
    }

    this._curTurn = { sessionId, model: profile.model, provider: profile.name, mode: s.mode, promptChars: (userText || "").length, replyChars: 0, replyText: "", userText: userText || "" };

    // Subscription mode forces the SDK for chat/project too (raw /v1/messages
    // can't use plan creds). Agent modes already use the SDK for anthropic.
    if (subMode && (s.mode === "project" || !AGENT_MODES.has(s.mode))) {
      return this._chatViaSdk(sessionId, userText, profile, images);
    }

    if (s.mode === "project") return this._projectTurn(sessionId, userText, profile, images);
    if (AGENT_MODES.has(s.mode)) return this._agentTurn(sessionId, userText, profile, images);

    // Chat: if skills/connectors are configured and the model speaks OpenAI tools,
    // run the lightweight tool loop (skills + connectors, no file/shell). Else plain chat.
    // Exception: when the turn carries images, take the plain inline-vision path so a
    // vision-capable model (e.g. a NIM VLM) receives real pixels rather than a Read-file note.
    const cfg = settings.load();
    const hasExtras = (cfg.skillsDirs || []).length > 0 || (cfg.connectors || []).some((c) => c.enabled);
    if (profile.kind !== "anthropic" && hasExtras && cleanImgs(images).length === 0) {
      return this._chatAgentTurn(sessionId, userText, profile, cfg, images);
    }
    return this._chatTurn(sessionId, userText, profile, images);
  }

  // Chat enriched with skills + connectors (OpenAI-compatible providers).
  async _chatAgentTurn(sessionId, userText, profile, cfg, images) {
    const s = this.sessions.get(sessionId);
    const controller = new AbortController();
    s.controller = controller;
    const emit = (e) => this._send(sessionId, e.kind, e.data);
    userText = (userText || "") + materializeImages(images);
    try {
      await runOpenAIAgentTurn({
        prompt: userText, mode: "chat", cwd: null, profile, permMode: "default",
        history: s.history, emit, permissions: this.permissions, signal: controller.signal,
        connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [], globalInstructions: cfg.globalInstructions || "",
      });
    } finally {
      s.controller = null;
    }
  }

  // ---- anthropic subscription chat (via Agent SDK, billed to the Claude plan) ----
  async _chatViaSdk(sessionId, userText, profile, images) {
    const s = this.sessions.get(sessionId);
    const emit = (e) => this._send(sessionId, e.kind, e.data);
    userText = (userText || "") + materializeImages(images);
    s.sdkSessionId = await runAgentTurn({
      sessionId, prompt: userText, mode: "chat", cwd: s.cwd || null, profile, permMode: s.permMode || "default",
      resume: s.sdkSessionId, emit, permissions: this.permissions, holds: this.holds,
    });
  }

  // ---- chat transport ----
  async _chatTurn(sessionId, userText, profile, images) {
    const s = this.sessions.get(sessionId);
    // Vision: inline image blocks (OpenAI image_url / Anthropic base64) on this no-tool path.
    s.history.push({ role: "user", content: inlineContent(userText, images, profile.kind) });
    const controller = new AbortController();
    s.controller = controller;
    this._send(sessionId, "init", { model: profile.model, provider: profile.name, kind: profile.kind, mode: s.mode });
    const gi = settings.load().globalInstructions;
    const now = new Date();
    const dateLine = `The current date is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Use this whenever a date is needed; never say you don't know it.`;
    const sysChat = "You are BrainEdge, a helpful assistant. " + dateLine +
      " Reply directly with the final answer only. Do NOT show your reasoning, inner monologue, or <think> notes. Keep greetings to one short sentence." +
      (gi ? `\n\nUser's custom instructions (always follow):\n${gi}` : "");
    const messages = [{ role: "system", content: sysChat }, ...s.history];
    const started = Date.now();
    try {
      const { text } = await streamChat(profile, messages, {
        signal: controller.signal,
        onDelta: (d) => this._send(sessionId, "assistant_delta", { text: d }),
      });
      s.history.push({ role: "assistant", content: text });
      this._send(sessionId, "assistant_message", { stop_reason: "end_turn" });
      this._send(sessionId, "result", { subtype: "success", num_turns: 1, duration_ms: Date.now() - started, total_cost_usd: 0 });
    } catch (err) {
      if (err.name === "AbortError") this._send(sessionId, "result", { subtype: "interrupted", duration_ms: Date.now() - started });
      else this._send(sessionId, "error", { code: err.code || "error", message: String(err.message || err) });
    } finally {
      s.controller = null;
    }
  }

  // ---- project conversations (persisted, knowledge-grounded chat) ----
  async _projectTurn(sessionId, userText, profile, images) {
    const s = this.sessions.get(sessionId);
    const project = store.getProject(s.projectId);
    if (!project) { this._send(sessionId, "error", { code: "no_project", message: "Project not found." }); return; }
    const useFolder = !!project.folder;
    const gi = settings.load().globalInstructions;
    const sys = store.projectSystem(project) +
      (useFolder ? `\n\nThis project is linked to a folder of files at: ${project.folder}. Use the file tools (read_file, list_dir, edit_file, run_bash) to inspect or modify those files when relevant.` : "") +
      (gi ? `\n\nUser's custom instructions (always follow):\n${gi}` : "");
    const cfg = settings.load();
    const emit = (e) => this._send(sessionId, e.kind, e.data);
    const controller = new AbortController();
    s.controller = controller;

    // index 0 is the project system message; keep it current each turn
    if (!s.history.length) s.history.push({ role: "system", content: sys });
    else if (s.history[0].role === "system") s.history[0].content = sys;
    else s.history.unshift({ role: "system", content: sys });

    try {
      if (profile.kind === "anthropic") {
        s.history.push({ role: "user", content: inlineContent(userText, images, "anthropic") });
        emit({ kind: "init", data: { model: profile.model, mode: "project", provider: profile.name } });
        const started = Date.now();
        const { text } = await streamChat(profile, s.history, {
          signal: controller.signal,
          onDelta: (d) => emit({ kind: "assistant_delta", data: { text: d } }),
        });
        s.history.push({ role: "assistant", content: text });
        emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
        emit({ kind: "result", data: { subtype: "success", duration_ms: Date.now() - started } });
      } else {
        await runOpenAIAgentTurn({
          prompt: userText + materializeImages(images), mode: useFolder ? "cowork" : "chat", cwd: project.folder || null, profile, permMode: "default",
          history: s.history, emit, permissions: this.permissions, signal: controller.signal,
          connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [], globalInstructions: cfg.globalInstructions || "",
          systemOverride: sys,
        });
      }
    } catch (e) {
      if (e.name === "AbortError") emit({ kind: "result", data: { subtype: "interrupted" } });
      else emit({ kind: "error", data: { code: e.code || "error", message: String(e.message || e) } });
    } finally {
      s.controller = null;
      const msgs = s.history.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length);
      const conv = store.getConversation(s.conversationId) || { id: s.conversationId, projectId: s.projectId, title: "New conversation", createdAt: Date.now() };
      conv.messages = msgs;
      if (conv.title === "New conversation") {
        const fu = msgs.find((m) => m.role === "user");
        if (fu) conv.title = String(fu.content).slice(0, 48);
      }
      store.saveConversation(conv);
    }
  }

  // ---- agent transport (routed by profile kind) ----
  async _agentTurn(sessionId, userText, profile, images) {
    const s = this.sessions.get(sessionId);
    if (!s.cwd) {
      this._send(sessionId, "error", { code: "no_folder", message: "Pick a working folder first (Choose folder)." });
      return;
    }
    // Cowork task scoped to a project: inject its instructions + knowledge once, up front.
    if (s.projectId && !s._projInjected) {
      const project = store.getProject(s.projectId);
      if (project) { userText = `${store.projectSystem(project)}\n\n----- TASK -----\n${userText}`; }
      s._projInjected = true;
    }
    userText = (userText || "") + materializeImages(images);
    const emit = (e) => this._send(sessionId, e.kind, e.data);

    if (profile.kind === "anthropic") {
      // Anthropic (or a proxy): full Claude Agent SDK.
      s.sdkSessionId = await runAgentTurn({
        sessionId, prompt: userText, mode: s.mode, cwd: s.cwd, profile, permMode: s.permMode,
        resume: s.sdkSessionId, emit, permissions: this.permissions, holds: this.holds,
      });
    } else {
      // External OpenAI-compatible model (NIM/OpenRouter/local): BrainEdge's own loop.
      const controller = new AbortController();
      s.controller = controller;
      try {
        const cfg = settings.load();
        await runOpenAIAgentTurn({
          prompt: userText, mode: s.mode, cwd: s.cwd, profile, permMode: s.permMode,
          history: s.history, emit, permissions: this.permissions, signal: controller.signal,
          connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [], globalInstructions: cfg.globalInstructions || "",
        });
      } finally {
        s.controller = null;
      }
    }
  }

  async interrupt(sessionId) {
    const s = this.sessions.get(sessionId);
    const q = this.holds.get(sessionId);
    if (q && typeof q.interrupt === "function") { try { await q.interrupt(); } catch {} }
    if (s && s.controller) s.controller.abort();
  }

  async setPermissionMode(sessionId, mode) {
    const s = this.sessions.get(sessionId);
    if (s) s.permMode = mode;
  }

  resolvePermission(requestId, result) {
    const resolve = this.permissions.get(requestId);
    if (resolve) { this.permissions.delete(requestId); resolve(result || { behavior: "deny" }); }
  }
}

module.exports = { SessionManager };
