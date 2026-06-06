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
  linkAnthropic: () => ipcRenderer.invoke("brainedge:linkAnthropic"),

  // --- agent ---
  chooseFolder: () => ipcRenderer.invoke("brainedge:chooseFolder"),
  listDir: (dir) => ipcRenderer.invoke("brainedge:listDir", dir),
  openExternal: (url) => ipcRenderer.invoke("brainedge:openExternal", url),

  // --- model speed check ---
  runSpeedTest: (args) => ipcRenderer.invoke("brainedge:runSpeedTest", args),
  cancelSpeedTest: () => ipcRenderer.invoke("brainedge:cancelSpeedTest"),
  getSpeedTestLast: () => ipcRenderer.invoke("brainedge:getSpeedTestLast"),

  // --- persisted chat history (Talk / Collaborate / Build) ---
  listSessions: (mode) => ipcRenderer.invoke("brainedge:listSessions", mode),
  getSession: (id) => ipcRenderer.invoke("brainedge:getSession", id),
  deleteSession: (id) => ipcRenderer.invoke("brainedge:deleteSession", id),

  // --- saved library (bookmarked responses) ---
  listSaved: () => ipcRenderer.invoke("brainedge:listSaved"),
  saveResponse: (item) => ipcRenderer.invoke("brainedge:saveResponse", item),
  updateSaved: (id, patch) => ipcRenderer.invoke("brainedge:updateSaved", { id, patch }),
  removeSaved: (id) => ipcRenderer.invoke("brainedge:removeSaved", id),

  // --- connectors (MCP) ---
  testConnector: (server) => ipcRenderer.invoke("brainedge:testConnector", server),

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
  pullGithub: (projectId) => ipcRenderer.invoke("brainedge:pullGithub", projectId),
  unlinkProjectSource: (projectId) => ipcRenderer.invoke("brainedge:unlinkProjectSource", projectId),
  listConversations: (projectId) => ipcRenderer.invoke("brainedge:listConversations", projectId),
  getConversation: (id) => ipcRenderer.invoke("brainedge:getConversation", id),
  createConversation: (projectId) => ipcRenderer.invoke("brainedge:createConversation", projectId),
  deleteConversation: (id) => ipcRenderer.invoke("brainedge:deleteConversation", id),

  // --- dispatch (background + scheduled tasks) --