import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Check, Search, Settings2, ChevronDown } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
import { bridge } from "../bridge/index.js";
import { iconUrlFor } from "../connectorIcons.js";

const BLANK = (id) => ({ id, name: "New connector", command: "npx", args: [], env: {}, enabled: true });

// Curated, popularity-ranked partner set — browsed + searched INSTANTLY client-side
// (no network), mirroring a polished app directory. "Add" resolves the real install
// spec from the MCP registry by `query`. Only connectors with a bundled brand icon are
// featured so the grid always shows real logos. Descriptions are Madav-native.
const FEATURED = [
  { key: "googledrive", title: "Google Drive", cat: "Productivity", rank: 1, badge: "", query: "google drive", desc: "Search, read, and upload files instantly." },
  { key: "gmail", title: "Gmail", cat: "Productivity", rank: 2, badge: "", query: "gmail", desc: "Draft replies, summarize threads, and search your inbox." },
  { key: "googlecalendar", title: "Google Calendar", cat: "Productivity", rank: 3, badge: "", query: "google calendar", desc: "Manage your schedule and coordinate meetings." },
  { key: "notion", title: "Notion", cat: "Productivity", rank: 4, badge: "", query: "notion", desc: "Search, update, and power workflows across your workspace." },
  { key: "slack", title: "Slack", cat: "Communication", rank: 5, badge: "", query: "slack", desc: "Send messages, create canvases, and fetch Slack data." },
  { key: "figma", title: "Figma", cat: "Design", rank: 6, badge: "trending", query: "figma", desc: "Generate diagrams and better code from Figma context." },
  { key: "github", title: "GitHub", cat: "Developer", rank: 7, badge: "", query: "github", desc: "Browse repos, open pull requests, and manage issues." },
  { key: "linear", title: "Linear", cat: "Developer", rank: 8, badge: "trending", query: "linear", desc: "Track issues, cycles, and projects." },
  { key: "jira", title: "Jira", cat: "Developer", rank: 9, badge: "", query: "jira", desc: "Access and update Jira issues and boards." },
  { key: "confluence", title: "Confluence", cat: "Productivity", rank: 10, badge: "", query: "confluence", desc: "Search and edit Confluence pages and spaces." },
  { key: "asana", title: "Asana", cat: "Productivity", rank: 11, badge: "", query: "asana", desc: "Manage tasks, projects, and timelines." },
  { key: "stripe", title: "Stripe", cat: "Data", rank: 12, badge: "new", query: "stripe", desc: "Query payments, customers, and invoices." },
  { key: "airtable", title: "Airtable", cat: "Data", rank: 13, badge: "", query: "airtable", desc: "Read and update bases, tables, and records." },
  { key: "dropbox", title: "Dropbox", cat: "Productivity", rank: 14, badge: "", query: "dropbox", desc: "Search, read, and share your files." },
  { key: "trello", title: "Trello", cat: "Productivity", rank: 15, badge: "", query: "trello", desc: "Manage boards, lists, and cards." },
  { key: "zapier", title: "Zapier", cat: "Developer", rank: 16, badge: "new", query: "zapier", desc: "Connect thousands of apps and automate workflows." },
];
const CATEGORIES = ["All", "Productivity", "Developer", "Design", "Communication", "Data"];

// Remove competitor branding that leaks in from registry descriptions.
const scrub = (t) => String(t || "")
  .replace(/\bclaude\b/gi, "Madav")
  .replace(/\banthropic\s*&\s*partners\b/gi, "Madav & Partners")
  .replace(/\banthropic\b/gi, "Madav");

