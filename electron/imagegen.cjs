// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// imagegen.cjs — TEXT→IMAGE through the model selector. No separate key system:
// the active profile + model do the work. Primary path is the OpenAI-compatible
// chat/completions call with modalities ["image","text"] (OpenRouter serves Gemini
// image / GPT Image / FLUX through it — one existing key covers all of them).
// The user simply selects an image-output model in the model picker and asks.
// Images are saved to userData/creations/ and shown directly in the tool card.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const dir = () => { const d = path.join(app.getPath("userData"), "creations"); try { fs.mkdirSync(d, { recursive: true }); } catch {} return d; };

// Returns { file, dataUrl } or throws with a human, fixable message.
async function generateImage(profile, prompt) {
  if (!profile || !profile.baseUrl) throw new Error("No provider configured — add one in Model configuration.");
  if (profile.kind === "anthropic") throw new Error("This provider can't generate images. Pick an image-output model in the model picker (e.g. google/gemini-2.5-flash-image on OpenRouter).");
  const url = profile.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(profile.apiKey ? { Authorization: `Bearer ${(profile.apiKey || "").trim()}` } : {}) },
    body: JSON.stringify({
      model: profile.model,
      messages: [{ role: "user", content: String(prompt || "").slice(0, 2000) }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`The selected model ("${profile.model}") couldn't generate an image (${res.status}). Pick an image-output model in the model picker — on OpenRouter try google/gemini-2.5-flash-image. ${body}`);
  }
  const j = await res.json().catch(() => ({}));
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  const img = msg && Array.isArray(msg.images) && msg.images[0];
  const dataUrl = img && img.image_url && img.image_url.url;
  if (!dataUrl || !/^data:image\//.test(dataUrl)) {
    throw new Error(`"${profile.model}" answered with text but no image — it isn't an image-output model. Pick one in the model picker (e.g. google/gemini-2.5-flash-image on OpenRouter).`);
  }
  // Save to disk so the creation outlives the chat.
  const m = /^data:image\/(\w+);base64,(.+)$/s.exec(dataUrl);
  let file = "";
  if (m) {
    file = path.join(dir(), `img_${Date.now().toString(36)}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
    try { fs.writeFileSync(file, Buffer.from(m[2], "base64")); } catch { file = ""; }
  }
  return { file, dataUrl };
}

module.exports = { generateImage };
