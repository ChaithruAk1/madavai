// Tiny persistence for the gateway. Long-lived things (registered MCP clients + issued
// gateway tokens → provider tokens) are written to a JSON file so a restart doesn't sign
// everyone out. Short-lived things (auth codes, pending provider redirects) stay in memory.
import fs from "node:fs";
import path from "node:path";

const FILE = process.env.STORE_FILE || path.join(process.cwd(), ".gateway-store.json");

let disk = { clients: {}, tokens: {} };   // tokens: gwToken -> { provider, providerToken, clientId, sub, exp }
try { disk = { clients: {}, tokens: {}, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(disk), { mode: 0o600 }); } catch {} }, 200);
}

// In-memory, short TTL.
const codes = new Map();    // gwCode -> { clientId, redirectUri, codeChallenge, provider, providerToken, sub, state, exp }
const pending = new Map();  // pendingId -> { clientId, redirectUri, codeChallenge, state, provider, exp }
const TTL = 10 * 60 * 1000;
function gcMap(m) { const now = Date.now(); for (const [k, v] of m) if (v.exp && v.exp < now) m.delete(k); }
setInterval(() => { gcMap(codes); gcMap(pending); }, 60 * 1000).unref?.();

export const clients = {
  get: (id) => disk.clients[id],
  set: (c) => { disk.clients[c.client_id] = c; persist(); },
};
export const tokens = {
  get: (t) => disk.tokens[t],
  set: (t, v) => { disk.tokens[t] = v; persist(); },
  del: (t) => { delete disk.tokens[t]; persist(); },
};
export const authCodes = {
  set: (code, v) => codes.set(code, { ...v, exp: Date.now() + TTL }),
  take: (code) => { const v = codes.get(code); codes.delete(code); return v; },
  peek: (code) => codes.get(code),
};
export const pendings = {
  set: (id, v) => pending.set(id, { ...v, exp: Date.now() + TTL }),
  take: (id) => { const v = pending.get(id); pending.delete(id); return v; },
};
