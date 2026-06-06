// Thinkflux for Chrome — service worker.
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

// --- message router (side panel → here) ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) { sendResponse({ error: "no active tab" }); return; }
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
