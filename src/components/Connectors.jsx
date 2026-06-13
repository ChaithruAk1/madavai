import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Check, Search, Settings2, ChevronDown, Copy, ExternalLink, MousePointerClick } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
import { bridge } from "../bridge/index.js";
import { iconUrlFor, iconBySlug } from "../connectorIcons.js";

const BLANK = (id) => ({ id, name: "New connector", command: "npx", args: [], env: {}, enabled: true });

// Curated, popularity-ranked partner set — browsed + searched INSTANTLY client-side
// (no network), mirroring a polished app directory. "Add" resolves the real install
// spec from the MCP registry by `query`. Only connectors with a bundled brand icon are
// featured so the grid always shows real logos. Descriptions are Madav-native.
const FEATURED = [
  { key: "googledrive", title: "Google Drive", cat: "Productivity", rank: 1, badge: "", query: "google drive", desc: "Search, read, and upload files instantly." },
  { key: "gmail", title: "Gmail", cat: "Productivity", rank: 2, badge: "", query: "gmail", desc: "Draft replies, summarize threads, and search your inbox." },
  { key: "googlecalendar", title: "Google Calendar", cat: "Productivity", rank: 3, badge: "", query: "google calendar", desc: "Manage your schedule and coordinate meetings." },
  { key: "notion", title: "Notion", cat: "Productivity", rank: 4, badge: "", query: "notion", desc: "Search, update, and power workflows across your workspace." },
  { key: "slack", title: "Slack", cat: "Communication", rank: 5, badge: "", query: "slack", desc: "Send messages, create canvases, and fetch Slack data." },
  { key: "figma", title: "Figma", cat: "Design", rank: 6, badge: "trending", query: "figma", desc: "Generate diagrams and better code from Figma context." },
  { key: "github", title: "GitHub", cat: "Developer", rank: 7, badge: "", query: "github", desc: "Browse repos, open pull requests, and manage issues." },
  { key: "linear", title: "Linear", cat: "Developer", rank: 8, badge: "trending", query: "linear", desc: "Track issues, cycles, and projects." },
  { key: "jira", title: "Jira", cat: "Developer", rank: 9, badge: "", query: "jira", desc: "Access and update Jira issues and boards." },
  { key: "confluence", title: "Confluence", cat: "Productivity", rank: 10, badge: "", query: "confluence", desc: "Search and edit Confluence pages and spaces." },
  { key: "asana", title: "Asana", cat: "Productivity", rank: 11, badge: "", query: "asana", desc: "Manage tasks, projects, and timelines." },
  { key: "stripe", title: "Stripe", cat: "Data", rank: 12, badge: "new", query: "stripe", desc: "Query payments, customers, and invoices." },
  { key: "airtable", title: "Airtable", cat: "Data", rank: 13, badge: "", query: "airtable", desc: "Read and update bases, tables, and records." },
  { key: "dropbox", title: "Dropbox", cat: "Productivity", rank: 14, badge: "", query: "dropbox", desc: "Search, read, and share your files." },
  { key: "trello", title: "Trello", cat: "Productivity", rank: 15, badge: "", query: "trello", desc: "Manage boards, lists, and cards." },
  { key: "zapier", title: "Zapier", cat: "Developer", rank: 16, badge: "new", query: "zapier", desc: "Connect thousands of apps and automate workflows." },
  { key: "gitlab", title: "GitLab", cat: "Developer", rank: 17, badge: "", query: "gitlab", desc: "Manage repos, merge requests, and pipelines." },
  { key: "sentry", title: "Sentry", cat: "Developer", rank: 18, badge: "", query: "sentry", desc: "Track errors, issues, and performance." },
  { key: "vercel", title: "Vercel", cat: "Developer", rank: 19, badge: "", query: "vercel", desc: "Deployments, projects, and logs." },
  { key: "supabase", title: "Supabase", cat: "Data", rank: 20, badge: "trending", query: "supabase", desc: "Query your Postgres database, auth, and storage." },
  { key: "mongodb", title: "MongoDB", cat: "Data", rank: 21, badge: "", query: "mongodb", desc: "Query collections and documents." },
  { key: "hubspot", title: "HubSpot", cat: "Marketing", rank: 22, badge: "", query: "hubspot", desc: "CRM contacts, deals, and companies." },
  { key: "salesforce", title: "Salesforce", cat: "Marketing", rank: 23, badge: "", query: "salesforce", desc: "Records, opportunities, and reports." },
  { key: "zendesk", title: "Zendesk", cat: "Support", rank: 24, badge: "", query: "zendesk", desc: "Tickets, users, and help center." },
  { key: "intercom", title: "Intercom", cat: "Support", rank: 25, badge: "", query: "intercom", desc: "Conversations and customer records." },
  { key: "shopify", title: "Shopify", cat: "Data", rank: 26, badge: "", query: "shopify", desc: "Products, orders, and customers." },
  { key: "discord", title: "Discord", cat: "Communication", rank: 27, badge: "", query: "discord", desc: "Read and post to your servers." },
  { key: "teams", title: "Microsoft Teams", cat: "Communication", rank: 28, badge: "", query: "microsoft teams", desc: "Chats, channels, and meetings." },
  { key: "outlook", title: "Outlook", cat: "Productivity", rank: 29, badge: "", query: "outlook", desc: "Mail and calendar." },
  { key: "googlesheets", title: "Google Sheets", cat: "Data", rank: 30, badge: "", query: "google sheets", desc: "Read and update spreadsheets." },
  { key: "clickup", title: "ClickUp", cat: "Productivity", rank: 31, badge: "", query: "clickup", desc: "Tasks, docs, and goals." },
  { key: "monday", title: "Monday.com", cat: "Productivity", rank: 32, badge: "", query: "monday", desc: "Boards, items, and updates." },
  { key: "calendly", title: "Calendly", cat: "Productivity", rank: 33, badge: "", query: "calendly", desc: "Scheduling and event types." },
  { key: "todoist", title: "Todoist", cat: "Productivity", rank: 34, badge: "", query: "todoist", desc: "Tasks and projects." },
  { key: "box", title: "Box", cat: "Productivity", rank: 35, badge: "", query: "box", desc: "Files and folders." },
  { key: "pagerduty", title: "PagerDuty", cat: "Developer", rank: 36, badge: "", query: "pagerduty", desc: "Incidents and on-call schedules." },
  { key: "sentryx", title: "Cloudflare", cat: "Developer", rank: 37, badge: "", query: "cloudflare", desc: "DNS, workers, and analytics." },
  { key: "spotify", title: "Spotify", cat: "Data", rank: 38, badge: "", query: "spotify", desc: "Search tracks, playlists, and playback." },
];
const CATEGORIES = ["All", "Productivity", "Developer", "Design", "Communication", "Data"];

