// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Failure alerts — desktop notification + optional Telegram ping when a run errors or exceeds
// a cost/latency budget. Reuses the Telegram credentials already in settings.messaging. Fully
// guarded: every path is wrapped so an alert can never throw into the caller (scheduler/trace).
const settings = require("./settings.cjs");

function conf() { try { return settings.load().alerts || {}; } catch { return {}; } }

async function fire({ title, body }) {
  const a = conf();
  if (a.enabled === false) return;
  // 1) Desktop notification (always, unless alerts disabled)
  try {
    const { Notification } = require("electron");
    if (Notification && Notification.isSupported && Notification.isSupported()) {
      new Notification({ title: title || "Madav alert", body: String(body || "").slice(0, 400) }).show();
    }
  } catch {}
  // 2) Telegram ping (opt-in via alerts.channel) — reuses Settings → Messaging credentials
  try {
    const ch = a.channel || "desktop";
    if (ch === "telegram" || ch === "both") {
      const cfg = settings.load();
      const m = cfg.messaging || {};
      const token = m.telegramToken || m.token;
      const chatId = String((m.allowed || "").split(/[,\s]+/).filter(Boolean)[0] || m.chatId || "");
      if (token && chatId) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `⚠️ ${title}\n${body || ""}`.slice(0, 3800) }),
        });
      }
    }
  } catch {}
}

// Called by trace-store when any run completes — threshold checks for interactive/agent runs.
function onRunFinalized(run) {
  try {
    const a = conf();
    if (a.enabled === false || !run) return;
    const reasons = [];
    if (a.onError !== false && run.status === "error") reasons.push("failed: " + (run.error || "unknown error"));
    if (a.costPerRunUSD && run.costUSD && run.costUSD >= a.costPerRunUSD) reasons.push(`cost $${run.costUSD} ≥ $${a.costPerRunUSD}`);
    if (a.latencyMs && run.durationMs && run.durationMs >= a.latencyMs) reasons.push(`took ${Math.round(run.durationMs / 1000)}s ≥ ${Math.round(a.latencyMs / 1000)}s`);
    if (reasons.length) fire({ title: `Madav run ${run.status === "error" ? "failed" : "alert"} — ${run.model || run.mode || ""}`.trim(), body: reasons.join(" · ") });
  } catch {}
}

// Called by the scheduler when a background/scheduled task finishes.
function onTaskResult(task, result) {
  try {
    const a = conf();
    if (a.enabled === false || a.onTaskError === false) return;
    if (result && result.status === "error") {
      fire({ title: `Scheduled task failed: ${(task && (task.name || task.id)) || "task"}`, body: String((result.output || "").slice(0, 300)) });
    }
  } catch {}
}

module.exports = { fire, onRunFinalized, onTaskResult };
