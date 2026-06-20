// core/chat-tools.js — SINGLE SOURCE for the chat tool SCHEMAS shared by web AND desktop. The schemas
// (name/description/parameters) live here ONCE so a tool can never exist on one surface and not the
// other (the "web has web_fetch, desktop doesn't" class of bug). The EXECUTORS stay per-surface (web
// fetches via the server proxy, desktop via research.cjs/imagegen) — only the model-facing schema is shared.
//
// "remember" is intentionally NOT here: it needs a long-term memory backend that exists on web but not
// desktop, so it's a documented web-only extra, not an accidental drift. Add it here once desktop grows a
// memory store.

export const WEB_SEARCH_SCHEMA = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web and return the top results (title + URL) for a query. Use this for ANYTHING current or beyond your training data — news, recent events, latest releases, current prices, 'today'/'now'/'latest'. Quick and lightweight (no approval needed). For an in-depth multi-source cited report use deep_research instead. After searching, answer from the results and cite the URLs — never claim you cannot access the internet.",
    parameters: { type: "object", properties: { query: { type: "string", description: "the search query" } }, required: ["query"] },
  },
};

export const WEB_FETCH_SCHEMA = {
  type: "function",
  function: {
    name: "web_fetch",
    description: "Fetch a specific web page by URL and return its readable text. Use when the user gives you a URL or asks you to open/read/summarize a specific page (use web_search to FIND pages by query). No approval needed. Never say you cannot browse a URL — call this.",
    parameters: { type: "object", properties: { url: { type: "string", description: "the http(s) URL to fetch" } }, required: ["url"] },
  },
};

export const CREATE_IMAGE_SCHEMA = {
  type: "function",
  function: {
    name: "create_image",
    description: "Generate an IMAGE (raster picture) from a text prompt using the user's selected model (must be an image-output model, e.g. google/gemini-2.5-flash-image on OpenRouter). The image is shown to the user automatically. Use ONLY for actual pictures: photos, illustrations, logos, artwork, or a diagram rendered as a picture. NEVER call this for a document, spreadsheet, slide deck, presentation, or PDF — those are produced with a fenced officedoc block, not with create_image. If unsure, do not call it.",
    parameters: { type: "object", properties: { prompt: { type: "string", description: "a vivid, complete description of the image" } }, required: ["prompt"] },
  },
};

export const DEEP_RESEARCH_SCHEMA = {
  type: "function",
  function: {
    name: "deep_research",
    // Superset params so BOTH executors work: desktop reads query+focus, web reads query+queries.
    description: "Run a deep multi-source web research pass: plans search queries, reads several sources in parallel, and returns a synthesized, citation-numbered report with a source list. Prefer over a single web_search for open-ended, comparative, or multi-faceted questions.",
    parameters: { type: "object", properties: {
      query: { type: "string", description: "the research question to investigate" },
      queries: { type: "array", items: { type: "string" }, description: "optional 2-5 sub-questions to steer the research" },
      focus: { type: "string", description: "optional extra angle/constraint to steer the research" },
    }, required: ["query"] },
  },
};

// The cross-surface chat tools, in order. Each surface filters by capability (image-gen on, web access
// on, deep-research on) and adds its own surface-only extras (e.g. web's "remember", desktop's file tools).
export const SHARED_CHAT_TOOLS = [WEB_SEARCH_SCHEMA, WEB_FETCH_SCHEMA, CREATE_IMAGE_SCHEMA, DEEP_RESEARCH_SCHEMA];
export const SHARED_CHAT_TOOL_NAMES = SHARED_CHAT_TOOLS.map((t) => t.function.name);
