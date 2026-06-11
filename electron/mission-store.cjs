// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Durable missions — checkpoint a team mission after every member completes, keyed
// by the conversation id. If the app crashes (or is closed) mid-mission, reopening
// the conversation offers "Resume mission" — completed members' work is reused and
// only the remaining stations run. LangGraph-style durability, file-simple.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const dir = () => path.join(app.getPath("userData"), "missions");
const file = (convId) => path.join(dir(), String(convId).replace(/[^\w.-]/g, "_") + ".json");

function get(convId) {
  if (!convId) return null;
  try { return JSON.parse(fs.readFileSync(file(convId), "utf8")); } catch { return null; }
}

// state: { teamName, mode, userText, plan:[{member,task}], outputs:[{name,text}], finished, at }
function save(convId, state) {
  if (!convId) return null;
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const s = { ...state, at: Date.now() };
    fs.writeFileSync(file(convId), JSON.stringify(s, null, 2));
    return s;
  } catch { return null; }
}

function clear(convId) { try { fs.unlinkSync(file(convId)); } catch {} return true; }

module.exports = { get, save, clear };
