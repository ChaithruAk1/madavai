import { useEffect, useState } from "react";
import { Plus, Puzzle, Plug, Send, BarChart3, FolderKanban, Cpu, Trash2, Search, Settings as SettingsIcon, Blocks, LayoutGrid, ChevronDown, ChevronRight, SlidersHorizontal, List, Gauge, Clock, Sparkles } from "lucide-react";
import { bridge } from "../bridge/index.js";

const TOP = [
  { id: "project", label: "Projects", icon: FolderKanban },
];
const INTERFACE = [
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "plugins", label: "Plugins", icon: Blocks },
  { id: "viamobile", label: "Via Mobile", icon: Send },
];
const MODELS = [
  { id: "models", label: "Model configuration", icon: SlidersHorizontal },
  { id: "models-overview", label: "Models overview", icon: List },
  { id: "models-speed", label: "Models speed check", icon: Gauge },
];
const BOTTOM = [
  { id: "scheduler", label: "Scheduler", icon: Clock },
  { id: "consumption", label: "Consumption", icon: BarChart3 },
];

export default function Sidebar({ active, onSelect, historyMode, activeConvId, refreshKey, onNew, onOpenSession, onDeleteSession }) {
  const [recents, setRecents] = useState([]);
  const [q, setQ] = useState("");
  const [ifaceOpen, setIfaceOpen] = useState(true);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [acct, setAcct] = useState(null);   // authMe() result: { user, status, daysLeft, subscription }
  const [upBusy, setUpBusy] = useState(false);

  // Pull the signed-in account so the sidebar can show the profile + trial/upgrade box.
  useEffect(() => {
    let live = true;
    const pull = () => bridge.authMe?.().then((r) => { if (live && r && !r.error) setAcct(r); }).catch(() => {});
    pull();
    const iv = setInterval(pull, 3 * 60 * 1000); // refresh so an upgrade/trial change reflects without a relaunch
    return () => { live = false; clearInterval(iv); };
  }, [refreshKey]);

  const upgrade = async () => {
    if (!bridge.billingCheckout) { onSelect("settings"); return; } // fall back to the Profile page
    setUpBusy(true);
    try { await bridge.billingCheckout(); } catch {} finally { setUpBusy(false); }
  };

  const u = acct && acct.user;
  const profileName = (u && u.name) || "Profile";
  const profileInitial = ((u && (u.name || u.email)) || "P").slice(0, 1).toUpperCase();
  const st = acct && acct.status;
  const plan = acct && acct.subscription && acct.subscription.plan;
  const navBtn = (t) => {
    const I = t.icon;
    return (
      <button key={t.id} className={`nav-item ${active === t.id ? "active" : ""}`} onClick={() => onSelect(t.id)}>
        <I size={16} /> <span className="sb-t">{t.label}</span>
      </button>
    );
  };
  useEffect(() => {
    let live = true;
    bridge.listSessions(historyMode).then((l) => { if (live) setRecents(l || []); }).catch(() => {});
    return () => { live = false; };
  }, [historyMode, refreshKey]);

  const newLabel = historyMode === "chat" ? "New chat" : "New task";
  const shown = q ? recents.filter((it) => (it.title || "").toLowerCase().includes(q.toLowerCase())) : recents;

  return (
    <aside className="sidebar glass">
      <button className="sb-new" onClick={onNew}><Plus size={16} /> <span className="sb-t">{newLabel}</span></button>

      {TOP.map(navBtn)}

      <button className={`nav-item nav-group ${INTERFACE.some((t) => t.id === active) ? "active-within" : ""}`} onClick={() => setIfaceOpen((o) => !o)}>
        <LayoutGrid size={16} /> <span className="sb-t">Interface</span>
        <span className="nav-caret sb-t">{ifaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {ifaceOpen && INTERFACE.map((t) => {
        const I = t.icon;
        return (
          <button key={t.id} className={`nav-item nav-sub ${active === t.id ? "active" : ""}`} onClick={() => onSelect(t.id)}>
            <I size={15} /> <span className="sb-t">{t.label}</span>
          </button>
        );
      })}

      <button className={`nav-item nav-group ${MODELS.some((t) => t.id === active) ? "active-within" : ""}`} onClick={() => setModelsOpen((o) => !o)}>
        <Cpu size={16} /> <span className="sb-t">Models</span>
        <span className="nav-caret sb-t">{modelsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {modelsOpen && MODELS.map((t) => {
        const I = t.icon;
        return (
          <button key={t.id} className={`nav-item nav-sub ${active === t.id ? "active" : ""}`} onClick={() => onSelect(t.id)}>
            <I size={15} /> <span className="sb-t">{t.label}</span>
          </button>
        );
      })}

      {BOTTOM.map(navBtn)}

      <div className="sb-expand">
        <div className="nav-label" style={{ marginTop: 10 }}>Recents</div>
        <div className="sb-search">
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats…" />
        </div>
        <div className="sb-recents scroll">
          {recents.length === 0 && <div className="sb-empty">No saved chats yet.</div>}
          {recents.length > 0 && shown.length === 0 && <div className="sb-empty">No matches.</div>}
          {shown.map((it) => (
            <div key={it.id} className={`sb-rec ${it.id === activeConvId ? "active" : ""}`} onClick={() => onOpenSession(it.id)} title={it.title}>
              <span className="sb-rec-title">{it.title || "Untitled"}</span>
              <button className="sb-rec-del" title="Delete" onClick={(e) => { e.stopPropagation(); onDeleteSession(it.id); }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Trial / Upgrade box — sits directly above the Profile entry */}
      {st === "trialing" && (
        <div className="sb-upsell sb-t">
          <div className="sb-upsell-row"><Sparkles size={13} /> <span>Free trial · {acct.daysLeft} day{acct.daysLeft === 1 ? "" : "s"} left</span></div>
          <button className="sb-upsell-btn" disabled={upBusy} onClick={upgrade}>{upBusy ? "Opening…" : "Upgrade"}</button>
        </div>
      )}
      {st === "expired" && (
        <div className="sb-upsell sb-t">
          <div className="sb-upsell-row"><Sparkles size={13} /> <span>Trial ended</span></div>
          <button className="sb-upsell-btn" disabled={upBusy} onClick={upgrade}>{upBusy ? "Opening…" : "Upgrade"}</button>
        </div>
      )}
      {st === "active" && (
        <div className="sb-upsell active sb-t">
          <div className="sb-upsell-row"><Sparkles size={13} /> <span>{plan || "Pro"}</span></div>
        </div>
      )}

      {/* Profile entry — replaces the old Settings button; opens the settings page (settings live inside Profile) */}
      <button className={`sb-profile ${active === "settings" ? "active" : ""}`} onClick={() => onSelect("settings")} title="Profile & settings">
        {u && u.avatar
          ? <img className="sb-profile-av" src={u.avatar} alt="" />
          : <span className="sb-profile-av sb-profile-ini">{profileInitial}</span>}
        <span className="sb-t sb-profile-meta">
          <span className="sb-profile-name">{profileName}</span>
          <span className="sb-profile-sub">View profile & settings</span>
        </span>
        <SettingsIcon className="sb-t sb-profile-gear" size={14} />
      </button>
      <div className="sb-copyright sb-t">© 2026 BrainEdge · Proprietary</div>
    </aside>
  );
}
