// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// electron/chat-core-runner.cjs — ADR-0001 / M2c.3. Routes ONE chat turn through the shared core
// (core/chat-loop.js coreChatTurn) via the desktop adapter, behind MADAV_CORE_CHAT. agent-openai.cjs
// calls this ONLY when the flag is on; the default-off path is the untouched legacy loop.
//
// Dependency-injected (no agent-openai internals imported) so it is unit-testable off the main
// process against the real recorded cassettes. The leaves (quickSearch/generateImage/runTool/
// askUserQuestion) and the permission helpers (isAuto/isBlocked/askPermission) are the SAME desktop
// functions the legacy loop uses — this re-expresses the chat tool wiring, it does not reinvent it.

const { makeDesktopChatAdapter } = require("./chat-core-adapter.cjs");
let _coreP = null;
const coreChatLoop = () => (_coreP ||= import("../core/chat-loop.js")); // cached dynamic ESM import (proven MCP-SDK pattern)

// The chat-mode per-tool executor: inline chat tools specially, everything else via the generic runTool.
function makeChatLeafExec(deps) {
  const { quickSearch, generateImage, runTool, askUserQuestion, emit, permissions,
          profile, cwd, skillsDir, mission, agentName, allowAskUser, imagegenOn, permMode, isBlocked, signal } = deps;
  return async function execLeaf(name, args) {
    if (name === "web_search") {
      try { return await quickSearch(String(args.query || ""), signal); } catch { return "(web search failed)"; }
    }
    if (name === "create_image") {
      if (isBlocked(permMode, name)) return "(blocked: plan mode is read-only)";
      if (!imagegenOn) return "Image generation is turned off for this install (Settings → Extras).";
      try {
        const r = await generateImage(profile, args.prompt); // NOTE: image-card emit is a documented M2c gap (no double tool_result)
        return "Image generated and shown to the user" + (r && r.file ? ` (saved: ${r.file})` : "") + ". Describe it in one short sentence and continue.";
      } catch (e) { return "ERROR: " + ((e && e.message) || e); }
    }
    if (name === "ask_user") {
      return allowAskUser ? await askUserQuestion(emit, permissions, "", args.question, args.options)
                          : "(no user available on this run — proceed with your best judgment and state your assumption)";
    }
    return await runTool(cwd, name, args, skillsDir, null, mission, agentName); // load_skill / MCP / file-shell
  };
}

// The permission gate, identical in spirit to the legacy loop: plan-mode block -> auto -> ask.
function makeAuthorize(deps) {
  const { isBlocked, isAuto, askPermission, emit, permissions, permMode } = deps;
  return async function authorize(name, args, id) {
    if (isBlocked(permMode, name)) return { decision: "blocked", auto: false };
    if (isAuto(permMode, name)) return { decision: "run", auto: true };
    const allowed = await askPermission(emit, permissions, id, name, args);
    return { decision: allowed ? "run" : "denied", auto: false };
  };
}

async function runChatTurnViaCore(deps) {
  const { coreChatTurn } = await coreChatLoop();
  const { streamChatTools, streamChat, parseTextToolCalls, emit, tools, history,
          profile, mode, caps, textMode, MAX_STEPS, signal, exactCtx } = deps;
  const adapter = makeDesktopChatAdapter({
    streamChatTools, streamChat, parseTextToolCalls,
    execLeaf: makeChatLeafExec(deps), authorize: makeAuthorize(deps),
    emit, toolset: tools, textMode,
  });
  // history already holds [system, ...prior, user prompt]; let core consume it as-is.
  const res = await coreChatTurn({
    adapter, history, prompt: "", system: "",
    model: (profile && profile.model) || "", mode, tools, caps,
    opts: { stepCap: MAX_STEPS, signal, profile, exactCtx }, // profile -> baseUrl/apiKey for the URL; exactCtx -> compaction budget
  });
  // Replace session history with the full transcript core produced (handles append AND compaction).
  history.length = 0;
  for (const m of res.messages) history.push(m);
  return res;
}

module.exports = { runChatTurnViaCore, makeChatLeafExec, makeAuthorize };
