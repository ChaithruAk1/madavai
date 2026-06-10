// Execution backends for the agent. Local runs in agent-openai's execTool; this module
// provides the SSH backend so the agent's file/shell tools run on a remote host.
const fs = require("fs");

const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'"; // single-quote for remote shell

async function sshBackend(host) {
  const { Client } = require("ssh2");
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on("ready", resolve).on("error", reject).connect({
      host: host.host,
      port: Number(host.port) || 22,
      username: host.user,
      password: host.password || undefined,
      privateKey: host.keyPath ? fs.readFileSync(host.keyPath) : undefined,
      passphrase: host.passphrase || undefined,
      readyTimeout: 15000,
    });
  });
  const cwd = host.cwd && host.cwd.trim() ? host.cwd.trim() : ".";
  const base = cwd === "." ? "" : cwd.replace(/\/$/, "") + "/";
  const rpath = (p) => base + String(p || "").replace(/^\.?\//, "");

  const exec = (cmd) => new Promise((resolve, reject) => {
    conn.exec(`cd ${shq(cwd)} 2>/dev/null; ${cmd}`, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", (d) => (out += d)).stderr.on("data", (d) => (out += d));
      stream.on("close", () => resolve(out.slice(0, 8000)));
    });
  });
  const sftp = await new Promise((resolve, reject) => conn.sftp((e, s) => (e ? reject(e) : resolve(s))));

  return {
    type: "ssh",
    async bash(cmd) { return exec(cmd); },
    async list(p) { return exec(`ls -la ${shq(rpath(p || "."))}`); },
    async read(p) {
      return new Promise((resolve, reject) => {
        let d = "";
        sftp.createReadStream(rpath(p)).on("data", (c) => (d += c)).on("end", () => resolve(d.slice(0, 8000))).on("error", reject);
      });
    },
    async write(p, c) {
      return new Promise((resolve, reject) => {
        const ws = sftp.createWriteStream(rpath(p));
        ws.on("close", () => resolve("wrote " + p)).on("error", reject);
        ws.end(c == null ? "" : c);
      });
    },
    async edit(p, oldStr, newStr) {
      const t = await this.read(p);
      if (!t.includes(oldStr)) throw new Error("old_string not found in " + p);
      return this.write(p, t.replace(oldStr, newStr == null ? "" : newStr));
    },
    async find(pattern) { return exec(`find . -type f -iname ${shq("*" + (pattern || "") + "*")} 2>/dev/null | head -200`); },
    async search(query, glob) { const inc = glob ? `--include=${shq("*" + glob)}` : ""; return exec(`grep -rn ${inc} ${shq(query || "")} . 2>/dev/null | head -100`); },
    close() { try { conn.end(); } catch {} },
  };
}

// Quick reachability/auth check for the UI "Test connection" button.
async function testSsh(host) {
  let b;
  try {
    b = await sshBackend(host);
    const who = (await b.bash("whoami")).trim();
    const pwd = (await b.bash("pwd")).trim();
    return { ok: true, info: `${who}@${host.host}:${pwd}` };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    if (b) b.close();
  }
}

module.exports = { sshBackend, testSsh };