export default function Connectors() {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [status, setStatus] = useState("");
  const [tools, setTools] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sortBy, setSortBy] = useState("popular");
  const [reg, setReg] = useState([]);          // registry fallback results
  const [regMsg, setRegMsg] = useState("");
  const [adding, setAdding] = useState("");     // featured key being added
  const [auth, setAuth] = useState({ connected: false });   // OAuth status for the selected remote connector
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    bridge.getSettings().then((cfg) => setS({ ...cfg, connectors: cfg.connectors || [] }));
  }, []);

  // Registry fallback — only when the user is searching for something the curated set
  // doesn't cover. Debounced so it never gets in the way of the instant local filter.
  useEffect(() => {
    const term = q.trim();
    if (!term || !bridge.listConnectorDirectory) { setReg([]); setRegMsg(""); return; }
    setRegMsg("Searching the registry…");
    const t = setTimeout(() => {
      bridge.listConnectorDirectory({ search: term }).then((r) => {
        setReg(r.items || []);
        setRegMsg("");
      }).catch(() => setRegMsg("Couldn't reach the registry."));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // Instant client-side filter over the curated set. (Declared before any early return
  // so the hook order is stable across renders.)
  const featured = useMemo(() => {
    const term = q.trim().toLowerCase();
    let arr = FEATURED.filter((f) => cat === "All" || f.cat === cat);
    if (term) arr = arr.filter((f) => (f.title + " " + f.desc + " " + f.cat).toLowerCase().includes(term));
    arr = [...arr];
    if (sortBy === "name") arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "new") arr.sort((a, b) => (b.badge === "new") - (a.badge === "new") || a.rank - b.rank);
    else arr.sort((a, b) => a.rank - b.rank);
    return arr;
  }, [q, cat, sortBy]);

  // OAuth status for the selected remote connector (hook stays above the early return).
  useEffect(() => {
    const cur = (s && s.connectors || []).find((c) => c.id === selId);
    if (cur && cur.url && bridge.connectorAuthStatus) bridge.connectorAuthStatus(cur.id).then(setAuth).catch(() => setAuth({ connected: false }));
    else setAuth({ connected: false });
  }, [selId, s]);

  if (!s) return <div className="empty"><div>Loading…</div></div>;
  const list = s.connectors;
  const sel = list.find((c) => c.id === selId) || null;

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); };
  const setConnectors = (cs) => persist({ ...s, connectors: cs });
  const patch = (field, val) => setConnectors(list.map((c) => (c.id === selId ? { ...c, [field]: val } : c)));
  const patchMany = (obj) => setConnectors(list.map((c) => (c.id === selId ? { ...c, ...obj } : c)));
  const setType = (remote) => remote
    ? patchMany({ url: sel.url || "", transport: sel.transport || "http", command: undefined, args: undefined })
    : patchMany({ command: sel.command || "npx", args: sel.args || [], url: undefined, transport: undefined });

  const rankLabel = (r) => (r === 1 ? "Most popular" : `#${r} popular`);
  const has = (name) => list.some((c) => c.name && name && c.name.toLowerCase() === name.toLowerCase());

  // Registry items that AREN'T already in the curated set (avoid duplicates).
  const featuredNames = new Set(FEATURED.map((f) => f.query));
  const regShown = (q.trim() ? reg : [])
    .filter((it) => !featuredNames.has((it.title || "").toLowerCase()))
    .slice(0, 40);

  const addFeatured = async (f) => {
    if (has(f.title)) { const e = list.find((c) => c.name.toLowerCase() === f.title.toLowerCase()); setSelId(e.id); return; }
    setAdding(f.key); setStatus("");
    try {
      const r = bridge.listConnectorDirectory ? await bridge.listConnectorDirectory({ search: f.query }) : { items: [] };
      const hit = (r.items || []).find((it) => it.connector) || null;
      if (hit && hit.connector) {
        const id = "c_" + Math.random().toString(36).slice(2, 7);
        setConnectors([...list, { id, ...hit.connector, name: f.title }]); setSelId(id); setTools(null);
        if (hit.connector.url) setStatus(`${f.title} is a hosted (remote) connector — confirm its Server URL below and sign in / add a token, then Test. Many cloud apps require the provider's own MCP endpoint + OAuth.`);
      } else {
        // No registry match — open a pre-named custom setup so the user can finish it.
        const id = "c_" + Math.random().toString(36).slice(2, 7);
        setConnectors([...list, { ...BLANK(id), name: f.title }]); setSelId(id); setTools(null);
        setStatus(`${f.title} needs manual setup — add its command/URL below.`);
      }
    } finally { setAdding(""); }
  };
  const addFromRegistry = (item) => {
    if (!item.connector) { setStatus(`${scrub(item.title)} isn't one-click installable (package type: ${item.kind}).`); return; }
    if (has(item.connector.name)) { const e = list.find((c) => c.name.toLowerCase() === item.connector.name.toLowerCase()); setSelId(e.id); return; }
    const id = "c_" + Math.random().toString(36).slice(2, 7);
    setConnectors([...list, { id, ...item.connector }]); setSelId(id); setTools(null); setStatus("");
  };
  const addCustom = () => { const id = "c_" + Math.random().toString(36).slice(2, 7); setConnectors([...list, BLANK(id)]); setSelId(id); setTools(null); setStatus(""); };
  const remove = () => { setConnectors(list.filter((c) => c.id !== selId)); setSelId(null); };

  const doSignIn = async () => {
    if (!sel || !bridge.connectorSignIn) return;
    setSigningIn(true); setStatus("Opening your browser to sign in…"); setTools(null);
    try {
      const r = await bridge.connectorSignIn(sel);
      if (r && r.ok) { setAuth({ connected: true }); setTools(r.tools || null); setStatus(`Signed in — ${(r.tools || []).length} tools available.`); }
      else setStatus("Sign-in failed: " + ((r && r.error) || "unknown error"));
    } finally { setSigningIn(false); }
  };
  const doSignOut = async () => {
    if (!sel || !bridge.connectorSignOut) return;
    await bridge.connectorSignOut(sel.id); setAuth({ connected: false }); setTools(null); setStatus("Signed out.");
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
        Browse popular connectors below, or search for any of thousands more. Cloud apps need a quick sign-in or token.
        Connected apps are available to the agent in Chat, Cowork, Code, and Projects.
      </p>

      {!sel && <>
      <div className="cdir-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search connectors…" /></div>

      <div className="cdir-bar">
        <span className="cdir-pill">Madav &amp; Partners</span>
        <span style={{ flex: 1 }} />
        <label className="cdir-selwrap">
          <select className="cdir-select" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c === "All" ? "Filter by" : c}</option>)}
          </select>
        </label>
        <label className="cdir-selwrap">
          <select className="cdir-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="popular">Sort by: Popular</option>
            <option value="name">Sort by: Name</option>
            <option value="new">Sort by: Newest</option>
          </select>
        </label>
      </div>

      <div className="cdir-grid">
        {featured.map((f) => {
          const added = has(f.title);
          const busy = adding === f.key;
          return (
            <div key={f.key} className="cdir-card">
              <div className="cdir-cardhead">
                <ConnectorIcon item={{ title: f.title, name: f.key }} />
                <div className="cdir-titles">
                  <div className="cdir-name">
                    {f.title}
                    {f.badge === "new" && <span className="cdir-tag new">New</span>}
                    {f.badge === "trending" && <span className="cdir-tag trending">↗ Trending</span>}
                  </div>
                  <div className="cdir-rank">{rankLabel(f.rank)}</div>
                </div>
                <button className={`cdir-add ${added ? "on" : ""}`} title={added ? "Configure" : "Add connector"}
                  disabled={busy} onClick={() => addFeatured(f)}>
                  {busy ? <RefreshCw size={15} className="spin" /> : added ? <Settings2 size={15} /> : <Plus size={16} />}
                </button>
              </div>
              <div className="cdir-desc">{f.desc}</div>
            </div>
          );
        })}
      </div>

      {q.trim() && (
        <>
          <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18 }}>More from the registry</div>
          {regMsg && <div className="cdir-msg">{regMsg}</div>}
          {!regMsg && regShown.length === 0 && <div className="cdir-msg">No other connectors match “{q.trim()}”.</div>}
          <div className="cdir-grid">
            {regShown.map((item) => {
              const cname = item.connector && item.connector.name;
              const added = cname && has(cname);
              return (
                <div key={item.name} className="cdir-card">
                  <div className="cdir-cardhead">
                    <ConnectorIcon item={item} />
                    <div className="cdir-titles">
                      <div className="cdir-name">{scrub(item.title)}
                        <span className="cdir-tag kind">{item.kind === "remote" ? "Remote" : "Local"}</span>
                      </div>
                      <div className="cdir-id">{item.name}</div>
                    </div>
                    <button className={`cdir-add ${added ? "on" : ""}`} title={added ? "Added" : "Add connector"} onClick={() => addFromRegistry(item)}>
                      {added ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  </div>
                  {item.description && <div className="cdir-desc">{scrub(item.description)}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}
      </>}

      <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18 }}>Your connectors<HelpDot mode="connectors" section="usage" /></div>
      {!sel && (
        <div className="mc-pgrid">
          {list.length === 0 && <div style={{ color: "var(--text-2)", fontSize: 13, padding: "6px 2px" }}>None yet — add one above.</div>}
          {list.map((c) => (
            <button key={c.id} className="mc-pcard" onClick={() => { setSelId(c.id); setTools(null); setStatus(""); }}>
              <ConnectorIcon item={{ title: c.name, name: c.name }} />
              <span className="mc-pmain">
                <b>{c.name}</b>
                <small>{[c.command, ...(c.args || [])].join(" ").slice(0, 46) || "not configured"}</small>
              </span>
              <span className={`mc-pact ${c.enabled ? "ok" : ""}`}>{c.enabled ? "Enabled" : "Off"}</span>
            </button>
          ))}
          <button className="mc-pcard" onClick={addCustom}>
            <span className="mc-pchip"><Plus size={18} /></span>
            <span className="mc-pmain">
              <b>Custom MCP server</b>
              <small>any stdio MCP command</small>
            </span>
            <span className="mc-pact">Set up</span>
          </button>
        </div>
      )}

      {sel && (() => {
        const isRemote = !!(sel.url != null || sel.transport != null);
        return (
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
            <Field label="Connection type">
              <select className="model-search" value={isRemote ? "remote" : "local"} onChange={(e) => setType(e.target.value === "remote")}>
                <option value="local">Local — runs an MCP command on this computer</option>
                <option value="remote">Remote — connects to a hosted MCP server URL</option>
              </select>
            </Field>
            {isRemote ? (
              <>
                <Field label="Server URL"><input className="model-search" value={sel.url || ""} onChange={(e) => patch("url", e.target.value.trim())} placeholder="https://mcp.example.com/  (from the provider; often needs sign-in)" /></Field>
                <Field label="Transport">
                  <select className="model-search" value={sel.transport || "http"} onChange={(e) => patch("transport", e.target.value)}>
                    <option value="http">Streamable HTTP</option>
                    <option value="sse">SSE</option>
                  </select>
                </Field>
                <div className="cdir-auth">
                  <div className="cdir-auth-state">
                    <span className={`cdir-auth-dot ${auth.connected ? "on" : ""}`} />
                    {auth.connected ? "Signed in" : "Not signed in"}
                  </div>
                  {auth.connected
                    ? <button className="btn ghost" onClick={doSignOut}>Sign out</button>
                    : <button className="btn" disabled={signingIn} onClick={doSignIn}>{signingIn ? <RefreshCw size={14} className="spin" /> : null} Sign in with your browser</button>}
                </div>
                <div className="cdir-msg" style={{ marginTop: 2 }}>Cloud connectors open a normal browser sign-in (OAuth). Your password and tokens stay between you and the provider — Madav only keeps an access token, encrypted on this device.</div>
              </>
            ) : (
              <>
                <Field label="Command"><input className="model-search" value={sel.command || ""} onChange={(e) => patch("command", e.target.value)} placeholder="npx" /></Field>
                <Field label="Arguments (space-separated)">
                  <input className="model-search" value={(sel.args || []).join(" ")} onChange={(e) => patch("args", e.target.value.split(/\s+/).filter(Boolean))} placeholder="-y @modelcontextprotocol/server-filesystem C:\\path" />
                </Field>
              </>
            )}
            <Field label={isRemote ? "Headers / tokens (KEY=VALUE per line)" : "Environment / tokens (KEY=VALUE per line)"}>
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
        );
      })()}
      {!sel && status && <div className="cdir-msg" style={{ marginTop: 10 }}>{status}</div>}
    </div>
  );
}

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

const MONO = ["#6e7bff", "#38b2ac", "#e8893a", "#d6597b", "#7a5cf0", "#46a35a", "#c98a12", "#3a8fd6"];
const monoColor = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return MONO[h % MONO.length]; };

function ConnectorIcon({ item }) {
  const url = iconUrlFor(`${item.title || ""} ${item.name || ""} ${iconDomain(item) || ""}`);
  if (url) {
    return (
      <span className="cdir-ico cdir-ico-img" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
        <img src={url} alt="" />
      </span>
    );
  }
  return <span className="cdir-ico" style={{ background: monoColor(item.title) }}>{(item.title || "?").slice(0, 1).toUpperCase()}</span>;
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}
