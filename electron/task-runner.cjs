// Task runner — executes a task headlessly (no UI session), capturing the output.
// Runs unattended, so it uses permission mode "bypass" (auto-approves tools).
const { streamChat } = require("./providers.cjs");
const { runOpenAIAgentTurn } = require("./agent-openai.cjs");
const settings = require("./settings.cjs");
const store = require("./projects-store.cjs");

function profileFor(task) {
  const cfg = settings.load();
  if (task.model && task.model.includes("::")) {
    const pid = task.model.slice(0, task.model.indexOf("::"));
    const mid = task.model.slice(task.model.indexOf("::") + 2);
    const p = cfg.profiles[pid];
    if (p && mid) return { ...p, model: mid };
  }
  return settings.activeProfile();
}

async function runTask(task) {
  const profile = profileFor(task);
  if (!profile || !profile.baseUrl) return { status: "error", output: "No provider configured." };
  const cfg = settings.load();
  const target = task.target || { type: "chat" };

  let text = "";
  const notes = [];
  const emit = (e) => {
    if (e.kind === "assistant_delta") text += e.data.text || "";
    else if (e.kind === "tool_use") notes.push("· used " + e.data.name);
    else if (e.kind === "error") notes.push("ERROR: " + (e.data.message || ""));
  };
  const permissions = new Map();
  // Prior turns, so a continued session (e.g. handed off to Telegram) keeps its context.
  const history = Array.isArray(task.history) ? task.history.slice() : [];

  const agent = (opts) => {
    // The agent only applies its system prompt when history[0] is a system slot; a
    // continued session's history starts with user/assistant turns, so ensure one exists.
    if (history.length && (!history[0] || history[0].role !== "system")) history.unshift({ role: "system", content: "" });
    return runOpenAIAgentTurn({
      prompt: task.prompt, profile, permMode: "bypass", history, emit, permissions,
      connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [],
      ...opts,
    });
  };

  try {
    // Agent / team triggers — the Scheduler (and webhooks) can run your workforce
    // headless: the agent's instructions, knowledge, memory, and tools all apply,
    // run history is recorded, and learnings are extracted — same as interactive runs.
    if (target.type === "agent") {
      const mission = require("./mission-runner.cjs");
      const agent = mission.findAgent(cfg, target.agentId);
      if (!agent) return { status: "error", output: "Agent not found — it may have been deleted." };
      const r = await mission.runAgentHeadless({
        agent, prompt: task.prompt, cwd: target.folder || null, source: "schedule",
        profile: task.model ? profile : null, // task-level model pin wins over the agent's
      });
      return { status: r.ok ? "success" : "error", output: r.text.slice(0, 20000) };
    }
    if (target.type === "team") {
      const mission = require("./mission-runner.cjs");
      const team = mission.findTeam(cfg, target.teamId);
      if (!team) return { status: "error", output: "Team not found — it may have been deleted." };
      const r = await mission.runTeamHeadless({ team, prompt: task.prompt, source: "schedule", profile: task.model ? profile : null });
      return { status: r.ok ? "success" : "error", output: r.text.slice(0, 20000) };
    }
    if (target.type === "project") {
      const project = store.getProject(target.projectId);
      if (!project) return { status: "error", output: "Project not found." };
      const sys = store.projectSystem(project) + (project.folder ? `\n\nLinked folder: ${project.folder}` : "");
      if (profile.kind === "anthropic") {
        const r = await streamChat(profile, [{ role: "system", content: sys }, ...history, { role: "user", content: task.prompt }], { onDelta: () => {} });
        text = r.text;
      } else {
        await agent({ mode: project.folder ? "cowork" : "chat", cwd: project.folder || null, systemOverride: sys });
      }
    } else if (target.type === "folder" && target.folder) {
      if (profile.kind === "anthropic") return { status: "error", output: "Folder tasks need an OpenAI-compatible provider." };
      await agent({ mode: "cowork", cwd: target.folder });
    } else {
      // plain chat
      const hasExtras = (cfg.skillsDirs || []).length || (cfg.connectors || []).some((c) => c.enabled);
      if (profile.kind === "anthropic" || !hasExtras) {
        const sys = task.systemOverride || "You are BrainEdge.";
        const r = await streamChat(profile, [{ role: "system", content: sys }, ...history, { role: "user", content: task.prompt }], { onDelta: () => {} });
        text = r.text;
      } else {
        await agent({ mode: "chat", cwd: null, systemOverride: task.systemOverride });
      }
    }
    const out = (text.trim() || notes.join("\n") || "(no output)").slice(0, 20000);
    return { status: "success", output: out };
  } catch (e) {
    return { status: "error", output: String((e && e.message) || e).slice(0, 2000) };
  }
}

module.exports = { runTask };
