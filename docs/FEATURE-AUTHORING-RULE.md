# Madav — Feature Authoring Rule (one page)

How every new feature gets built so it serves **both** surfaces without ever corrupting desktop.
Basis: `docs/adr/0001-architecture.md`. Hard law: **desktop is validated first and is never edited for a web reason.**

---

## 1. Classify the feature (the triage)

| Class | Examples | Where it lives |
|---|---|---|
| **Local-only** | shell/terminal, native-app automation, OS speech, desktop recorder | **Desktop-only** module + a `desktop-only` entry in the capability manifest. Not built for web. |
| **Cross-platform logic** | prompt assembly, tool schema, turn/agent orchestration, parsing, validation, capability gating | **Shared core** (behind the adapter) |
| **Platform mechanics** | read/write a file, run code, emit an event, store a secret, persist data | **Adapter**, implemented once per surface |

A typical feature is a mix: the *logic* goes in core, the *mechanics* go in each adapter, and if any part is local-only, that part is desktop-only and the manifest says so.

---

## 2. Build path by class

- **Local-only →** build on desktop; register it in the capability manifest as `desktop-only`; the web UI shows an honest "available in the desktop app" state. No web implementation, no apology.
- **Cross-platform logic →** write it once in the core against the adapter interface. **Validate on desktop first.** Encode the validated behavior as a parity test. Web inherits it through the web adapter.
- **Platform mechanics →** implement in the desktop adapter (Node/Electron) and the web adapter (browser/server). Same interface, two bodies.

---

## 3. Desktop-first gate (non-negotiable)

1. Build + validate on desktop.
2. Freeze the validated behavior as a **parity test** (this is what stops a later web change from silently altering desktop).
3. Light it up on web via the web adapter / managed service.
4. Update the capability manifest + parity matrix.

---

## 4. The "always build both" PR checklist

Every PR that changes turn / tool / prompt / agent behavior must answer:

- [ ] Desktop path built **and validated**?
- [ ] Web path decided and done — one of: **shared-core+adapter** / **managed service** / **desktop-only (manifest entry)**?
- [ ] Capability manifest (`webCapabilities`) updated?
- [ ] Parity test added/updated and **green in CI**?
- [ ] `WEB-VS-DESKTOP.md` matrix updated?
- [ ] Did this touch a **shared file** (`shared/csp.cjs`, `shared/office-rules.cjs`)? If yes → **permission-gated**: attach the diff + proof the desktop-facing output is byte-unchanged.

If any box is "no," the feature is not done.

---

## 5. Hard rules

1. **Never edit `electron/**` for a web reason.** If a web goal seems to need it, stop and ask.
2. **Never put logic on both sides of the bridge.** Logic lives in the core; the bridge carries mechanics only. Duplicating logic is how drift starts.
3. **Don't refactor the validated desktop engine for purity.** Migrate a legacy module into the core *only* when you're already editing it for an independent reason (strangler-fig).
4. **Shared files are permission-gated.** `shared/csp.cjs` and `shared/office-rules.cjs` ship to desktop too — prove the desktop branch is unchanged before merge.
5. **Web 3rd-party secrets stay server-side.** Never ship a service key to the browser.
6. **A discovered desktop bug is not a free fix.** Report it; don't patch desktop without permission.