// One-click connectors served by your hosted Madav gateway (OAuth — sign in with the browser,
// no token to paste). Change GATEWAY_BASE if you redeploy the gateway elsewhere.
const GATEWAY_BASE = "https://madav-gateway.onrender.com";

// Native broker endpoints — your OWN registered OAuth apps, brokered at /<key>/mcp. $0, with
// no third party in the token path. (Google's gmail/drive use restricted scopes that require
// app verification, so those are served one-click via Composio below instead of natively.)
const GATEWAY = [
  { key: "github", title: "GitHub", desc: "Browse repos, search issues, and open pull requests.", beta: false },
  { key: "notion", title: "Notion", desc: "Search and read your Notion workspace.", beta: false },
  { key: "slack", title: "Slack", desc: "List channels and post messages.", beta: false },
];
const GATEWAY_KEYS = { github: "github", notion: "notion", slack: "slack" };

// Composio managed-auth endpoints — one-click for hundreds of apps with NO OAuth app to
// register yourself: Composio supplies the verified OAuth client and hosts the sign-in. The
// same gateway brokers them at /c/<slug>/mcp. Mirrors COMPOSIO_TOOLKITS in
// gateway/src/composio.js — keep the two in sync (slug must match Composio's toolkit slug).
// Apps already served natively above (github/notion/slack) are omitted to avoid duplicate cards.
const COMPOSIO = [
  { slug: "gmail",          title: "Gmail",           icon: "gmail",          desc: "Search, read, and draft email." },
  { slug: "googledrive",    title: "Google Drive",    icon: "googledrive",    desc: "Search and read your Drive files." },
  { slug: "googlecalendar", title: "Google Calendar", icon: "googlecalendar", desc: "Read and manage events on your calendar." },
  { slug: "googlesheets",   title: "Google Sheets",   icon: "googlesheets",   desc: "Read and update spreadsheets." },
  { slug: "linear",         title: "Linear",          icon: "linear",         desc: "Track issues, cycles, and projects." },
  { slug: "jira",           title: "Jira",            icon: "jira",           desc: "Access and update issues and boards." },
  { slug: "asana",          title: "Asana",           icon: "asana",          desc: "Manage tasks, projects, and timelines." },
  { slug: "trello",         title: "Trello",          icon: "trello",         desc: "Manage boards, lists, and cards." },
  { slug: "hubspot",        title: "HubSpot",         icon: "hubspot",        desc: "CRM contacts, deals, and companies." },
  { slug: "salesforce",     title: "Salesforce",      icon: "salesforce",     desc: "Records, opportunities, and reports." },
  { slug: "zendesk",        title: "Zendesk",         icon: "zendesk",        desc: "Tickets, users, and the help center." },
  { slug: "discord",        title: "Discord",         icon: "discord",        desc: "Read and post to your servers." },
  { slug: "airtable",       title: "Airtable",        icon: "airtable",       desc: "Read and update bases, tables, and records." },
  { slug: "calendly",       title: "Calendly",        icon: "calendly",       desc: "Scheduling links and event types." },
  { slug: "dropbox",        title: "Dropbox",         icon: "dropbox",        desc: "Search, read, and share your files." },
  { slug: "figma",          title: "Figma",           icon: "figma",          desc: "Read design files, comments, and file data." },
  { slug: "gitlab",         title: "GitLab",          icon: "gitlab",         desc: "Manage repos, issues, merge requests, and pipelines." },
  { slug: "clickup",        title: "ClickUp",         icon: "clickup",        desc: "Create tasks, docs, and manage projects." },
  { slug: "todoist",        title: "Todoist",         icon: "todoist",        desc: "Create tasks, projects, and reminders." },
  { slug: "intercom",       title: "Intercom",        icon: "intercom",       desc: "Read conversations and contacts, and reply to support." },
  { slug: "confluence",     title: "Confluence",      icon: "confluence",     desc: "Create and search pages and spaces." },
  { slug: "box",            title: "Box",             icon: "box",            desc: "Upload, fetch, and share files and folders." },
  { slug: "monday",         title: "Monday.com",      icon: "monday",         desc: "Manage boards, items, and updates." },
  { slug: "microsoft_teams",title: "Microsoft Teams", icon: "teams",          desc: "Send messages and manage channels and chats." },
  { slug: "outlook",        title: "Outlook",         icon: "outlook",        desc: "Mail and calendar." },
  { slug: "canva",          title: "Canva",           icon: "canva",          desc: "Create designs, templates, and brand assets." },
  { slug: "one_drive",      title: "OneDrive",        icon: "one_drive",      desc: "Find, upload, and share files and folders." },
  { slug: "share_point",    title: "SharePoint",      icon: "share_point",    desc: "Manage sites, document libraries, and lists." },
];
const COMPOSIO_KEYS = COMPOSIO.map((t) => t.slug);
// Real brand logos, Claude-style. The app is online-only, so we resolve full-color logos from
// a logo service rather than shipping every brand asset. Composio serves one per toolkit slug.
const composioLogo = (slug) => (slug ? `https://logos.composio.dev/api/${slug}` : null);
// Map a gateway connector URL to a logo slug — covers BOTH Composio (/c/<slug>/mcp) and native
// (/<key>/mcp) gateway endpoints, so native providers also resolve a brand logo (not a monogram).
const GATEWAY_LOGO_SLUG = { github: "github", notion: "notion", slack: "slack", gmail: "gmail", gdrive: "googledrive" };
const composioSlugFromUrl = (u) => {
  if (!u || !u.startsWith(GATEWAY_BASE)) return null;
  const m = /\/(?:c\/)?([^/]+)\/mcp/.exec(u);
  return m ? (GATEWAY_LOGO_SLUG[m[1]] || m[1]) : null;
};

