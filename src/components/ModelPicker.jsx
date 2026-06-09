import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, Check, Search, RefreshCw } from "lucide-react";
import { MODELS } from "../bridge/contract.js";

// Best-guess of a model's core purpose from its name (no universal API exposes this).
export function classify(id) {
  const n = (id || "").toLowerCase();
  if (/cod(er|e)\b|coder|deepseek-coder/.test(n)) return "coding";
  if (/reason|\br1\b|\bo1\b|\bo3\b|qwq|thinking|think\b/.test(n)) return "reasoning";
  if (/vision|multimodal|\bvl\b|llava|-v\b/.test(n)) return "vision";
  if (/embed/.test(n)) return "embeddings";
  if (/flash|mini|lite|haiku|tiny|small|turbo|nano|\b[1-9]b\b/.test(n)) return "fast";
  return "general";
}
const PURPOSE_COLOR = { coding: "#7ee787", reasoning: "#d2a8ff", vision: "#79c0ff", fast: "#ffd479", embeddings: "#79c0ff", general: "var(--text-2)" };
const chipStyle = (active) => ({ padding: "3px 11px", borderRadius: 999, fontSize: 11.5, lineHeight: 1.5, border: "1px solid " + (active ? "var(--accent)" : "var(--line)"), background: active ? "var(--accent)" : "transparent", color: active ? "#04121a" : "var(--text-2)", cursor: "pointer", fontWeight: active ? 600 : 400 });

// `groups` are provider-derived: [{ group: providerName, items: [{id:"pid::model", name, prov, badge}] }]
export default function ModelPicker({ value, onChange, groups: groupsProp, onRefresh }) {
  const source = groupsProp && groupsProp.length ? groupsProp : MODELS;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cost, setCost] = useState("all");      // all | free | paid
  const [purpose, setPurpose] = useState("any"); // any | coding | reasoning | vision | fast
  const [refreshing, setRefreshing] = useState(false);
  const ref = useRef(null);
  const isFree = (it, groupName) => /local/i.test(it.prov || groupName || "") || /:free\b/.test((it.name || "").toLowerCase());

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Find the selected item; if not in the list yet, synthesize a label from the value.
  const current = useMemo(() => {
    for (const g of source) for (const it of g.items) if (it.id === value) return it;
    if (value && value.includes("::")) {
      const mid = value.slice(value.indexOf("::") + 2);
      return { id: value, name: mid || "select model", prov: "" };
    }
    return source[0]?.items[0] || { name: "no models", prov: "" };
  }, [value, source]);

  const total = source.reduce((n, g) => n + g.items.length, 0);
  const groups = source
    .map((g) => ({ ...g, items: g.items.filter((it) => {
      if (!(it.name + it.id).toLowerCase().includes(q.toLowerCase())) return false;
      const free = isFree(it, g.group);
      if (cost === "free" && !free) return false;
      if (cost === "paid" && free) return false;
      if (purpose !== "any" && classify(it.name) !== purpose) return false;
      return true;
    }) }))
    .filter((g) => g.items.length);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  const doRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  return (
    <div className="model-picker" ref={ref}>
      <button className="model-btn" onClick={() => setOpen((o) => !o)}>
        {current.prov && <span className="prov">{current.prov}</span>} {current.name} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="model-menu scroll">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-2)" }} />
              <input
                className="model-search" style={{ paddingLeft: 30, marginBottom: 0 }} autoFocus
                placeholder={`Search ${total} models…`} value={q} onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {onRefresh && (
              <button className="btn" title="Reload models from providers" onClick={doRefresh} style={{ padding: "8px 9px" }}>
                <RefreshCw size={14} className={refreshing ? "spin" : ""} />
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            {[["all", "All"], ["free", "Free"], ["paid", "Paid"]].map(([k, label]) => (
              <button key={k} onClick={() => setCost(k)} style={chipStyle(cost === k)}>{label}</button>
            ))}
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--line)", margin: "2px 3px" }} />
            {[["any", "Any"], ["coding", "Coding"], ["reasoning", "Reasoning"], ["vision", "Vision"], ["fast", "Fast"]].map(([k, label]) => (
              <button key={k} onClick={() => setPurpose(k)} style={chipStyle(purpose === k)}>{label}</button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)" }}>{shown} of {total}</span>
          </div>

          {groups.length === 0 && (
            <div className="model-group" style={{ textTransform: "none", color: "var(--text-2)", padding: 10 }}>
              No models match these filters. Clear a filter, or open Settings to add a provider.
            </div>
          )}

          {groups.map((g) => (
            <div key={g.group}>
              <div className="model-group">{g.group} · {g.items.length}</div>
              {g.items.map((it) => {
                const isLocal = /local/i.test(it.prov || g.group || "");
                const free = isFree(it, g.group);
                const purp = classify(it.name);
                const label = isLocal ? "Local" : free ? "Free" : "Cloud";
                const labelColor = isLocal ? "var(--ok)" : free ? "#7ee787" : "var(--accent)";
                return (
                  <div
                    key={it.id}
                    className={`model-row ${it.id === value ? "sel" : ""}`}
                    onClick={() => { onChange(it.id); setOpen(false); }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                    {purp !== "general" && purp !== "embeddings" && <span className="badge" style={{ background: "transparent", border: "1px solid var(--line)", color: PURPOSE_COLOR[purp] }}>{purp}</span>}
                    <span className="badge" style={{ background: "transparent", border: "1px solid var(--line)", color: labelColor }}>{label}</span>
                    {it.id === value && <Check size={15} className="check" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
