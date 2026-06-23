// src/bridge/ragLite.js — RE-EXPORT SHIM. The implementation moved to core/projects/context.js so there
// is ONE copy used by BOTH web and desktop (ADR-0001 single-source). Kept as a thin shim so existing
// imports (webBridge.js, tests) keep working unchanged.
export { chunkText, selectRelevant, buildKnowledgeContext } from "../../core/projects/context.js";
