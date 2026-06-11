// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Voice — push-to-talk transcription. The renderer records audio (MediaRecorder)
// and sends it here; we transcribe through the user's OWN OpenAI-compatible Whisper
// endpoint (OpenAI or Groq key — whichever profile has one). No new accounts, no
// bundled speech engine. Spoken replies use the OS speech synthesis in the renderer.
const settings = require("./settings.cjs");

// Known Whisper-capable hosts → default model.
const STT_HOSTS = [
  { match: /api\.openai\.com/i, model: "whisper-1" },
  { match: /api\.groq\.com/i, model: "whisper-large-v3-turbo" },
];

function sttProfile(cfg) {
  // Explicit override first: settings.voiceStt = { profileId, model, path }
  const ov = cfg.voiceStt || {};
  if (ov.profileId && cfg.profiles[ov.profileId] && cfg.profiles[ov.profileId].apiKey) {
    const p = cfg.profiles[ov.profileId];
    return { p, model: ov.model || "whisper-1", path: ov.path || "/v1/audio/transcriptions" };
  }
  for (const p of Object.values(cfg.profiles || {})) {
    if (!p.apiKey) continue;
    const hit = STT_HOSTS.find((h) => h.match.test(p.baseUrl || ""));
    if (hit) return { p, model: hit.model, path: p.baseUrl.includes("groq") ? "/openai/v1/audio/transcriptions" : "/v1/audio/transcriptions" };
  }
  return null;
}

async function transcribe({ b64, mime }) {
  try {
    const cfg = settings.load();
    const stt = sttProfile(cfg);
    if (!stt) return { error: "Voice input needs a Whisper-capable key — add an OpenAI or Groq API key in Settings → Models, then try again." };
    if (!b64) return { error: "No audio captured." };
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 1200) return { error: "That recording was too short — hold the mic and speak." };
    if (buf.length > 24 * 1024 * 1024) return { error: "Recording too long — keep it under ~2 minutes." };

    const form = new FormData();
    const ext = /ogg/.test(mime || "") ? "ogg" : /mp4|m4a/.test(mime || "") ? "m4a" : "webm";
    form.append("file", new Blob([buf], { type: mime || "audio/webm" }), "speech." + ext);
    form.append("model", stt.model);

    const base = (stt.p.baseUrl || "").replace(/\/$/, "");
    const res = await fetch(base + stt.path, {
      method: "POST",
      headers: { Authorization: "Bearer " + stt.p.apiKey },
      body: form,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 220);
      return { error: `Transcription failed (${res.status} from ${stt.p.name}): ${body}` };
    }
    const j = await res.json();
    const text = String(j.text || "").trim();
    if (!text) return { error: "Nothing was transcribed — try speaking a little longer." };
    return { text, provider: stt.p.name, model: stt.model };
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 300) };
  }
}

module.exports = { transcribe };
