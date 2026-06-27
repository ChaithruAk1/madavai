// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// Let's Build environment picker. Pick a Local folder, or pull any repo from your
// connected GitHub account(s) via a clean searchable list. Connect a whole account, or one repo by URL.
// No cloud sandbox (Madav runs locally), no Remote Control.
import { useEffect, useState } from "react";
import { FolderOpen, Github, Plus, ChevronDown, Check, X, Trash2, Loader, Search, FolderGit2, Link2 } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
import { bridge, isWeb } from "../bridge/index.js";

// `github` (default true): Build shows the full GitHub integration; Collaborate passes
// false and gets a pure folder picker (user decision 2026-06-12 — repos are a coding thing).
export default function EnvPicker({ cwd, onPickFolder, onUseFolder, onAddRepoUrl, github = true }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);   // [{ login, token }]
  const [recent, setRecent] = useState([]);        // [{ full, url, folder }]
  const [acctRepos, setAcctRepos] = useState({});  // login -> [{ full_name, clone_url, private }]
  const [q, setQ] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { bridge.getSettings?.().then((s) => { setAccounts(s.githubAccounts || []); setRecent(s.buildRepos || []); }).catch(() => {}); }, []);
  useEffect(() => {
    const close = (e) => { if (!e.target.closest?.(".env-picker")) { setOpen(false); setConnecting(false); } };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, []);
  // When opened, pull repos for any account we haven't loaded yet.
  useEffect(() => { if (open) accounts.forEach((a) => { if (!acctRepos[a.login]) loadRepos(a); }); }, [open, accounts]); // eslint-disable-line

  const persist = async (patch) => { try { const s = await bridge.getSettings(); await bridge.saveSettings({ ...s, ...patch }); } catch {} };
  const saveAccounts = (next) => { setAccounts(next); persist({ githubAccounts: next }); };
  const saveRecent = (next) => { setRecent(next); persist({ buildRepos: next }); };

  const connect = async () => {
    const t = token.trim(); if (!t) return;
    setLoading(true); setErr("");
    try {
      const r = await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + t, Accept: "application/vnd.github+json" } });
      if (!r.ok) { setErr(r.status === 401 ? "That token didn't work — check it has the “repo” scope." : "GitHub error " + r.status); setLoading(false); return; }
      const u = await r.json();
      if (accounts.find((a) => a.login === u.login)) { setErr(u.login + " is already connected."); setLoading(false); setConnecting(false); return; }
      const acct = { login: u.login, token: t };
      saveAccounts([...accounts, acct]); setToken(""); setConnecting(false); loadRepos(acct);
    } catch { setErr("Couldn't reach GitHub."); }
    setLoading(false);
  };
  const loadRepos = async (acct) => {
    setLoading(true); setErr("");
    try {
      const r = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
        { headers: { Authorization: "Bearer " + acct.token, Accept: "application/vnd.github+json" } });
      const j = await r.json();
      setAcctRepos((m) => ({ ...m, [acct.login]: Array.isArray(j) ? j.map((x) => ({ full_name: x.full_name, clone_url: x.clone_url, private: x.private })) : [] }));
    } catch { setErr("Couldn't load repositories."); }
    setLoading(false);
  };
  const disconnect = (login) => { saveAccounts(accounts.filter((a) => a.login !== login)); setAcctRepos((m) => { const n = { ...m }; delete n[login]; return n; }); };

  const openRepo = async (repo) => {
    const acct = accounts.find((a) => a.login === repo.full_name.split("/")[0]) || accounts.find((a) => (acctRepos[a.login] || []).some((r) => r.full_name === repo.full_name));
    setCloning(repo.full_name); setErr("");
    const url = acct ? repo.clone_url.replace("https://", `https://${acct.login}:${acct.token}@`) : repo.clone_url;
    const res = await (bridge.cloneRepo ? bridge.cloneRepo(url) : Promise.resolve({ error: "Cloning needs the desktop app." })).catch((e) => ({ error: String((e && e.message) || e) }));
    if (res && res.folder) {
      saveRecent([{ full: repo.full_name, url: repo.clone_url, folder: res.folder }, ...recent.filter((x) => x.full !== repo.full_name)].slice(0, 12));
      onUseFolder(res.folder); setOpen(false);
    } else setErr((res && res.error) || "Couldn't clone the repo.");
    setCloning("");
  };

  // All repos across every connected account, flattened + filtered.
  const allRepos = accounts.flatMap((a) => acctRepos[a.login] || []);
  const seen = new Set();
  const repos = allRepos.filter((r) => { if (seen.has(r.full_name)) return false; seen.add(r.full_name); return r.full_name.toLowerCase().includes(q.toLowerCase()); });

  return (
    <div className="env-picker">
      <button className="chip tipbtn" onClick={() => (github ? setOpen((o) => !o) : onPickFolder())} data-tip={cwd ? "Folder: " + cwd.split(/[\\/]/).pop() : "Select Folder"} aria-label="Select folder">
        <FolderGit2 size={14} />{github ? <ChevronDown size={12} /> : null}
      </button>
      <HelpDot mode="cowork" section="folder" />
      {open && (
        <div className="env-menu">
          <div className="env-sec">Local</div>
          <button className="env-row" onClick={() => { setOpen(false); onPickFolder(); }}>
            <FolderOpen size={15} /> <span className="env-grow">Choose a folder…</span>{cwd && <Check size={15} className="env-ok" />}
          </button>

          {recent.length > 0 && <>
            <div className="env-sec">Recent</div>
            {recent.slice(0, 4).map((r) => (
              <button key={r.full} className="env-row" onClick={() => { onUseFolder(r.folder); setOpen(false); }}>
                <FolderGit2 size={15} /> <span className="env-grow env-mono">{r.full}</span>
                <Trash2 size={13} className="env-x" onClick={(e) => { e.stopPropagation(); saveRecent(recent.filter((x) => x.full !== r.full)); }} />
              </button>
            ))}
          </>}

          {github && <>
          <div className="env-sec env-secrow">
            <span>GitHub{accounts.length ? "" : " — not connected"}</span>
            {accounts.length > 0 && <button className="env-add" onClick={() => { setConnecting(true); setErr(""); }} title="Connect another account"><Plus size={13} /></button>}
          </div>

          {accounts.length > 0 && (
            <div className="env-accts">
              {accounts.map((a) => (
                <span key={a.login} className="env-acct"><Github size={11} /> {a.login}<X size={11} className="env-x" onClick={() => disconnect(a.login)} /></span>
              ))}
            </div>
          )}

          {accounts.length > 0 && (
            <>
              <div className="env-search"><Search size={13} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${repos.length} repositories…`} /></div>
              <div className="env-repolist">
                {loading && repos.length === 0 && <div className="env-muted"><Loader size={13} className="spin" /> Loading repositories…</div>}
                {!loading && repos.length === 0 && <div className="env-muted">No repositories match.</div>}
                {repos.map((r) => (
                  <button key={r.full_name} className="env-repo" onClick={() => openRepo(r)} disabled={!!cloning}>
                    <Github size={13} className="env-dim" />
                    <span className="env-grow env-mono">{r.full_name}</span>
                    {r.private && <span className="env-tag">private</span>}
                    {cloning === r.full_name ? <Loader size={13} className="spin" /> : <Plus size={13} className="env-dim" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {(connecting || accounts.length === 0) && (
            <div className="env-connect">
              <div className="env-search"><Github size={13} /><input type="password" value={token} autoFocus={connecting} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") connect(); }} placeholder="Paste a GitHub token to connect" /></div>
              <div className="env-connectrow">
                <button className="btn primary" disabled={loading || !token.trim()} onClick={connect}>{loading ? "Connecting…" : "Connect account"}</button>
                {accounts.length > 0 && <button className="btn" onClick={() => { setConnecting(false); setErr(""); }}><X size={13} /></button>}
                <a href="#" className="env-link" onClick={(e) => { e.preventDefault(); bridge.openExternal?.("https://github.com/settings/tokens/new?scopes=repo&description=Madav"); }}>Create a token →</a>
              </div>
            </div>
          )}

          <div className="env-divider" />
          <button className="env-row" onClick={() => { setOpen(false); onAddRepoUrl(); }}>
            <Link2 size={15} /> <span className="env-grow">Add a single repo by URL…</span>
          </button>
          </>}

          {err && <div className="env-err">{err}</div>}
          {isWeb && <div className="env-muted">Listing works on the web; cloning a repo to work on needs the desktop app.</div>}
        </div>
      )}
    </div>
  );
}
