// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// "Add content from GitHub" — Claude-style. Link a GitHub account, pick a repository (or paste a URL),
// then select individual files to add to the chat as context. Files are returned as { name, content }
// attachments. All GitHub calls are client-side (api.github.com is CORS-friendly); private repos use
// the connected account's token.
import { useEffect, useState } from "react";
import { Github, X, Link2, Search, Loader, FileText, Check, Plus } from "lucide-react";
import { bridge } from "../bridge/index.js";

const CAP = 300000; // ~character budget for chat context
const TEXT = /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|c|h|cpp|cc|cs|php|sh|bash|css|scss|less|html|json|md|mdx|txt|yml|yaml|toml|ini|xml|sql|vue|svelte|swift|dart|lua|r|jl|gradle|dockerfile|env|gitignore)$/i;

export default function GithubContent({ onClose, onAttach }) {
  const [accounts, setAccounts] = useState([]);
  const [token, setToken] = useState(""); const [connecting, setConnecting] = useState(false);
  const [repos, setRepos] = useState([]);     // [{ full_name, default_branch, token, login }]
  const [repo, setRepo] = useState("");        // selected full_name
  const [branch, setBranch] = useState("");
  const [tree, setTree] = useState([]);        // [{ path, size }]
  const [sel, setSel] = useState(new Set());
  const [q, setQ] = useState(""); const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");

  useEffect(() => { bridge.getSettings?.().then((s) => setAccounts(s.githubAccounts || [])).catch(() => {}); }, []);
  useEffect(() => { accounts.forEach(loadRepos); }, [accounts]); // eslint-disable-line

  async function loadRepos(acct) {
    try {
      const r = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", { headers: { Authorization: "Bearer " + acct.token, Accept: "application/vnd.github+json" } });
      const j = await r.json(); if (!Array.isArray(j)) return;
      setRepos((prev) => { const m = new Map(prev.map((x) => [x.full_name, x])); for (const x of j) m.set(x.full_name, { full_name: x.full_name, default_branch: x.default_branch, token: acct.token, login: acct.login }); return [...m.values()]; });
    } catch {}
  }
  async function connect() {
    const t = token.trim(); if (!t) return; setBusy("connect"); setErr("");
    try {
      const r = await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + t, Accept: "application/vnd.github+json" } });
      if (!r.ok) { setErr(r.status === 401 ? "That token didn't work — needs the “repo” scope." : "GitHub error " + r.status); setBusy(""); return; }
      const u = await r.json(); const acct = { login: u.login, token: t };
      const next = [...accounts.filter((a) => a.login !== u.login), acct];
      setAccounts(next); setToken(""); setConnecting(false);
      try { const s = await bridge.getSettings(); await bridge.saveSettings({ ...s, githubAccounts: next }); } catch {}
      loadRepos(acct);
    } catch { setErr("Couldn't reach GitHub."); }
    setBusy("");
  }
  async function openRepo(full) {
    const r = repos.find((x) => x.full_name === full); if (!full) { setRepo(""); setTree([]); return; }
    setRepo(full); setSel(new Set()); setTree([]); setErr(""); setBusy("tree");
    try {
      const br = (r && r.default_branch) || "main";
      const t = await fetch(`https://api.github.com/repos/${full}/git/trees/${br}?recursive=1`, { headers: r && r.token ? { Authorization: "Bearer " + r.token } : {} });
      const j = await t.json();
      if (!j.tree) { setErr(j.message || "Couldn't read this repository."); setBusy(""); return; }
      setBranch(br); setTree(j.tree.filter((x) => x.type === "blob" && TEXT.test(x.path)).map((x) => ({ path: x.path, size: x.size || 0 })));
    } catch { setErr("Couldn't load files."); }
    setBusy("");
  }
  function fromUrl() {
    const m = url.trim().match(/github\.com\/([^/\s]+\/[^/\s]+)/i); if (!m) { setErr("Paste a github.com repository or file URL."); return; }
    const full = m[1].replace(/\.git$/, "");
    if (!repos.find((x) => x.full_name === full)) setRepos((p) => [{ full_name: full, default_branch: "main", token: null, login: "" }, ...p]);
    openRepo(full);
  }
  const toggle = (p) => setSel((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const visible = tree.filter((f) => f.path.toLowerCase().includes(q.toLowerCase()));
  const totalSize = [...sel].reduce((n, p) => n + (tree.find((f) => f.path === p)?.size || 0), 0);
  const pct = Math.min(100, Math.round((totalSize / CAP) * 100));

  async function add() {
    if (!sel.size) return; const r = repos.find((x) => x.full_name === repo);
    setBusy("fetch"); const items = [];
    for (const p of sel) {
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/${p.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`, { headers: { Accept: "application/vnd.github.raw", ...(r && r.token ? { Authorization: "Bearer " + r.token } : {}) } });
        items.push({ name: `${repo}/${p}`, content: (await res.text()).slice(0, 120000) });
      } catch {}
    }
    setBusy(""); onAttach(items); onClose();
  }

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gh-modal">
        <div className="gh-head">
          <div><div className="gh-title">Add content from GitHub</div><div className="gh-sub">Select the files you'd like to add to this chat</div></div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="gh-bar">
          <Github size={15} className="env-dim" />
          {accounts.length ? (
            <select className="model-search gh-select" value={repo} onChange={(e) => openRepo(e.target.value)}>
              <option value="">Select a repository…</option>
              {repos.map((r) => <option key={r.full_name} value={r.full_name}>{r.full_name}</option>)}
            </select>
          ) : <span className="env-dim" style={{ flex: 1, fontSize: 13 }}>Connect a GitHub account to list repositories</span>}
          <div className="gh-url"><Link2 size={14} className="env-dim" /><input value={url} placeholder="or paste a repo / file URL" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") fromUrl(); }} /></div>
        </div>

        <div className="gh-body">
          {accounts.length === 0 ? (
            <div className="gh-connect">
              {connecting ? (
                <>
                  <div className="env-search" style={{ maxWidth: 360, margin: "0 auto" }}><Github size={13} /><input type="password" autoFocus value={token} placeholder="Paste a GitHub token (repo scope)" onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") connect(); }} /></div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                    <button className="btn primary" disabled={busy === "connect" || !token.trim()} onClick={connect}>{busy === "connect" ? "Connecting…" : "Connect account"}</button>
                    <a href="#" className="env-link" onClick={(e) => { e.preventDefault(); bridge.openExternal?.("https://github.com/settings/tokens/new?scopes=repo&description=BrainEdge"); }}>Create a token →</a>
                  </div>
                </>
              ) : (
                <button className="btn primary" onClick={() => { setConnecting(true); setErr(""); }}><Github size={14} /> Connect GitHub account</button>
              )}
            </div>
          ) : busy === "tree" ? (
            <div className="gh-empty"><Loader size={16} className="spin" /> Loading files…</div>
          ) : !repo ? (
            <div className="gh-empty">Select a repository or paste a URL above to get started</div>
          ) : (
            <>
              <div className="env-search" style={{ margin: "0 0 8px" }}><Search size={13} /><input value={q} placeholder={`Search ${tree.length} files…`} onChange={(e) => setQ(e.target.value)} /></div>
              <div className="gh-files">
                {visible.slice(0, 600).map((f) => (
                  <button key={f.path} className={`gh-file ${sel.has(f.path) ? "on" : ""}`} onClick={() => toggle(f.path)}>
                    <span className="gh-check">{sel.has(f.path) ? <Check size={12} /> : null}</span>
                    <FileText size={13} className="env-dim" />
                    <span className="gh-path">{f.path}</span>
                    <span className="env-dim" style={{ fontSize: 11 }}>{f.size > 1024 ? Math.round(f.size / 1024) + "kb" : f.size + "b"}</span>
                  </button>
                ))}
                {visible.length === 0 && <div className="gh-empty">No matching files.</div>}
              </div>
            </>
          )}
        </div>

        <div className="gh-foot">
          <span className="env-dim" style={{ fontSize: 12 }}>{sel.size ? `${sel.size} file${sel.size === 1 ? "" : "s"} selected` : "Select files to add to chat context"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="gh-cap"><span style={{ width: pct + "%" }} /></span>
            <span className="env-dim" style={{ fontSize: 11 }}>{pct}% of capacity</span>
            <button className="btn primary" disabled={!sel.size || busy === "fetch"} onClick={add}>{busy === "fetch" ? "Adding…" : `Add ${sel.size || ""}`.trim()}</button>
          </div>
        </div>
        {err && <div className="env-err" style={{ padding: "0 18px 12px" }}>{err}</div>}
      </div>
    </div>
  );
}
