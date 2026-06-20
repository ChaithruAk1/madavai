// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// Models → Model Routing. Build a per-category FALLBACK CHAIN. The model picked in the top bar is always
// tried first (slot 0); if it fails RETRYABLY, the shared router (core/model-router.js) walks down the
// chain for this turn's category until one answers. This page only EDITS settings.modelRouting; the loop
// that consumes it is single-source in core and identical on desktop + web. Persisted via bridge.saveSettings.
import { useEffect, useMemo, useState } from "react";
import { bridge } from "../bridge/index.js";
import ModelPicker from "./ModelPicker.jsx";
import { ArrowUp, ArrowDown, X, AlertTriangle } from "lucide-react";

// Categories are derived from the SURFACE + an attached image (deterministic), never from guessing the
// message topic — so what you set here maps 1:1 to what actually runs. Must match core/model-router.js.
const CATS = [
  { id: "general", label: "General", desc: "Plain Let's Chat — everyday questions and writing." },
  { id: "agentic", label: "Agentic", desc: "Agents, Teams, Projects, and spreadsheet/data turns (need tool-calling)." },
  { id: "coding", label: "Coding", desc: "Let's Build and code generation." },
  { id: "vision", label: "Vision", desc: "Any turn with an image attached — a non-vision model literally can't see it." },
];
const EMPTY = { general: [], agentic: [], coding: [], vision: [] };
const iconBtn = (disabled) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: disabled ? "var(--text-3)" : "var(--text-1, var(--text-0))", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 });

export default function ModelRouting({ onChanged }) {
  const [s, setS] = useState(null);
  useEffect(() => { bridge.getSettings().then((cfg) => setS(cfg || {})).catch(() => setS({})); }, []);

  const profiles = useMemo(() => Object.values((s && s.profiles) || {}), [s]);
  const routing = (s && s.modelRouting) || EMPTY;

  // All configured provider models, for the "add a model" picker — same shape Model configuration builds.
  const modelGroups = useMemo(() => profiles.map((p) => {
    const ids = (p.cachedModels && p.cachedModels.length) ? p.cachedModels : (p.model ? [p.model] : []);
    return { group: p.name, items: ids.map((mid) => ({ id: `${p.id}::${mid}`, name: mid, prov: p.name, badge: p.kind })) };
  }).filter((g) => g.items.length), [profiles]);

  // Resolve a "pid::model" ref to a display row (model, provider, whether that provider has a key set).
  const resolve = (ref) => {
    const i = String(ref).indexOf("::");
    const pid = i >= 0 ? String(ref).slice(0, i) : "";
    const model = i >= 0 ? String(ref).slice(i + 2) : String(ref);
    const p = (s && s.profiles && s.profiles[pid]) || null;
    return { model, prov: (p && p.name) || pid || "?", hasKey: !!(p && String(p.apiKey || "").trim()) };
  };

  const persist = async (nextRouting) => {
    const next = { ...s, modelRouting: nextRouting };
    setS(next);
    try { await bridge.saveSettings(next); onChanged && onChanged(next); } catch {}
  };
  const chainOf = (cat) => (Array.isArray(routing[cat]) ? routing[cat] : []);
  const setChain = (cat, list) => persist({ ...EMPTY, ...routing, [cat]: list });
  const add = (cat, ref) => { if (!ref || ref === "auto" || !String(ref).includes("::")) return; const cur = chainOf(cat); if (cur.includes(ref)) return; setChain(cat, [...cur, ref]); };
  const remove = (cat, idx) => { const cur = chainOf(cat).slice(); cur.splice(idx, 1); setChain(cat, cur); };
  const move = (cat, idx, dir) => { const cur = chainOf(cat).slice(); const j = idx + dir; if (j < 0 || j >= cur.length) return; const t = cur[idx]; cur[idx] = cur[j]; cur[j] = t; setChain(cat, cur); };

  if (!s) return <div style={{ padding: 24, color: "var(--text-2)" }}>Loading…</div>;

  return (
    <div className="mr-wrap" style={{ padding: "10px 20px 48px", maxWidth: 880, margin: "0 auto", overflowY: "auto" }}>
      <h2 style={{ margin: "4px 0 6px", fontSize: 20 }}>Model Routing</h2>
      <p style={{ color: "var(--text-2)", marginTop: 0, fontSize: 13.5, lineHeight: 1.6, maxWidth: 720 }}>
        Build a fallback chain for each kind of work. The model you choose in the top bar is always tried
        first; if it's busy or errors, Madav moves down that category's chain — in order — until one answers.
        An empty chain means no fallback: just your selected model. This applies everywhere, on desktop and web.
      </p>
      {modelGroups.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-2)", color: "var(--text-2)", fontSize: 13, marginTop: 8 }}>
          <AlertTriangle size={15} /> No provider models yet. Add a provider and its API key in <b style={{ margin: "0 3px" }}>Model configuration</b> first, then come back to build chains.
        </div>
      )}
      {CATS.map((c) => {
        const chain = chainOf(c.id);
        return (
          <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginTop: 14, background: "var(--bg-1)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>{c.label}</strong>
              <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>{c.desc}</span>
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {chain.length === 0 && (
                <div style={{ color: "var(--text-3)", fontSize: 12.5, fontStyle: "italic" }}>No fallback models — this category uses your selected model only.</div>
              )}
              {chain.map((ref, idx) => {
                const r = resolve(ref);
                return (
                  <div key={ref + "@" + idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg-2)" }}>
                    <span style={{ width: 20, textAlign: "center", color: "var(--text-3)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{idx + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5 }}>
                      {r.model} <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>· {r.prov}</span>
                    </span>
                    {!r.hasKey && (
                      <span title="This provider has no API key set — it will be skipped at runtime." style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--warn, #e3b341)", fontSize: 11, whiteSpace: "nowrap" }}>
                        <AlertTriangle size={13} /> no key
                      </span>
                    )}
                    <button title="Move up" disabled={idx === 0} onClick={() => move(c.id, idx, -1)} style={iconBtn(idx === 0)}><ArrowUp size={15} /></button>
                    <button title="Move down" disabled={idx === chain.length - 1} onClick={() => move(c.id, idx, 1)} style={iconBtn(idx === chain.length - 1)}><ArrowDown size={15} /></button>
                    <button title="Remove from chain" onClick={() => remove(c.id, idx)} style={iconBtn(false)}><X size={15} /></button>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <ModelPicker value="" placeholder="＋ Add a fallback model…" groups={modelGroups} onChange={(ref) => add(c.id, ref)} />
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>tried after the ones above</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
