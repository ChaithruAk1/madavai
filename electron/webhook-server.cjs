// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Webhook triggers — a tiny local HTTP server that lets ANY external system fire a
// Madav agent, team, or scheduled task: Zapier, IFTTT, a mail filter, a cron box,
// a CI pipeline. Token-protected; binds to 127.0.0.1 by default (set webhooks.lan
// to accept LAN calls). This is the "runs while you sleep" half of triggers.
//
//   POST /hook/agent/<agentId>   { "prompt": "..." }       → runs the agent headless
//   POST /hook/team/<teamId>     { "prompt": "..." }       → runs the team headless
//   POST /hook/task/<taskId>     { "prompt": "optional" }  → runs a scheduled task now
//   GET  /hook/ping                                        → { ok: true }
//
// Auth: Authorization: Bearer <token>  (or ?token=<token>).
const http = require("http");
const crypto = require("crypto");

let server = null;
let state = { running: false, port: 0, error: "" };

function newToken() { return crypto.randomBytes(24).toString("base64url"); }

// Constant-time token check — sha256 both sides first so the buffers are always the
// same length (timingSafeEqual throws on length mismatch, which itself leaks length).
function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(String(provided)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

// Tiny per-IP rate limiter: 30 requests per rolling minute.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;
const rateMap = new Map(); // ip → array of request timestamps
function rateLimited(ip) {
  const now = Date.now();
  // Prune stale IPs occasionally so the map can't grow unbounded.
  if (rateMap.size > 500) {
    for (const [k, v] of rateMap) { if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) rateMap.delete(k); }
  }
  const hits = (rateMap.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  rateMap.set(ip, hits);
  return hits.length > RATE_LIMIT;
}

function readBody(req, cb) {
  let buf = "";
  req.on("data", (c) => { buf += c; if (buf.length > 256 * 1024) req.destroy(); });
  req.on("end", () => { let j = {}; try { j = JSON.parse(buf || "{}"); } catch {} cb(j); });
}

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

/**
 * (Re)start the webhook server per settings.webhooks. deps:
 *  { settings, taskStore, taskRunner, missionRunner, onRun(kind, id, run) }
 */
function reconcile(deps) {
  const cfg = deps.settings.load();
  const wh = cfg.webhooks || {};
  stop();
  if (!wh.enabled) return status();
  const port = Number(wh.port) || 8765;
  const token = wh.token || "";
  const host = wh.lan ? "0.0.0.0" : "127.0.0.1";
  if (wh.lan) {
    console.warn([
      "",
      "============================================================",
      "[madav] WARNING: webhook triggers are bound to 0.0.0.0.",
      "  Your agent workforce is reachable by EVERY device on this",
      "  network. Anyone with the token can run agents headlessly.",
      "  Disable webhooks.lan unless you trust the whole network.",
      "============================================================",
      "",
    ].join("\n"));
  }

  server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, "http://localhost");
      const ip = (req.socket && req.socket.remoteAddress) || "?";
      if (rateLimited(ip)) return send(res, 429, { ok: false, error: "rate limit exceeded (30 req/min)" });
      const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || u.searchParams.get("token") || "";
      if (u.pathname === "/hook/ping") return send(res, 200, { ok: true, app: "Madav" });
      if (!token || !tokenMatches(auth, token)) return send(res, 401, { ok: false, error: "bad or missing token" });
      // POST /hook/flow — a workflow recorded in REAL Chrome (Madav extension) arrives
      // here; the Flow Recorder's distiller turns it into a Skill Forge DRAFT (the
      // user still approves it on the Skills screen — nothing activates by itself).
      if (u.pathname === "/hook/flow" && req.method === "POST") {
        readBody(req, async (body) => {
          try {
            const raw = Array.isArray(body.steps) ? body.steps.slice(-300) : [];
            const steps = raw.map((s) => ({
              t: s.t === "page" || s.t === "fill" ? s.t : "click",
              url: String(s.url || "").slice(0, 300), title: String(s.title || "").slice(0, 120),
              role: String(s.role || "").slice(0, 24), name: String(s.name || "").slice(0, 70),
              field: String(s.field || "").slice(0, 70), value: String(s.value || "").slice(0, 80),
              at: Number(s.at) || Date.now(),
            }));
            if (steps.length < 3) return send(res, 400, { ok: false, error: "need at least 3 recorded steps" });
            await require("./flow-recorder.cjs").distill(steps);
            return send(res, 200, { ok: true, note: "Draft created — approve it in Madav → Skills → Learned drafts (may take ~30s to appear)." });
          } catch (e) { return send(res, 500, { ok: false, error: String((e && e.message) || e).slice(0, 300) }); }
        });
        return;
      }

      // GET /hook/models — the desktop app's model catalog for trusted local companions
      // (the Chrome extension). Names/ids only — API KEYS NEVER LEAVE THE APP.
      if (u.pathname === "/hook/models" && req.method === "GET") {
        const scfg = deps.settings.load();
        const groups = Object.values(scfg.profiles || {}).map((p) => ({
          id: p.id, name: p.name, kind: p.kind,
          models: (p.cachedModels && p.cachedModels.length ? p.cachedModels : (p.model ? [p.model] : [])).slice(0, 400),
        })).filter((g) => g.models.length);
        return send(res, 200, { ok: true, active: scfg.activeProfileId, groups });
      }
      // POST /hook/chat { model?: "pid::model", messages } — run a completion ON the
      // desktop app (its keys, its providers); companions get the answer, never the key.
      if (u.pathname === "/hook/chat" && req.method === "POST") {
        readBody(req, async (body) => {
          try {
            const scfg = deps.settings.load();
            let prof = deps.settings.activeProfile(scfg);
            const mm = String(body.model || "");
            if (mm.includes("::")) {
              const i = mm.indexOf("::");
              const p = scfg.profiles[mm.slice(0, i)];
              if (p) prof = deps.settings.resolveProfile({ ...p, model: mm.slice(i + 2) });
            }
            const msgs = Array.isArray(body.messages) ? body.messages.slice(-30).map((x) => ({ role: x.role === "system" ? "system" : x.role === "assistant" ? "assistant" : "user", content: String(x.content || "").slice(0, 30000) })) : [];
            if (!msgs.length) return send(res, 400, { ok: false, error: "messages required" });
            const { streamChat } = require("./providers.cjs");
            const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 120000);
            let text = "";
            try { text = (await streamChat({ ...prof }, msgs, { signal: ac.signal, onDelta: () => {} })).text || ""; }
            finally { clearTimeout(to); }
            return send(res, 200, { ok: true, text, model: prof.model, provider: prof.name });
          } catch (e) { return send(res, 500, { ok: false, error: String((e && e.message) || e).slice(0, 300) }); }
        });
        return;
      }

      const m = /^\/hook\/(agent|team|task)\/([\w.-]+)$/.exec(u.pathname);
      if (!m || req.method !== "POST") return send(res, 404, { ok: false, error: "unknown route" });
      const [, kind, id] = m;

      readBody(req, async (body) => {
        try {
          const prompt = String(body.prompt || "").slice(0, 32000);
          const scfg = deps.settings.load();
          if (kind === "agent") {
            const agent = deps.missionRunner.findAgent(scfg, id);
            if (!agent) return send(res, 404, { ok: false, error: "agent not found" });
            if (!prompt) return send(res, 400, { ok: false, error: "prompt required" });
            const r = await deps.missionRunner.runAgentHeadless({ agent, prompt, source: "webhook" });
            deps.onRun && deps.onRun("agent", agent.id, r);
            return send(res, 200, { ok: r.ok, output: r.text.slice(0, 8000) });
          }
          if (kind === "team") {
            const team = deps.missionRunner.findTeam(scfg, id);
            if (!team) return send(res, 404, { ok: false, error: "team not found" });
            if (!prompt) return send(res, 400, { ok: false, error: "prompt required" });
            const r = await deps.missionRunner.runTeamHeadless({ team, prompt, source: "webhook" });
            deps.onRun && deps.onRun("team", team.id, r);
            return send(res, 200, { ok: r.ok, output: r.text.slice(0, 8000) });
          }
          // task
          const t = deps.taskStore.getTask(id);
          if (!t) return send(res, 404, { ok: false, error: "task not found" });
          const run = await deps.taskRunner.runTask({ ...t, ...(prompt ? { prompt } : {}), source: "webhook" });
          deps.taskStore.addRun(t.id, { ...run, source: "webhook" });
          deps.onRun && deps.onRun("task", t.id, run);
          return send(res, 200, { ok: run.status === "success", output: String(run.output || "").slice(0, 8000) });
        } catch (e) {
          return send(res, 500, { ok: false, error: String((e && e.message) || e).slice(0, 400) });
        }
      });
    } catch (e) {
      try { send(res, 500, { ok: false, error: String((e && e.message) || e).slice(0, 200) }); } catch {}
    }
  });

  server.on("error", (e) => { state = { running: false, port, error: String((e && e.message) || e) }; server = null; });
  server.listen(port, host, () => { state = { running: true, port, error: "" }; console.log(`[madav] webhook triggers listening on ${host}:${port}`); });
  state = { running: true, port, error: "" };
  return status();
}

function stop() {
  if (server) { try { server.close(); } catch {} server = null; }
  state = { running: false, port: 0, error: state.error || "" };
}

function status() { return { ...state }; }

module.exports = { reconcile, stop, status, newToken };
