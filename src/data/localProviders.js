// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// SINGLE SOURCE for how a local RUNTIME (Ollama / LM Studio / llama.cpp) maps to a Madav provider PROFILE
// (display name + OpenAI-compatible baseUrl). Both the provider quick-add presets (ModelConfig) and the
// Local Models page (which auto-syncs pulled models into a profile so they appear in the model selector and
// the Models overview) read THIS file, so the baseUrl/kind/name live in exactly one place. HuggingFace has no
// profile of its own: its GGUF models are pulled THROUGH Ollama (named hf.co/...), so they live under Ollama.
export const LOCAL_PROVIDERS = [
  { runtime: "ollama", name: "Ollama (local)", kind: "openai", baseUrl: "http://localhost:11434/v1" },
  { runtime: "lmstudio", name: "LM Studio (local)", kind: "openai", baseUrl: "http://localhost:1234/v1" },
  { runtime: "llamacpp", name: "llama.cpp (local)", kind: "openai", baseUrl: "http://localhost:8080/v1" },
];

// The quick-add preset rows (name/kind/baseUrl) that ModelConfig spreads into its provider list.
export const LOCAL_PRESETS = LOCAL_PROVIDERS.map(({ name, kind, baseUrl }) => ({ name, kind, baseUrl }));

// Runtime id (from @madav/models) -> which local provider profile its models belong to.
const RUNTIME_TO_PROVIDER = { ollama: "ollama", huggingface: "ollama", lmstudio: "lmstudio" };

export function providerForRuntime(runtimeId) {
  const key = RUNTIME_TO_PROVIDER[runtimeId] || runtimeId;
  return LOCAL_PROVIDERS.find((p) => p.runtime === key) || null;
}
