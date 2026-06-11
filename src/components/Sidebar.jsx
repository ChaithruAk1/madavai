import { useEffect, useState } from "react";
import { Plus, Puzzle, Plug, Send, BarChart3, FolderKanban, Cpu, Trash2, Search, Settings as SettingsIcon, Blocks, LayoutGrid, ChevronDown, ChevronRight, SlidersHorizontal, List, Gauge, Clock, Sparkles, Globe, CreditCard, LogOut, HelpCircle, Shapes, TerminalSquare, Bot, Download, FlaskConical, BookOpen } from "lucide-react";
import { bridge } from "../bridge/index.js";

const TOP = [
  { id: "project", label: "Projects", icon: FolderKanban },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "studio", label: "Studio", icon: Shapes },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
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
const ADMIN_ITEM = { id: "testcenter", label: "Test Center", icon: FlaskConical };

export default function Sidebar({ active, onSelect, historyMode, activeConvId, refreshKey, onNew, onOpenSession, onDeleteSession, extras = {} }) {
  const [recents, setRecents] = useState([]);
  const [q, setQ] = useState("");
  const [ifaceOpen, setIfaceOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  // Extras switchboard (Settings → Extras): an entry whose feature is switched off
  // disappears from the nav. Absent flag = ON; only an explicit false hides it.
  const extraOff = (id) => extras && extras[id] === false;
  // Groups are collapsed by default; auto-open only while you're inside one, and re-collapse when you leave.
  useEffect(() => { setIfaceOpen(INTERFACE.some((t) => t.id === active)); setModelsOpen(MODELS.some((t) => t.id === active)); }, [active]);
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

  const [menuOpen, setMenuOpen] = useState(false);

  // Test Center entry needs BOTH: an admin account AND the QA tools present in this build
  // (they're excluded from end-user installers — downloads from the website never get them).
  const [isAdmin, setIsAdmin] = useState(false);
  const [qaHere, setQaHere] = useState(false);
  useEffect(() => {
    let live = true;
    bridge.adminStats?.().then((r) => { if (live) setIsAdmin(!!r && !r.error); }).catch(() => {});
    bridge.qaStatus?.().then((r) => { if (live) setQaHere(!!r && r.available !== false); }).catch(() => {});
    return () => { live = false; };
  }, [refreshKey]);

  // Desktop update check: compare this build against /app-version on the account server.
  const [update, setUpdate] = useState(null); // { version, url }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!bridge.getAppVersion) return;
        const mine = await bridge.getAppVersion();
        if (!mine || mine === "web") return; // web updates itself on deploy
        const s = await bridge.getSettings();
        const base = (s && s.authBaseUrl) || "";
        if (!base) return;
        const r = await fetch(base.replace(/\/$/, "") + "/app-version");
        const j = await r.json();
        const newer = (a, b) => { const A = String(a).split(".").map(Number), B = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { if ((A[i] || 0) > (B[i] || 0)) return true; if ((A[i] || 0) < (B[i] || 0)) return false; } return false; };
        if (live && j && j.version && newer(j.version, mine)) setUpdate(j);
      } catch {}
    })();
    return () => { live = false; };
  }, []);

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
  const role = acct && acct.role; // local-roster role: "creator" | "complimentary"
  const planLabel = role === "creator" ? "Creator" : role === "complimentary" ? "Complimentary"
    : st === "active" ? (plan || "Pro plan") : st === "trialing" ? `Trial · ${acct ? acct.daysLeft : 0}d left` : st === "expired" ? "Trial ended" : (acct ? "Account" : "Sign in");
  const signOut = async () => { setMenuOpen(false); try { await bridge.authSignOut?.(); } catch {} try { location.reload(); } catch {} };
  const manage = async () => { setMenuOpen(false); if (st === "active" && bridge.billingPortal) { try { await bridge.billingPortal(); } catch {} } else { upgrade(); } };
  // "Get help" was removed from the menu — it duplicated User Guide exactly
  // (and Sage floats on every screen for live questions).

  // Default-response-language picker, lives in the account menu now.
  const [lang, setLang] = useState("model");
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => { bridge.getSettings?.().then((s) => { if (s) setLang(s.responseLanguage || "model"); }).catch(() => {}); }, []);
  const setLanguage = async (v) => { setLang(v); try { const s = await bridge.getSettings(); await bridge.saveSettings({ ...s, responseLanguage: v }); } catch {} };
  const LANGS = [["model", "Default (model decides)"], ["English", "English"], ["Spanish", "Spanish"], ["French", "French"], ["German", "German"], ["Italian", "Italian"], ["Portuguese", "Portuguese"], ["Hindi", "Hindi"], ["Arabic", "Arabic"], ["Chinese", "Chinese"], ["Japanese", "Japanese"], ["Korean", "Korean"], ["Russian", "Russian"]];
  const isComp = role === "complimentary" || (acct && acct.subscription && acct.subscription.plan === "Complimentary");
  const isCreator = role === "creator";
  // Treat Creator/Complimentary like a settled paid account: no trial/upgrade nags.
  const paidSub = isCreator || (acct && acct.subscription && acct.subscription.active && !isComp);
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
    // Agent/team-bound conversations live on the Agents screen, not the general recents.
    bridge.listSessions(historyMode, "exclude").then((l) => { if (live) setRecents(l || []); }).catch(() => {});
    return () => { live = false; };
  }, [historyMode, refreshKey]);

  const newLabel = { chat: "New chat", cowork: "New task", code: "New session" }[historyMode] || "New chat";

  // Global DEEP search: 3+ characters searches message content everywhere (debounced),
  // shorter queries filter visible titles like before.
  const [deep, setDeep] = useState(null); // null = title filtering; array = content results w/ snippets
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 3 || !bridge.searchSessions) { setDeep(null); return; }
    const t = setTimeout(() => bridge.searchSessions(needle, historyMode).then((r) => setDeep(r || [])).catch(() => setDeep(null)), 250);
    return () => clearTimeout(t);
  }, [q, historyMode, refreshKey]);
  const shown = deep !== null ? deep : (q ? recents.filter((it) => (it.title || "").toLowerCase().includes(q.toLowerCase())) : recents);

  // Export a conversation as Markdown — readable anywhere, prints to PDF from any editor/browser.
  const exportConv = async (id, title) => {
    try {
      const conv = await bridge.getSession(id);
      if (!conv) return;
      const md = `# ${conv.title || "Conversation"}\n\n_Exported from BrainEdge · ${new Date().toLocaleString()}_\n\n` +
        (conv.messages || []).map((m) => `**${m.role === "user" ? "You" : "BrainEdge"}**\n\n${m.content}`).join("\n\n---\n\n");
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(title || conv.title || "chat").replace(/[^\w\- ]+/g, "").slice(0, 50) || "chat"}.md`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  };

  return (
    <aside className="sidebar glass">
      <button className="sb-new" onClick={onNew}><Plus size={16} /> <span className="sb-t">{newLabel}</span></button>

      {TOP.filter((t) => !extraOff(t.id)).map(navBtn)}

      <button className={`nav-item nav-group ${INTERFACE.some((t) => t.id === active) ? "active-within" : ""}`} onClick={() => setIfaceOpen((o) => !o)}>
        <LayoutGrid size={16} /> <span className="sb-t">Interface</span>
        <span className="nav-caret sb-t">{ifaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {ifaceOpen && INTERFACE.filter((t) => !extraOff(t.id)).map((t) => {
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

      {BOTTOM.filter((t) => !extraOff(t.id)).map(navBtn)}
      {isAdmin && qaHere && navBtn(ADMIN_ITEM)}

      <div className="sb-expand">
        <div className="nav-label" style={{ marginTop: 10 }}>Recents</div>
        <div className="sb-search">
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats…" />
        </div>
        <div className="sb-recents scroll">
          {recents.length === 0 && <div className="sb-empty">Nothing here yet — your conversations will live here. Start one above ↑</div>}
          {recents.length > 0 && shown.length === 0 && <div className="sb-empty">No matches{q.trim().length >= 3 ? " anywhere in your chats" : ""} — try different words.</div>}
          {shown.slice(0, 100).map((it) => (
            <div key={it.id} className={`sb-rec ${it.id === activeConvId ? "active" : ""}`} onClick={() => onOpenSession(it.id)} title={it.title}>
              <span className="sb-rec-main">
                <span className="sb-rec-title">{it.title || "Untitled"}</span>
                {deep !== null && it.snippet && it.snippet !== it.title && <span className="sb-rec-snip">…{it.snippet}…</span>}
              </span>
              <button className="sb-rec-del" title="Export as Markdown" onClick={(e) => { e.stopPropagation(); exportConv(it.id, it.title); }}><Download size={12} /></button>
              <button className="sb-rec-del" title="Delete" onClick={(e) => { e.stopPropagation(); onDeleteSession(it.id); }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Update-available banner (desktop; appears only when the server announces a newer version) */}
      {update && (
        <div className="sb-upsell sb-t">
          <div className="sb-upsell-row"><Download size={13} /> <span>Update available · v{update.version}</span></div>
          <button className="sb-upsell-btn" onClick={() => { try { update.url ? bridge.openExternal?.(update.url) : null; } catch {} }}>{update.url ? "Download" : "See site"}</button>
        </div>
      )}

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
      {/* Account: avatar/name trigger + a popover menu */}
      <div style={{ position: "relative" }}>
        {menuOpen && (
          <>
            <div className="sb-acct-scrim" onClick={() => setMenuOpen(false)} />
            <div className="sb-acct-menu">
              {u && u.email && <div className="sb-acct-email">{u.email}</div>}
              <button className="sb-acct-item" onClick={() => { setMenuOpen(false); onSelect("settings"); }}><SettingsIcon size={15} /> Settings</button>
              <button className="sb-acct-item" onClick={() => { setMenuOpen(false); onSelect("guide"); }}><BookOpen size={15} /> User Guide</button>
              <button className="sb-acct-item" onClick={() => setLangOpen((o) => !o)}>
                <Globe size={15} /> Language
                <span style={{ marginLeft: "auto", color: "var(--text-2)", fontSize: 11 }}>{lang === "model" ? "Auto" : lang}</span>
                <ChevronRight size={13} style={{ transition: "transform .15s", transform: langOpen ? "rotate(90deg)" : "none" }} />
              </button>
              {langOpen && (
                <div className="sb-acct-sub">
                  {LANGS.map(([v, label]) => (
                    <button key={v} className={`sb-acct-subitem ${lang === v ? "on" : ""}`} onClick={() => setLanguage(v)}>{label}{lang === v ? "  ✓" : ""}</button>
                  ))}
                </div>
              )}
              {(paidSub || (!isComp && (st === "trialing" || st === "expired"))) && <div className="sb-acct-div" />}
              {paidSub
                ? <button className="sb-acct-item" onClick={manage}><CreditCard size={15} /> Manage subscription</button>
                : (!isComp && (st === "trialing" || st === "expired")) ? <button className="sb-acct-item" onClick={() => { setMenuOpen(false); upgrade(); }}><Sparkles size={15} /> View plans</button> : null}
              <div className="sb-acct-div" />
              <button className="sb-acct-item" onClick={signOut}><LogOut size={15} /> Log out</button>
            </div>
          </>
        )}
        <button className={`sb-profile ${menuOpen || active === "settings" ? "active" : ""}`} onClick={() => setMenuOpen((o) => !o)} title="Account">
          {u && u.avatar
            ? <img className="sb-profile-av" src={u.avatar} alt="" />
            : <span className="sb-profile-av sb-profile-ini">{profileInitial}</span>}
          <span className="sb-t sb-profile-meta">
            <span className="sb-profile-name">{profileName}</span>
            <span className="sb-profile-sub">{planLabel}</span>
          </span>
          <ChevronRight className="sb-t sb-profile-gear" size={14} style={{ transition: "transform .15s", transform: menuOpen ? "rotate(90deg)" : "none" }} />
        </button>
      </div>
      <div className="sb-copyright sb-t">© 2026 BrainEdge · Proprietary</div>
    </aside>
  );
}
