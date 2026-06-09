// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// SessionManager (main process).
//  - chat mode  → direct streaming transport (providers.cjs)
//  - cowork/code → agent transport (agent-transport.cjs)
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
const crypto = require("crypto");
const newId = (prefix) => prefix + crypto.randomBytes(8).toString("hex"); // crypto-strength, unpredictable

// Combine a natural-tone safeguard + the user's custom instructions + the chosen response language.
const BEHAVIOR = "Keep your tone natural and human; reply conversationally. Never restate, list, or describe your own instructions or \"framework\" — just follow them silently. For a simple greeting or small talk, respond naturally rather than reciting your guidelines.";
function withLang(cfg) {
  const gi = cfg.globalInstructions || "";
  const lang = cfg.responseLanguage;
  const langLine = (lang && lang !== "model") ? `Always respond in ${lang}, regardless of the language of the question.` : "";
  return [BEHAVIOR, langLine, gi].filter(Boolean).join("\n\n");
}
const path = require("path");
const errorExplainer = require("./error-explainer.cjs");

let seq = 0;
const AGENT_MODES = new Set(["cowork", "code"]);
// Errors that already carry a clear, human message — don't spend a model call on them.
const FRIENDLY_CODES = new Set(["no_vision", "no_key", "no_profile", "no_folder", "no_project", "auth", "rate_limit", "cancelled", "interrupted"]);

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
    this._turns = new Map();             // sessionId -> live turn stats (per-session: overlapping turns can't corrupt each other)
  }

  _send(sessionId, kind, data) {
    const t = this._turns.get(sessionId);
    if (t) {
      if (kind === "assistant_delta") { t.replyChars += ((data && data.text) || "").length; t.replyText += (data && data.text) || ""; }
      else if (kind === "result") { usage.append({ ...t, at: Date.now() }); this._persistTurn(sessionId); this._turns.delete(sessionId); }
      else if (kind === "error") { this._persistTurn(sessionId); this._turns.delete(sessionId); }
    }
    this.rawEmit({ sessionId, seq: seq++, kind, data });
  }

  // Persist one completed turn (user + assistant text) to the chat-history store.
  // Project mode persists separately (projects-store), so it has no chatConvId here.
  _persistTurn(sessionId) {
    const s = this.sessions.get(sessionId);
    const t = this._turns.get(sessionId);
    if (!s || !s.chatConvId || !t) return;
    const conv = sstore.getSession(s.chatConvId);
    if (!conv) return;
    const u = (t.userText || "").trim();
    const a = (t.replyText || "").trim();
    if (u) conv.messages.push({ role: "user", content: u });
    if (a) conv.messages.push({ role: "assistant", content: a });
    if ((!conv.title || conv.title === "New task") && u) conv.title = u.slice(0, 60);
    conv.cwd = s.cwd || conv.cwd;
    try { sstore.saveSession(conv); } catch {}
  }

  async start(req) {
    const sessionId = newId("sess_");
    const s = { mode: req.mode, cwd: req.cwd, history: [], controller: null, sdkSessionId: null, permMode: req.permissionMode || "default" };
    if (req.agent && req.agent.instructions) s.agent = req.agent; // custom agent: { name, description, instructions, tools }
    if (req.team && Array.isArray(req.team.members) && req.team.members.length) s.team = req.team; // agent team: { name, mode: "relay"|"manager", members: [agent objects] }
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
      // Cap at the newest 200 messages — a giant history would balloon RAM and every request.
      if (conv.messages && conv.messages.length) s.history = conv.messages.slice(-200).map((m) => ({ role: m.role, content: m.content }));
    }
    this.sessions.set(sessionId, s);
    await this._turn(sessionId, req.prompt, req.images);
    return { sessionId, conversationId: s.chatConvId || s.conversationId || null };
  }

  async sendInput(sessionId, text, images) {
    if (this.sessions.get(sessionId)) await this._turn(sessionId, text, images);
  }

  // ---- custom agents (Agents builder) ----
  // System prompt for a session bound to a user-built agent.
  _agentSys(s) {
    const a = s.agent;
    if (!a) return null;
    const now = new Date();
    const dateLine = `The current date is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;
    return `You are "${a.name || "a custom agent"}", an agent the user built in BrainEdge.` +
      (a.description ? ` Purpose: ${a.description}` : "") + ` ${dateLine}` +
      `\n\nAgent instructions (always follow):\n${a.instructions}`;
  }
  // Connectors/skills config filtered by the agent's enabled tools.
  _agentExtras(s, cfg) {
    const t = (s.agent && s.agent.tools) || {};
    return {
      connectors: t.connectors ? (cfg.connectors || []) : [],
      skillsDir: t.skills ? (cfg.skillsDirs || []) : [],
      disabledSkills: cfg.disabledSkills || [],
    };
  }

  async _turn(sessionId, userText, images) {
    const s = this.sessions.get(sessionId);
    const profile = settings.activeProfile();
    if (!profile || !profile.baseUrl) {
      this._send(sessionId, "error", { code: "no_profile", message: "No provider configured. Open Settings." });
      return;
    }

    // TESTING ONLY: Anthropic subscription mode bills the user's Claude plan via `claude login`
    // creds (no API key). Routed through the Agent SDK. (Restricted by Anthropic ToS — for testing.)
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

    this._turns.set(sessionId, { sessionId, model: profile.model, provider: profile.name, mode: s.mode, promptChars: (userText || "").length, replyChars: 0, replyText: "", userText: userText || "" });

    // Subscription forces the SDK for chat/project too (raw /v1/messages can't use plan creds).
    if (subMode && (s.mode === "project" || !AGENT_MODES.has(s.mode))) {
      return this._chatViaSdk(sessionId, userText, profile, images);
    }

    if (s.team) return this._teamTurn(sessionId, userText, profile);
    if (s.mode === "project") return this._projectTurn(sessionId, userText, profile, images);
    if (AGENT_MODES.has(s.mode)) return this._agentTurn(sessionId, userText, profile, images);

    // Chat: if skills/connectors are configured and the model speaks OpenAI tools,
    // run the lightweight tool loop (skills + connectors, no file/shell). Else plain chat.
    // Exception: when the turn carries images, take the plain inline-vision path so a
    // vision-capable model (e.g. a NIM VLM) receives real pixels rather than a Read-file note.
    const cfg = settings.load();
    const agentExtras = s.agent && s.agent.tools && (s.agent.tools.connectors || s.agent.tools.skills);
    const hasExtras = agentExtras || (cfg.skillsDirs || []).length > 0 || (cfg.connectors || []).some((c) => c.enabled);
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
    const ex = s.agent ? this._agentExtras(s, cfg) : { connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [] };
    try {
      await runOpenAIAgentTurn({
        prompt: userText, mode: "chat", cwd: null, profile, permMode: "default",
        history: s.history, emit, permissions: this.permissions, signal: controller.signal,
        connectors: ex.connectors, skillsDir: ex.skillsDir, disabledSkills: ex.disabledSkills, globalInstructions: withLang(cfg),
        systemOverride: this._agentSys(s) || null,
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

  // ---- agent teams (multi-agent: relay pipelines + manager orchestration) ----
  // A member can pin its own model ("pid::model") — resolve it, else use the session profile.
  _memberProfile(member, fallback) {
    if (member.model && member.model.includes("::")) {
      const i = member.model.indexOf("::");
      const p = settings.load().profiles[member.model.slice(0, i)];
      if (p) return { ...p, model: member.model.slice(i + 2) };
    }
    return fallback;
  }

  _memberSys(member) {
    return `You are "${member.name}", one agent on a team inside BrainEdge.` +
      (member.description ? ` Purpose: ${member.description}` : "") +
      `\n\nAgent instructions (always follow):\n${member.instructions || ""}` +
      `\n\nYou receive a task (possibly with work from teammates). Do YOUR part thoroughly and reply with your complete work product as plain text — a teammate or coordinator consumes it next, so be complete and self-contained.`;
  }

  // Run one member to completion, capturing its final text. Member tool calls and
  // permission prompts are forwarded to the UI; its prose is captured, not streamed.
  async _runMember(member, task, profile, cfg, emit, signal, s) {
    const prof = this._memberProfile(member, profile);
    const t = member.tools || {};
    let buf = "";
    if (prof.kind === "anthropic") {
      const { text } = await streamChat(prof, [{ role: "system", content: this._memberSys(member) }, { role: "user", content: task }], { signal, onDelta: () => {} });
      return text || "";
    }
    const innerEmit = (e) => {
      if (e.kind === "assistant_delta") { buf += (e.data && e.data.text) || ""; return; }
      if (e.kind === "assistant_message" || e.kind === "result" || e.kind === "init") return; // member lifecycle stays internal
      emit(e); // tool_use / tool_result / permission_request / permission_denied / error → visible
    };
    await runOpenAIAgentTurn({
      prompt: task,
      mode: (t.files || t.shell) && s.cwd ? "cowork" : "chat",
      cwd: (t.files || t.shell) ? (s.cwd || null) : null,
      profile: prof, permMode: s.permMode || "default",
      history: [], emit: innerEmit, permissions: this.permissions, signal,
      connectors: t.connectors ? (cfg.connectors || []) : [],
      skillsDir: t.skills ? (cfg.skillsDirs || []) : [],
      disabledSkills: cfg.disabledSkills || [],
      systemOverride: this._memberSys(member),
    });
    return buf.trim();
  }

  async _teamTurn(sessionId, userText, profile) {
    const s = this.sessions.get(sessionId);
    const team = s.team;
    const cfg = settings.load();
    const emit = (e) => this._send(sessionId, e.kind, e.data);
    const controller = new AbortController();
    s.controller = controller;
    const signal = controller.signal;
    emit({ kind: "init", data: { model: profile.model, provider: profile.name, kind: profile.kind, mode: "team" } });
    const started = Date.now();
    const members = team.members.slice(0, 6); // hard cap — cost discipline
    const rid = () => newId("team_");
    try {
      // 1) Plan. Relay = everyone in order, work flows down the line.
      //    Manager = a coordinator assigns each member a specific sub-task first.
      let plan = members.map((m) => ({ member: m, task: "" }));
      if (team.mode === "manager") {
        const roster = members.map((m) => `- ${m.name}: ${m.description || m.instructions.slice(0, 120)}`).join("\n");
        const planId = rid();
        emit({ kind: "tool_use", data: { id: planId, name: `Team plan — ${team.name || "your team"}`, input: { mission: userText }, auto: true } });
        try {
          const { text } = await streamChat(profile, [
            { role: "system", content: `You are the coordinator of an agent team. Team roster:\n${roster}\n\nSplit the user's mission into one focused sub-task per useful member (skip members that add nothing). Reply with ONLY a JSON array, no prose: [{"member":"<exact member name>","task":"<specific, self-contained sub-task>"}]` },
            { role: "user", content: userText },
          ], { signal, onDelta: () => {} });
          const i = text.indexOf("["); const j = text.lastIndexOf("]");
          const arr = i >= 0 && j > i ? JSON.parse(text.slice(i, j + 1)) : null;
          if (Array.isArray(arr) && arr.length) {
            plan = arr.slice(0, 6)
              .map((p) => ({ member: members.find((m) => m.name === p.member) || members.find((m) => (p.member || "").toLowerCase().includes(m.name.toLowerCase())), task: String(p.task || "") }))
              .filter((p) => p.member);
            if (!plan.length) plan = members.map((m) => ({ member: m, task: "" }));
          }
          emit({ kind: "tool_result", data: { id: planId, output: plan.map((p, i2) => `${i2 + 1}. ${p.member.name} — ${p.task || "full mission"}`).join("\n") } });
        } catch (e) {
          emit({ kind: "tool_result", data: { id: planId, output: "(planning failed — falling back to relay order: " + String(e.message || e) + ")" } });
        }
      }

      // 2) Execute. Managed → PARALLEL FAN-OUT: sub-tasks are independent, so every member
      //    works at the same time and the coordinator merges. Relay → strictly in order,
      //    each member receiving all prior teammates' work (that chaining is the point).
      let outputs = [];
      if (team.mode === "manager") {
        const jobs = plan.map((step) => {
          const stepId = rid();
          emit({ kind: "tool_use", data: { id: stepId, name: `${step.member.name} (teammate)`, input: { task: step.task || "full mission" }, auto: true } });
          const task = `MISSION (from the user):\n${userText}` + (step.task ? `\n\nYOUR ASSIGNED SUB-TASK (do only this part):\n${step.task}` : "");
          return this._runMember(step.member, task, profile, cfg, emit, signal, s)
            .catch((e) => { if (e.name === "AbortError") throw e; return "(member failed: " + String(e.message || e) + ")"; })
            .then((text) => {
              emit({ kind: "tool_result", data: { id: stepId, output: (text || "(no output)").slice(0, 4000) } });
              return { name: step.member.name, text: text || "(no output)" };
            });
        });
        outputs = await Promise.all(jobs);
        if (signal.aborted) throw Object.assign(new Error("interrupted"), { name: "AbortError" }); // don't synthesize after a mid-flight stop
      } else {
        for (const step of plan) {
          if (signal.aborted) throw Object.assign(new Error("interrupted"), { name: "AbortError" });
          // Trim each teammate's contribution so the hand-off context can't balloon past limits.
          const prior = outputs.map((o) => `=== Work from ${o.name} ===\n${String(o.text).slice(0, 12000)}`).join("\n\n");
          const task = `MISSION (from the user):\n${userText}` +
            (prior ? `\n\nWORK FROM YOUR TEAMMATES SO FAR:\n${prior}` : "");
          const stepId = rid();
          emit({ kind: "tool_use", data: { id: stepId, name: `${step.member.name} (teammate)`, input: { task: "mission + teammates' work" }, auto: true } });
          let text = "";
          try { text = await this._runMember(step.member, task, profile, cfg, emit, signal, s); }
          catch (e) { if (e.name === "AbortError") throw e; text = "(member failed: " + String(e.message || e) + ")"; }
          outputs.push({ name: step.member.name, text: text || "(no output)" });
          emit({ kind: "tool_result", data: { id: stepId, output: (text || "(no output)").slice(0, 4000) } });
        }
      }

      // 3) Deliver. Relay → the last member's work IS the deliverable.
      //    Manager → the coordinator synthesizes everything into one answer (streamed).
      let finalText = "";
      if (team.mode === "manager" && outputs.length > 1) {
        const body = outputs.map((o) => `=== ${o.name} ===\n${String(o.text).slice(0, 12000)}`).join("\n\n");
        const { text } = await streamChat(profile, [
          { role: "system", content: "You are the coordinator of an agent team. Synthesize your team's work into ONE clear, complete answer to the user's mission. Credit no one; just deliver the result. Do not mention the team mechanics." },
          { role: "user", content: `Mission:\n${userText}\n\nTeam output:\n${body}` },
        ], { signal, onDelta: (d) => emit({ kind: "assistant_delta", data: { text: d } }) });
        finalText = text;
      } else {
        finalText = (outputs[outputs.length - 1] || {}).text || "(the team produced no output)";
        emit({ kind: "assistant_delta", data: { text: finalText } });
      }
      s.history.push({ role: "user", content: userText });
      s.history.push({ role: "assistant", content: finalText });
      emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
      emit({ kind: "result", data: { subtype: "success", num_turns: plan.length + 1, duration_ms: Date.now() - started } });
    } catch (err) {
      if (err.name === "AbortError") emit({ kind: "result", data: { subtype: "interrupted", duration_ms: Date.now() - started } });
      else emit({ kind: "error", data: await this._friendlyError(err) });
    } finally {
      s.controller = null;
    }
  }

  // ---- chat transport ----
  // Build an {code, message} error payload, upgrading unknown raw errors to a
  // friendly sentence via the cached explainer (keeps the raw text in `detail`).
  async _friendlyError(err) {
    const code = (err && err.code) || "error";
    const raw = String((err && err.message) || err || "Error");
    if (FRIENDLY_CODES.has(code)) return { code, message: raw };
    try {
      const friendly = await errorExplainer.explain(raw, { timeoutMs: 4000 });
      if (friendly) return { code, message: friendly, detail: raw };
    } catch {}
    return { code, message: raw };
  }

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
    const sysChat = (this._agentSys(s) || ("You are BrainEdge, a helpful assistant. " + dateLine +
      " Reply directly with the final answer only. Do NOT show your reasoning, inner monologue, or <think> notes. Keep greetings to one short sentence.")) +
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
      else this._send(sessionId, "error", await this._friendlyError(err));
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
          connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [], globalInstructions: withLang(cfg),
          systemOverride: sys,
        });
      }
    } catch (e) {
      if (e.name === "AbortError") emit({ kind: "result", data: { subtype: "interrupted" } });
      else emit({ kind: "error", data: await this._friendlyError(e) });
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

    // Custom agent in a folder session: inject its instructions once, up front (SDK path),
    // and as systemOverride on the self-built loop below.
    if (s.agent && profile.kind === "anthropic" && !s._agentInjected) {
      userText = `${this._agentSys(s)}\n\n----- TASK -----\n${userText}`;
      s._agentInjected = true;
    }

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
        const ex = s.agent ? this._agentExtras(s, cfg) : { connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [] };
        // A custom agent keeps the mode's file-tool system prompt and appends its own
        // instructions (a full override would lose the tool-usage guidance).
        const agentSys = this._agentSys(s);
        await runOpenAIAgentTurn({
          prompt: userText, mode: s.mode, cwd: s.cwd, profile, permMode: s.permMode,
          history: s.history, emit, permissions: this.permissions, signal: controller.signal,
          connectors: ex.connectors, skillsDir: ex.skillsDir, disabledSkills: ex.disabledSkills,
          globalInstructions: agentSys ? `${agentSys}\n\n${withLang(cfg)}` : withLang(cfg),
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
