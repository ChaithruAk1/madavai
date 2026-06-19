// src/bridge/chatCoreWeb.js — ADR-0001 / M2d.2. The WEB platform wiring over the SHARED core
// (core/chat-loop.js coreChatTurn + core/chat-adapter.js makeChatAdapter). Web is ESM, so it imports
// the core natively — no dynamic-import dance. This is the web mirror of electron/chat-core-runner.cjs;
// the ONLY differences are the web emit (3-arg emit(sessId,kind,data)), web's tool executor
// (executeTool / webGenImage), and that web has no approval flow (everything auto).
//
// ADDITIVE / NOT WIRED: webBridge.runAgentTurn does NOT call this yet. The web cutover (route chat
// through this, delete web's loop) is gated on the desktop shakeout of MADAV_CORE_CHAT + Render validation.

import { coreChatTurn } from "../../core/chat-loop.js";
import { makeChatAdapter } from "../../core/chat-adapter.js";
import { parseTextToolCalls } from "../../core/turn-helpers.js";

export async function runWebChatTurnViaCore(deps) {
  const {
    streamChatTools, streamChat, executeTool, webGenImage,
    emit, sessId, sess, tools, history,
    profile, mode = "chat", exactCtx, signal,
  } = deps;

  // Web per-tool executor: create_image shows the picture (image card is an M2d gap on the core path,
  // like desktop); everything else goes through web's executeTool. No approval flow (web is single-user).
  const execLeaf = async (name, args) => {
    if (name === "create_image") {
      try { const image = await webGenImage(profile, args.prompt); return { output: "Image generated and shown to the user. Describe it in one short sentence and continue.", image }; }
      catch (e) { return "ERROR: " + ((e && e.message) || e); }
    }
    return await executeTool(name, args, { sess });
  };

  const adapter = makeChatAdapter({
    streamChatTools, streamChat, parseTextToolCalls,
    execLeaf,
    ui: (kind, data) => emit(sessId, kind, data), // web 3-arg emit sink
    toolset: tools,
  });

  // history holds [system?, ...prior, user prompt]; let core consume it as-is.
  const res = await coreChatTurn({
    adapter, history, prompt: "", system: "",
    model: (profile && profile.model) || "", mode, tools,
    opts: { stepCap: 16, signal, profile, exactCtx },
  });
  // Replace session history with the full transcript core produced (append OR compaction).
  history.length = 0;
  for (const m of res.messages) history.push(m);
  return res;
}
