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

// `groups` are provider-derived: [{ group: providerName, items: [{id:"pid::model", name, prov, badge}] }]
export default function ModelPicker({ value, onChange, groups: groupsProp, onRefresh }) {
  const source = groupsProp && groupsProp.length ? groupsProp : MODELS;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const ref = useRef(null);

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
    .map((g) => ({ ...g, items: g.items.filter((it) => (it.name + it.id).toLowerCase().includes(q.toLowerCase())) }))
    .filter((g) => g.items.length);

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

          {groups.length === 0 && (
            <div className="model-group" style={{ textTransform: "none", color: "var(--text-2)", padding: 10 }}>
              No models. Open Settings, set a provider's Base URL + API key, then hit refresh.
            </div>
          )}

          {groups.map((g) => (
            <div key={g.group}>
              <div className="model-group">{g.group} · {g.items.length}</div>
              {g.items.map((it) => {
                const isLocal = /local/i.test(it.prov || g.group || "");
                return (
                  <div
                    key={it.id}
                    className={`model-row ${it.id === value ? "sel" : ""}`}
                    onClick={() => { onChange(it.id); setOpen(false); }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                    <span className="badge" style={{ background: "transparent", border: "1px solid var(--line)", color: isLocal ? "var(--ok)" : "var(--accent)" }}>{isLocal ? "Local" : "Cloud"}</span>
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
