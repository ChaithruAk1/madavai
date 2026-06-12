import { useState } from "react";
import { Puzzle, Plug, Terminal, Upload } from "lucide-react";

// Plugins = installable bundles of Skills + Connectors (+ commands). The install
// pipeline is not built yet; this surface explains the concept and links to the
// building blocks. Wiring a .plugin (zip + manifest) installer is the next step.
export default function Plugins({ onNavigate }) {
  const [status, setStatus] = useState("");

  const parts = [
    { icon: Puzzle, name: "Skills", desc: "Task know-how (SKILL.md + scripts) the bundle registers into your skills.", go: "skills" },
    { icon: Plug, name: "Connectors", desc: "MCP server configs the bundle adds to your connectors.", go: "connectors" },
    { icon: Terminal, name: "Commands", desc: "Optional slash commands and hooks the bundle ships.", go: null },
  ];

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Plugins</h2>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 0, maxWidth: 720 }}>
        A plugin is a single installable bundle that registers multiple Skills and Connectors (and optionally commands)
        at once — the easy way to share a whole setup. Think of it as a boxed kit: the integrations, the know-how, and the
        commands, pre-assembled.
      </p>

      <div className="pjd-files-empty" style={{ marginTop: 16 }}>No plugins installed yet.</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <button className="btn primary" onClick={() => setStatus("Plugin installation isn't wired yet — for now add Skills and Connectors individually below. The .plugin (zip + manifest) installer is the next step.")}>
          <Upload size={14} /> Import plugin (.plugin / .zip)
        </button>
        {status && <span style={{ color: "var(--text-2)", fontSize: 12, maxWidth: 520 }}>{status}</span>}
      </div>

      <div className="nav-label" style={{ paddingLeft: 0, marginTop: 24 }}>What a plugin bundles</div>
      <div className="cdir-grid">
        {parts.map((p) => {
          const I = p.icon;
          return (
            <div key={p.name} className="cdir-card" style={{ cursor: p.go ? "pointer" : "default" }} onClick={() => p.go && onNavigate && onNavigate(p.go)}>
              <div className="cdir-cardhead">
                <span className="cdir-ico" style={{ color: "var(--accent)" }}><I size={18} /></span>
                <div className="cdir-titles">
                  <div className="cdir-name">{p.name}</div>
                  {p.go && <div className="cdir-id">Open {p.name} →</div>}
                </div>
              </div>
              <div className="cdir-desc">{p.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
