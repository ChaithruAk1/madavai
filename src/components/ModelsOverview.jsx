import { useMemo, useState } from "react";
import { Check, X, Search, ChevronUp, ChevronDown, Download } from "lucide-react";
import { MODELS, CATEGORIES, freeInfo } from "../data/modelCatalog.js";
import { bridge } from "../bridge/index.js";

// Open-weight & where to get it. Proprietary models are API-only (no download).
function dl(m) {
  if (/proprietary/i.test(m.license)) return { open: false };
  const base = (m.run || "").split(":")[0];
  const ollama = (m.providers || []).some((p) => p.name === "Ollama") ? `https://ollama.com/library/${base}` : null;
  const hf = `https://huggingface.co/models?search=${encodeURIComponent(m.name)}`;
  return { open: true, ollama, hf };
}
const openExt = (url) => url && bridge.openExternal && bridge.openExternal(url);

const costRank = (m) => { const c = freeInfo(m).cost; return c === "Free (local)" ? 0 : c === "Free tier" ? 1 : 2; };

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function Cap({ v }) {
  if (v === "toggle") return <span className="mo-toggle">Toggle</span>;
  return v ? <Check size={15} className="mo-yes" /> : <X size={15} className="mo-no" />;
}

const COLS = [
  { key: "name", label: "Model", sort: (m) => m.name },
  { key: "rating", label: "Rating", sort: (m) => m.rating },
  { key: "bestFor", label: "Best for", sort: (m) => m.bestFor },
  { key: "ctx", label: "Context", sort: (m) => m.ctx },
  { key: "host", label: "Host", sort: (m) => (m.host === "local" ? "0" : "1" + m.host) },
  { key: "cost", label: "Cost", sort: (m) => costRank(m) },
  { key: "thinking", label: "Thinking", sort: (m) => String(m.thinking) },
  { key: "tools", label: "Tools", sort: (m) => Number(m.tools) },
  { key: "vision", label: "Vision", sort: (m) => Number(m.vision) },
  { key: "license", label: "License", sort: (m) => m.license },
  { key: "download", label: "Weights", sort: (m) => (dl(m).open ? 0 : 1) },
];

function Stars({ value }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="stars" title={value.toFixed(1) + " / 5 (approx. reputation)"}>
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fg" style={{ width: pct + "%" }}>★★★★★</span>
    </span>
  );
}

const fmtCtx = (k) => (k >= 1000 ? (k / 1000) + "M" : k + "K");

const TOP = new Set(["Qwen2.5-Coder 32B", "Qwen3 32B", "Claude Sonnet"]);

function tagsFor(m) {
  const t = [m.cat];
  if (m.agentic) t.push("Agentic");
  if (m.thinking) t.push("Thinking");
  if (m.vision) t.push("Vision");
  return t;
}
function blurbFor(m) {
  if (m.sparse) return `Live model from ${m.maker}. It isn't in the curated catalog yet, so detailed specs (context, VRAM, license, capabilities) aren't available — only that it's offered by ${m.maker}.`;
  const where = m.host === "local" ? `Runs locally in ~${m.vram} GB VRAM (≈Q4)` : `Served via the ${m.host} API`;
  const think = m.thinking === "toggle" ? ", hybrid thinking mode" : m.thinking ? ", step-by-step reasoning" : "";
  return `${m.bestFor}. ${where}, ${fmtCtx(m.ctx)} context${think}. ${m.size !== "—" ? m.size + " parameters, " : ""}licensed ${m.license}.`;
}
function winsFor(m) {
  const w = [];
  if (/apache|mit/i.test(m.license)) w.push(`${m.license} — no usage restrictions`);
  if (m.host === "local") w.push(`Runs fully offline (~${m.vram} GB, ≈Q4)`);
  if (m.ctx >= 128) w.push(`${fmtCtx(m.ctx)} context — large repos/docs fit`);
  if (m.tools) w.push("Native tool calling — agent ready");
  if (m.vision) w.push("Understands images & documents");
  if (m.thinking === true) w.push("Always-on reasoning");
  return w.slice(0, 4);
}
function missesFor(m) {
  const x = [];
  if (m.host !== "local") x.push("Cloud only — needs API key + network");
  if (/proprietary/i.test(m.license)) x.push("Closed weights / proprietary");
  if (!m.vision) x.push("No vision / image input");
  if (m.thinking === "toggle") x.push("Thinking is a toggle, not always-on");
  if (m.host === "local" && m.vram >= 24) x.push(`Needs a large GPU (~${m.vram} GB)`);
  if (m.ctx <= 32) x.push("Smaller context window");
  if (!m.tools) x.push("No native tool calling");
  return x.slice(0, 4);
}

