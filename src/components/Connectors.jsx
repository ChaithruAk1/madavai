import { useEffect, useState } from "react";
import { Plus, Trash2, Plug, RefreshCw, Check, Mail, Cloud, HardDrive, Github, MessageSquare, FolderOpen, Globe, Search } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
import { bridge } from "../bridge/index.js";
import { iconUrlFor } from "../connectorIcons.js";

const BLANK = (id) => ({ id, name: "New connector", command: "npx", args: [], env: {}, enabled: true });

export default function Connectors() {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [status, setStatus] = useState("");
  const [tools, setTools] = useState(null);
  const [dir, setDir] = useState([]);
  const [dirQ, setDirQ] = useState("");
  const [dirMsg, setDirMsg] = useState("Loading directory…");
  const [fKind, setFKind] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  useEffect(() => {
    bridge.getSettings().then((cfg) => { const withC = { ...cfg, connectors: cfg.connectors || [] }; setS(withC); });
  }, []);

  useEffect(() => {
    if (!bridge.listConnectorDirectory) { setDirMsg("Directory available in the desktop app."); return; }
    const q = dirQ.trim();
    setDirMsg(q ? "Searching…" : "Loading directory…");
    const t = setTimeout(() => {
      bridge.listConnectorDirectory({ search: q }).then((r) => {
        setDir(r.items || []);
        setDirMsg((r.items || []).length ? (r.stale ? "Showing cached list (registry unreachable)." : "") : (q ? `No connectors match "${q}".` : "No connectors found."));
      }).catch(() => setDirMsg("Couldn't load the directory."));
    }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [dirQ]);

  if (!s) return <div className="empty"><div>Loading…</div></div>;
  const list = s.connectors;
  const sel = list.find((c) => c.id === selId) || null;

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); };
  const setConnectors = (cs) => persist({ ...s, connectors: cs });
  const patch = (field, val) => setConnectors(list.map((c) => (c.id === selId ? { ...c, [field]: val } : c)));

  const addFrom = (app) => {
    const existing = app ? list.find((c) => c.name === app.name) : null;
    if (existing) { setSelId(existing.id); setTools(null); setStatus(""); return; }
    const id = "c_" + Math.random().toString(36).slice(2, 7);
    const c = app ? { ...BLANK(id), name: app.name, command: app.command, args: app.args, env: app.env || {} } : BLANK(id);
    setConnectors([...list, c]); setSelId(id); setTools(null); setStatus("");
  };
  const remove = () => { setConnectors(list.filter((c) => c.id !== selId)); setSelId(null); };

  const isLocalKind = (k) => k === "npm" || k === "pypi" || k === "oci";
  const dirShown = dir
    .filter((it) => fKind === "all" || (fKind === "remote" ? it.kind === "remote" : isLocalKind(it.kind)))
    .sort((a, b) => sortBy === "recent"
      ? (new Date(b.updated || 0) - new Date(a.updated || 0))
      : (a.title || "").localeCompare(b.title || ""))
    .slice(0, 80);
  const isNew = (it) => it.updated && (Date.now() - new Date(it.updated).getTime()) < 30 * 86400000;
  // Deterministic tile color from the connector name.
  const TILE = ["#6e7bff", "#38b2ac", "#e8893a", "#d6597b", "#7a5cf0", "#46a35a", "#c98a12", "#3a8fd6"];
  const tileColor = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return TILE[h % TILE.length]; };
  const addFromDirectory = (item) => {
    if (!item.connector) { setStatus(`${item.title} isn't one-click installable here (package type: ${item.kind}).`); return; }
    const existing = list.find((c) => c.name === item.connector.name);
    if (existing) { setSelId(existing.id); return; }
    const id = "c_" + Math.random().toString(36).slice(2, 7);
    setConnectors([...list, { id, ...item.connector }]); setSelId(id); setTools(null); setStatus("");
  };

  const test = async () => {
    setStatus("Connecting…"); setTools(null);
    const r = await bridge.testConnector(sel);
    if (r.ok) { setTools(r.tools); setStatus(`Connected — ${r.tools.length} tools`); }
    else setStatus("Failed: " + r.error);
  };

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Connect your apps<HelpDot mode="connectors" section="what" /></h2>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 0 }}>
        Add an integration from the Model Context Protocol registry — popular apps are shown below; search for anything else.
        Cloud apps then need a quick sign-in or token. Connected apps are available to the agent in Chat, Cowork, Code, and Projects.
      </p>

      {!sel && <>
      {/* Featured one-click connectors */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 12px" }}>
        <button className="btn" title="Microsoft's official Playwright MCP — agents drive a real Chromium for JavaScript-heavy sites, with accessibility-snapshot reading. Needs Node; first run downloads the browser."
          onClick={() => addFrom({ name: "Playwright Browser", command: "npx", args: ["-y", "@playwright/mcp@latest"] })}>
          <Plus size={13} /> Playwright Browser — official Microsoft MCP for tough, JS-heavy sites
        </button>
      </div>

      <div className="nav-label" style={{ paddingLeft: 0, display: "flex", alignItems: "center" }}>Add a connector<HelpDot mode="connectors" section="add" /></div>
      <div className="cdir-search"><Search size={16} /><input value={dirQ} onChange={(e) => setDirQ(e.target.value)} placeholder="Search connectors…" /></div>
      <div className="cdir-bar">
        <span style={{ flex: 1 }} />
        <select className="cdir-select" value={fKind} onChange={(e) => setFKind(e.target.value)}>
          <option value="all">Filter: All</option>
          <option value="remote">Remote (URL)</option>
          <option value="local">Local (npm)</option>
        </select>
        <select className="cdir-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Sort: Name</option>
          <option value="recent">Sort: Recent</option>
        </select>
      </div>
      {dirMsg && <div className="cdir-msg">{dirMsg}</div>}
      <div className="cdir-grid">
        {dirShown.map((item) => {
          const cname = item.connector && item.connector.name;
          const added = cname && list.some((c) => c.name === cname);
          return (
            <div key={item.name} className="cdir-card">
              <div className="cdir-cardhead">
                <ConnectorIcon item={item} color={tileColor(item.title)} />
                <div className="cdir-titles">
                  <div className="cdir-name">
                    {item.title}
                    {isNew(item) && <span className="cdir-tag new">New</span>}
                    <span className="cdir-tag kind">{item.kind === "remote" ? "Remote" : "Local"}</span>
                  </div>
                  <div className="cdir-id">{item.name}</div>
                </div>
                <button className={`cdir-add ${added ? "on" : ""}`} title={added ? "Added" : "Add connector"} onClick={() => addFromDirectory(item)}>
                  {added ? <Check size={16} /> : <Plus size={16} />}
                </button>
              </div>
              {item.description && <div className="cdir-desc">{item.description}</div>}
            </div>
          );
        })}
      </div>

      </>}

      <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18 }}>Your connectors<HelpDot mode="connectors" section="usage" /></div>
      {!sel && (
        <div className="mc-pgrid">
          {list.length === 0 && <div style={{ color: "var(--text-2)", fontSize: 13, padding: "6px 2px" }}>None yet — add one above.</div>}
          {list.map((c) => (
            <button key={c.id} className="mc-pcard" onClick={() => { setSelId(c.id); setTools(null); setStatus(""); }}>
              <ConnectorIcon item={{ title: c.name, name: c.name }} color="rgba(var(--accent-rgb),0.25)" />
              <span className="mc-pmain">
                <b>{c.name}</b>
                <small>{[c.command, ...(c.args || [])].join(" ").slice(0, 46) || "not configured"}</small>
              </span>
              <span className={`mc-pact ${c.enabled ? "ok" : ""}`}>{c.enabled ? "Enabled" : "Off"}</span>
            </button>
          ))}
          <button className="mc-pcard" onClick={() => addFrom(null)}>
            <span className="mc-pchip"><Plus size={18} /></span>
            <span className="mc-pmain">
              <b>Custom MCP server</b>
              <small>any stdio MCP command</small>
            </span>
            <span className="mc-pact">Set up</span>
          </button>
        </div>
      )}

      {sel && (
        <div>
          <button className="btn ghost" style={{ marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => { setSelId(null); setTools(null); setStatus(""); }}>
            ← All connectors
          </button>
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{sel.name}</h3>
              <label className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={sel.enabled} onChange={(e) => patch("enabled", e.target.checked)} style={{ marginRight: 6 }} /> enabled
              </label>
              <span style={{ flex: 1 }} />
              <button className="btn ghost danger" onClick={remove}><Trash2 size={14} /></button>
            </div>
            <Field label="Display name"><input className="model-search" value={sel.name} onChange={(e) => patch("name", e.target.value)} /></Field>
            <Field label="Command"><input className="model-search" value={sel.command} onChange={(e) => patch("command", e.target.value)} placeholder="npx" /></Field>
            <Field label="Arguments (space-separated)">
              <input className="model-search" value={(sel.args || []).join(" ")} onChange={(e) => patch("args", e.target.value.split(/\s+/).filter(Boolean))} placeholder="-y @modelcontextprotocol/server-filesystem C:\\path" />
            </Field>
            <Field label="Environment / tokens (KEY=VALUE per line)">
              <textarea className="model-search" rows={3} style={{ fontFamily: "var(--mono)", resize: "vertical" }}
                value={Object.entries(sel.env || {}).map(([k, v]) => `${k}=${v}`).join("\n")}
                onChange={(e) => { const env = {}; e.target.value.split("\n").forEach((l) => { const i = l.indexOf("="); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); patch("env", env); }}
                placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=ghp_..." />
            </Field>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <button className="btn" onClick={test}><RefreshCw size={14} /> Test connection</button>
              <span style={{ color: status.startsWith("Failed") ? "var(--danger)" : "var(--text-2)", fontSize: 12 }}>{status}</span>
            </div>
            {tools && (
              <div style={{ marginTop: 12 }}>
                <div style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 6 }}>Available tools<HelpDot mode="connectors" section="tools" /></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{tools.map((t) => <span key={t} className="badge" style={{ fontFamily: "var(--mono)" }}>{t}</span>)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Best-guess brand domain for a connector: prefer the remote URL host, else the
// reverse-DNS registry id (com.notion/mcp → notion.com).
function iconDomain(item) {
  try {
    if (item.connector && item.connector.url) {
      const parts = new URL(item.connector.url).hostname.split(".");
      return parts.slice(-2).join(".");
    }
  } catch {}
  const ns = (item.name || "").split("/")[0];
  const segs = ns.split(".").filter(Boolean);
  if (segs.length >= 2) return [segs[1], segs[0]].join(".");
  return null;
}

function ConnectorIcon({ item, color }) {
  // Anthropic-connectors approach: brand icons are BUNDLED with the app and sit on a
  // light tile — zero network, so they can never flicker or disappear. Services without
  // a bundled icon get a deliberate colored monogram tile (not a flaky fetch).
  const url = iconUrlFor(`${item.title || ""} ${item.name || ""} ${iconDomain(item) || ""}`);
  if (url) {
    return (
      <span className="cdir-ico" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
        <img src={url} alt="" style={{ width: 18, height: 18 }} />
      </span>
    );
  }
  return <span className="cdir-ico" style={{ background: color }}>{(item.title || "?").slice(0, 1).toUpperCase()}</span>;
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}
