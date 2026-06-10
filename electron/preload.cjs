// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Exposes window.brainedge — the real Bridge (mirrors src/bridge/contract.js).
const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Set();
ipcRenderer.on("brainedge:event", (_e, uiEvent) => {
  listeners.forEach((cb) => cb(uiEvent));
});

contextBridge.exposeInMainWorld("brainedge", {
  // --- Bridge contract ---
  start: (req) => ipcRenderer.invoke("brainedge:start", req),
  sendInput: (sessionId, text, images) => ipcRenderer.invoke("brainedge:sendInput", { sessionId, text, images }),
  interrupt: (sessionId) => ipcRenderer.invoke("brainedge:interrupt", { sessionId }),
  setPermissionMode: (sessionId, mode) => ipcRenderer.invoke("brainedge:setPermissionMode", { sessionId, mode }),
  resolvePermission: (requestId, result) => ipcRenderer.send("brainedge:resolvePermission", { requestId, result }),
  onEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },

  // --- settings / models ---
  getSettings: () => ipcRenderer.invoke("brainedge:getSettings"),
  saveSettings: (next) => ipcRenderer.invoke("brainedge:saveSettings", next),
  listModels: (profileId) => ipcRenderer.invoke("brainedge:listModels", profileId),
  pingProvider: (profileId) => ipcRenderer.invoke("brainedge:pingProvider", profileId),

  // --- account / sign-in ---
  saveAccount: (account) => ipcRenderer.invoke("brainedge:saveAccount", account),
  signOut: () => ipcRenderer.invoke("brainedge:signOut"),
  googleSignIn: () => ipcRenderer.invoke("brainedge:googleSignIn"),
  githubSignIn: () => ipcRenderer.invoke("brainedge:githubSignIn"),

  // --- agent ---
  chooseFolder: () => ipcRenderer.invoke("brainedge:chooseFolder"),
  listDir: (dir) => ipcRenderer.invoke("brainedge:listDir", dir),
  openExternal: (url) => ipcRenderer.invoke("brainedge:openExternal", url),

  // --- model speed check ---
  runSpeedTest: (args) => ipcRenderer.invoke("brainedge:runSpeedTest", args),
  cancelSpeedTest: () => ipcRenderer.invoke("brainedge:cancelSpeedTest"),
  getSpeedTestLast: () => ipcRenderer.invoke("brainedge:getSpeedTestLast"),
  getSpeedTestStatus: () => ipcRenderer.invoke("brainedge:getSpeedTestStatus"),
  getOpenRouterCatalog: (opts) => ipcRenderer.invoke("brainedge:getOpenRouterCatalog", opts),

  // --- persisted chat history (Talk / Collaborate / Build) ---
  listSessions: (mode, agentScope) => ipcRenderer.invoke("brainedge:listSessions", mode, agentScope),
  searchSessions: (q, mode) => ipcRenderer.invoke("brainedge:searchSessions", { q, mode }),
  getAppVersion: () => ipcRenderer.invoke("brainedge:getAppVersion"),
  qaStart: () => ipcRenderer.invoke("brainedge:qaStart"),
  qaStatus: () => ipcRenderer.invoke("brainedge:qaStatus"),
  qaHistory: () => ipcRenderer.invoke("brainedge:qaHistory"),
  qaDiagnose: (test) => ipcRenderer.invoke("brainedge:qaDiagnose", test),
  qaApplyFix: (fix) => ipcRenderer.invoke("brainedge:qaApplyFix", fix),
  qaRollback: (args) => ipcRenderer.invoke("brainedge:qaRollback", args),
  onQaEvent: (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on("brainedge:qa", h); return () => ipcRenderer.removeListener("brainedge:qa", h); },
  getSession: (id) => ipcRenderer.invoke("brainedge:getSession", id),
  deleteSession: (id) => ipcRenderer.invoke("brainedge:deleteSession", id),

  // --- saved library (bookmarked responses) ---
  listSaved: () => ipcRenderer.invoke("brainedge:listSaved"),
  saveResponse: (item) => ipcRenderer.invoke("brainedge:saveResponse", item),
  updateSaved: (id, patch) => ipcRenderer.invoke("brainedge:updateSaved", { id, patch }),
  removeSaved: (id) => ipcRenderer.invoke("brainedge:removeSaved", id),

  // --- connectors (MCP) ---
  testConnector: (server) => ipcRenderer.invoke("brainedge:testConnector", server),
  listConnectorDirectory: (opts) => ipcRenderer.invoke("brainedge:listConnectorDirectory", opts),

  // --- skills ---
  listSkills: () => ipcRenderer.invoke("brainedge:listSkills"),
  createSkill: (name) => ipcRenderer.invoke("brainedge:createSkill", name),
  importSkillFolder: () => ipcRenderer.invoke("brainedge:importSkillFolder"),
  importSkillZip: () => ipcRenderer.invoke("brainedge:importSkillZip"),
  readSkill: (dir) => ipcRenderer.invoke("brainedge:readSkill", dir),
  setSkillEnabled: (dir, enabled) => ipcRenderer.invoke("brainedge:setSkillEnabled", { dir, enabled }),
  deleteSkill: (dir) => ipcRenderer.invoke("brainedge:deleteSkill", dir),

  // --- projects ---
  listProjects: () => ipcRenderer.invoke("brainedge:listProjects"),
  getProject: (id) => ipcRenderer.invoke("brainedge:getProject", id),
  createProject: (name) => ipcRenderer.invoke("brainedge:createProject", name),
  updateProject: (id, patch) => ipcRenderer.invoke("brainedge:updateProject", { id, patch }),
  deleteProject: (id) => ipcRenderer.invoke("brainedge:deleteProject", id),
  addKnowledgeText: (projectId, name, content) => ipcRenderer.invoke("brainedge:addKnowledgeText", { projectId, name, content }),
  addKnowledgeFile: (projectId) => ipcRenderer.invoke("brainedge:addKnowledgeFile", projectId),
  removeKnowledge: (projectId, knId) => ipcRenderer.invoke("brainedge:removeKnowledge", { projectId, knId }),
  linkProjectFolder: (projectId) => ipcRenderer.invoke("brainedge:linkProjectFolder", projectId),
  linkGithub: (projectId, url) => ipcRenderer.invoke("brainedge:linkGithub", { projectId, url }),
  cloneRepo: (url) => ipcRenderer.invoke("brainedge:cloneRepo", url),
  pullGithub: (projectId) => ipcRenderer.invoke("brainedge:pullGithub", projectId),
  unlinkProjectSource: (projectId) => ipcRenderer.invoke("brainedge:unlinkProjectSource", projectId),
  listConversations: (projectId) => ipcRenderer.invoke("brainedge:listConversations", projectId),
  getConversation: (id) => ipcRenderer.invoke("brainedge:getConversation", id),
  createConversation: (projectId) => ipcRenderer.invoke("brainedge:createConversation", projectId),
  deleteConversation: (id) => ipcRenderer.invoke("brainedge:deleteConversation", id),

  // --- agent engine: memory · track record · missions · versions · swarms · webhooks ---
  getAgentMemory: (agentId) => ipcRenderer.invoke("brainedge:getAgentMemory", agentId),
  setAgentMemory: (agentId, notes) => ipcRenderer.invoke("brainedge:setAgentMemory", { agentId, notes }),
  clearAgentMemory: (agentId) => ipcRenderer.invoke("brainedge:clearAgentMemory", agentId),
  getAgentHistory: (agentId) => ipcRenderer.invoke("brainedge:getAgentHistory", agentId),
  getAgentStats: () => ipcRenderer.invoke("brainedge:getAgentStats"),
  getMission: (convId) => ipcRenderer.invoke("brainedge:getMission", convId),
  exportAgent: (agent) => ipcRenderer.invoke("brainedge:exportAgent", agent),
  importAgent: () => ipcRenderer.invoke("brainedge:importAgent"),
  snapshotAgentVersion: (agent) => ipcRenderer.invoke("brainedge:snapshotAgentVersion", agent),
  listAgentVersions: (agentId) => ipcRenderer.invoke("brainedge:listAgentVersions", agentId),
  applyWebhooks: () => ipcRenderer.invoke("brainedge:applyWebhooks"),
  webhookStatus: () => ipcRenderer.invoke("brainedge:webhookStatus"),
  newWebhookToken: () => ipcRenderer.invoke("brainedge:newWebhookToken"),
  transcribe: (args) => ipcRenderer.invoke("brainedge:transcribe", args),
  runSwarm: (args) => ipcRenderer.invoke("brainedge:runSwarm", args),
  cancelSwarm: (swarmId) => ipcRenderer.invoke("brainedge:cancelSwarm", swarmId),
  onSwarmEvent: (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on("brainedge:swarm", h); return () => ipcRenderer.removeListener("brainedge:swarm", h); },

  // --- background + scheduled tasks ---
  listTasks: () => ipcRenderer.invoke("brainedge:listTasks"),
  createTask: () => ipcRenderer.invoke("brainedge:createTask"),
  updateTask: (id, patch) => ipcRenderer.invoke("brainedge:updateTask", { id, patch }),
  deleteTask: (id) => ipcRenderer.invoke("brainedge:deleteTask", id),
  getRuns: (id) => ipcRenderer.invoke("brainedge:getRuns", id),
  runTaskNow: (id) => ipcRenderer.invoke("brainedge:runTaskNow", id),

  // --- usage ---
  getUsage: (days) => ipcRenderer.invoke("brainedge:getUsage", days),

  // --- messaging (Telegram) ---
  applyMessaging: () => ipcRenderer.invoke("brainedge:applyMessaging"),
  messagingStatus: () => ipcRenderer.invoke("brainedge:messagingStatus"),
  completeOnce: (messages) => ipcRenderer.invoke("brainedge:completeOnce", messages),
  listViaMobile: () => ipcRenderer.invoke("brainedge:listViaMobile"),
  removeViaMobile: (id) => ipcRenderer.invoke("brainedge:removeViaMobile", id),
  clearViaMobile: () => ipcRenderer.invoke("brainedge:clearViaMobile"),
  authSignIn: (provider) => ipcRenderer.invoke("brainedge:authSignIn", provider),
  authMe: () => ipcRenderer.invoke("brainedge:authMe"),
  authSignOut: () => ipcRenderer.invoke("brainedge:authSignOut"),
  billingCheckout: () => ipcRenderer.invoke("brainedge:billingCheckout"),
  billingPortal: () => ipcRenderer.invoke("brainedge:billingPortal"),
  track: (type, meta) => ipcRenderer.invoke("brainedge:track", type, meta),
  adminStats: (adminKey) => ipcRenderer.invoke("brainedge:adminStats", adminKey),
  adminUsers: (adminKey) => ipcRenderer.invoke("brainedge:adminUsers", adminKey),
  adminAction: (id, action, adminKey) => ipcRenderer.invoke("brainedge:adminAction", id, action, adminKey),
  scoreQuiz: (batch) => ipcRenderer.invoke("brainedge:scoreQuiz", batch),
  enableCli: () => ipcRenderer.invoke("brainedge:enableCli"),
  cliStatus: () => ipcRenderer.invoke("brainedge:cliStatus"),
  disableCli: () => ipcRenderer.invoke("brainedge:disableCli"),
  termCreate: (opts) => ipcRenderer.invoke("brainedge:termCreate", opts),
  termInput: (id, data) => ipcRenderer.invoke("brainedge:termInput", { id, data }),
  termResize: (id, cols, rows) => ipcRenderer.invoke("brainedge:termResize", { id, cols, rows }),
  termKill: (id) => ipcRenderer.invoke("brainedge:termKill", id),
  onTermData: (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on("brainedge:term:data", h); return () => ipcRenderer.removeListener("brainedge:term:data", h); },
  onTermExit: (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on("brainedge:term:exit", h); return () => ipcRenderer.removeListener("brainedge:term:exit", h); },
  getMobileLink: () => ipcRenderer.invoke("brainedge:getMobileLink"),
  setMobileLink: (link) => ipcRenderer.invoke("brainedge:setMobileLink", link),
  clearMobileLink: () => ipcRenderer.invoke("brainedge:clearMobileLink"),
  setKeepAwake: (on) => ipcRenderer.invoke("brainedge:setKeepAwake", on),
});
