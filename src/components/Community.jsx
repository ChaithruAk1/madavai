// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// Community forum (v1). Two views in one component: a thread LIST and a single THREAD.
// Talks to the account server via bridge.apiCall (generic authed fetch).
//   GET  /community/threads?category=  → [{id,title,category,authorName,createdAt,lastAt,posts,pinned,locked}]
//   POST /community/threads {title,category,body}
//   GET  /community/threads/:id        → { thread, posts:[{id,authorName,body,createdAt}] }
//   POST /community/threads/:id/posts {body}
//   POST /community/threads/:id/mod {pin?,lock?,delete?}  (admin)
// Plain text rendering ONLY (no markdown/HTML) — bodies render with whiteSpace pre-wrap.
import { useEffect, useState } from "react";
import { Pin, Lock, Trash2, ArrowLeft, Plus, MessageSquare } from "lucide-react";
import { bridge } from "../bridge/index.js";

const CATEGORIES = [
  { id: "general", label: "General" },
  { id: "ideas", label: "Ideas" },
  { id: "help", label: "Help" },
  { id: "showcase", label: "Showcase" },
];

function relTime(ts) {
  if (!ts) return "";
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  if (!t || isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export default function Community({ isAdmin }) {
  const [view, setView] = useState("list"); // "list" | "thread"
  const [openId, setOpenId] = useState(null);

  if (view === "thread" && openId) {
    return <ThreadView id={openId} isAdmin={isAdmin} onBack={() => { setView("list"); setOpenId(null); }} />;
  }
  return <ThreadList isAdmin={isAdmin} onOpen={(id) => { setOpenId(id); setView("thread"); }} />;
}

function ThreadList({ isAdmin, onOpen }) {
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [threads, setThreads] = useState([]);
  const [category, setCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [nt, setNt] = useState({ title: "", category: "general", body: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const q = category === "all" ? "" : `?category=${encodeURIComponent(category)}`;
    const r = await (bridge.apiCall ? bridge.apiCall("GET", `/community/threads${q}`) : { error: "offline" });
    setLoading(false);
    if (!r || r.error) { setOffline(true); setThreads([]); return; }
    setOffline(false);
    setThreads(Array.isArray(r) ? r : (Array.isArray(r.threads) ? r.threads : []));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [category]);

  const create = async () => {
    const title = nt.title.trim(), body = nt.body.trim();
    if (title.length < 4) return setErr("Title must be at least 4 characters.");
    if (title.length > 140) return setErr("Title must be under 140 characters.");
    if (body.length < 4) return setErr("Please write a little more.");
    if (body.length > 8000) return setErr("Post is too long (8000 char max).");
    setErr(""); setBusy(true);
    const r = await (bridge.apiCall ? bridge.apiCall("POST", "/community/threads", { title, category: nt.category, body }) : { error: "offline" });
    setBusy(false);
    if (!r || r.error) return setErr(r && r.error === "offline" ? "The community server isn't reachable." : (r && r.error) || "Couldn't post.");
    setNt({ title: "", category: "general", body: "" }); setShowForm(false);
    load();
  };

  return (
    <div className="cmty" style={{ maxWidth: 860 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Community</h2>
      <p className="mo-sub" style={{ margin: "0 0 14px", color: "var(--text-2)", fontSize: 13 }}>
        Ask questions, share what you built, and trade ideas with other BrainEdge users.
      </p>

      <div className="cmty-bar">
        <div className="cmty-cats">
          <button className={`chip ${category === "all" ? "active" : ""}`} onClick={() => setCategory("all")}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c.id} className={`chip ${category === c.id ? "active" : ""}`} onClick={() => setCategory(c.id)}>{c.label}</button>
          ))}
        </div>
        <button className="btn primary" onClick={() => { setShowForm((v) => !v); setErr(""); }}><Plus size={14} /> New thread</button>
      </div>

      {showForm && (
        <div className="cmty-form">
          <input className="cmty-input" placeholder="Thread title" value={nt.title} maxLength={140} onChange={(e) => setNt({ ...nt, title: e.target.value })} />
          <select className="cmty-input cmty-cat-select" value={nt.category} onChange={(e) => setNt({ ...nt, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <textarea className="cmty-input cmty-textarea" placeholder="Write your post…" value={nt.body} maxLength={8000} rows={5} onChange={(e) => setNt({ ...nt, body: e.target.value })} />
          {err && <div className="cmty-err">{err}</div>}
          <div className="cmty-form-actions">
            <button className="btn" onClick={() => { setShowForm(false); setErr(""); }}>Cancel</button>
            <button className="btn primary" onClick={create} disabled={busy}>{busy ? "Posting…" : "Create thread"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="cmty-list">{[0, 1, 2, 3].map((i) => <div key={i} className="cmty-row cmty-skel" />)}</div>
      ) : offline ? (
        <div className="cmty-empty">The community server isn't reachable. Check your connection and try again.</div>
      ) : threads.length === 0 ? (
        <div className="cmty-empty">No threads here yet — start the conversation.</div>
      ) : (
        <div className="cmty-list">
          {threads.map((t) => (
            <div key={t.id} className="cmty-row" onClick={() => onOpen(t.id)}>
              <div className="cmty-row-main">
                <div className="cmty-row-title">
                  {t.pinned && <span className="cmty-pin" title="Pinned"><Pin size={12} /></span>}
                  {t.locked && <Lock size={12} className="cmty-lock-i" />}
                  <span>{t.title}</span>
                </div>
                <div className="cmty-row-meta">
                  <span className="cmty-tag">{(CATEGORIES.find((c) => c.id === t.category) || {}).label || t.category || "General"}</span>
                  <span>{t.authorName || "Someone"}</span>
                  <span>· {relTime(t.lastAt || t.createdAt) || "recently"}</span>
                </div>
              </div>
              <div className="cmty-row-replies"><MessageSquare size={12} /> {typeof t.posts === "number" ? t.posts : (Array.isArray(t.posts) ? t.posts.length : 0)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadView({ id, isAdmin, onBack }) {
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [thread, setThread] = useState(null);
  const [posts, setPosts] = useState([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await (bridge.apiCall ? bridge.apiCall("GET", `/community/threads/${encodeURIComponent(id)}`) : { error: "offline" });
    setLoading(false);
    if (!r || r.error) { setOffline(true); return; }
    setOffline(false);
    setThread(r.thread || null);
    setPosts(Array.isArray(r.posts) ? r.posts : []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const send = async () => {
    const body = reply.trim();
    if (body.length < 1) return;
    if (body.length > 8000) return setErr("Reply is too long (8000 char max).");
    setErr(""); setBusy(true);
    const r = await (bridge.apiCall ? bridge.apiCall("POST", `/community/threads/${encodeURIComponent(id)}/posts`, { body }) : { error: "offline" });
    setBusy(false);
    if (!r || r.error) return setErr(r && r.error === "offline" ? "The community server isn't reachable." : (r && r.error) || "Couldn't post your reply.");
    setReply("");
    load();
  };

  const mod = async (patch) => {
    if (patch.delete && !window.confirm("Delete this thread permanently?")) return;
    const r = await (bridge.apiCall ? bridge.apiCall("POST", `/community/threads/${encodeURIComponent(id)}/mod`, patch) : { error: "offline" });
    if (r && !r.error) {
      if (patch.delete) return onBack();
      load();
    }
  };

  const locked = thread && thread.locked;

  return (
    <div className="cmty" style={{ maxWidth: 820 }}>
      <button className="btn cmty-back" onClick={onBack}><ArrowLeft size={14} /> Back to community</button>

      {loading ? (
        <div className="cmty-list" style={{ marginTop: 14 }}>{[0, 1].map((i) => <div key={i} className="cmty-post cmty-skel" />)}</div>
      ) : offline ? (
        <div className="cmty-empty">The community server isn't reachable. Check your connection and try again.</div>
      ) : !thread ? (
        <div className="cmty-empty">This thread couldn't be found.</div>
      ) : (
        <>
          <div className="cmty-thread-head">
            <h2 style={{ margin: "8px 0 4px", fontSize: 20 }}>
              {thread.pinned && <span className="cmty-pin" title="Pinned"><Pin size={13} /></span>}
              {thread.title}
            </h2>
            <div className="cmty-row-meta" style={{ marginBottom: 8 }}>
              <span className="cmty-tag">{(CATEGORIES.find((c) => c.id === thread.category) || {}).label || thread.category || "General"}</span>
              <span>{thread.authorName || "Someone"}</span>
              <span>· {relTime(thread.createdAt) || "recently"}</span>
            </div>
            {isAdmin && (
              <div className="cmty-mod">
                <button className="btn cmty-mod-btn" onClick={() => mod({ pin: !thread.pinned })}><Pin size={13} /> {thread.pinned ? "Unpin" : "Pin"}</button>
                <button className="btn cmty-mod-btn" onClick={() => mod({ lock: !thread.locked })}><Lock size={13} /> {thread.locked ? "Unlock" : "Lock"}</button>
                <button className="btn cmty-mod-btn danger" onClick={() => mod({ delete: true })}><Trash2 size={13} /> Delete</button>
              </div>
            )}
          </div>

          <div className="cmty-posts">
            {posts.length === 0 && <div className="cmty-empty">No replies yet.</div>}
            {posts.map((p) => (
              <div key={p.id} className="cmty-post">
                <div className="cmty-post-meta">{p.authorName || "Someone"} · {relTime(p.createdAt) || "recently"}</div>
                <div className="cmty-post-body" style={{ whiteSpace: "pre-wrap" }}>{p.body}</div>
              </div>
            ))}
          </div>

          {locked ? (
            <div className="cmty-locked"><Lock size={13} /> This thread is locked — no new replies.</div>
          ) : (
            <div className="cmty-composer">
              <textarea className="cmty-input cmty-textarea" placeholder="Write a reply…" value={reply} maxLength={8000} rows={3} onChange={(e) => setReply(e.target.value)} />
              {err && <div className="cmty-err">{err}</div>}
              <div className="cmty-form-actions">
                <button className="btn primary" onClick={send} disabled={busy || !reply.trim()}>{busy ? "Posting…" : "Reply"}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
