import { useState } from "react";
import { Folder, FileText, FilePlus, FilePen, TerminalSquare, Search, Wrench, Loader2, ChevronRight, Globe, MousePointerClick, Keyboard, ArrowLeft, Image as ImageIcon, ListChecks, Users, MessageCircleQuestion, Archive, BadgeCheck, Trash2, Bot } from "lucide-react";

// Turn a raw tool call into a human sentence + icon, like Cowork.
// EVERY tool the engine can emit needs a human label here — raw names like
// "browse_fill" are engine vocabulary and must never reach the user.
function describe(name, input = {}) {
  input = input || {};          // default param doesn't cover an explicit null
  name = String(name || "");    // undefined/null name must not throw on .startsWith
  const p = input.path || input.file_path || input.filePath || "";
  const trim = (s, n = 70) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; };
  switch (name) {
    case "list_dir":
    case "Glob": return { icon: Folder, verb: "Listed", obj: input.path || input.pattern || "folder" };
    case "list_files": return { icon: Folder, verb: "Listed", obj: "all project files" };
    case "read_file":
    case "Read": return { icon: FileText, verb: "Read", obj: p };
    case "write_file":
    case "Write": return { icon: FilePlus, verb: "Created", obj: p || "file" };
    case "edit_file":
    case "Edit": return { icon: FilePen, verb: "Edited", obj: p || "file" };
    case "delete_file": return { icon: Trash2, verb: "Deleted", obj: p || "file" };
    case "run_bash":
    case "Bash": return humanizeCommand(input.command);
    case "Grep":
    case "search":
    case "search_text": return { icon: Search, verb: "Searched", obj: input.pattern || input.query || "" };
    case "find_files": return { icon: Search, verb: "Found files", obj: input.pattern || "" };
    // Agent Browser — say what happened on the page, not the tool's name.
    case "browse_open": return { icon: Globe, verb: "Opened", obj: trim(input.url || "a web page") };
    case "browse_read": return { icon: Globe, verb: "Read", obj: "the page" };
    case "browse_click": return { icon: MousePointerClick, verb: "Clicked", obj: input.n != null ? `item ${input.n} on the page` : "on the page" };
    case "browse_fill": return { icon: Keyboard, verb: "Typed", obj: trim(input.text ? `"${input.text}"` : "into the page", 60) };
    case "browse_back": return { icon: ArrowLeft, verb: "Went back", obj: "a page" };
    // Desktop Applications Driver — plain words for native-app actions.
    case "desktop_apps": return { icon: Globe, verb: "Looked at", obj: "the open app windows" };
    case "desktop_focus": return { icon: MousePointerClick, verb: "Switched to", obj: input.n != null ? `app window ${input.n}` : "an app window" };
    case "desktop_read": return { icon: Globe, verb: "Read", obj: "the app window" };
    case "desktop_click": return { icon: MousePointerClick, verb: "Clicked", obj: input.n != null ? `item ${input.n} in the app` : "in the app" };
    case "desktop_type": return { icon: Keyboard, verb: "Typed", obj: trim(input.text ? `"${input.text}"` : "into the app", 60) };
    case "desktop_open": return { icon: Globe, verb: "Opened", obj: trim(input.app || "an app") };
    case "deep_research": return { icon: Search, verb: "Researched", obj: trim(input.query || "the web") };
    // Newer abilities
    case "create_image": return { icon: ImageIcon, verb: "Created image", obj: trim(input.prompt || "") };
    case "set_plan": return { icon: ListChecks, verb: "Updated", obj: "the working plan" };
    case "compact_context": return { icon: Archive, verb: "Tidied", obj: "its working notes" };
    case "reviewer": return { icon: BadgeCheck, verb: "Reviewed", obj: input.file || "the change" };
    case "ask_user": return { icon: MessageCircleQuestion, verb: "Asked you", obj: trim(input.question || "a question") };
    case "load_skill": return { icon: Wrench, verb: "Used skill", obj: input.name || "" };
    case "web_fetch": return { icon: Globe, verb: "Fetched", obj: trim(input.url || "a web page") };
    case "web_search": return { icon: Search, verb: "Searched the web for", obj: trim(input.query || "") };
    case "spawn_subagent": return { icon: Bot, verb: "Delegated", obj: trim(input.task || "a sub-task") };
    default: {
      // Dynamic names ("call_agent → Scout", "explore_parallel (2 scouts)", "Team plan — …")
      if (name.startsWith("call_agent")) return { icon: Users, verb: "Handed off to", obj: name.split("→")[1]?.trim() || "an agent" };
      if (name.startsWith("explore_parallel")) return { icon: Search, verb: "Scouted", obj: "the project in parallel" };
      if (name.startsWith("mcp__")) { const parts = name.split("__"); return { icon: Wrench, verb: "Used " + (parts[1] || "connector"), obj: parts[2] || "" }; }
      // Last resort: humanize snake_case instead of leaking it raw.
      return { icon: Wrench, verb: name.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase()), obj: "" };
    }
  }
}

