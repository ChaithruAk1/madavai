// Exposes window.thinkflux — the real Bridge (mirrors src/bridge/contract.js).
const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Set();
ipcRenderer.on("thinkflux:event", (_e, uiEvent) => {
  listeners.forEach((cb) => cb(uiEvent));
});

contextBridge.exposeInMainWorld("thinkflux", {
  // --- Bridge contract ---
  start: (req) => ipcRenderer.invoke("thinkflux:start", req),
  sendInput: (sessionId, text) => ipcRenderer.invoke("thinkflux:sendInput", { sessionId, text }),
  interrupt: (sessionId) => ipcRenderer.invoke("thinkflux:interrupt", { sessionId }),
  setPermissionMode: (sessionId, mode) => ipcRenderer.invoke("thinkflux:setPermissionMode", { sessionId, mode }),
  resolvePermission: (requestId, result) => ipcRenderer.send("thinkflux:resolvePermission", { requestId, result }),
  onEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },

  // --- settings / models ---
  getSettings: () => ipcRenderer.invoke("thinkflux:getSettings"),
  saveSettings: (next) => ipcRenderer.invoke("thinkflux:saveSettings", next),
  listModels: (profileId) => ipcRenderer.invoke("thinkflux:listModels", profileId),
  pingProvider: (profileId) => ipcRenderer.invoke("thinkflux:pingProvider", profileId),

  // --- account / sign-in ---
  saveAccount: (account) => ipcRenderer.invoke("thinkflux:saveAccount", account),
  signOut: () => ipcRenderer.invoke("thinkflux:signOut"),
  googleSignIn: () => ipcRenderer.invoke("thinkflux:googleSignIn"),
  githubSignIn: () => ipcRenderer.invoke("thinkflux:githubSignIn"),
  linkAnthropic: () => ipcRenderer.invoke("thinkflux:linkAnthropic"),

  // --- agent ---
  chooseFolder: () => ipcRenderer.invoke("thinkflux:chooseFolder"),

  // --- persisted chat history (Talk / Collaborate / Build) ---
  listSessions: (mode) => ipcRenderer.invoke("thinkflux:listSessions", mode),
  getSession: (id) => ipcRenderer.invoke("thinkflux:getSession", id),
  deleteSession: (id) => ipcRenderer.invoke("thinkflux:deleteSession", id),

  // --- connectors (MCP) ---
  testConnector: (server) => ipcRenderer.invoke("thinkflux:testConnector", server),

  // --- skills ---
  listSkills: () => ipcRenderer.invoke("thinkflux:listSkills"),
  createSkill: (name) => ipcRenderer.invoke("thinkflux:createSkill", name),
  importSkillFolder: () => ipcRenderer.invoke("thinkflux:importSkillFolder"),
  importSkillZip: () => ipcRenderer.invoke("thinkflux:importSkillZip"),
  readSkill: (dir) => ipcRenderer.invoke("thinkflux:readSkill", dir),
  setSkillEnabled: (dir, enabled) => ipcRenderer.invoke("thinkflux:setSkillEnabled", { dir, enabled }),
  deleteSkill: (dir) => ipcRenderer.invoke("thinkflux:deleteSkill", dir),

  // --- projects ---
  listProjects: () => ipcRenderer.invoke("thinkflux:listProjects"),
  getProject: (id) => ipcRenderer.invoke("thinkflux:getProject", id),
  createProject: (name) => ipcRenderer.invoke("thinkflux:createProject", name),
  updateProject: (id, patch) => ipcRenderer.invoke("thinkflux:updateProject", { id, patch }),
  deleteProject: (id) => ipcRenderer.invoke("thinkflux:deleteProject", id),
  addKnowledgeText: (projectId, name, content) => ipcRenderer.invoke("thinkflux:addKnowledgeText", { projectId, name, content }),
  addKnowledgeFile: (projectId) => ipcRenderer.invoke("thinkflux:addKnowledgeFile", projectId),
  removeKnowledge: (projectId, knId) => ipcRenderer.invoke("thinkflux:removeKnowledge", { projectId, knId }),
  linkProjectFolder: (projectId) => ipcRenderer.invoke("thinkflux:linkProjectFolder", projectId),
  linkGithub: (projectId, url) => ipcRenderer.invoke("thinkflux:linkGithub", { projectId, url }),
  pullGithub: (projectId) => ipcRenderer.invoke("thinkflux:pullGithub", projectId),
  unlinkProjectSource: (projectId) => ipcRenderer.invoke("thinkflux:unlinkProjectSource", projectId),
  listConversations: (projectId) => ipcRenderer.invoke("thinkflux:listConversations", projectId),
  getConversation: (id) => ipcRenderer.invoke("thinkflux:getConversation", id),
  createConversation: (projectId) => ipcRenderer.invoke("thinkflux:createConversation", projectId),
  deleteConversation: (id) => ipcRenderer.invoke("thinkflux:deleteConversation", id),

  // --- dispatch (background + scheduled tasks) ---
  listTasks: () => ipcRenderer.invoke("thinkflux:listTasks"),
  createTask: () => ipcRenderer.invoke("thinkflux:createTask"),
  updateTask: (id, patch) => ipcRenderer.invoke("thinkflux:updateTask", { id, patch }),
  deleteTask: (id) => ipcRenderer.invoke("thinkflux:deleteTask", id),
  getRuns: (id) => ipcRenderer.invoke("thinkflux:getRuns", id),
  runTaskNow: (id) => ipcRenderer.invoke("thinkflux:runTaskNow", id),

  // --- usage ---
  getUsage: (days) => ipcRenderer.invoke("thinkflux:getUsage", days),

  // --- messaging (Telegram) ---
  applyMessaging: () => ipcRenderer.invoke("thinkflux:applyMessaging"),
  messagingStatus: () => ipcRenderer.invoke("thinkflux:messagingStatus"),
});
