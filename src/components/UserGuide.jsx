// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// The in-app User Guide: a full-page, searchable handbook covering every BrainEdge
// feature. Reached from the sidebar account menu (User Guide / Get help). All styling
// lives in src/userguide.css (.ug- prefix) — styles.css is never touched.
import { useEffect, useRef, useState } from "react";
import {
  BookOpen, Search, Copy, Check, Lightbulb, AlertTriangle, ShieldCheck, Info,
  Rocket, KeyRound, MessageCircle, Users, Hammer, FolderKanban, Shapes, Bot,
  Network, Layers, Clock, Globe, Mic, Plug, Send, BarChart3, Cpu, UserRound,
  LifeBuoy, GitBranch, Repeat
} from "lucide-react";
import "../userguide.css";

/* ----------------------------------------------------------------------------
   Small building blocks — every visual in the guide is built from these.
---------------------------------------------------------------------------- */

function Kbd({ children }) {
  return <kbd className="ug-kbd">{children}</kbd>;
}

function Chip({ children }) {
  return <span className="ug-chip">{children}</span>;
}

// Inline "open that screen now" button — wired to the app's mode switcher.
function Go({ nav, to, children }) {
  return (
    <button className="ug-go" onClick={() => nav && nav(to)}>
      {children} →
    </button>
  );
}

function Steps({ children }) {
  return <div className="ug-steps">{children}</div>;
}

function Step({ n, title, children }) {
  return (
    <div className="ug-step">
      <div className="ug-step-n">{n}</div>
      <div className="ug-step-body">
        <div className="ug-step-t">{title}</div>
        <div className="ug-step-d">{children}</div>
      </div>
    </div>
  );
}

const CALLOUT_ICONS = {
  info: Info,
  tip: Lightbulb,
  warn: AlertTriangle,
  ok: ShieldCheck,
  danger: AlertTriangle,
};

function Callout({ tone = "tip", title, children }) {
  const I = CALLOUT_ICONS[tone] || Lightbulb;
  const cls = tone === "warn" ? "warn" : tone === "ok" ? "ok" : tone === "danger" ? "danger" : "";
  return (
    <div className={`ug-callout ${cls}`}>
      <I size={16} />
      <div>
        {title && <div className="ug-callout-t">{title}</div>}
        <div className="ug-callout-b">{children}</div>
      </div>
    </div>
  );
}

