// Madav for Chrome — service worker.
// The side panel (the "brain") sends three commands here; we inject tiny functions
// into the active tab to OBSERVE the page or ACT on it, and handle navigation.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// --- functions injected INTO the page (run in the page's world) ---

function observePage() {
  const sel = "a,button,input,textarea,select,[role=button],[role=link],[contenteditable=true],[onclick]";
  const els = Array.from(document.querySelectorAll(sel));
  const out = [];
  let i = 0;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const visible = r.width > 1 && r.height > 1 && r.bottom > -120 && r.top < window.innerHeight + 120;
    if (!visible) continue;
    el.setAttribute("data-tf", String(i));
    let label = (el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 90);
    out.push({ i, tag: el.tagName.toLowerCase(), type: el.getAttribute("type") || "", label });
    i++;
    if (i >= 60) break;
  }
  return {
    url: location.href,
    title: document.title,
    text: (document.body ? document.body.innerText : "").replace(/\s+\n/g, "\n").slice(0, 2500),
    elements: out,
  };
}

function actPage(cmd) {
  const el = cmd.index != null ? document.querySelector('[data-tf="' + cmd.index + '"]') : null;
  try {
    if (cmd.action === "click") {
      if (!el) return "error: no element " + cmd.index;
      el.scrollIntoView({ block: "center" });
      el.click();
      return "clicked #" + cmd.index;
    }
    if (cmd.action === "type") {
      if (!el) return "error: no element " + cmd.index;
      el.focus();
      if (el.isContentEditable) { el.textContent = cmd.text; }
      else { el.value = cmd.text; }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return "typed into #" + cmd.index;
    }
    if (cmd.action === "submit") {
      if (el && el.form) { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); return "submitted"; }
      const active = document.activeElement;
      if (active) { active.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return "pressed enter"; }
      return "nothing to submit";
    }
    if (cmd.action === "scroll") {
      window.scrollBy(0, cmd.text === "up" ? -700 : 700);
      return "scrolled " + (cmd.text || "down");
    }
  } catch (e) {
    return "error: " + (e && e.message);
  }
  return "unknown action";
}

// --- Flow Recorder: record a workflow in REAL Chrome → Madav skill draft ---
// Injected into the recorded tab on every page load; reports clicks/fills/navigations
// back here. Credential fields (password/card/otp/...) are redacted AT THE SOURCE.

function recordPage() {
  if (window.__madavRecOn) return "already";
  window.__madavRecOn = true;
  const FORBIDDEN = /passw|cvv|cvc|card.?num|cardnumber|ccnum|cc-(number|exp|csc)|expir|ssn|social.?sec|secret|otp|\bpin\b/i;
  const send = (e) => { try { chrome.runtime.sendMessage({ type: "rec-event", e }); } catch {} };
  const nameOf = (el) => {
    let s = el.getAttribute && (el.getAttribute("aria-label") || "");
    if (!s && el.labels && el.labels[0]) s = el.labels[0].innerText;
    if (!s) s = (el.innerText || el.value || el.placeholder || el.title || el.name || "").trim();
    return String(s).replace(/\s+/g, " ").slice(0, 70);
  };
  document.addEventListener("click", (ev) => {
    const el = ev.target && ev.target.closest && ev.target.closest("a,button,[role=button],[role=link],[role=tab],input[type=submit],input[type=checkbox],input[type=radio],select,[onclick]");
    if (el) send({ t: "click", role: el.tagName.toLowerCase(), name: nameOf(el), at: Date.now() });
  }, { capture: true, passive: true });
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (!el || !el.tagName || !/INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
    const meta = [(el.type || ""), el.name || "", el.id || "", el.placeholder || "", (el.labels && el.labels[0] && el.labels[0].innerText) || ""].join(" ");
    const secret = el.type === "password" || FORBIDDEN.test(meta);
    send({ t: "fill", field: nameOf(el) || el.name || el.type, value: secret ? "(redacted — credential field)" : String(el.value || "").slice(0, 80), at: Date.now() });
  }, { capture: true, passive: true });
  send({ t: "page", url: location.href, title: document.title, at: Date.now() });
  return "recording";
}

async function recState() { return (await chrome.storage.session.get(["recTab", "recSteps"])) || {}; }
async function recAppend(e) {
  const st = await recState();
  if (st.recTab == null) return;
  const steps = st.recSteps || [];
  steps.push(e);
  await chrome.storage.session.set({ recSteps: steps.slice(-300) });
}

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  const st = await recState();
  if (st.recTab === tabId && info.status === "complete") {
    chrome.scripting.executeScript({ target: { tabId }, func: recordPage }).catch(() => {});
  }
});

// --- message router (side panel → here) ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "rec-event") { await recAppend(msg.e); sendResponse({ ok: true }); return; }
      if (msg.type === "rec-status") { const st = await recState(); sendResponse({ recording: st.recTab != null, steps: (st.recSteps || []).length }); return; }
      if (msg.type === "rec-stop") {
        const st = await recState();
        await chrome.storage.session.remove(["recTab", "recSteps"]);
        const steps = st.recSteps || [];
        if (steps.length < 3) { sendResponse({ error: "Too little recorded (need at least 3 actions)." }); return; }
        const cfg = await chrome.storage.local.get(["madavPort", "madavToken"]);
        const port = cfg.madavPort || "8765";
        if (!cfg.madavToken) { sendResponse({ error: "Set the Madav webhook token in ⚙ first (Madav → Scheduler → Webhook triggers)." }); return; }
        try {
          const r = await fetch(`http://127.0.0.1:${port}/hook/flow`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.madavToken },
            body: JSON.stringify({ steps }),
          });
          const j = await r.json().catch(() => ({}));
          sendResponse(j.ok ? { ok: true, note: j.note } : { error: j.error || ("Madav said " + r.status) });
        } catch { sendResponse({ error: "Couldn't reach Madav — is the desktop app running with webhooks enabled?" }); }
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) { sendResponse({ error: "no active tab" }); return; }
      if (msg.type === "rec-start") {
        await chrome.storage.session.set({ recTab: tab.id, recSteps: [] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: recordPage }).catch(() => {});
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === "observe") {
        const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: observePage });
        sendResponse(r.result);
      } else if (msg.type === "act") {
        const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: actPage, args: [msg.cmd] });
        sendResponse({ result: r.result });
      } else if (msg.type === "navigate") {
        let url = msg.url;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        await chrome.tabs.update(tab.id, { url });
        sendResponse({ result: "navigating to " + url });
      } else {
        sendResponse({ error: "unknown message" });
      }
    } catch (e) {
      sendResponse({ error: String((e && e.message) || e) });
    }
  })();
  return true; // keep the channel open for the async reply
});
