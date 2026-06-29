# Madav — Provenance Scan (first-pass, factual)
_Heuristic derivation audit run on the MadavNew repo. NOT a certified forensic/legal analysis — see caveats._

## Verdict
**No evidence of literal code copying from Open WebUI.** The only material tie to Claude is the **published `@anthropic-ai/claude-agent-sdk`** (a legitimate npm dependency, used as intended). The codebase reads as an **independent TypeScript/React implementation**, inspired by Open WebUI's *ideas* (documented as competitive analysis) and built on Anthropic's public Agent SDK.

## Evidence

| Check | Finding | Reading |
|---|---|---|
| **Stack** | Open WebUI = Python + Svelte; Madav = TypeScript + React | A literal copy is structurally impossible — different language *and* framework |
| **Code fingerprints** | **Zero** Open WebUI identifiers (`open_webui`, `WEBUI_*`), no Python idioms (`def`/`self`/`pydantic`/`fastapi`), no Svelte, none of OWUI's deps (`chromadb`, `langchain`, `sentence_transformers`) | No OWUI code present |
| **RAG** | Madav's RAG is its **own** `@madav/knowledge` (feature-hashing + pgvector), not OWUI's chromadb/langchain | Independently built |
| **License headers** | Every source header is Madav's own (`© Samskruthi Harish. Madav`); no foreign headers | Copied code almost always drags foreign headers — there are none |
| **Dependencies** | 36 normal deps; **no** open-webui/ollama-webui packages | Not a fork |
| **"Open WebUI" in history** | Appears **only in comparison docs** (`Madav_vs_OpenWebUI_*`), never in code | You *analyzed* a competitor and reimplemented the principle — documented independent work, the opposite of copying |
| **Claude tie** | `electron/agent-transport.cjs` imports `@anthropic-ai/claude-agent-sdk` | Anthropic's official SDK, published for building agents — intended use, not copying source |

## What an audit WOULD surface (and how to read it)
- **`@anthropic-ai/claude-agent-sdk` dependency** — legitimate, but the one visible, material tie to Anthropic (vendor lock-in; the "not Claude" positioning is awkward when the agent runtime *is* Claude's SDK). A strategic decision, **not** infringement.
- **Comparison docs** in the repo — normal competitive analysis; evidence you studied, not stole.
- **Legacy "BrainEdge"** name across ~33 commits — a rebrand artifact.
- **Feature/UX parallels** to both — circumstantial; ideas/APIs/UX aren't copyrightable.

## Caveats (read before relying on this)
- This is a **first-pass heuristic** scan, not a certified forensic clean-room analysis. For an acquisition / litigation / serious due-diligence, run a commercial code-provenance/SCA tool **and** have an IP attorney review. I am not a lawyer.
- It covers committed code on the current branch; other branches, uncommitted work, or external assets would need separate checks.

## So what to "fix"?
1. **Code copying:** nothing found → nothing to clean-room rewrite.
2. **The one real Claude tie = the Agent SDK.** If you want vendor independence / the "not Claude" stance to be literally true, that's an **architecture** project (replace the SDK with your own agent loop), not a provenance scrub. If you're fine depending on a public SDK (most products are), leave it.
3. **Comparison docs:** keep internal (`_planning`) if you don't want them shipped — but they're harmless and actually prove independence.
4. **Git history:** since the code is original, there is nothing to hide — a genuine, clean history is your **best** evidence of originality. Don't rewrite it to "look" cleaner.