// Shell commands get a plain-English headline ("Created folder ABCD", never
// "Ran mkdir ABCD"); the literal command stays in the card's expandable detail.
function humanizeCommand(cmd) {
  let c = String(cmd || "").trim();
  // Unwrap things that hide the real command from the matcher (so steps aren't all "the terminal"):
  // a leading `cd <dir> &&`/`;`, a `set FOO=bar &&` or `FOO=bar ` env prefix, and `bash -c "…"`.
  c = c.replace(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*/i, "");
  c = c.replace(/^set\s+\w+=\S*\s*(?:&&|;)\s*/i, "");
  c = c.replace(/^(?:\w+=\S*\s+)+/, "");
  const wrap = /^(?:bash|sh|cmd(?:\s+\/c)?|powershell|pwsh)\s+(?:-\S+\s+)*["']([\s\S]+?)["']\s*$/i.exec(c);
  if (wrap && wrap[1]) c = wrap[1].trim();
  const arg = (re) => { const m = re.exec(c); return (m && m[1] || "").replace(/^["']|["']$/g, ""); };
  const base = (p) => String(p || "").replace(/^["']|["']$/g, "").split(/[\\/]/).pop();
  let verb = "Ran", obj = "";
  if (/^mkdir\s/i.test(c)) { verb = "Created folder"; obj = base(arg(/^mkdir\s+(?:-p\s+)?(\S+)/i)); }
  else if (/^(rmdir|rm|del|Remove-Item)\s/i.test(c)) { verb = "Deleted"; obj = base(arg(/\s(?:-\S+\s+)*(\S+)\s*$/)); }
  else if (/^(copy|cp|Copy-Item)\s/i.test(c)) { verb = "Copied"; obj = base(arg(/^\S+\s+(?:-\S+\s+)*(\S+)/)); }
  else if (/^(move|mv|ren|rename|Move-Item)\s/i.test(c)) { verb = "Moved"; obj = base(arg(/^\S+\s+(\S+)/)); }
  else if (/^(dir|ls|Get-ChildItem)\b/i.test(c)) { verb = "Listed"; obj = "a folder"; }
  else if (/^(type|cat|Get-Content|head|tail|more)\s/i.test(c)) { verb = "Viewed"; obj = base(arg(/^\S+\s+(?:-\S+\s+)*(\S+)/)); }
  else if (/^git\s+(\w+)/i.test(c)) { verb = "Git:"; obj = arg(/^git\s+(\w+)/i); }
  else if (/^npm\s+(?:i|install)\b/i.test(c)) { verb = "Installed"; obj = "packages"; }
  else if (/^npm\s+(?:run\s+)?(\S+)/i.test(c)) { verb = "Ran the"; obj = arg(/^npm\s+(?:run\s+)?(\S+)/i) + " script"; }
  else if (/^(node|python|python3|py)\b/i.test(c)) {
    verb = "Ran";
    if (/\s-c\b/.test(c)) obj = "a calculation";
    else { const s = (/(?:^|\s)(\S+\.(?:py|js|mjs|cjs|ts|sh))\b/i.exec(c) || [])[1]; obj = s ? base(s) : "a script"; }
  }
  else if (/^(curl|wget|Invoke-WebRequest)\s/i.test(c)) { verb = "Downloaded"; obj = "from the web"; }
  else { const snip = c.split(/\s+/).slice(0, 4).join(" "); obj = snip.length > 48 ? (snip.slice(0, 48) + "…") : snip; } // informative default — a snippet, never just "the terminal"
  return { icon: TerminalSquare, verb, obj: obj || "a command", mono: false };
}

// Heuristic: does this tool output look like a unified diff we should color?
function isDiff(s) { return /^@@ /m.test(s) && /^[+-]/m.test(s); }

export default function ToolCard({ name, input, output, status, image }) {
  const [open, setOpen] = useState(false);
  const d = describe(name, input);
  const Icon = d.icon;

  return (
    <div className={`tool2 ${status}`}>
      <button className="tool2-row" onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={14} className="chev" style={{ transform: open ? "rotate(90deg)" : "none" }} />
        <span className="tool2-ic"><Icon size={15} /></span>
        <span className="tool2-text">
          <span className="verb">{d.verb}</span>{" "}
          <span className={`obj ${d.mono ? "mono" : ""}`}>{d.obj}</span>
        </span>
        <span className="tool2-status">
          {status === "run" && <Loader2 size={13} className="spin" />}
          {status === "deny" && <span className="s-deny">declined</span>}
        </span>
      </button>
      {/* Generated images show right in the card — always visible, no expand needed */}
      {image && (
        <div className="tool2-img">
          <img src={image} alt={String((input && input.prompt) || "generated image")} />
          <a href={image} download={"image-" + Date.now() + ".png"} className="tool2-img-dl">Download</a>
        </div>
      )}
      {open && (
        <div className="tool2-detail">
          {input && input.command && (
            <pre className="mono-block"><span className="prompt">$</span> {input.command}</pre>
          )}
          {input && !input.command && Object.keys(input).length > 0 && (
            <pre className="mono-block dim">{JSON.stringify(input, null, 2)}</pre>
          )}
          {output && (isDiff(output)
            ? <pre className="mono-block out diff">{output.split("\n").map((ln, i) => (
                <div key={i} className={ln.startsWith("+") ? "d-add" : ln.startsWith("-") ? "d-del" : ln.startsWith("@@") ? "d-hunk" : ""}>{ln || " "}</div>
              ))}</pre>
            : <pre className="mono-block out">{output}</pre>)}
        </div>
      )}
    </div>
  );
}
