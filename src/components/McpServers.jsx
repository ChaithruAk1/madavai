import { useEffect, useState } from "react";
import { bridge } from "../bridge/index.js";
import { Plus, Trash2, Plug } from "lucide-react";

// Web-only panel to configure MCP connector servers (HTTPS). Tools from these are offered to the web
// chat agent (opt-in via settings.mcpServers). The server broker enforces auth + SSRF — see
// docs/PHASE3-MCP.md. Rendered from Connectors.jsx only when isWeb, so desktop Connectors is unchanged.
export default function McpServers() {
  const [servers, setServers] = useState([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    bridge.getSettings().then((s) => setServers(Array.isArray(s && s.mcpServers) ? s.mcpServers : [])).catch(() => {});
  }, []);

  // Read-modify-write so we never clobber other settings.
  const save = async (next) => {
    setServers(next);
    try { const s = await bridge.getSettings(); await bridge.saveSettings({ ...s, mcpServers: next }); } catch (e) { setMsg("Couldn't save: " + String((e && e.message) || e)); }
  };
  const add = async () => {
    const u = url.trim();
    if (!/^https:\/\//i.test(u)) { setMsg("Enter an https:// MCP server URL."); return; }
    if (servers.some((x) => x && x.url === u)) { setMsg("Already added."); return; }
    await save([...servers, { url: u }]);
    setUrl(""); setMsg("Added. It's now available to Madav chat.");
  };
  const remove = async (u) => { await save(servers.filter((x) => x && x.url !== u)); };
  const test = async (u) => {
    setBusy(true); setMsg("Testing " + u + " …");
    try {
      const r = bridge.mcpTestServer ? await bridge.mcpTestServer(u) : { ok: false, error: "not supported in this build" };
      setMsg(r.ok
        ? "OK — " + r.count + " tool" + (r.count === 1 ? "" : "s") + (r.count ? ": " + (r.tools || []).slice(0, 8).join(", ") : "")
        : "Failed: " + (r.error || "unknown") + (r.detail ? " — " + r.detail : ""));
    } catch (e) { setMsg("Failed: " + String((e && e.message) || e)); }
    finally { setBusy(false); }
  };

  const box = { border: "1px solid var(--border, #2a2a2a)", borderRadius: 10, padding: 14, margin: "10px 0 18px" };
  const inp = { flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #2a2a2a)", background: "transparent", color: "inherit" };
  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
        <Plug size={15} /> MCP servers
        <span style={{ color: "var(--text-2)", fontWeight: 400, fontSize: 12 }}>
          &mdash; connect an HTTPS MCP server; its tools become available to Madav chat on the web
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-mcp-server/mcp"
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} style={inp} />
        <button className="btn primary" onClick={add} disabled={busy}><Plus size={14} /> Add</button>
      </div>
      {servers.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {servers.map((x) => (
            <div key={x.url} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.url}</span>
              <button className="btn" onClick={() => test(x.url)} disabled={busy}>Test</button>
              <button className="btn" title="Remove" onClick={() => remove(x.url)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-2)" }}>{msg}</div>}
    </div>
  );
}
