// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Shared system-prompt builders for custom agents and team members.
// One place wires together: identity + instructions + retrieved knowledge + memory.
// Used by session-manager (interactive) and mission-runner (headless), so an agent
// behaves identically whether you brief it in chat or a trigger fires it at 3 AM.
const retrieval = require("./knowledge-retrieval.cjs");
const memory = require("./agent-memory.cjs");

function dateLine() {
  const now = new Date();
  return `The current date is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;
}

// Knowledge block with RAG-lite retrieval (whole docs when small, top passages when large).
// Image-type knowledge entries are skipped here — they can't live in a text system prompt;
// they're surfaced separately via knowledgeImages() and inlined into the first user turn.
function knowledgeBlock(agent, taskText) {
  const docs = ((agent && agent.knowledge) || []).filter((k) => k && k.type !== "image");
  return retrieval.knowledgeBlock(docs, taskText || "");
}

// Image knowledge entries for an agent: [{ name, dataUrl }] (empty array when none).
// Consumed by session-manager to inline them into the first user turn for vision models.
function knowledgeImages(agent) {
  return ((agent && agent.knowledge) || [])
    .filter((k) => k && k.type === "image" && k.dataUrl)
    .map((k) => ({ name: k.name || "image", dataUrl: k.dataUrl }));
}

// System prompt for a solo custom agent.
function agentSystem(agent, { taskText = "" } = {}) {
  if (!agent || !agent.instructions) return null;
  return `You are "${agent.name || "a custom agent"}", an agent the user built in BrainEdge.` +
    (agent.description ? ` Purpose: ${agent.description}` : "") + ` ${dateLine()}` +
    `\n\nAgent instructions (always follow):\n${agent.instructions}` +
    knowledgeBlock(agent, taskText) +
    memory.block(agent);
}

// System prompt for one member of a team mission.
function memberSystem(member, taskText) {
  return `You are "${member.name}", one agent on a team inside BrainEdge.` +
    (member.description ? ` Purpose: ${member.description}` : "") +
    `\n\nAgent instructions (always follow):\n${member.instructions || ""}` +
    knowledgeBlock(member, taskText) +
    memory.block(member) +
    `\n\nYou receive a task (possibly with work from teammates). Do YOUR part thoroughly and reply with your complete work product as plain text — a teammate or coordinator consumes it next, so be complete and self-contained.`;
}

module.exports = { agentSystem, memberSystem, knowledgeBlock, knowledgeImages, dateLine };
