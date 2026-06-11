// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// QA CONSOLE — a friendly UI for the external safety net.
// Independent of the app on purpose: it's a tiny local web page served by Node alone,
// so it works even when Madav itself won't start. It runs the same trusted
// qa-external.mjs underneath and streams its output live into the browser.
//
//   Double-click QA-Console.cmd   (or: node scripts/qa-external-ui.mjs)
import http from "node:http";
import tls from "node:tls";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ===== OTP protection for Restore =====
// Config lives in scripts/qa-config.json (gitignored — see qa-config.example.json).
// Channels, in order of preference: email (Gmail SMTP app password), SMS via Twilio
// (lands in the iPhone Messages app — Apple offers no public iMessage API), and a
// zero-setup fallback: the code prints in THIS terminal window.
function qaConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "qa-config.json"), "utf8")); } catch { return {}; }
}
let otp = null; // { code, exp, used }
const newOtp = () => { otp = { code: String(crypto.randomInt(100000, 999999)), exp: Date.now() + 5 * 60000, used: false }; return otp.code; };
const checkOtp = (code) => {
  if (!otp || otp.used || Date.now() > otp.exp) return false;
  const ok = crypto.timingSafeEqual(Buffer.from(String(code).padEnd(6)), Buffer.from(otp.code.padEnd(6)));
  if (ok) otp.used = true;
  return ok;
};

// Minimal SMTP-over-TLS client (Gmail: smtp.gmail.com:465 + an App Password). No dependencies.
function sendEmail(cfg, subject, body) {
  return new Promise((resolve, reject) => {
    const { smtpHost = "smtp.gmail.com", smtpPort = 465, smtpUser, smtpPass, otpEmail } = cfg;
    if (!smtpUser || !smtpPass || !otpEmail) return reject(new Error("email not configured"));
    const sock = tls.connect(smtpPort, smtpHost, { servername: smtpHost });
    const cmds = [
      `EHLO madav.local`,
      `AUTH LOGIN`, Buffer.from(smtpUser).toString("base64"), Buffer.from(smtpPass).toString("base64"),
      `MAIL FROM:<${smtpUser}>`, `RCPT TO:<${otpEmail}>`, `DATA`,
      `From: Madav QA <${smtpUser}>\r\nTo: <${otpEmail}>\r\nSubject: ${subject}\r\n\r\n${body}\r\n.`,
      `QUIT`,
    ];
    let i = 0, buf = "";
    const to = setTimeout(() => { sock.destroy(); reject(new Error("email timed out")); }, 20000);
    sock.on("data", (d) => {
      buf += String(d);
      if (!/\r?\n$/.test(buf)) return;
      const code = Number(buf.slice(0, 3)); buf = "";
      if (code >= 500) { clearTimeout(to); sock.destroy(); return reject(new Error("mail server said " + code)); }
      if (i < cmds.length) sock.write(cmds[i++] + "\r\n");
      else { clearTimeout(to); sock.end(); resolve(true); }
    });
    sock.on("error", (e) => { clearTimeout(to); reject(e); });
  });
}

// Twilio SMS via plain REST (no SDK). Lands in the Messages app on the iPhone.
async function sendSms(cfg, body) {
  const { twilioSid, twilioToken, twilioFrom, otpPhone } = cfg;
  if (!twilioSid || !twilioToken || !twilioFrom || !otpPhone) throw new Error("sms not configured");
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: otpPhone, From: twilioFrom, Body: body }).toString(),
  });
  if (!r.ok) throw new Error("Twilio said " + r.status + ": " + (await r.text()).slice(0, 160));
}