// A copyable example block — prompts, commands, payloads.
function TryIt({ label = "Try it", text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {}
  };
  return (
    <div className="ug-try">
      <span className="ug-try-label">{label}</span>
      <pre>{text}</pre>
      <button className={`ug-copy ${done ? "done" : ""}`} onClick={copy} title="Copy">
        {done ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

// Horizontal node → arrow → node flow strip. items: { t, s?, on? ("accent"|"ok") }
function Flow({ items, caption }) {
  return (
    <div className="ug-flow">
      {items.map((it, i) => (
        <FlowPiece key={i} item={it} last={i === items.length - 1} />
      ))}
      {caption && <div className="ug-flow-cap">{caption}</div>}
    </div>
  );
}

function FlowPiece({ item, last }) {
  return (
    <>
      <div className={`ug-node ${item.on || ""}`}>
        <div className="ug-node-t">{item.t}</div>
        {item.s && <div className="ug-node-s">{item.s}</div>}
      </div>
      {!last && <span className="ug-arrow">→</span>}
    </>
  );
}

function Table({ head, rows }) {
  return (
    <div className="ug-tablewrap">
      <table className="ug-table">
        <thead>
          <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Faq({ q, children }) {
  return (
    <details className="ug-faq">
      <summary>{q}</summary>
      <div className="ug-faq-a">{children}</div>
    </details>
  );
}

function H3({ children }) {
  return <h3 className="ug-h3">{children}</h3>;
}

/* ----------------------------------------------------------------------------
   Shot — a "beautiful screenshot": a stylized, theme-aware vector mockup of a
   BrainEdge screen with an accent highlight ring on the control being taught.
   Drawn with CSS (no images), so it's crisp at any size, matches light AND dark
   themes, and never goes stale the way a real PNG would after a redesign.
---------------------------------------------------------------------------- */
const Sk = ({ w, h = 8, tone }) => <span className={`ug-sk ${tone || ""}`} style={{ width: w, height: h }} />;
const Hl = ({ label, children }) => (
  <span className="ug-hl">{children}<i className="ug-hl-tag">{label}</i></span>
);
function Shot({ screen, caption }) {
  return (
    <figure className="ug-shot">
      <div className="ug-shot-win">
        <div className="ug-shot-bar"><i /><i /><i /><span>BrainEdge</span></div>
        <div className="ug-shot-body">
          <div className="ug-shot-side">
            <span className="ug-shot-logo" />
            <Sk w={46} /><Sk w={58} /><Sk w={40} />
            {screen === "agents" ? <Hl label="Agents"><Sk w={52} tone="acc" /></Hl> : <Sk w={52} />}
            {screen === "scheduler" ? <Hl label="Scheduler"><Sk w={56} tone="acc" /></Hl> : <Sk w={56} />}
            <Sk w={44} />
          </div>
          <div className="ug-shot-main">
            {screen === "providers" && (
              <>
                <Sk w="40%" h={10} />
                <div className="ug-shot-cards">
                  <Hl label="provider card">
                    <span className="ug-shot-card acc"><Sk w="60%" h={7} tone="acc" /><Sk w="85%" h={6} /><span className="ug-shot-field"><Sk w="70%" h={6} /><i className="ug-shot-btn">Save</i></span></span>
                  </Hl>
                  <span className="ug-shot-card"><Sk w="50%" h={7} /><Sk w="80%" h={6} /><Sk w="65%" h={6} /></span>
                  <span className="ug-shot-card"><Sk w="55%" h={7} /><Sk w="75%" h={6} /><Sk w="60%" h={6} /></span>
                </div>
                <div className="ug-shot-foot"><Hl label="model selector"><i className="ug-shot-chip acc">llama-3.3-70b ▾</i></Hl><i className="ug-shot-dot ok" /><Sk w={40} h={6} /></div>
              </>
            )}
            {screen === "chat" && (
              <>
                <span className="ug-shot-bub me"><Sk w="55%" h={6} tone="inv" /></span>
                <span className="ug-shot-bub"><Sk w="85%" h={6} /><Sk w="70%" h={6} /><Sk w="40%" h={6} /></span>
                <div className="ug-shot-foot grow">
                  <Hl label="mic — talk instead of typing"><i className="ug-shot-ico acc">🎙</i></Hl>
                  <span className="ug-shot-input"><Sk w="60%" h={6} /></span>
                  <i className="ug-shot-ico send">↑</i>
                </div>
              </>
            )}
            {screen === "collaborate" && (
              <>
                <div className="ug-shot-foot"><Hl label="your folder"><i className="ug-shot-chip acc">📁 my-project</i></Hl><Sk w={60} h={6} /></div>
                <span className="ug-shot-tool ok">✓ <Sk w="42%" h={6} /></span>
                <span className="ug-shot-tool"><b className="add">+ 12</b><b className="del">− 3</b> <Sk w="38%" h={6} /></span>
                <Hl label="approve each change">
                  <span className="ug-shot-modal"><Sk w="50%" h={7} /><span><i className="ug-shot-btn acc">Allow</i><i className="ug-shot-btn">Deny</i></span></span>
                </Hl>
              </>
            )}
            {screen === "agents" && (
              <div className="ug-shot-split">
                <div>
                  <Sk w="55%" h={8} tone="acc" /><Sk w="90%" h={6} /><Sk w="75%" h={6} />
                  <span className="ug-shot-face" /><Sk w="65%" h={6} />
                </div>
                <div>
                  <Sk w="45%" h={8} /><Sk w="85%" h={6} /><Sk w="70%" h={6} />
                  <Hl label="Put to work"><i className="ug-shot-btn acc">Put to work →</i></Hl>
                </div>
              </div>
            )}
            {screen === "scheduler" && (
              <>
                <Sk w="35%" h={10} />
                <span className="ug-shot-row"><i className="ug-shot-clock">🕗</i><Sk w="40%" h={6} /><i className="ug-shot-chip">daily 8:00</i></span>
                <Hl label="agents run on schedules too">
                  <span className="ug-shot-row acc"><span className="ug-shot-face sm" /><Sk w="35%" h={6} tone="acc" /><i className="ug-shot-chip acc">weekly</i></span>
                </Hl>
                <span className="ug-shot-row"><i className="ug-shot-clock">⚡</i><Sk w="30%" h={6} /><i className="ug-shot-chip">webhook</i></span>
              </>
            )}
          </div>
        </div>
      </div>
      {caption && <figcaption className="ug-shot-cap">{caption}</figcaption>}
    </figure>
  );
}

/* ----------------------------------------------------------------------------
   The sections. Each entry: id, short rail title, icon, search keywords, and
   a render function receiving the app's navigation callback.
---------------------------------------------------------------------------- */

const SECTIONS = [
  /* 1 ─────────────────────────────────────────────────────────────────── */
  {
    id: "welcome",
    title: "Welcome & quick start",
    icon: Rocket,
    keywords: "start begin first setup onboarding 5 minute intro basics new user hello",
    render: (nav) => (
      <>
        <p>
          BrainEdge is one workspace for everything you do with AI models: chatting, working on
          your files, building software, and running autonomous agents — all powered by{" "}
          <strong>your own model providers</strong>. You bring an API key (or a free local model);
          BrainEdge brings the tools.
        </p>
        <p>Here is the entire setup, start to first answer, in three moves:</p>
        <Flow
          items={[
            { t: "Add a provider key", s: "Model configuration", on: "accent" },
            { t: "Pick a model", s: "the model selector" },
            { t: "Chat", s: "ask anything", on: "ok" },
          ]}
        />
        <Steps>
          <Step n={1} title="Add a provider">
            Open <Chip>Models → Model configuration</Chip> in the sidebar.{" "}
            <Go nav={nav} to="models">Open Model configuration</Go>
            <p style={{ marginTop: 6 }}>
              Pick a provider card (OpenRouter is the easiest first stop — one key unlocks hundreds
              of models, including free ones), paste your API key, and save. Running a local model
              with Ollama or LM Studio? No key needed at all.
            </p>
          </Step>
          <Step n={2} title="Choose a model">
            Click the <strong>model selector</strong> — the model name shown at the bottom-right of
            the message box. Models are grouped by provider; use the <Chip>Free</Chip> chip to see
            zero-cost options. Click one and it becomes your active model everywhere.
          </Step>
          <Step n={3} title="Say hello">
            Make sure the status chip in the top bar shows a green <Chip>online</Chip> dot, then
            type a message and press <Kbd>Enter</Kbd>. The reply streams in live.
          </Step>
        </Steps>
        <TryIt
          label="Your first prompt"
          text={"Introduce yourself in two sentences, then suggest three things you could help me with today."}
        />
        <Callout tone="tip" title="Where everything lives">
          The top bar switches between the three working modes — <Chip>Let's Chat</Chip>,{" "}
          <Chip>Let's Collaborate</Chip>, and <Chip>Let's Build</Chip>. The sidebar holds the bigger
          machines: Projects, Agents, Studio, Terminal, Skills, Connectors, the Scheduler, and your
          recent conversations. Everything in this guide is reachable from one of those two places.
        </Callout>
        <Callout tone="info" title="No key yet?">
          OpenRouter offers models tagged <Chip>:free</Chip> that cost nothing, and local models via
          Ollama or LM Studio run entirely on your computer. You can try every feature in this guide
          without spending a cent.
        </Callout>
      </>
    ),
  },

  /* 2 ─────────────────────────────────────────────────────────────────── */
  {
    id: "providers",
    title: "Providers & the model selector",
    icon: KeyRound,
    keywords: "api key openrouter nim nvidia ollama lm studio local profile base url model picker selector free paid cost online offline dot",
    render: (nav) => (
      <>
        <p>
          BrainEdge doesn't sell you a model — it connects to the providers you already use. Each
          connection is a <strong>profile</strong>: a name, a base URL, an API key, and a chosen
          model. You can keep as many profiles as you like, and they're all available at once; the
          model you pick in the selector decides which provider actually answers.
        </p>
        <Shot screen="providers" caption="Model configuration: one card per provider — paste a key, save, then pick any of its models from the selector at the bottom of the message box." />
        <H3>Providers that work out of the box</H3>
        <Table
          head={["Provider", "What it's good for", "Key needed?"]}
          rows={[
            ["OpenRouter", "One key, hundreds of models from many labs — including free-tier models tagged :free. The best first profile.", "Yes (free to create)"],
            ["NVIDIA NIM", "Fast hosted open models with a generous free tier.", "Yes"],
            ["Ollama (local)", "Models running on your own machine — private, offline, free. Default URL: http://localhost:11434/v1", "No"],
            ["LM Studio (local)", "Desktop app serving local models. Default URL: http://localhost:1234/v1", "No"],
            ["Anything OpenAI-compatible", "Any service exposing the standard chat-completions API: point a custom profile at its base URL.", "Usually"],
          ]}
        />
        <Steps>
          <Step n={1} title="Open Model configuration">
            <Go nav={nav} to="models">Open Model configuration</Go>{" "}
            You'll see a card per profile. Add one with the provider buttons, or create a custom
            profile for any compatible endpoint.
          </Step>
          <Step n={2} title="Paste the key, pick a default model">
            Keys are stored <strong>only on this device</strong> — they never pass through
            BrainEdge servers. After saving, BrainEdge fetches the provider's live model list.
          </Step>
          <Step n={3} title="Use the selector">
            Back in any chat, open the model selector next to the message box. Models are grouped
            by profile and badged <Chip>Local</Chip>, <Chip>Free</Chip>, or <Chip>Cloud</Chip>.
            Filter with the <Chip>All</Chip> / <Chip>Free</Chip> / <Chip>Paid</Chip> chips or the
            capability chips, type to search, click to switch.
          </Step>
        </Steps>
        <H3>The online dot</H3>
        <p>
          The status chip in the top bar pings your active provider every 30 seconds. Green{" "}
          <Chip>online</Chip> means it answered; red <Chip>offline</Chip> usually means a local
          server isn't running, a bad key, or no internet. It's the first thing to check when a
          message fails.
        </p>
        <H3>Cost basics</H3>
        <p>
          Cloud providers charge <strong>per token</strong> (a token is roughly four characters).
          You pay them directly through your own account — BrainEdge adds nothing on top. Local
          models are free forever. The <Go nav={nav} to="consumption">Consumption</Go> page
          estimates what each conversation used.
        </p>
        <Callout tone="warn" title="Keep keys like passwords">
          Anyone with your API key can spend on your provider account. Don't paste keys into chats
          or share screenshots of the Model configuration page with keys revealed.
        </Callout>
      </>
    ),
  },

  /* 3 ─────────────────────────────────────────────────────────────────── */
  {
    id: "chat",
    title: "Let's Chat",
    icon: MessageCircle,
    keywords: "conversation streaming markdown image vision attach slash command mention saved library export markdown history search badge",
    render: (nav) => (
      <>
        <p>
          <Chip>Let's Chat</Chip> is the conversation mode — the place for questions, writing,
          analysis, and thinking out loud. Replies <strong>stream</strong> in word by word and
          render full Markdown: headings, tables, code blocks with syntax highlighting, and lists.
        </p>
        <Shot screen="chat" caption="The chat screen: your message on the right, the streamed reply on the left — and the mic button lets you talk instead of typing (built-in Windows voice, no key needed)." />
        <H3>The composer's hidden powers</H3>
        <Table
          head={["Type…", "What happens"]}
          rows={[
            ["/", "Opens the slash menu: built-in commands plus every skill you've installed. Arrow keys + Enter to pick."],
            ["@", "Opens the mention menu: files from your linked folder and your connectors, attached as context."],
            ["(paperclip)", "Attach images — models with vision can read screenshots, photos, diagrams, and charts."],
            ["Shift+Enter", "New line without sending."],
          ]}
        />
        <Steps>
          <Step n={1} title="Ask, watch it stream">
            Type and press <Kbd>Enter</Kbd>. Press the stop button any time to cut a response
            short — everything generated so far stays.
          </Step>
          <Step n={2} title="Attach an image (vision)">
            Click the attachment button or paste an image straight into the composer, then ask
            about it: <em>"What's wrong with the layout in this screenshot?"</em> Pick a
            vision-capable model first (filter by capability in the selector).
          </Step>
          <Step n={3} title="Save the good ones">
            Each response carries actions on hover — copy it, or save it to your{" "}
            <strong>saved library</strong> so you can find it again without scrolling history.
            Every response also shows a small <strong>model badge</strong> so you always know which
            model wrote what, even after switching mid-conversation.
          </Step>
        </Steps>
        <TryIt
          label="Try it"
          text={"Compare electric cars and hybrids for a family that drives 20,000 km a year. Give me a Markdown table, then a one-paragraph recommendation."}
        />
        <H3>Finding and keeping conversations</H3>
        <ul>
          <li>
            <strong>Recents</strong> in the sidebar lists past conversations for the current mode.
            Click to reopen one exactly where you left it.
          </li>
          <li>
            <strong>Global search:</strong> type 3+ characters in the sidebar search box and
            BrainEdge searches <em>inside</em> every conversation, showing matching snippets — not
            just titles.
          </li>
          <li>
            <strong>Export:</strong> the download icon on any recent saves the whole conversation
            as a Markdown file — readable anywhere, printable to PDF.
          </li>
        </ul>
        <Callout tone="info" title="Your history is yours — and only yours">
          Conversations are stored locally on this device, not on a server. That's great for
          privacy, but it means uninstalling the app or clearing browser data removes them. Export
          anything you'd hate to lose.
        </Callout>
        <Callout tone="tip" title="Switch models mid-conversation">
          Stuck on a hard question? Change the model in the selector and ask again in the same
          thread. The model badges keep track of who said what.
        </Callout>
      </>
    ),
  },

  /* 4 ─────────────────────────────────────────────────────────────────── */
  {
    id: "collaborate",
    title: "Let's Collaborate",
    icon: Users,
    keywords: "folder files permission modes accept edits bypass plan read only tool cards diff desktop web difference",
    render: (nav) => (
      <>
        <p>
          <Chip>Let's Collaborate</Chip> gives the AI <strong>hands</strong>: point it at a folder
          and it can read, organize, analyze, and edit the files inside — always under a permission
          system you control. Think of it as a careful assistant working at your desk: it shows you
          each move before making it.
        </p>
        <Shot screen="collaborate" caption="A folder mission: the linked folder chip, tool cards showing real diffs (+ added / − removed lines), and the permission prompt that puts you in charge of every change." />
        <Flow
          items={[
            { t: "You brief it", s: '"clean up this folder"' },
            { t: "It proposes a tool", s: "read / edit / run" },
            { t: "You approve", s: "or set auto-approve", on: "accent" },
            { t: "Tool card shows result", s: "diffs, outputs", on: "ok" },
          ]}
        />
        <Steps>
          <Step n={1} title="Link a folder">
            Click the folder button by the composer and pick a directory. On the desktop app any
            folder works; in the web version folder access uses the browser's File System Access
            API, which currently means <strong>Chrome or Edge</strong>.
          </Step>
          <Step n={2} title="Pick a permission mode">
            The shield control next to the composer sets how much freedom the AI gets — see the
            table below. Start with the default; loosen it once you trust the task.
          </Step>
          <Step n={3} title="Brief it and supervise">
            Describe the job in plain language. Every action appears as a <strong>tool card</strong>{" "}
            in the timeline; file edits show a <strong>before/after diff</strong> so you can see
            exactly what changed, line by line.
          </Step>
        </Steps>
        <H3>Permission modes</H3>
        <Table
          head={["Mode", "Behavior", "Use it when…"]}
          rows={[
            ["Ask first (default)", "Every file change and command waits for your click.", "New tasks, important folders, getting to know an agent."],
            ["Auto-accept edits", "File edits apply automatically; commands still ask.", "You trust the edits but want a say on anything executed."],
            ["Act — trust all", "Runs everything without asking.", "Repetitive, low-risk jobs in a folder you can restore."],
            ["Read-only", "Inspect only — nothing is ever modified.", "Audits, reviews, \"tell me what's in here\" questions."],
          ]}
        />
        <TryIt
          label="Try it"
          text={"Look through this folder and tell me what's in it. Then propose a tidier structure — don't move anything yet, just show me the plan."}
        />
        <H3>Web vs desktop</H3>
        <Table
          head={["Capability", "Desktop app", "Web app"]}
          rows={[
            ["Folder access", "Any folder", "Chrome/Edge only (File System Access API)"],
            ["Terminal & shell commands", "Yes", "No — browsers can't run a shell"],
            ["GitHub repo cloning", "Yes", "No (read-only repo browsing only)"],
            ["Everything else", "Yes", "Yes"],
          ]}
        />
        <Callout tone="warn" title="Bypass is powerful — scope it">
          In <Chip>Act — trust all</Chip> mode nothing waits for you. Use it on a copy of the
          folder, or on folders where every file is recoverable.
        </Callout>
      </>
    ),
  },

  /* 5 ─────────────────────────────────────────────────────────────────── */
  {
    id: "build",
    title: "Let's Build",
    icon: Hammer,
    keywords: "code coding terminal github repo clone environment cli command line build software develop",
    render: (nav) => (
      <>
        <p>
          <Chip>Let's Build</Chip> is Collaborate tuned for software: the AI reads your codebase,
          writes and edits code, runs commands and tests in a real terminal, and iterates until
          things pass. You review diffs and approve commands exactly like in Collaborate.
        </p>
        <Steps>
          <Step n={1} title="Open a codebase">
            Use the <strong>environment picker</strong> by the composer: link a local folder,{" "}
            or click <Chip>Connect a GitHub repo</Chip> and paste a public repo URL — the desktop
            app clones it for you and starts a session inside.
          </Step>
          <Step n={2} title="Describe the change">
            Talk about outcomes, not files: <em>"add input validation to the signup form and write
            a test for it."</em> The AI explores the repo itself to find what to touch.
          </Step>
          <Step n={3} title="Watch the terminal work">
            Commands the AI runs appear as tool cards with their output. You also have your own{" "}
            <strong>Terminal</strong> page in the sidebar for poking around manually — same
            machine, same folder. <Go nav={nav} to="terminal">Open Terminal</Go>
          </Step>
        </Steps>
        <TryIt
          label="Try it"
          text={"Explore this repo and give me a tour: what it does, how it's organized, where the entry point is, and one thing you'd improve first."}
        />
        <H3>The BrainEdge CLI</H3>
        <p>
          Prefer living in a terminal? BrainEdge ships a command-line companion so you can start
          sessions from any shell. Set it up under{" "}
          <Chip>Settings → Terminal access</Chip> — it walks you through installing the command and
          shows usage examples. <Go nav={nav} to="settings">Open Settings</Go>
        </p>
        <Callout tone="tip" title="Small loops beat big asks">
          "Fix the failing test" → review → "now refactor the helper" works far better than one
          giant request. Each approved step keeps you in control and the AI on track.
        </Callout>
        <Callout tone="info" title="Web users">
          The browser build can read and discuss code, but terminals and cloning need the desktop
          app — a browser simply can't run shell commands on your machine.
        </Callout>
      </>
    ),
  },

  /* 6 ─────────────────────────────────────────────────────────────────── */
  {
    id: "projects",
    title: "Projects",
    icon: FolderKanban,
    keywords: "project instructions knowledge files pdf docx persistent workspace repo linked conversations",
    render: (nav) => (
      <>
        <p>
          A <strong>Project</strong> is a workspace that remembers. It bundles standing
          instructions, reference documents, an optional linked folder or repo, and every
          conversation you have inside it — so you stop re-explaining context each time.
        </p>
        <Flow
          items={[
            { t: "Instructions", s: "how to behave" },
            { t: "Knowledge", s: "PDFs, docx, notes" },
            { t: "Folder / repo", s: "optional, linked" },
            { t: "Conversations", s: "all kept inside", on: "accent" },
          ]}
          caption="Everything in the project travels into every conversation you start there."
        />
        <Steps>
          <Step n={1} title="Create one">
            <Go nav={nav} to="project">Open Projects</Go> and create a project — one per ongoing
            effort: a client, a course, a product, a thesis.
          </Step>
          <Step n={2} title="Write the standing instructions">
            Tone, audience, constraints, vocabulary. Example: <em>"You are helping with the Acme
            account. Always write in UK English. Budgets are in EUR. Never promise delivery dates."</em>
          </Step>
          <Step n={3} title="Add knowledge files">
            Drop in PDFs, Word documents (.docx), Markdown, or plain text — contracts, specs, style
            guides, past reports. The AI consults them when answering inside the project.
          </Step>
          <Step n={4} title="Optionally link a folder or GitHub repo">
            Project conversations can then work hands-on in that location, with the usual
            permission system.
          </Step>
        </Steps>
        <TryIt
          label="Try it (inside a project)"
          text={"Using the attached brand guide, draft a launch announcement for the new feature. Flag anything that conflicts with the guide."}
        />
        <Callout tone="tip" title="Projects vs plain chats">
          A plain chat forgets its context when it ends. A project's instructions and knowledge
          apply to <strong>every</strong> conversation inside it, and those conversations stay
          organized under the project instead of drowning in Recents.
        </Callout>
      </>
    ),
  },

  /* 7 ─────────────────────────────────────────────────────────────────── */
  {
    id: "artifacts",
    title: "Artifacts & Studio",
    icon: Shapes,
    keywords: "artifact preview html svg mermaid markdown react live studio launcher build console version toolbar",
    render: (nav) => (
      <>
        <p>
          When the AI produces something <em>visual</em> — a web page, a diagram, an interactive
          component — it opens in the <strong>Artifact panel</strong> beside the chat as a live,
          running preview instead of a wall of code.
        </p>
        <H3>What previews live</H3>
        <ul>
          <li><strong>HTML / CSS / JS</strong> — full pages and mini-apps, fully interactive.</li>
          <li><strong>SVG</strong> — graphics and illustrations, rendered crisp at any size.</li>
          <li><strong>Mermaid</strong> — flowcharts, sequence diagrams, and mind maps from text.</li>
          <li><strong>Markdown</strong> — formatted documents.</li>
          <li><strong>React components</strong> — interactive UI rendered live.</li>
        </ul>
        <Steps>
          <Step n={1} title="Just ask for something visual">
            <em>"Make me a one-page invoice template in HTML"</em> — the artifact panel opens
            automatically when the response contains something previewable.
          </Step>
          <Step n={2} title="Use the toolbar">
            Switch between <Chip>Preview</Chip> and <Chip>Code</Chip>, copy the source, or download
            the file. Interactive artifacts run right in the panel.
          </Step>
          <Step n={3} title="Iterate — versions stack up">
            Say what to change (<em>"make the header dark, add a totals row"</em>) and a new version
            replaces the preview. Earlier versions remain in the conversation, so nothing is lost.
          </Step>
        </Steps>
        <TryIt
          label="Try it"
          text={"Create an interactive HTML color-palette generator: five swatches, click any swatch to lock it, a button to randomize the rest, and the hex code under each swatch."}
        />
        <H3>Studio — start from an idea</H3>
        <p>
          <Go nav={nav} to="studio">Open Studio</Go> The Studio launcher flips the flow: instead of
          chatting first, you describe the thing you want to build, and BrainEdge opens a fresh
          build conversation seeded with your idea — a build console where the artifact takes shape
          iteration by iteration.
        </p>
        <Callout tone="tip" title="Mermaid is the fastest diagram tool you own">
          Ask for "a Mermaid flowchart of our hiring process" and you'll get an editable diagram in
          seconds — much faster than dragging boxes in a drawing tool.
        </Callout>
      </>
    ),
  },

  /* 8 ─────────────────────────────────────────────────────────────────── */
  {
    id: "agents",
    title: "Agents & Agent Studio",
    icon: Bot,
    keywords: "agent studio designer bench identity capabilities knowledge memory pinned model track record export import .agent versions blueprint",
    render: (nav) => (
      <>
        <p>
          An <strong>agent</strong> is a specialist you hire once and use forever: a name, a
          personality, instructions, a set of capabilities, and optionally its own knowledge,
          memory, and pinned model. You build agents in the <strong>Agent Studio</strong> — by
          describing them in plain language. <Go nav={nav} to="agents">Open Agents</Go>
        </p>
        <Shot screen="agents" caption="The Agent Studio: shape the agent by chatting with the Designer (left), interview it on the Bench (right), then Put to work sends it on real missions." />
        <Flow
          items={[
            { t: "Designer", s: "describe the agent in chat", on: "accent" },
            { t: "Bench", s: "interview & refine it" },
            { t: "Put to work", s: "real tasks", on: "ok" },
          ]}
          caption="The Studio loop: the Designer drafts the blueprint, the Bench is the tryout, then it joins your roster."
        />
        <Steps>
          <Step n={1} title="Describe it to the Designer">
            One sentence is enough: <em>"An agent called Briefly that turns any text into exactly 3
            bullet points, max 15 words each."</em> The Designer drafts the full blueprint —
            identity, instructions, suggested capabilities.
          </Step>
          <Step n={2} title="Interview it on the Bench">
            The Bench is a sandbox chat with the draft agent. Paste real input, see how it behaves,
            tell the Designer what to adjust.
          </Step>
          <Step n={3} title="Put it to work">
            Launch from the agent card. Agents with file or terminal capabilities open in
            Collaborate mode (pick a folder); the rest open a chat. Either way it's a fresh session
            with the agent's blueprint in charge.
          </Step>
        </Steps>
        <H3>The blueprint, piece by piece</H3>
        <Table
          head={["Part", "What it does"]}
          rows={[
            ["Identity & instructions", "Who the agent is and exactly how it should work. The heart of the agent."],
            ["Capabilities", "Toggles for files, terminal, connectors, skills, and the Agent Browser. Off by default — grant only what the job needs."],
            ["Knowledge", "Up to 24 reference files. Small libraries are included whole; large ones are searched so only relevant passages are used per task."],
            ["Memory", "Durable learnings the agent keeps across missions — see below."],
            ["Pinned model", "Optionally lock the agent to a specific model; otherwise it uses whatever your selector points at."],
            ["Track record", "Run history: when, from where (chat/team/schedule/webhook/swarm), clean or failed, estimated tokens."],
          ]}
        />
        <H3>Memory — agents that learn</H3>
        <p>
          After a successful mission the agent extracts up to three <em>durable</em> learnings —
          your preferences ("lead with risks"), corrections you made, stable facts — and applies
          them next time automatically. Mission content itself is never stored.
        </p>
        <ul>
          <li><strong>View / edit / clear:</strong> Studio → Blueprint → <em>Memory</em>. It's plain text; rewrite it freely.</li>
          <li><strong>Turn off:</strong> untick <em>Learn across missions</em> in the same section.</li>
          <li>Memory follows the agent everywhere: chat, teams, schedules, webhooks.</li>
        </ul>
        <H3>Sharing and safety nets</H3>
        <ul>
          <li>
            <strong>Export:</strong> Blueprint → <em>Export .agent file</em> — a portable file with
            instructions, capabilities, knowledge, and identity. Memory and model pins deliberately
            stay private to you.
          </li>
          <li><strong>Import:</strong> Agents tab → <em>Import .agent</em>. Imports get a fresh identity card.</li>
          <li><strong>Versions:</strong> every Studio save snapshots the previous blueprint (last 10). Blueprint → <em>Versions</em> → Restore.</li>
          <li>
            <strong>Handoffs:</strong> any solo agent can delegate a focused sub-task to another
            roster agent mid-mission and use the answer — one level deep, inside your session, with
            the usual permission prompts.
          </li>
        </ul>
        <TryIt
          label="Try it — your first hire"
          text={"An agent called Briefly that turns any text I paste into exactly 3 bullet points, max 15 words each, keeping numbers and names accurate."}
        />
        <Callout tone="tip" title="One job per agent">
          "Researches and writes and posts" makes a worse agent than three sharp ones on a team.
          Narrow agents are easier to trust, test, and reuse.
        </Callout>
      </>
    ),
  },

  /* 9 ─────────────────────────────────────────────────────────────────── */
  {
    id: "teams",
    title: "Teams & Mission Control",
    icon: Network,
    keywords: "team relay managed coordinator parallel fan out budget meter checkpoint resume mission ask user question replanning waves",
    render: (nav) => (
      <>
        <p>
          Teams put several agents on one brief. There are two shapes — and{" "}
          <strong>Mission Control</strong>, the live panel that opens beside the chat, shows every
          station light up, work, and stamp its output in real time.
        </p>
        <H3>Relay — the assembly line</H3>
        <Flow
          items={[
            { t: "Digger", s: "researches" },
            { t: "Drafter", s: "writes" },
            { t: "Polisher", s: "edits", on: "ok" },
          ]}
          caption="Relay: agents run in order; each one receives everything the previous one produced."
        />
        <H3>Managed — the factory floor</H3>
        <div className="ug-flow">
          <div className="ug-node accent">
            <div className="ug-node-t">Coordinator</div>
            <div className="ug-node-s">splits the brief</div>
          </div>
          <span className="ug-arrow">→</span>
          <div className="ug-fan">
            <div className="ug-node"><div className="ug-node-t">Adsmith</div><div className="ug-node-s">runs in parallel</div></div>
            <div className="ug-node"><div className="ug-node-t">Faqster</div><div className="ug-node-s">runs in parallel</div></div>
            <div className="ug-node"><div className="ug-node-t">Socialite</div><div className="ug-node-s">runs in parallel</div></div>
          </div>
          <span className="ug-arrow">→</span>
          <div className="ug-node accent">
            <div className="ug-node-t">Review</div>
            <div className="ug-node-s">done, or new wave</div>
          </div>
          <span className="ug-arrow">→</span>
          <div className="ug-node ok">
            <div className="ug-node-t">Merged result</div>
            <div className="ug-node-s">one deliverable</div>
          </div>
          <div className="ug-flow-cap">
            Managed: a coordinator fans the work out in parallel, reviews the results, and may
            dispatch up to two follow-up waves — recruiting from your whole bench, not just the
            original line-up ("Scout found nothing → send Radar").
          </div>
        </div>
        <Table
          head={["", "Relay line", "Managed"]}
          rows={[
            ["Flow", "Sequential — A then B then C", "Parallel fan-out, then merge"],
            ["Best for", "Pipelines where each step builds on the last", "Independent workstreams under one brief"],
            ["Smart routing", "Fixed order", "Coordinator re-plans between waves"],
            ["Speed", "Sum of the steps", "Roughly the slowest member per wave"],
          ]}
        />
        <Steps>
          <Step n={1} title="Build the team">
            In <Go nav={nav} to="agents">Agents</Go>, create a team, pick the shape, and add
            members from your roster.
          </Step>
          <Step n={2} title="Set a mission budget (recommended)">
            In the team builder, set <em>Mission budget</em> — a token cap for the whole mission.
            A global default lives in settings as <Chip>missionTokenBudget</Chip>. Mission Control
            shows a <strong>live meter</strong>; at the cap the mission stops cleanly, delivers
            what exists, and tells you how to raise the cap and resume.
          </Step>
          <Step n={3} title="Brief it and watch Mission Control">
            Stations glow while working and stamp their output when done. The final answer lands in
            the chat as one deliverable.
          </Step>
        </Steps>
        <H3>Mid-mission questions</H3>
        <p>
          When an agent hits a genuine fork — budget? audience? — it can pause and ask you{" "}
          <strong>one question</strong>, optionally with suggested answers. A modal appears; your
          answer flows straight back in and the mission resumes. On headless runs (schedules,
          webhooks, swarms) agents are told to proceed on best judgment and state the assumption.
        </p>
        <H3>Checkpoints & Resume mission</H3>
        <p>
          Team missions checkpoint after every member completes. If the app closes mid-mission,
          reopen that conversation and you'll see <em>"Mission interrupted — N steps already
          done"</em> with a <Chip>Resume mission</Chip> button. Finished stations restore from the
          checkpoint; only the remaining ones run.
        </p>
        <TryIt
          label="Try it — a Managed brief"
          text={"Launch kit for BeanBox, a coffee subscription for remote teams: ad copy, an FAQ, three social posts, and a launch email. Merge everything into one document."}
        />
        <Callout tone="warn" title="Budget the big ones">
          A Managed team that can re-plan is powerful and not free. Give any serious mission a
          token budget and let the meter do the worrying.
        </Callout>
      </>
    ),
  },

  /* 10 ────────────────────────────────────────────────────────────────── */
  {
    id: "swarms",
    title: "Swarms",
    icon: Layers,
    keywords: "swarm list batch parallel items bulk run one agent many",
    render: (nav) => (
      <>
        <p>
          A <strong>swarm</strong> runs one agent over a whole list: 20 companies to research, 50
          reviews to classify, 30 URLs to check. Each line becomes its own full mission; the result
          comes back as one compiled report.
        </p>
        <Flow
          items={[
            { t: "Your list", s: "one item per line" },
            { t: "⧉ Swarm runner", s: "brief with {item}", on: "accent" },
            { t: "Parallel pool", s: "1–6 at a time" },
            { t: "Compiled report", s: "one document", on: "ok" },
          ]}
        />
        <Steps>
          <Step n={1} title="Open the swarm runner">
            Click the <Chip>⧉</Chip> button on any agent card in{" "}
            <Go nav={nav} to="agents">Agents</Go>.
          </Step>
          <Step n={2} title="Paste the list, write the brief">
            One item per line. In the brief, write <Chip>{"{item}"}</Chip> where each entry should
            be inserted — it's replaced per run.
          </Step>
          <Step n={3} title="Pick parallelism and run">
            1–6 simultaneous missions. Progress streams live; swarm runs count toward the agent's
            track record.
          </Step>
        </Steps>
        <TryIt
          label="Try it — a swarm brief"
          text={"Research {item} and produce a 3-bullet profile: what they do, approximate size, and one recent move worth knowing."}
        />
        <Callout tone="warn" title="Swarms run headless">
          There's nobody to click "allow" twenty times, so swarm missions auto-approve their own
          tools. Only swarm agents whose capabilities you'd trust unattended — and remember each
          item is a full mission, so 20 items ≈ 20 missions of token spend.
        </Callout>
      </>
    ),
  },

  /* 11 ────────────────────────────────────────────────────────────────── */
  {
    id: "scheduler",
    title: "Scheduler & Triggers",
    icon: Clock,
    keywords: "schedule scheduled task cron daily weekly webhook trigger curl token headless automation overnight",
    render: (nav) => (
      <>
        <p>
          The <strong>Scheduler</strong> makes BrainEdge work while you don't: run a prompt, an
          agent, or an entire team on a timetable — or fire them from the outside world with a
          webhook. <Go nav={nav} to="scheduler">Open Scheduler</Go>
        </p>
        <Shot screen="scheduler" caption="The Scheduler: plain prompts on timers, agents on daily or weekly schedules, and token-protected webhooks so outside systems can put your workforce to work." />
        <H3>Scheduled tasks</H3>
        <Steps>
          <Step n={1} title="New task">
            Pick a target: a plain prompt, <Chip>Run an agent</Chip>, or{" "}
            <Chip>Run an agent team</Chip>.
          </Step>
          <Step n={2} title="Pick the rhythm">
            Interval, daily, or weekly — e.g. every Monday at 07:00. Agents with file capabilities
            can be given an optional working folder.
          </Step>
          <Step n={3} title="Check the results">
            Each run lands in the task's run history — and, for agents, in their track record and
            memory. Open any run to read the full output.
          </Step>
        </Steps>
        <H3>Webhook triggers</H3>
        <p>
          Enable <em>Webhook triggers</em> at the bottom of the Scheduler page and BrainEdge starts
          a token-protected listener on your machine. Anything that can send an HTTP POST — a mail
          rule, Zapier, CI, a cron box — can now put your agents to work:
        </p>
        <TryIt
          label="curl example"
          text={'curl -X POST http://127.0.0.1:8765/hook/agent/<agent-id> \\\n  -H "Authorization: Bearer <your-token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{ "prompt": "Triage this alert: disk usage at 92% on server-3" }\''}
        />
        <p>
          Routes: <Chip>/hook/agent/&lt;id&gt;</Chip>, <Chip>/hook/team/&lt;id&gt;</Chip>,{" "}
          <Chip>/hook/task/&lt;id&gt;</Chip>, plus <Chip>GET /hook/ping</Chip> to test. The
          listener is local-only by default; the token is shown next to the toggle.
        </p>
        <Callout tone="danger" title="Headless means nobody is watching">
          Scheduled, webhook, and swarm runs auto-approve their own tools — there is no one to ask.
          A triggered agent gets <strong>only</strong> the capabilities you switched on in its
          blueprint: no files or shell unless you deliberately opted it in. Give file/terminal
          capabilities to triggered agents only when you trust them with the chosen folder, and
          treat the webhook token like a password.
        </Callout>
        <Callout tone="tip" title="The overnight worker pattern">
          A "Radar" agent on a weekly schedule (<em>"What changed in our industry this week?"</em>)
          plus a webhook for on-demand runs is the classic setup — same agent, two doors, one
          accumulating track record.
        </Callout>
      </>
    ),
  },

  /* 12 ────────────────────────────────────────────────────────────────── */
  {
    id: "browser",
    title: "Agent Browser",
    icon: Globe,
    keywords: "browser browse web agent text mode allowlist permission credential password navigate click fill",
    render: (nav) => (
      <>
        <p>
          Switch on the <strong>Browser</strong> capability and an agent can drive a real, visible
          browser window — BrainEdge's own, no extra install. It browses in <strong>text
          mode</strong>: pages come back as readable text plus a numbered list of links and fields,
          so any model works, vision or not. You watch every move, and you can grab the mouse
          yourself at any time.
        </p>
        <Flow
          items={[
            { t: "browse_open", s: "go to a page" },
            { t: "browse_read", s: "page as text + [n] elements" },
            { t: "browse_click [n]", s: "asks permission", on: "accent" },
            { t: "browse_fill [n]", s: "asks permission", on: "accent" },
            { t: "Report back", s: "with what it found", on: "ok" },
          ]}
        />
        <H3>The safety model</H3>
        <ul>
          <li><strong>Reading is free; acting asks.</strong> Every navigation, click, and form-fill goes through your permission system.</li>
          <li><strong>Allowlist:</strong> give the agent a per-agent list of allowed sites and it can't leave them — redirects off-list are blocked too.</li>
          <li><strong>Credentials are human-only.</strong> Password and payment fields are always refused; the agent hands the window to you for those.</li>
          <li><strong>Webpages are treated as data, not commands.</strong> Page text is marked untrusted, so instructions embedded in a webpage can't steer the agent.</li>
        </ul>
        <Steps>
          <Step n={1} title="Enable the capability">
            In the Agent Studio blueprint, toggle <Chip>Browser</Chip> on and (recommended) fill in{" "}
            <em>Allowed sites</em>.
          </Step>
          <Step n={2} title="Give it a web-shaped task">
            Price comparisons, availability checks, gathering facts across a few known sites.
          </Step>
          <Step n={3} title="Supervise the window">
            The browser window opens beside you. Approve actions as they come — or take over with
            your own mouse whenever you like.
          </Step>
        </Steps>
        <TryIt
          label="Try it — a Pricecheck brief"
          text={"Find the current price of the Logitech MX Master 3S on the allowed sites and tell me which is cheapest, with the prices you saw."}
        />
        <Callout tone="warn" title="Triggered + browser = allowlist it">
          On scheduled/webhook/swarm runs, browsing is auto-approved like every other tool. If a
          headless agent browses, the allowlist is your seatbelt — set it.
        </Callout>
      </>
    ),
  },

  /* 13 ────────────────────────────────────────────────────────────────── */
  {
    id: "voice",
    title: "Voice",
    icon: Mic,
    keywords: "voice mic microphone push to talk speak spoken replies tts whisper groq openai transcription speech",
    render: (nav) => (
      <>
        <p>
          Voice in BrainEdge is two independent halves: <strong>talk in</strong> (push-to-talk
          transcription) and <strong>hear back</strong> (spoken replies). Use either, or both.
        </p>
        <Flow
          items={[
            { t: "Click the mic", s: "speak your prompt" },
            { t: "Transcribed", s: "via your OpenAI/Groq key" },
            { t: "Lands in composer", s: "edit, then send", on: "accent" },
            { t: "Reply read aloud", s: "your OS voices, free", on: "ok" },
          ]}
        />
        <Steps>
          <Step n={1} title="Talking in needs one key">
            Push-to-talk transcribes through <strong>your own</strong> OpenAI or Groq key —
            auto-detected from your provider profiles. Click the mic to record, click again to
            stop; the transcript drops into the composer so you can review before sending.
          </Step>
          <Step n={2} title="Hearing back is free">
            The speaker toggle next to the model picker reads final answers aloud using your
            operating system's built-in voices — no key, no internet needed for the speech itself.
          </Step>
        </Steps>
        <TryIt
          label="Say this"
          text={"Give me a two-paragraph summary of what my agents did this week."}
        />
        <Callout tone="info" title="Why not full-duplex live voice?">
          Realtime two-way voice is provider-locked plumbing that fights BrainEdge's any-model
          design, so it's deliberately not built. Push-to-talk plus spoken replies covers the
          hands-free loop with any model you choose.
        </Callout>
      </>
    ),
  },

  /* 14 ────────────────────────────────────────────────────────────────── */
  {
    id: "connectors",
    title: "Connectors & Skills",
    icon: Plug,
    keywords: "connector mcp skill plugin tool integration import toggle folder gallery mention",
    render: (nav) => (
      <>
        <p>
          Connectors and skills extend what the AI can <em>do</em>. Connectors plug in outside
          tools and data; skills package reusable instructions you trigger with a slash command.
        </p>
        <div className="ug-grid2">
          <div className="ug-card">
            <div className="ug-card-t"><Plug size={14} /> Connectors</div>
            <div className="ug-card-b">
              Built on <strong>MCP</strong> — an open standard that lets AI apps talk to external
              tools and data sources through one common plug. Browse the gallery on the desktop
              app, connect what you use, and the AI gains those tools in every conversation.
              Reference a connector directly by typing <Kbd>@</Kbd> in the composer.
            </div>
          </div>
          <div className="ug-card">
            <div className="ug-card-t"><Repeat size={14} /> Skills</div>
            <div className="ug-card-b">
              A skill is a folder of instructions (and optional helper files) teaching the AI a
              repeatable job — "format meeting minutes our way", "review a contract". Import or
              drop skills on the Skills page, toggle them on or off, and run one by typing{" "}
              <Kbd>/</Kbd> and picking it.
            </div>
          </div>
        </div>
        <Steps>
          <Step n={1} title="Browse and connect">
            <Go nav={nav} to="connectors">Open Connectors</Go> — the gallery lists available
            connectors with one-click setup (desktop app).
          </Step>
          <Step n={2} title="Manage skills">
            <Go nav={nav} to="skills">Open Skills</Go> — import a skill folder, toggle skills on or
            off, and see what each one does.
          </Step>
          <Step n={3} title="Use them in chat">
            <Kbd>/</Kbd> lists commands and skills; <Kbd>@</Kbd> lists files and connectors. Agents
            can also be granted connectors and skills as capabilities in their blueprint.
          </Step>
        </Steps>
        <Callout tone="tip" title="Skills make teams consistent">
          Export a skill folder, share it, and everyone's "weekly report" comes out the same shape.
        </Callout>
      </>
    ),
  },

  /* 15 ────────────────────────────────────────────────────────────────── */
  {
    id: "mobile",
    title: "Via Mobile",
    icon: Send,
    keywords: "telegram phone mobile bot botfather token handoff continue on phone remote",
    render: (nav) => (
      <>
        <p>
          <strong>Via Mobile</strong> connects BrainEdge to a private Telegram bot, so the desktop
          can keep working while you step away — and you can keep the conversation going from your
          phone.
        </p>
        <Steps>
          <Step n={1} title="Create your bot (2 minutes)">
            In Telegram, message <Chip>@BotFather</Chip>, send <Chip>/newbot</Chip>, pick a name,
            and copy the token it gives you. This bot is private to you.
          </Step>
          <Step n={2} title="Paste the token">
            <Go nav={nav} to="viamobile">Open Via Mobile</Go> — paste the token and start the
            bridge. BrainEdge shows your bot's link; open it on your phone and say hi.
          </Step>
          <Step n={3} title="Chat from anywhere">
            Messages to the bot run through your BrainEdge — your providers, your model, your
            agents — and answers come back to Telegram.
          </Step>
          <Step n={4} title="Continue on phone">
            Use the handoff option on a desktop conversation to pick it up on your phone with full
            context — start at your desk, finish on the couch.
          </Step>
        </Steps>
        <Callout tone="warn" title="The bot token is a key">
          Anyone with the token can talk to your bot. Keep it private, and revoke it via BotFather
          if it ever leaks.
        </Callout>
        <Callout tone="info" title="The desktop does the work">
          The phone is a remote control: your BrainEdge app (and your keys) stay on your computer,
          which needs to be running for the bridge to answer.
        </Callout>
      </>
    ),
  },

  /* 16 ────────────────────────────────────────────────────────────────── */
  {
    id: "consumption",
    title: "Consumption & costs",
    icon: BarChart3,
    keywords: "usage tokens spend cost dashboard estimate budget money price meter",
    render: (nav) => (
      <>
        <p>
          The <strong>Consumption</strong> page is your usage dashboard: estimated tokens and spend
          across conversations, agents, and missions — so the first surprising bill never happens.{" "}
          <Go nav={nav} to="consumption">Open Consumption</Go>
        </p>
        <H3>How the numbers work</H3>
        <ul>
          <li>
            Tokens are <strong>estimated</strong> at roughly 4 characters per token — the same
            basis used by mission budget meters. Treat figures as a close guide, not an invoice.
          </li>
          <li>Spend estimates combine token counts with known per-model prices. Local models count as zero.</li>
          <li>Your provider's own billing page is always the source of truth for actual charges.</li>
        </ul>
        <H3>Keeping costs down</H3>
        <Table
          head={["Habit", "Why it works"]}
          rows={[
            ["Match the model to the job", "Drafts and summaries don't need your most expensive model. Switch in the selector per task."],
            ["Use Free and Local for volume", "Filter the selector by the Free chip; run bulk jobs on local models when quality allows."],
            ["Budget every big mission", "Team budgets hard-stop runaway missions and show a live meter while they run."],
            ["Start fresh when topics change", "Long conversations resend their history every turn; a new chat resets the meter."],
            ["Watch swarm math", "20 list items = 20 full missions. Estimate one before launching fifty."],
          ]}
        />
        <Callout tone="tip" title="A sanity check that pays for itself">
          After your first week, open Consumption and sort by spend. The one conversation at the
          top usually teaches you more about your habits than any guide can.
        </Callout>
      </>
    ),
  },

  /* 17 ────────────────────────────────────────────────────────────────── */
  {
    id: "modelspages",
    title: "Models overview & Speed check",
    icon: Cpu,
    keywords: "models overview catalog benchmark compare filter speed check quiz latency throughput cost per result",
    render: (nav) => (
      <>
        <p>
          Two pages help you choose models with evidence instead of vibes — both live under{" "}
          <Chip>Models</Chip> in the sidebar.
        </p>
        <H3>Models overview — the catalog</H3>
        <p>
          A browsable catalog of models with <strong>published benchmark scores</strong>, context
          sizes, prices, and capabilities. <Go nav={nav} to="models-overview">Open Models overview</Go>
        </p>
        <ul>
          <li><strong>Filter</strong> by capability, price tier, and provider to shortlist candidates.</li>
          <li><strong>Compare</strong> shortlisted models side by side — benchmarks and costs in one table.</li>
          <li>Found a winner? Select it as your active model right from the page.</li>
        </ul>
        <H3>Speed check — your own benchmark</H3>
        <p>
          Published benchmarks measure labs' conditions, not yours.{" "}
          <strong>Speed check</strong> tests models on <em>your</em> connection with{" "}
          <em>your</em> keys: <Go nav={nav} to="models-speed">Open Speed check</Go>
        </p>
        <ul>
          <li><strong>What it measures:</strong> time to first token (how quickly the reply starts) and generation speed (tokens per second), per model.</li>
          <li><strong>Quiz scoring:</strong> each model answers a short quiz so raw speed is paired with a quick quality sanity-check — fast nonsense scores poorly.</li>
          <li><strong>Cost per result:</strong> what one good answer actually costs on each model, combining price and quality.</li>
        </ul>
        <Callout tone="tip" title="A practical shortlisting recipe">
          Overview filters → three candidates → Speed check them → pick the cheapest one that's
          fast enough and passes the quiz. Re-run the speed check occasionally; provider
          performance drifts.
        </Callout>
      </>
    ),
  },

  /* 18 ────────────────────────────────────────────────────────────────── */
  {
    id: "account",
    title: "Account, plans & your data",
    icon: UserRound,
    keywords: "sign in login trial subscription plan billing backup restore data privacy theme dark light accent language",
    render: (nav) => (
      <>
        <p>
          Your account unlocks the app; your data stays with you. Here's how the two fit together.
        </p>
        <H3>Sign-in & plans</H3>
        <ul>
          <li>Sign in once per device. New accounts start on a <strong>free trial</strong>; the sidebar shows days remaining.</li>
          <li>Upgrade from the trial box in the sidebar, or manage an active subscription via the account menu → <Chip>Manage subscription</Chip>.</li>
          <li>Your subscription covers the app. <strong>Model usage is separate</strong> — you pay providers directly through your own keys (or nothing, with local/free models).</li>
        </ul>
        <H3>Where your data lives</H3>
        <Table
          head={["Data", "Where it lives"]}
          rows={[
            ["API keys", "On this device only — never sent to BrainEdge servers."],
            ["Conversation history", "Local to this device."],
            ["Agents, teams, memory, projects", "Local to this device."],
            ["Account & subscription", "BrainEdge's account service (email, plan status)."],
            ["Prompts & responses", "Sent only to the provider of the model you selected."],
          ]}
        />
        <H3>Backup & restore</H3>
        <Steps>
          <Step n={1} title="Back up">
            <Go nav={nav} to="settings">Open Settings</Go> and use Backup to export your
            configuration — profiles, agents, projects, and settings — into a single file.
          </Step>
          <Step n={2} title="Restore">
            On a new machine (or after a reinstall), Restore from that file puts everything back.
          </Step>
        </Steps>
        <Callout tone="danger" title="The backup file contains your API keys">
          That's what makes restore seamless — and what makes the file sensitive. Store it
          somewhere encrypted, never in a shared folder or an email, and delete old copies.
        </Callout>
        <H3>Make it yours</H3>
        <ul>
          <li><strong>Theme:</strong> Settings → Profile — light or dark, plus an accent color picker (default is the multi-color scheme; pick any color you like).</li>
          <li><strong>Default response language:</strong> account menu → <Chip>Language</Chip> — answers arrive in your language regardless of what you type.</li>
        </ul>
      </>
    ),
  },

  /* 19 ────────────────────────────────────────────────────────────────── */
  {
    id: "troubleshooting",
    title: "Troubleshooting & FAQ",
    icon: LifeBuoy,
    keywords: "error 401 403 404 429 rate limit slow model not found help fix problem offline faq question",
    render: (nav) => (
      <>
        <p>
          Most problems trace back to one of four things: the key, the model name, the provider's
          limits, or the platform you're on. Work down this list.
        </p>
        <Faq q="401 / 403 — “unauthorized” or “invalid key”">
          <p>
            The provider rejected your key. In <Go nav={nav} to="models">Model configuration</Go>,
            re-paste it (watch for spaces and missing characters), confirm it's for the right
            provider, and check the provider dashboard — keys can expire, hit quota, or be revoked.
            Some providers also need billing enabled before any key works.
          </p>
        </Faq>
        <Faq q="“Model not found”">
          <p>
            The selected model ID no longer exists on that provider — catalogs change weekly. Open
            the model selector, hit refresh, and pick a current one. For local providers, the model
            must actually be pulled/loaded (e.g. <Chip>ollama pull</Chip> first).
          </p>
        </Faq>
        <Faq q="429 — rate limited">
          <p>
            You're sending faster than your provider tier allows — common on free tiers and during
            parallel team waves or swarms. Wait a minute, lower swarm parallelism, or upgrade the
            provider tier. This is a provider-side ceiling, not a BrainEdge setting.
          </p>
        </Faq>
        <Faq q="Responses feel slow">
          <p>
            Speed is mostly the model and the provider's current load — bigger models think
            slower, and proxies that route between labs add hops. Try a smaller or faster model,
            measure your candidates on the{" "}
            <Go nav={nav} to="models-speed">Speed check</Go> page, and prefer providers that score
            well on time-to-first-token from your location.
          </p>
        </Faq>
        <Faq q="The status chip says offline">
          <p>
            For local providers: the server isn't running — start Ollama or LM Studio and refresh.
            For cloud: check your internet, then the key, then the provider's status page.
          </p>
        </Faq>
        <Faq q="It works on desktop but not in the browser">
          <p>
            By design, the web build can't run terminals or shell commands, can't clone repos, and
            folder access needs Chrome or Edge. For hands-on file and code work, the desktop app is
            the full experience.
          </p>
        </Faq>
        <Faq q="My conversations disappeared">
          <p>
            History is stored locally per device and per build — clearing browser data clears web
            history, and a different machine starts fresh. Use Backup in Settings, and export
            individual conversations to Markdown from the sidebar's download icon.
          </p>
        </Faq>
        <Faq q="A scheduled or webhook run did nothing">
          <p>
            Check the task's run history in the <Go nav={nav} to="scheduler">Scheduler</Go> for the
            error, confirm the app was running at trigger time, and for webhooks test{" "}
            <Chip>GET /hook/ping</Chip> first, then verify the bearer token.
          </p>
        </Faq>
        <Faq q="Where do I get more help?">
          <p>
            This guide is searchable — use the box at the top of the left rail. For agent-specific
            depth, the Agents section above covers memory, budgets, triggers, and the browser. And
            the <Go nav={nav} to="settings">Settings</Go> page links your account details if you
            need to reach support about plans or sign-in.
          </p>
        </Faq>
        <Callout tone="ok" title="The 60-second health check">
          Green online dot → key saved → model freshly picked from the live list → one short test
          message. If all four pass, the pipes are fine and the issue is task-specific.
        </Callout>
      </>
    ),
  },
];

/* ----------------------------------------------------------------------------
   The page: sticky TOC rail with search + scrollspy, content column, hero.
---------------------------------------------------------------------------- */

export default function UserGuide({ onNavigate }) {
  const bodyRef = useRef(null);
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const [q, setQ] = useState("");

  // Scrollspy: highlight the section whose heading most recently crossed the
  // top of the viewport. Cheap rAF-throttled scroll handler — no observers.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const fold = el.getBoundingClientRect().top + 130;
        let cur = SECTIONS[0].id;
        for (const s of SECTIONS) {
          const n = document.getElementById("ug-" + s.id);
          if (n && n.getBoundingClientRect().top <= fold) cur = s.id;
        }
        setActiveId(cur);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const jump = (id) => {
    const n = document.getElementById("ug-" + id);
    if (n) n.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  const needle = q.trim().toLowerCase();
  const visible = needle
    ? SECTIONS.filter(
        (s) => s.title.toLowerCase().includes(needle) || s.keywords.includes(needle)
      )
    : SECTIONS;

  return (
    <div className="ug-page">
      {/* ---- left rail: search + table of contents ---- */}
      <nav className="ug-rail scroll">
        <div className="ug-rail-head">
          <BookOpen size={15} /> User Guide
        </div>
        <div className="ug-search">
          <Search size={13} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search topics…"
            aria-label="Search guide topics"
          />
        </div>
        <div className="ug-toc">
          {visible.length === 0 && (
            <div className="ug-toc-empty">No matching topics — try a different word.</div>
          )}
          {visible.map((s) => (
            <button
              key={s.id}
              className={`ug-toc-item ${activeId === s.id ? "active" : ""}`}
              onClick={() => jump(s.id)}
            >
              <span className="ug-toc-num">{SECTIONS.indexOf(s) + 1}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ---- content column ---- */}
      <div className="ug-body scroll" ref={bodyRef}>
        <div className="ug-col">
          <header className="ug-hero">
            <div className="ug-hero-kicker">
              <BookOpen size={13} /> Handbook
            </div>
            <h1>BrainEdge User Guide</h1>
            <p className="ug-hero-sub">
              Everything BrainEdge can do — explained step by step, from your first chat to a
              scheduled team of agents working overnight. No jargon required.
            </p>
            <div className="ug-hero-chips">
              <button className="ug-hero-chip" onClick={() => jump("welcome")}>
                <Rocket size={12} /> 5-minute start
              </button>
              <button className="ug-hero-chip" onClick={() => jump("agents")}>
                <Bot size={12} /> Build an agent
              </button>
              <button className="ug-hero-chip" onClick={() => jump("teams")}>
                <Network size={12} /> Run a team
              </button>
              <button className="ug-hero-chip" onClick={() => jump("troubleshooting")}>
                <LifeBuoy size={12} /> Fix a problem
              </button>
            </div>
          </header>

          {SECTIONS.map((s, i) => (
            <section key={s.id} id={"ug-" + s.id} className="ug-section">
              <div className="ug-sec-kicker">Section {i + 1}</div>
              <h2>{s.title}</h2>
              {s.render(onNavigate)}
            </section>
          ))}

          <footer className="ug-footer">
            <GitBranch size={13} />
            <span>
              BrainEdge evolves quickly — screens may gain new buttons between releases, but the
              concepts in this guide stay true. Happy building.
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
