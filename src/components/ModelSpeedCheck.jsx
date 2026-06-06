import { useEffect, useState } from "react";
import { Zap, Play, Square, AlertCircle, Search } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { MODELS } from "../data/modelCatalog.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const PRESETS = [
  { label: "Short", text: "Write a haiku about the ocean." },
  { label: "Medium", text: "In about 150 words, explain what makes a good API design." },
  { label: "Long", text: "Write ~300 words explaining how large language models generate text, step by step, for a smart beginner." },
  { label: "Code", text: "Write a Python function that returns the nth Fibonacci number iteratively, with a docstring." },
];

// Map a catalog provider name to one of the user's configured profiles (cloud + local).
function matchProfile(profiles, providerName) {
  const hints = {
    "Anthropic": (p) => p.kind === "anthropic",
    "OpenAI": (p) => /openai\.com/i.test(p.baseUrl),
    "OpenRouter