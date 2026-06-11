# Madav CLI

A terminal coding agent that works with any provider. You `cd` into a project and run it;
no folder picker, full power (it can read/write/edit files **and run commands**).

## Setup (one time)

1. Make sure you have **Node ≥ 18** (`node -v`).
2. Create a config file at `~/.madav/config.json` (or `C:\Users\<you>\.madav\config.json`):
   ```json
   {
     "baseUrl": "https://openrouter.ai/api/v1",
     "apiKey": "sk-or-...",
     "model": "deepseek/deepseek-chat",
     "kind": "openai"
   }
   ```
   (Or set env vars `MADAV_BASE_URL`, `MADAV_API_KEY`, `MADAV_MODEL`.)
3. Make the `madav` command available everywhere — from the project folder:
   ```
   npm link
   ```
   (or `npm install -g .`). Now `madav` works in any folder, in PowerShell or the VS Code terminal.

## Use

```
cd C:\path\to\your\project
madav
```
Then just type what you want done. Examples: *"add a dark navbar to index.html"*, *"find where we call the
auth API and add a retry"*, *"run the tests and fix the failure"*.

Without installing, you can also run it directly:
```
node C:\Projects\ClaudeCodeUI\Madav\cli\brainedge.mjs
```

## Commands

- `/model [id]` — show or switch the model
- `/clear` — start a fresh conversation
- `/skills` — list skills · `/reload` — re-scan skills
- `/init` — create a `MADAV.md` project guide (auto-read every session; existing `CLAUDE.md`/`AGENTS.md` files are also read for compatibility)
- `/cwd` — show the working folder · `/cost` — rough token estimate
- `/auto` — toggle auto-approve (no confirmation prompts) · `/exit`

Flags: `madav --yes` (auto-approve everything) · `madav --model <id>`.

## Skills

Drop skill folders (each with a `SKILL.md` that has `name:` and `description:` frontmatter) into any of:
`.madav/skills/` (in your project), `skills/`, or `~/.madav/skills/`. The agent sees the list and
calls `load_skill` to pull full instructions when relevant — same progressive‑disclosure model as the app.

## Safety

By default the agent **asks before** writing files, editing, or running commands. Approve with `y`. Use
`--yes` / `/auto` only when you trust the task. It's sandboxed to the folder you launched it in.
