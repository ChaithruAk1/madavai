// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// sageKnowledge — Sage's control-level memory, with LOCAL retrieval.
//
// THE DESIGN (read SAGE-KNOWLEDGE-PROCESS.md for the full story):
//  - sage-knowledge/*.md hold ~300 entries documenting every field, checkbox, window
//    and section in the app, generated FROM SOURCE CODE (exact labels, real behavior).
//  - Injecting all of it into every Sage question would cost ~80k tokens. Instead this
//    module keyword-scores the entries against the question (plus a boost for the
//    screen the user is currently on) and returns only the TOP FEW — ~1-2k tokens.
//  - Retrieval is deterministic string scoring: zero model calls, zero network, zero
//    new dependencies, sub-millisecond. A weaker model gets the same perfect context.
//  - FAIL OPEN: missing/empty/malformed files simply mean fewer (or no) entries —
//    Sage then behaves exactly as before this feature existed. Nothing can break.
//
// Entry contract (the sweep agents write this; keep it stable):
//   ### <Screen> · <Exact control label>
//   aliases: word, word, …
//   What: … / Why: … / Behavior: … / Example: …

// Load every knowledge file at build time (Vite inlines them as raw strings).
// eager:true = no async; adding a new NN-area.md file is picked up automatically.
let _files = {};
try { _files = import.meta.glob("../sage-knowledge/*.md", { query: "?raw", import: "default", eager: true }); } catch { _files = {}; }

// App mode id → words that identify that screen in entry headings (screen boost).
const MODE_WORDS = {
  chat: ["chat", "composer", "surfaces"], cowork: ["collaborate", "composer", "surfaces"], code: ["build", "composer", "surfaces"],
  project: ["projects", "project"], agents: ["agent", "agents", "studio", "teams", "floor", "recruiter", "bench", "blueprint"],
  studio: ["studio", "launcher"], terminal: ["terminal"], scheduler: ["scheduler", "task", "webhook"],
  consumption: ["consumption", "usage"], connectors: ["connectors", "connector"], skills: ["skills", "skill"],
  plugins: ["plugins"], viamobile: ["mobile", "telegram"], settings: ["settings", "extras", "profile", "account"],
  "models": ["models", "provider", "picker"], "models-overview": ["models", "overview"], "models-speed": ["models", "speed"],
  guide: ["guide"], community: ["community"], requests: ["requests", "request"],
};

const STOP = new Set(["the", "and", "for", "what", "this", "that", "with", "how", "does", "can", "you", "are", "is", "it", "in", "on", "of", "to", "a", "i", "my", "me", "do", "why", "when", "where", "which", "from", "about", "tell", "mean", "use"]);
const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s&·-]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

// One-time parse: file blobs → [{ heading, aliases, body, headWords, aliasWords, bodyWords }]
let _entries = null;
function entries() {
  if (_entries) return _entries;
  const out = [];
  try {
    for (const raw of Object.values(_files)) {
      for (const chunk of String(raw).split(/\n(?=### )/)) {
        if (!chunk.startsWith("### ")) continue; // file header / comments — skip
        const heading = chunk.split("\n", 1)[0].replace(/^###\s*/, "").trim();
        const am = /(^|\n)aliases:\s*([^\n]+)/i.exec(chunk);
        const aliases = am ? am[2] : "";
        if (!heading || chunk.length < 40) continue; // malformed — skip, never throw
        out.push({
          text: chunk.trim(),
          headWords: new Set(words(heading)),
          aliasWords: new Set(words(aliases)),
          bodyWords: new Set(words(chunk)),
        });
      }
    }
  } catch { /* fail open: no entries */ }
  _entries = out;
  return out;
}

// The one public function: most-relevant entries for this question on this screen.
// Returns "" when nothing matches — the caller then sends the prompt unchanged.
export function retrieveKnowledge(question, mode, k = 6, maxChars = 5200) {
  try {
    const q = words(question);
    if (!q.length) return "";
    const boost = MODE_WORDS[mode] || [];
    const scored = [];
    for (const e of entries()) {
      let s = 0;
      for (const w of q) {
        if (e.headWords.has(w)) s += 4;        // the control's own name matters most
        else if (e.aliasWords.has(w)) s += 4;  // …or what users casually call it
        else if (e.bodyWords.has(w)) s += 1;
      }
      if (s > 0) for (const b of boost) if (e.headWords.has(b)) { s += 5; break; } // current screen wins ties
      if (s >= 4) scored.push([s, e.text]);    // threshold: at least one strong hit
    }
    scored.sort((a, b) => b[0] - a[0]);
    let out = "", n = 0;
    for (const [, text] of scored) {
      if (n >= k || out.length + text.length > maxChars) break;
      out += (out ? "\n\n" : "") + text; n++;
    }
    return out;
  } catch { return ""; } // any surprise → Sage works exactly as before
}

// For diagnostics / the User Guide (optional consumers): how much Sage knows.
export function knowledgeStats() {
  try { return { files: Object.keys(_files).length, entries: entries().length }; }
  catch { return { files: 0, entries: 0 }; }
}
