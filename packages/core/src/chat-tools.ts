// @madav/core — the chat tool SCHEMAS shared by every runtime (name/description/parameters live here ONCE,
// so a tool can never exist on one surface and not another). Executors stay per-runtime; only the
// model-facing schema is shared.
import type { ToolSchema } from './chat-loop.js';

export const WEB_SEARCH_SCHEMA: ToolSchema = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      "Search the web and return the top results (title + URL). Use for ANYTHING current or beyond your training data — news, recent events, latest releases, current prices, 'today'/'now'/'latest'. Quick and lightweight. For an in-depth multi-source cited report use deep_research instead. After searching, answer from the results and cite the URLs — never claim you cannot access the internet.",
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'the search query' } }, required: ['query'] },
  },
};

export const WEB_FETCH_SCHEMA: ToolSchema = {
  type: 'function',
  function: {
    name: 'web_fetch',
    description:
      'Fetch a specific web page by URL and return its readable text. Use when the user gives you a URL or asks you to open/read/summarize a specific page (use web_search to FIND pages by query). Never say you cannot browse a URL — call this.',
    parameters: { type: 'object', properties: { url: { type: 'string', description: 'the http(s) URL to fetch' } }, required: ['url'] },
  },
};

export const CREATE_IMAGE_SCHEMA: ToolSchema = {
  type: 'function',
  function: {
    name: 'create_image',
    description:
      'Generate an IMAGE (raster picture) from a text prompt using the selected image-output model; the image is shown to the user automatically. Use ONLY for actual pictures: photos, illustrations, logos, artwork, or a diagram rendered as a picture. NEVER call this for a document, spreadsheet, slide deck, or PDF — those are produced as a document spec, not with create_image.',
    parameters: { type: 'object', properties: { prompt: { type: 'string', description: 'a vivid, complete description of the image' } }, required: ['prompt'] },
  },
};

export const DEEP_RESEARCH_SCHEMA: ToolSchema = {
  type: 'function',
  function: {
    name: 'deep_research',
    description:
      'Run a deep multi-source web research pass: plans search queries, reads several sources in parallel, and returns a synthesized, citation-numbered report with a source list. Prefer over a single web_search for open-ended, comparative, or multi-faceted questions.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'the research question to investigate' },
        queries: { type: 'array', items: { type: 'string' }, description: 'optional 2-5 sub-questions to steer the research' },
        focus: { type: 'string', description: 'optional extra angle/constraint to steer the research' },
      },
      required: ['query'],
    },
  },
};

export const SHARED_CHAT_TOOLS: ToolSchema[] = [WEB_SEARCH_SCHEMA, WEB_FETCH_SCHEMA, CREATE_IMAGE_SCHEMA, DEEP_RESEARCH_SCHEMA];
export const SHARED_CHAT_TOOL_NAMES: string[] = SHARED_CHAT_TOOLS.map((t) => (t.function && t.function.name) || '');
