---
name: mcp-builder
description: Design and build a connector (MCP server) for Madav — wrapping an external API or service so Madav's agents can use it as tools. Use when the user wants to "build a connector", "add an integration", "wrap an API", "create an MCP server", or expose a service to Madav.
license: © 2026 Samskruthi Harish. Madav — Proprietary.
---
# Building a connector (MCP server) for Madav

Madav reaches connectors over MCP: each connector is a small server that exposes **tools** (named
functions). Madav lists those tools to the model, the model calls them, and the results come back as
text. A good connector is a thin, well-described wrapper around a service's API.

## Design the tools first
- **One job per tool.** `search_orders`, `create_invoice` — not a single `do_everything` tool.
- **Sharp names + descriptions.** The description is what the model reads to decide when to call it.
  Say what it does, when to use it, and what it returns, in one or two sentences.
- **Tight JSON schemas.** Mark required params; give each a short description; prefer enums over free text
  where the values are fixed. Validate inputs and fail with a clear message, not a stack trace.
- **Concise text results.** Return the few fields the model actually needs (summaries, ids, links) —
  never dump raw payloads; cap large outputs. Never return secrets.

## Build it
- Use the official MCP SDK (Python `mcp` / FastMCP, or the TypeScript SDK). Implement each tool, keep
  auth/keys in the server's own environment, and handle errors so one bad call doesn't crash the server.
- Time-box outbound calls; return a useful message on timeout (Madav also time-boxes the connect).
- Test each tool in isolation before wiring it up.

## Add it to Madav
- Host the server (stdio for local, or HTTP/SSE for remote) and add it on the **Connectors page**.
- Remember per-process scoping: a connector is enabled on the Connectors page (master), then turned on
  per process (Chat / Collaborate / Build / Projects) from each composer's `+` menu, and per-agent via
  the agent's Connectors capability.

Keep the surface small and the descriptions sharp — that's what makes the model use it correctly.