async function dispatchOtp() {
  const cfg = qaConfig();
  const code = newOtp();
  const sentTo = [];
  try { await sendEmail(cfg, "Madav restore code", `Your Madav RESTORE confirmation code is: ${code}\n\nIt expires in 5 minutes. If you didn't request a restore, ignore this.`); sentTo.push("email " + String(cfg.otpEmail).replace(/^(..).*(@.*)$/, "$1…$2")); } catch {}
  try { await sendSms(cfg, `Madav restore code: ${code} (expires in 5 min)`); sentTo.push("text message " + String(cfg.otpPhone).slice(-4).padStart(8, "•")); } catch {}
  if (!sentTo.length) { console.log(`\n  🔐 RESTORE CONFIRMATION CODE: ${code}   (expires in 5 minutes)\n`); sentTo.push("this terminal window (set up scripts/qa-config.json for email/SMS)"); }
  return sentTo;
}
const SCRIPT = path.join(ROOT, "scripts", "qa-external.mjs");
const PORT = 7878;
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

let child = null;
const clients = new Set();
const send = (type, line) => { const msg = `data: ${JSON.stringify({ type, line })}\n\n`; for (const c of clients) c.write(msg); };

function runJob(args) {
  if (child) return false;
  child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT });
  send("start", args.join(" ") || "verify");
  const onData = (d) => String(d).split("\n").forEach((l) => { const t = stripAnsi(l).trimEnd(); if (t) send("line", t); });
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", (code) => { send("done", code === 0 ? "ok" : "fail"); child = null; });
  return true;
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>Madav QA Console</title>
<style>
  :root{--bg:#0b0f14;--card:#121821;--line:#232b36;--text:#e8eef7;--dim:#8b96a5;--acc:#13c2d6;--ok:#5fb573;--bad:#f08a86}
  body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui;display:flex;flex-direction:column;align-items:center;padding:34px 18px}
  .wrap{width:min(860px,100%)}
  h1{font-size:22px;margin:0 0 4px} .sub{color:var(--dim);font-size:13px;margin:0 0 22px}
  .btns{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
  button{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:11px;padding:11px 18px;font:600 13.5px system-ui;cursor:pointer;transition:all .15s}
  button:hover:not(:disabled){border-color:var(--acc);transform:translateY(-1px)}
  button:disabled{opacity:.45;cursor:default}
  button.primary{background:var(--acc);color:#04121a;border-color:var(--acc)}
  button.danger{border-color:rgba(240,138,134,.5);color:var(--bad)}
  #status{font-size:13px;margin-bottom:12px;color:var(--dim)}
  #status.run{color:var(--acc)} #status.ok{color:var(--ok);font-weight:700} #status.fail{color:var(--bad);font-weight:700}
  #log{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;min-height:300px;max-height:60vh;overflow:auto;font:12.5px/1.7 ui-monospace,monospace;white-space:pre-wrap}
  #log .ok{color:var(--ok)} #log .bad{color:var(--bad)} #log .dim{color:var(--dim)}
  .note{color:var(--dim);font-size:12px;margin-top:14px;line-height:1.6}
</style>
<div class="wrap">
  <h1>🛟 Madav QA Console</h1>
  <p class="sub">The safety net that lives OUTSIDE the app — verify the code, keep automatic checkpoints, and restore the last working state. Works even when Madav won't start.</p>
  <div class="btns">
    <button class="primary" id="b-full" onclick="job('')">▶ Full verification <span style="font-weight:400">(checks + build)</span></button>
    <button id="b-fast" onclick="job('--no-build')">⚡ Fast check <span style="opacity:.7">(skips build)</span></button>
    <button id="b-list" onclick="job('list')">🗂 Checkpoints</button>
    <button class="danger" id="b-restore" onclick="askRestore()">⏪ Restore last working state</button>
  </div>
  <div id="otpbox" style="display:none;background:var(--card);border:1px solid var(--bad);border-radius:12px;padding:14px 16px;margin-bottom:14px">
    <div id="otpmsg" style="font-size:13px;margin-bottom:10px"></div>
    <input id="otpcode" placeholder="6-digit code" maxlength="6" inputmode="numeric"
      style="background:var(--bg);border:1px solid var(--line);border-radius:9px;color:var(--text);font:600 16px ui-monospace,monospace;letter-spacing:4px;padding:9px 12px;width:140px;text-align:center">
    <button class="danger" onclick="confirmRestore()" style="margin-left:8px">Confirm restore</button>
    <button onclick="document.getElementById('otpbox').style.display='none'" style="margin-left:4px">Cancel</button>
  </div>
  <div id="status">Idle — run a verification. Every all-green run saves a checkpoint automatically.</div>
  <div id="log"><span class="dim">Output will appear here…</span></div>
  <p class="note">Green = saved as the new "last known good". Red = fix the listed problems, or click Restore to go back in time.
  After a restore: run <b>npm install</b> (only if package.json changed), then start the app normally. Checkpoints cover source code — your chats, agents and settings are never touched.</p>
</div>
<script>
  const log = document.getElementById("log"), status = document.getElementById("status");
  const btns = [...document.querySelectorAll("button")];
  function busy(b){ btns.forEach(x=>x.disabled=b); }
  function add(line){
    const div=document.createElement("div");
    div.className = line.startsWith("✓")?"ok":line.startsWith("✗")||line.includes("problem")?"bad":line.startsWith("ALL CLEAR")?"ok":"";
    div.textContent=line; log.appendChild(div); log.scrollTop=log.scrollHeight;
  }
  async function job(arg, otp){
    log.innerHTML=""; busy(true);
    status.className="run"; status.textContent="Running… (the build step can take a minute)";
    const r = await fetch("/run?arg="+encodeURIComponent(arg)+(otp?"&otp="+encodeURIComponent(otp):""),{method:"POST"});
    if(r.status===403){ busy(false); status.className="fail"; status.textContent="✗ Wrong or expired code — request a new one."; }
  }
  // Restore requires a one-time code, delivered out-of-band (email / text / the terminal window).
  async function askRestore(){
    status.className="run"; status.textContent="Sending your confirmation code…";
    const r = await fetch("/otp/send",{method:"POST"});
    if(!r.ok){ status.className="fail"; status.textContent="Couldn't send a code: "+await r.text(); return; }
    const j = await r.json();
    status.className=""; status.textContent="";
    document.getElementById("otpmsg").innerHTML = "🔐 <b>Restore needs confirmation.</b> A 6-digit code was sent to: <b>"+j.sentTo.join("</b> and <b>")+"</b>. Enter it within 5 minutes. Your current state is saved first, so the restore is reversible.";
    document.getElementById("otpbox").style.display="block";
    document.getElementById("otpcode").value=""; document.getElementById("otpcode").focus();
  }
  function confirmRestore(){
    const code = document.getElementById("otpcode").value.trim();
    if(code.length!==6) return;
    document.getElementById("otpbox").style.display="none";
    job("restore", code);
  }
  const es=new EventSource("/events");
  es.onmessage=(e)=>{ const m=JSON.parse(e.data);
    if(m.type==="line") add(m.line);
    if(m.type==="done"){ busy(false);
      status.className=m.line==="ok"?"ok":"fail";
      status.textContent=m.line==="ok"?"✓ Finished — all clear.":"✗ Finished with problems — see above (or Restore).";
    }
  };
</script>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(PAGE); }
  if (u.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (u.pathname === "/otp/send" && req.method === "POST") {
    dispatchOtp().then((sentTo) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ sentTo })); })
      .catch((e) => { res.writeHead(500); res.end(String(e.message || e)); });
    return;
  }
  if (u.pathname === "/run" && req.method === "POST") {
    const arg = (u.searchParams.get("arg") || "").trim();
    // Restore is destructive-adjacent → it requires a fresh OTP. Everything else runs freely.
    if (arg.startsWith("restore") && !checkOtp(u.searchParams.get("otp") || "")) {
      res.writeHead(403); return res.end("wrong or expired code");
    }
    const ok = runJob(arg ? arg.split(" ") : []);
    res.writeHead(ok ? 200 : 409); return res.end(ok ? "started" : "already running");
  }
  res.writeHead(404); res.end();
});
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`QA Console running at ${url}  (Ctrl+C to stop)`);
  const open = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(open[0], open[1], { detached: true, stdio: "ignore" }).unref(); } catch {}
});