// Single source of truth for a card's logo URL. Cards pass an explicit `logo` (the Composio
// toolkit logo, by slug); registry/custom servers fall back to the site's favicon by domain.
// Swap the provider here (e.g. logo.dev or Clearbit) to change the logo source app-wide.
const logoFor = (item) => {
  if (item.logo) return item.logo;
  const d = iconDomain(item);
  return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=64` : null;
};

// Per-connector overview shown in the detail panel (Claude-style: tagline, description,
// developer, tools, and reference links). Unknown connectors fall back to a generic card.
const CONNECTOR_INFO = {
  github: {
    tagline: "Browse repos, search issues, and open pull requests.",
    desc: "Connect your GitHub account to give Madav access to your repositories. Attach repo files in Chat, sync a codebase into a Project for context, and browse branches or open pull requests while you build.",
    developer: { name: "GitHub", url: "https://github.com" },
    tools: ["github_list_repos", "github_search_issues", "github_create_issue"],
    docs: "https://docs.github.com", support: "https://support.github.com",
    privacy: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
  },
  gmail: {
    tagline: "Draft replies, summarize threads, & search your inbox.",
    desc: "Connect Gmail to let Madav quickly find important emails and understand long conversations. Madav can search your messages, read entire threads for context, and help you stay on top of your inbox — great for catching up on chains you missed or preparing for meetings.",
    developer: { name: "Google", url: "https://google.com" },
    tools: ["gmail_search", "gmail_read"],
    docs: "https://developers.google.com/gmail/api", support: "https://support.google.com/mail",
    privacy: "https://policies.google.com/privacy",
  },
  "google drive": {
    tagline: "Search and read your Drive files.",
    desc: "Connect Google Drive so Madav can find and read your files — search across your Drive and pull document text in as context for whatever you're working on.",
    developer: { name: "Google", url: "https://google.com" },
    tools: ["gdrive_search", "gdrive_read"],
    docs: "https://developers.google.com/drive", support: "https://support.google.com/drive",
    privacy: "https://policies.google.com/privacy",
  },
  notion: {
    tagline: "Search and read your workspace.",
    desc: "Connect Notion to search pages and databases and pull workspace content into your work across Chat, Cowork, and Projects.",
    developer: { name: "Notion", url: "https://notion.so" },
    tools: ["notion_search"],
    docs: "https://developers.notion.com", support: "https://www.notion.so/help",
    privacy: "https://www.notion.so/privacy",
  },
  slack: {
    tagline: "List channels and post messages.",
    desc: "Connect Slack to read channels, fetch recent messages, and post updates to a channel from inside Madav.",
    developer: { name: "Slack", url: "https://slack.com" },
    tools: ["slack_list_channels", "slack_post_message"],
    docs: "https://api.slack.com", support: "https://slack.com/help",
    privacy: "https://slack.com/trust/privacy/privacy-policy",
  },
};
function infoFor(sel) {
  const n = (sel.name || "").toLowerCase();
  for (const k of Object.keys(CONNECTOR_INFO)) if (n.includes(k)) return CONNECTOR_INFO[k];
  return { tagline: "Connected app", desc: "Once connected, this connector's tools are available to the agent in Chat, Cowork, Code, and Projects.", developer: null, tools: [], docs: null, support: null, privacy: null };
}
const openExt = (url) => { try { (bridge.openExternal || window.open)(url); } catch { try { window.open(url, "_blank"); } catch {} } };

// Remove competitor branding that leaks in from registry descriptions.
const scrub = (t) => String(t || "")
  .replace(/\bclaude\b/gi, "Madav")
  .replace(/\banthropic\s*&\s*partners\b/gi, "Madav & Partners")
  .replace(/\banthropic\b/gi, "Madav");

export default function Connectors() {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [status, setStatus] = useState("");
  const [tools, setTools] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sortBy, setSortBy] = useState("popular");
  const [reg, setReg] = useState([]);          // registry fallback results
  const [regMsg, setRegMsg] = useState("");
  const [adding, setAdding] = useState("");     // featured key being added
  const [auth, setAuth] = useState({ connected: false });   // OAuth status for the selected remote connector
  const [signingIn, setSigningIn] = useState(false);
  const [draft, setDraft] = useState(null);   // a connector being set up but NOT yet saved; persisted to the list only on first successful connect

  useEffect(() => {
    bridge.getSettings().then((cfg) => setS({ ...cfg, connectors: cfg.connectors || [] }));
  }, []);

  // Registry fallback — only when the user is searching for something the curated set
  // doesn't cover. Debounced so it never gets in the way of the instant local filter.
  useEffect(() => {
    if (!bridge.listConnectorDirectory) { setReg([]); setRegMsg(""); return; }
    const term = q.trim();
    setRegMsg(term ? "Searching the registry…" : "");
    const t = setTimeout(() => {
      bridge.listConnectorDirectory({ search: term }).then((r) => {
        setReg(r.items || []);
        setRegMsg("");
      }).catch(() => setRegMsg("Couldn't reach the registry."));
    }, term ? 350 : 0);
    return () => clearTimeout(t);
  }, [q]);

  // Instant client-side filter over the curated set. (Declared before any early return
  // so the hook order is stable across renders.)
  const featured = useMemo(() => {
    const term = q.trim().toLowerCase();
    const covered = new Set([...Object.values(GATEWAY_KEYS), ...COMPOSIO_KEYS]);
    const composioTitles = new Set(COMPOSIO.map((t) => t.title.toLowerCase()));
    let arr = FEATURED.filter((f) => !covered.has(f.key) && !composioTitles.has(f.title.toLowerCase()) && (cat === "All" || f.cat === cat));
    if (term) arr = arr.filter((f) => (f.title + " " + f.desc + " " + f.cat).toLowerCase().includes(term));
    arr = [...arr];
    if (sortBy === "name") arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "new") arr.sort((a, b) => (b.badge === "new") - (a.badge === "new") || a.rank - b.rank);
    else arr.sort((a, b) => a.rank - b.rank);
    return arr;
  }, [q, cat, sortBy]);

  // OAuth status for the selected remote connector (hook stays above the early return).
  useEffect(() => {
    const cur = (s && s.connectors || []).find((c) => c.id === selId);
    if (cur && cur.url && bridge.connectorAuthStatus) bridge.connectorAuthStatus(cur.id).then(setAuth).catch(() => setAuth({ connected: false }));
    else setAuth({ connected: false });
  }, [selId, s]);

  if (!s) return <div className="empty"><div>Loading…</div></div>;
  const list = s.connectors;
  const sel = list.find((c) => c.id === selId) || (draft && draft.id === selId ? draft : null);
  const editingDraft = !!(draft && selId === draft.id && !list.some((c) => c.id === selId));

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); };
  const setConnectors = (cs) => persist({ ...s, connectors: cs });
  const openDraft = (conn) => { setDraft(conn); setSelId(conn.id); setTools(null); setStatus(""); };
  // Save a not-yet-saved connector into the list — called only after a successful first connect.
  const commitDraft = () => { if (editingDraft) { setConnectors([...list, { ...sel }]); setDraft(null); } };
  const patchMany = (obj) => { if (editingDraft) { setDraft((d) => ({ ...d, ...obj })); return; } setConnectors(list.map((c) => (c.id === selId ? { ...c, ...obj } : c))); };
  const patch = (field, val) => patchMany({ [field]: val });
  const setType = (remote) => remote
    ? patchMany({ url: sel.url || "", transport: sel.transport || "http", command: undefined, args: undefined })
    : patchMany({ command: sel.command || "npx", args: sel.args || [], url: undefined, transport: undefined });

  const rankLabel = (r) => (r === 1 ? "Most popular" : `#${r} popular`);
  const has = (name) => list.some((c) => c.name && name && c.name.toLowerCase() === name.toLowerCase());

  // Registry items that AREN'T already in the curated set (avoid duplicates).
  const covered = new Set([...FEATURED.map((f) => f.title.toLowerCase()), ...FEATURED.map((f) => f.query.toLowerCase()), ...GATEWAY.map((g) => g.title.toLowerCase()), ...COMPOSIO.map((t) => t.title.toLowerCase())]);
  const regShown = reg
    .filter((it) => { const t = (it.title || "").toLowerCase(); return t && !covered.has(t); })
    .slice(0, 80);

  const addGateway = (g) => {
    const url = `${GATEWAY_BASE}/${g.key}/mcp`;
    const existing = list.find((c) => c.url === url || c.name.toLowerCase() === g.title.toLowerCase());
    if (existing) { setDraft(null); setSelId(existing.id); setTools(null); setStatus(""); return; }
    openDraft({ id: "c_" + Math.random().toString(36).slice(2, 7), name: g.title, url, transport: "http", enabled: true });
  };
  const addComposio = (t) => {
    const url = `${GATEWAY_BASE}/c/${t.slug}/mcp`;
    const existing = list.find((c) => c.url === url || c.name.toLowerCase() === t.title.toLowerCase());
    if (existing) { setDraft(null); setSelId(existing.id); setTools(null); setStatus(""); return; }
    openDraft({ id: "c_" + Math.random().toString(36).slice(2, 7), name: t.title, url, transport: "http", enabled: true });
  };
  const addFeatured = async (f) => {
    if (has(f.title)) { const e = list.find((c) => c.name.toLowerCase() === f.title.toLowerCase()); setDraft(null); setSelId(e.id); setTools(null); setStatus(""); return; }
    setAdding(f.key); setStatus("");
    try {
      const r = bridge.listConnectorDirectory ? await bridge.listConnectorDirectory({ search: f.query }) : { items: [] };
      const hit = (r.items || []).find((it) => it.connector) || null;
      const id = "c_" + Math.random().toString(36).slice(2, 7);
      if (hit && hit.connector) {
        openDraft({ id, ...hit.connector, name: f.title });
        if (hit.connector.url) setStatus(`${f.title} is a hosted (remote) connector — confirm its Server URL below and sign in / add a token, then Test. Many cloud apps require the provider's own MCP endpoint + OAuth.`);
      } else {
        // No registry match — open a pre-named custom setup so the user can finish it.
        openDraft({ ...BLANK(id), name: f.title });
        setStatus(`${f.title} needs manual setup — add its command/URL below.`);
      }
    } finally { setAdding(""); }
  };
  const addFromRegistry = (item) => {
    if (!item.connector) { setStatus(`${scrub(item.title)} isn't one-click installable (package type: ${item.kind}).`); return; }
    if (has(item.connector.name)) { const e = list.find((c) => c.name.toLowerCase() === item.connector.name.toLowerCase()); setDraft(null); setSelId(e.id); setTools(null); setStatus(""); return; }
    openDraft({ id: "c_" + Math.random().toString(36).slice(2, 7), ...item.connector });
  };
  const addCustom = () => openDraft(BLANK("c_" + Math.random().toString(36).slice(2, 7)));
  const remove = () => {
    if (editingDraft) { setDraft(null); setSelId(null); setTools(null); setStatus(""); return; }
    setConnectors(list.filter((c) => c.id !== selId)); setSelId(null);
  };

  const doSignIn = async () => {
    if (!sel || !bridge.connectorSignIn) return;
    setSigningIn(true); setStatus("Opening your browser to sign in…"); setTools(null);
    try {
      const r = await bridge.connectorSignIn(sel);
      if (r && r.ok) { setAuth({ connected: true }); setTools(r.tools || null); setStatus(`Signed in — ${(r.tools || []).length} tools available.`); commitDraft(); }
      else setStatus("Sign-in failed: " + ((r && r.error) || "unknown error"));
    } finally { setSigningIn(false); }
  };
  const doSignOut = async () => {
    if (!sel || !bridge.connectorSignOut) return;
    await bridge.connectorSignOut(sel.id); setAuth({ connected: false }); setTools(null); setStatus("Signed out.");
  };

  const test = async () => {
    setStatus("Connecting…"); setTools(null);
    const r = await bridge.testConnector(sel);
    if (r.ok) { setTools(r.tools); setStatus(`Connected — ${r.tools.length} tools`); commitDraft(); }
    else setStatus("Failed: " + r.error);
  };

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Connect your apps<HelpDot mode="connectors" section="what" /></h2>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 0 }}>
        Browse popular connectors below, or search for any of thousands more. Cloud apps need a quick sign-in or token.
        Connected apps are available to the agent in Chat, Cowork, Code, and Projects.
      </p>

      {!sel && <>
      {list.length > 0 && (
        <>
          <div className="nav-label" style={{ paddingLeft: 0 }}>Connected<HelpDot mode="connectors" section="usage" /></div>
          <div className="conn-mini-grid">
            {list.map((c) => (
              <button key={c.id} className="conn-minicard" onClick={() => { setDraft(null); setSelId(c.id); setTools(null); setStatus(""); }}>
                <ConnectorIcon item={{ title: c.name, name: c.name, iconKey: composioSlugFromUrl(c.url), logo: composioLogo(composioSlugFromUrl(c.url)) }} />
                <span className="conn-minicard-main">
                  <b>{c.name}</b>
                  <span className="conn-minicard-sub"><span className={`conn-minidot ${c.enabled ? "on" : ""}`} /> {c.enabled ? "Connected" : "Off"}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="nav-label" style={{ paddingLeft: 0, marginTop: list.length ? 22 : 0 }}>Add a connector</div>
      <div className="cdir-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search connectors…" /></div>

      <div className="cdir-bar">
        <span style={{ flex: 1 }} />
        <label className="cdir-selwrap">
          <select className="cdir-select" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c === "All" ? "Filter by" : c}</option>)}
          </select>
        </label>
        <label className="cdir-selwrap">
          <select className="cdir-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="popular">Sort by: Popular</option>
            <option value="name">Sort by: Name</option>
            <option value="new">Sort by: Newest</option>
          </select>
        </label>
      </div>

      <div className="cdir-grid">
        {GATEWAY.filter((g) => { const t = q.trim().toLowerCase(); return !t || (g.title + " " + g.desc).toLowerCase().includes(t); }).map((g) => {
          const url = `${GATEWAY_BASE}/${g.key}/mcp`;
          const added = list.some((c) => c.url === url || c.name.toLowerCase() === g.title.toLowerCase());
          return (
            <div key={g.key} className="cdir-card" onClick={() => addGateway(g)}>
              <div className="cdir-cardhead">
                <ConnectorIcon item={{ title: g.title, name: GATEWAY_KEYS[g.key], iconKey: g.key }} />
                <div className="cdir-titles">
                  <div className="cdir-name">{g.title}
                    {g.beta && <span className="cdir-tag trending">Beta</span>}
                    <span className="cdir-oneclick" title="One-click — sign in with your browser"><MousePointerClick size={12} /></span>
                  </div>
                </div>
                <button className={`cdir-add ${added ? "on" : ""}`} title={added ? "Open" : "Add connector"} onClick={(e) => { e.stopPropagation(); addGateway(g); }}>
                  {added ? <Settings2 size={15} /> : <Plus size={16} />}
                </button>
              </div>
              <div className="cdir-desc">{g.desc}</div>
            </div>
          );
        })}
        {COMPOSIO.filter((t) => { const term = q.trim().toLowerCase(); return !term || (t.title + " " + t.desc).toLowerCase().includes(term); }).map((t) => {
          const url = `${GATEWAY_BASE}/c/${t.slug}/mcp`;
          const added = list.some((c) => c.url === url || c.name.toLowerCase() === t.title.toLowerCase());
          return (
            <div key={t.slug} className="cdir-card" onClick={() => addComposio(t)}>
              <div className="cdir-cardhead">
                <ConnectorIcon item={{ title: t.title, name: t.icon, iconKey: t.slug, logo: composioLogo(t.slug) }} />
                <div className="cdir-titles">
                  <div className="cdir-name">{t.title}
                    <span className="cdir-oneclick" title="One-click via Composio"><MousePointerClick size={12} /></span>
                  </div>
                </div>
                <button className={`cdir-add ${added ? "on" : ""}`} title={added ? "Open" : "Add connector"} onClick={(e) => { e.stopPropagation(); addComposio(t); }}>
                  {added ? <Settings2 size={15} /> : <Plus size={16} />}
                </button>
              </div>
              <div className="cdir-desc">{t.desc}</div>
            </div>
          );
        })}
        {featured.map((f) => {
          const added = has(f.title);
          const busy = adding === f.key;
          return (
            <div key={f.key} className="cdir-card" onClick={() => addFeatured(f)}>
              <div className="cdir-cardhead">
                <ConnectorIcon item={{ title: f.title, name: f.key, iconKey: f.key, logo: composioLogo(f.key) }} />
                <div className="cdir-titles">
                  <div className="cdir-name">
                    {f.title}
                    {f.badge === "new" && <span className="cdir-tag new">New</span>}
                    {f.badge === "trending" && <span className="cdir-tag trending">↗ Trending</span>}
                  </div>
                  <div className="cdir-rank">{rankLabel(f.rank)}</div>
                </div>
                <button className={`cdir-add ${added ? "on" : ""}`} title={added ? "Configure" : "Add connector"}
                  disabled={busy} onClick={(e) => { e.stopPropagation(); addFeatured(f); }}>
                  {busy ? <RefreshCw size={15} className="spin" /> : added ? <Settings2 size={15} /> : <Plus size={16} />}
                </button>
              </div>
              <div className="cdir-desc">{f.desc}</div>
            </div>
          );
        })}
      </div>

      {(regShown.length > 0 || q.trim()) && (
        <>
          <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18 }}>{q.trim() ? "More from the registry" : "More connectors"}</div>
          {regMsg && <div className="cdir-msg">{regMsg}</div>}
          {!regMsg && regShown.length === 0 && q.trim() && <div className="cdir-msg">No other connectors match “{q.trim()}”.</div>}
          <div className="cdir-grid">
            {regShown.map((item) => {
              const cname = item.connector && item.connector.name;
              const added = cname && has(cname);
              return (
                <div key={item.name} className="cdir-card" onClick={() => addFromRegistry(item)}>
                  <div className="cdir-cardhead">
                    <ConnectorIcon item={item} />
                    <div className="cdir-titles">
                      <div className="cdir-name">{scrub(item.title)}
                        <span className="cdir-tag kind">{item.kind === "remote" ? "Remote" : "Local"}</span>
                      </div>
                      <div className="cdir-id">{item.name}</div>
                    </div>
                    <button className={`cdir-add ${added ? "on" : ""}`} title={added ? "Added" : "Add connector"} onClick={(e) => { e.stopPropagation(); addFromRegistry(item); }}>
                      {added ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  </div>
                  {item.description && <div className="cdir-desc">{scrub(item.description)}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}
      <button className="conn-customrow" onClick={addCustom}><Plus size={15} /> Add a custom MCP server</button>
      </>}

      {sel && (() => {
        const isRemote = !!(sel.url != null || sel.transport != null);
        const info = infoFor(sel);
        return (
        <div>
          <button className="btn ghost" style={{ marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => { setDraft(null); setSelId(null); setTools(null); setStatus(""); }}>
            ← All connectors
          </button>
          <div style={{ maxWidth: 720 }}>
            {/* Claude-style overview header */}
            <div className="conn-head">
              <span className="conn-headico"><ConnectorIcon item={{ title: sel.name, name: sel.name, iconKey: composioSlugFromUrl(sel.url), logo: composioLogo(composioSlugFromUrl(sel.url)) }} /></span>
              <div className="conn-headmain">
                <h3 className="conn-headname">{sel.name}</h3>
                <div className="conn-tagline">{info.tagline}</div>
              </div>
              {isRemote && (auth.connected
                ? <button className="btn ghost" onClick={doSignOut}>Disconnect</button>
                : <button className="btn" disabled={signingIn} onClick={doSignIn}>{signingIn ? <RefreshCw size={14} className="spin" /> : null} Connect</button>)}
              <button className="btn ghost danger" title="Remove connector" onClick={remove}><Trash2 size={14} /></button>
            </div>

            <p className="conn-blurb">{info.desc}</p>
            {info.developer && <p className="conn-dev">Developed by <a className="conn-link" href="#" onClick={(e) => { e.preventDefault(); openExt(info.developer.url); }}>{info.developer.name} <ExternalLink size={11} /></a></p>}
            <p className="conn-trust">Only use connectors from developers you trust. Madav can't verify that third-party tools will work as intended or that they won't change.</p>

            {status && <div className="cdir-msg" style={{ marginTop: 8, color: status.startsWith("Failed") ? "var(--danger)" : "var(--text-2)" }}>{status}</div>}

            {/* Tools */}
            {(() => {
              const tl = (tools && tools.length) ? tools : info.tools;
              return (tl && tl.length) ? (
                <div className="conn-sec">
                  <div className="conn-sec-h">Tools <span className="conn-count">{tl.length}</span><span style={{ flex: 1 }} />
                    <button className="btn ghost conn-mini" onClick={test}><RefreshCw size={13} /> {tools ? "Re-check" : "Check"}</button>
                  </div>
                  <div className="conn-tools">{tl.map((t) => <span key={t} className="conn-tool">{t}</span>)}</div>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}><button className="btn" onClick={test}><RefreshCw size={14} /> Test connection</button></div>
              );
            })()}

            {/* Details */}
            <div className="conn-sec">
              <div className="conn-sec-h">Details</div>
              <div className="conn-detgrid">
                {info.developer && <div><div className="conn-k">Author</div><a className="conn-link" href="#" onClick={(e) => { e.preventDefault(); openExt(info.developer.url); }}>{info.developer.name} <ExternalLink size={11} /></a></div>}
                {sel.url && <div><div className="conn-k">Connector URL</div><span className="conn-url">{sel.url}<button className="conn-copy" title="Copy" onClick={() => { try { navigator.clipboard.writeText(sel.url); } catch {} }}><Copy size={12} /></button></span></div>}
              </div>
            </div>

            {/* More info */}
            {(info.docs || info.support || info.privacy) && (
              <div className="conn-sec">
                <div className="conn-sec-h">More info</div>
                <div className="conn-links">
                  {info.docs && <a className="conn-link" href="#" onClick={(e) => { e.preventDefault(); openExt(info.docs); }}>Documentation <ExternalLink size={11} /></a>}
                  {info.support && <a className="conn-link" href="#" onClick={(e) => { e.preventDefault(); openExt(info.support); }}>Support <ExternalLink size={11} /></a>}
                  {info.privacy && <a className="conn-link" href="#" onClick={(e) => { e.preventDefault(); openExt(info.privacy); }}>Privacy Policy <ExternalLink size={11} /></a>}
                </div>
              </div>
            )}

            {/* Settings tucked away — Claude hides the plumbing too */}
            <details className="conn-settings">
              <summary>Connection settings</summary>
              <div style={{ marginTop: 12 }}>
                <label className="chip" style={{ cursor: "pointer", marginBottom: 12, display: "inline-flex" }}>
                  <input type="checkbox" checked={sel.enabled} onChange={(e) => patch("enabled", e.target.checked)} style={{ marginRight: 6 }} /> enabled
                </label>
                <Field label="Display name"><input className="model-search" value={sel.name} onChange={(e) => patch("name", e.target.value)} /></Field>
                <Field label="Connection type">
                  <select className="model-search" value={isRemote ? "remote" : "local"} onChange={(e) => setType(e.target.value === "remote")}>
                    <option value="local">Local — runs an MCP command on this computer</option>
                    <option value="remote">Remote — connects to a hosted MCP server URL</option>
                  </select>
                </Field>
                {isRemote ? (
                  <>
                    <Field label="Server URL"><input className="model-search" value={sel.url || ""} onChange={(e) => patch("url", e.target.value.trim())} placeholder="https://mcp.example.com/" /></Field>
                    <Field label="Transport">
                      <select className="model-search" value={sel.transport || "http"} onChange={(e) => patch("transport", e.target.value)}>
                        <option value="http">Streamable HTTP</option>
                        <option value="sse">SSE</option>
                      </select>
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Command"><input className="model-search" value={sel.command || ""} onChange={(e) => patch("command", e.target.value)} placeholder="npx" /></Field>
                    <Field label="Arguments (space-separated)">
                      <input className="model-search" value={(sel.args || []).join(" ")} onChange={(e) => patch("args", e.target.value.split(/\s+/).filter(Boolean))} placeholder="-y @modelcontextprotocol/server-filesystem C:\\path" />
                    </Field>
                  </>
                )}
                <Field label={isRemote ? "Headers / tokens (KEY=VALUE per line)" : "Environment / tokens (KEY=VALUE per line)"}>
                  <textarea className="model-search" rows={3} style={{ fontFamily: "var(--mono)", resize: "vertical" }}
                    value={Object.entries(sel.env || {}).map(([k, v]) => `${k}=${v}`).join("\n")}
                    onChange={(e) => { const env = {}; e.target.value.split("\n").forEach((l) => { const i = l.indexOf("="); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); patch("env", env); }}
                    placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=ghp_..." />
                </Field>
              </div>
            </details>
          </div>
        </div>
        );
      })()}
      {!sel && status && <div className="cdir-msg" style={{ marginTop: 10 }}>{status}</div>}
    </div>
  );
}

function iconDomain(item) {
  try {
    if (item.connector && item.connector.url) {
      const parts = new URL(item.connector.url).hostname.split(".");
      return parts.slice(-2).join(".");
    }
  } catch {}
  const ns = (item.name || "").split("/")[0];
  const segs = ns.split(".").filter(Boolean);
  if (segs.length >= 2) return [segs[1], segs[0]].join(".");
  return null;
}

const MONO = ["#6e7bff", "#38b2ac", "#e8893a", "#d6597b", "#7a5cf0", "#46a35a", "#c98a12", "#3a8fd6"];
const monoColor = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return MONO[h % MONO.length]; };

function ConnectorIcon({ item }) {
  // Bundled SVG first (offline-proof), then the real brand logo from Composio, then a monogram.
  const [failed, setFailed] = useState(false);
  // Online-first: full-color brand logo from the logo service, then a bundled SVG, then a monogram.
  const remote = failed ? null : logoFor(item);
  const url = remote || iconBySlug(item.iconKey) || iconUrlFor(`${item.title || ""} ${item.name || ""} ${iconDomain(item) || ""}`);
  if (url) {
    return (
      <span className="cdir-ico cdir-ico-img" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
        <img src={url} alt="" onError={() => setFailed(true)} />
      </span>
    );
  }
  return <span className="cdir-ico" style={{ background: monoColor(item.title) }}>{(item.title || "?").slice(0, 1).toUpperCase()}</span>;
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}
