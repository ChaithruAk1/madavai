// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// Product requests board. Talks to the account server via bridge.apiCall (generic authed fetch).
// Endpoints: GET /requests → { requests:[...], canVote }; POST /requests {title,detail};
// POST /requests/:id/vote (403 for trial); POST /requests/:id/status {status,adminNote} (admin).
// Degrades gracefully to a friendly offline state when the server isn't reachable.
import { useEffect, useState } from "react";
import { ChevronUp, Plus, Trash2 } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { madavConfirm } from "../dialogs.jsx";

const STATUSES = ["requested", "approved", "rejected", "building", "deployed"];
const FILTERS = [
  { id: "all", label: "All" },
  { id: "requested", label: "Requested" },
  { id: "approved", label: "Approved" },
  { id: "building", label: "Building" },
  { id: "deployed", label: "Deployed" },
  { id: "rejected", label: "Rejected" },
];

// Tolerate votes-as-count or votes-as-array; normalize to a number + voted bool.
function normalize(r) {
  const votes = Array.isArray(r.votes) ? r.votes.length : (typeof r.votes === "number" ? r.votes : 0);
  return { ...r, votes, voted: !!r.voted };
}

function relTime(ts) {
  if (!ts) return "";
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  if (!t || isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export default function ProductRequests({ isAdmin }) {
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [items, setItems] = useState([]);
  const [canVote, setCanVote] = useState(true);
  const [sort, setSort] = useState("top"); // "top" | "new"
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [formErr, setFormErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState({}); // id -> bool
  const [voteErr, setVoteErr] = useState({}); // id -> message

  const load = async () => {
    setLoading(true);
    const r = await (bridge.apiCall ? bridge.apiCall("GET", "/requests") : { error: "offline" });
    setLoading(false);
    if (!r || r.error) { setOffline(true); return; }
    setOffline(false);
    setItems((Array.isArray(r.requests) ? r.requests : []).map(normalize));
    setCanVote(r.canVote !== false);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    const t = title.trim(), d = detail.trim();
    if (t.length < 4) return setFormErr("Title must be at least 4 characters.");
    if (t.length > 120) return setFormErr("Title must be under 120 characters.");
    if (d.length < 10) return setFormErr("Please add a little more detail (10+ characters).");
    if (d.length > 2000) return setFormErr("Detail must be under 2000 characters.");
    setFormErr(""); setSubmitting(true);
    const r = await (bridge.apiCall ? bridge.apiCall("POST", "/requests", { title: t, detail: d }) : { error: "offline" });
    setSubmitting(false);
    if (!r || r.error) return setFormErr(r && r.error === "offline" ? "The community server isn't reachable." : (r && r.error) || "Couldn't submit.");
    setTitle(""); setDetail(""); setShowForm(false);
    load();
  };

  const toggleVote = async (it) => {
    if (!canVote) return;
    const wasVoted = it.voted;
    // optimistic
    setItems((arr) => arr.map((x) => x.id === it.id ? { ...x, voted: !wasVoted, votes: x.votes + (wasVoted ? -1 : 1) } : x));
    setVoteErr((e) => { const n = { ...e }; delete n[it.id]; return n; });
    const r = await (bridge.apiCall ? bridge.apiCall("POST", `/requests/${encodeURIComponent(it.id)}/vote`) : { error: "offline" });
    if (!r || r.error) {
      // rollback
      setItems((arr) => arr.map((x) => x.id === it.id ? { ...x, voted: wasVoted, votes: x.votes + (wasVoted ? 1 : -1) } : x));
      if (r && r.code === 403) setVoteErr((e) => ({ ...e, [it.id]: r.error || "Voting is available once your trial converts to a subscription." }));
      else setVoteErr((e) => ({ ...e, [it.id]: r && r.error === "offline" ? "The community server isn't reachable." : "Couldn't record your vote." }));
    } else if (typeof r.votes !== "undefined" || typeof r.voted !== "undefined") {
      const norm = normalize(r);
      setItems((arr) => arr.map((x) => x.id === it.id ? { ...x, votes: typeof r.votes !== "undefined" ? norm.votes : x.votes, voted: typeof r.voted !== "undefined" ? norm.voted : x.voted } : x));
    }
  };

  const setStatus = async (it, status) => {
    let adminNote = it.adminNote || "";
    const entered = window.prompt(`Optional note for "${status}" (shown to users):`, adminNote);
    if (entered === null) { /* allow status change without changing note */ } else adminNote = entered;
    setItems((arr) => arr.map((x) => x.id === it.id ? { ...x, status, statusAt: Date.now(), adminNote } : x)); // optimistic
    const r = await (bridge.apiCall ? bridge.apiCall("POST", `/requests/${encodeURIComponent(it.id)}/status`, { status, adminNote }) : { error: "offline" });
    if (!r || r.error) load(); // reconcile on failure
  };

  const delRequest = async (it) => {
    if (!(await madavConfirm(`Delete request "${it.title}"?`, { okLabel: "Delete" }))) return;
    setItems((arr) => arr.filter((x) => x.id !== it.id)); // optimistic
    const r = await (bridge.apiCall ? bridge.apiCall("DELETE", `/requests/${encodeURIComponent(it.id)}`) : { error: "offline" });
    if (!r || r.error) load();
  };

  const shown = items
    .filter((it) => filter === "all" || it.status === filter)
    .sort((a, b) => sort === "top" ? (b.votes - a.votes) : ((Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)));

  return (
    <div className="pr" style={{ maxWidth: 860 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Product requests</h2>
      <p className="mo-sub" style={{ margin: "0 0 12px", color: "var(--text-2)", fontSize: 13 }}>
        Suggest features, vote on what matters, and watch ideas move from requested to deployed.
      </p>

      <div className="pr-banner">
        Minimum 10,000+ votes are required for a feature to be considered — final decision rests with the admin.
      </div>

      <div className="pr-bar">
        <div className="pr-sort">
          <button className={`chip ${sort === "top" ? "active" : ""}`} onClick={() => setSort("top")}>Top voted</button>
          <button className={`chip ${sort === "new" ? "active" : ""}`} onClick={() => setSort("new")}>Newest</button>
        </div>
        <div className="pr-filters">
          {FILTERS.map((f) => (
            <button key={f.id} className={`chip ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <button className="btn primary pr-new" onClick={() => { setShowForm((v) => !v); setFormErr(""); }}>
          <Plus size={14} /> New request
        </button>
      </div>

      {showForm && (
        <div className="pr-form">
          <input className="pr-input" placeholder="Short, clear title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="pr-input pr-textarea" placeholder="What's the idea, and why does it matter?" value={detail} maxLength={2000} onChange={(e) => setDetail(e.target.value)} rows={4} />
          {formErr && <div className="pr-err">{formErr}</div>}
          <div className="pr-form-actions">
            <button className="btn" onClick={() => { setShowForm(false); setFormErr(""); }}>Cancel</button>
            <button className="btn primary" onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Submit request"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="pr-list">
          {[0, 1, 2].map((i) => <div key={i} className="pr-card pr-skel" />)}
        </div>
      ) : offline ? (
        <div className="pr-empty">The community server isn't reachable. Check your connection and try again.</div>
      ) : shown.length === 0 ? (
        <div className="pr-empty">No requests here yet — be the first to suggest a feature.</div>
      ) : (
        <div className="pr-list">
          {shown.map((it) => {
            const isExp = !!expanded[it.id];
            return (
              <div key={it.id} className="pr-card">
                <div className="pr-card-row">
                  <button
                    className={`pr-vote ${it.voted ? "voted" : ""}`}
                    onClick={() => toggleVote(it)}
                    disabled={!canVote}
                    title={!canVote ? "Voting unlocks once your trial converts to a subscription." : (it.voted ? "Remove your vote" : "Upvote")}
                  >
                    <ChevronUp size={16} />
                    <span>{it.votes}</span>
                  </button>
                  <div className="pr-body">
                    <div className="pr-head">
                      <span className="pr-title">{it.title}</span>
                      <span className={`pr-status pr-st-${it.status || "requested"}`}>{it.status || "requested"}</span>
                    </div>
                    <div className={`pr-detail ${isExp ? "" : "clamp"}`} onClick={() => setExpanded((e) => ({ ...e, [it.id]: !isExp }))}>
                      {it.detail}
                    </div>
                    {it.adminNote && <div className="pr-note">Admin: {it.adminNote}</div>}
                    <div className="pr-meta">
                      {it.authorName || "Someone"} · {relTime(it.createdAt) || "recently"}
                    </div>
                    {voteErr[it.id] && <div className="pr-vote-err">{voteErr[it.id]}</div>}
                    {isAdmin && (
                      <div className="pr-admin">
                        <span className="pr-admin-lbl">Set status:</span>
                        <select className="pr-select" value={it.status || "requested"} onChange={(e) => setStatus(it, e.target.value)}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button title="Delete request" onClick={() => delRequest(it)} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--danger, #e5534b)", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center" }}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