export default function ModelsOverview({ activeModel }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [hostFilter, setHostFilter] = useState("All"); // All | local | cloud
  const [caps, setCaps] = useState({ tools: false, vision: false, thinking: false, agentic: false });
  const [freeOnly, setFreeOnly] = useState(false);
  const [sortKey, setSortKey] = useState("ctx");
  const [dir, setDir] = useState("desc");
  const [detail, setDetail] = useState(null);
  const [copied, setCopied] = useState("");
  const copy = (text, label) => { try { navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1400); } catch {} };

  const activeNorm = norm(activeModel);
  const isActive = (m) => activeNorm && (activeNorm.includes(norm(m.run)) || activeNorm.includes(norm(m.name)) || norm(m.run).includes(activeNorm));

  const rows = useMemo(() => {
    let r = MODELS.filter((m) => {
      if (cat !== "All" && m.cat !== cat) return false;
      if (hostFilter === "local" && m.host !== "local") return false;
      if (hostFilter === "cloud" && m.host === "local") return false;
      if (caps.tools && !m.tools) return false;
      if (caps.vision && !m.vision) return false;
      if (caps.thinking && !m.thinking) return false;
      if (caps.agentic && !m.agentic) return false;
      if (freeOnly && !freeInfo(m).has) return false;
      if (q) { const t = (m.name + " " + m.maker + " " + m.bestFor + " " + m.run).toLowerCase(); if (!t.includes(q.toLowerCase())) return false; }
      return true;
    });
    const col = COLS.find((c) => c.key === sortKey) || COLS[0];
    r = [...r].sort((a, b) => {
      const va = col.sort(a), vb = col.sort(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return dir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [q, cat, hostFilter, caps, freeOnly, sortKey, dir]);

  const setSort = (key) => { if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setDir(key === "ctx" || key === "vram" ? "desc" : "asc"); } };
  const toggleCap = (k) => setCaps((c) => ({ ...c, [k]: !c[k] }));

  return (
    <div className="mo scroll">
      <div className="mo-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Models overview</h2>
          <p style={{ color: "var(--text-2)", fontSize: 12, margin: "4px 0 0" }}>
            Curated reference — VRAM is an approximate ~Q4 estimate, context is the practical max. {rows.length} of {MODELS.length} shown.
          </p>
        </div>
      </div>

      <div className="mo-filters">
        <div className="mo-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" />
        </div>
        <div className="mo-chips">
          {["All", ...CATEGORIES].map((c) => (
            <button key={c} className={`mo-chip ${cat === c ? "on" : ""}`} onClick={() => setCat(cat === c ? "All" : c)}>{c}</button>
          ))}
          <span className="mo-sep" />
          {["All", "local", "cloud"].map((h) => (
            <button key={h} className={`mo-chip ${hostFilter === h ? "on" : ""}`} onClick={() => setHostFilter(hostFilter === h ? "All" : h)}>{h === "All" ? "All hosts" : h === "local" ? "Local" : "Cloud"}</button>
          ))}
          <span className="mo-sep" />
          <button className={`mo-chip ${caps.agentic ? "on" : ""}`} onClick={() => toggleCap("agentic")}>Agentic</button>
          <button className={`mo-chip ${caps.tools ? "on" : ""}`} onClick={() => toggleCap("tools")}>Tools</button>
          <button className={`mo-chip ${caps.vision ? "on" : ""}`} onClick={() => toggleCap("vision")}>Vision</button>
          <button className={`mo-chip ${caps.thinking ? "on" : ""}`} onClick={() => toggleCap("thinking")}>Thinking</button>
          <button className={`mo-chip ${freeOnly ? "on" : ""}`} onClick={() => setFreeOnly((v) => !v)}>Free endpoint</button>
        </div>
      </div>

      <div className="mo-tablewrap">
        <table className="mo-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} onClick={() => setSort(c.key)} className={sortKey === c.key ? "sorted" : ""}>
                  <span>{c.label}</span>
                  {sortKey === c.key && (dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.name} className={isActive(m) ? "active" : ""} onClick={() => setDetail(m)} style={{ cursor: "pointer" }}>
                <td><div className="mo-name">{m.name}{isActive(m) && <span className="mo-activebadge">active</span>}</div><div className="mo-sub">{m.maker} · {m.year}</div></td>
                <td><Stars value={m.rating} /></td>
                <td><span className="mo-best">{m.bestFor}</span>{m.agentic && <span className="mo-agentic" title="Strong for agentic / tool-use workflows">⚡ agentic</span>}</td>
                <td className="mo-num">{fmtCtx(m.ctx)}</td>
                <td>{m.host === "local" ? <span className="mo-pill local">Local · {m.vram}GB</span> : <span className="mo-pill cloud">Cloud · {m.host}</span>}</td>
                <td><span className={`mo-cost ${costRank(m) === 0 ? "free" : costRank(m) === 1 ? "tier" : "paid"}`}>{freeInfo(m).cost}</span></td>
                <td><Cap v={m.thinking} /></td>
                <td><Cap v={m.tools} /></td>
                <td><Cap v={m.vision} /></td>
                <td><span className="mo-lic">{m.license}</span></td>
                <td>{dl(m).open
                  ? <button className="mo-dlink" title="Open weights — download source" onClick={(e) => { e.stopPropagation(); openExt(dl(m).ollama || dl(m).hf); }}><Download size={12} /> Download</button>
                  : <span className="mo-sub">API only</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={COLS.length} style={{ textAlign: "center", color: "var(--text-2)", padding: 24 }}>No models match your filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="mo-card">
            <div className="mo-card-head">
              <div>
                <div className="mo-card-title">{detail.name}{TOP.has(detail.name) && <span className="mo-pick">Top pick</span>}</div>
                <div className="mo-sub">{detail.maker}{detail.year ? " · " + detail.year : ""}</div>
                {detail.rating ? <div className="mo-rating-row"><Stars value={detail.rating} /> <span className="mo-rating-num">{detail.rating.toFixed(1)}</span> <span className="mo-sub">· approx. reputation</span></div> : null}
              </div>
              <button className="icon-btn" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>

            <div className="mo-badges">
              {detail.host === "local" && detail.vram
                ? <span className="mo-badge green">{detail.vram} GB VRAM ✓</span>
                : <span className="mo-badge blue">{detail.host === "local" ? "Local" : detail.host} {detail.host === "local" ? "" : "API"}</span>}
              {detail.ctx ? <span className="mo-badge">{fmtCtx(detail.ctx)} context</span> : null}
              {detail.size !== "—" && <span className="mo-badge">{detail.size}</span>}
              {detail.license !== "—" && <span className="mo-badge gray">{detail.license}</span>}
            </div>
            <div className="mo-badges">
              {tagsFor(detail).map((t) => <span key={t} className="mo-badge tag">{t}</span>)}
            </div>

            <p className="mo-blurb">{blurbFor(detail)}</p>

            <div className="mo-avail">
              <div className="mo-wmhead">Available on {(() => { const f = freeInfo(detail); return f.has ? <span className="mo-freetag">free endpoint available</span> : <span className="mo-paidtag">paid only</span>; })()}</div>
              <div className="mo-provs">
                {detail.providers.map((p) => (
                  <span key={p.name} className={`mo-prov ${p.tier}`}>
                    {p.name}
                    <span className="mo-prov-meta">{p.type === "local" ? "local" : "cloud"} · {p.tier === "freemium" ? "free tier" : p.tier}</span>
                  </span>
                ))}
              </div>
            </div>

            {!detail.sparse && (
              <div className="mo-wm">
                <div className="mo-wmcol">
                  <div className="mo-wmhead">Wins</div>
                  <ul>{winsFor(detail).map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
                <div className="mo-wmcol">
                  <div className="mo-wmhead">Misses</div>
                  <ul>{missesFor(detail).map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              </div>
            )}

            <div className="mo-wmhead" style={{ marginTop: 16 }}>Weights & download {dl(detail).open ? <span className="mo-freetag">open weights</span> : <span className="mo-paidtag">API only — no download</span>}</div>
            <div className="mo-dl">
              {dl(detail).open ? (
                <>
                  {dl(detail).ollama && <button className="btn" onClick={() => openExt(dl(detail).ollama)}><Download size={13} /> Ollama library</button>}
                  <button className="btn" onClick={() => openExt(dl(detail).hf)}><Download size={13} /> Hugging Face</button>
                  <button className="btn ghost" onClick={() => copy(detail.host === "local" ? `ollama run ${detail.run}` : detail.run, "cmd")}>{copied === "cmd" ? "Copied!" : "Copy run id"}</button>
                </>
              ) : (
                <span className="mo-sub">Closed weights — available only through the {detail.host} API.</span>
              )}
            </div>
            {dl(detail).open && <pre className="mo-runcmd">{detail.host === "local" ? `ollama run ${detail.run}` : `model: ${detail.run}`}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}
