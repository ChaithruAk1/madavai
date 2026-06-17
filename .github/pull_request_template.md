<!-- Madav PR checklist — keeps web and desktop from drifting. See docs/FEATURE-AUTHORING-RULE.md -->

## What & why


## Surface impact (required)

- [ ] **Desktop** path built **and validated** (desktop is the reference, validated first)
- [ ] **Web** path decided and done — one of: shared-core+adapter / managed service / desktop-only (manifest entry)
- [ ] `src/bridge/webCapabilities.js` updated if a capability's web status changed
- [ ] Parity test added/updated and **green** (`npx vitest run tests/parity`)
- [ ] `WEB-VS-DESKTOP.md` matrix updated if a capability changed

## Guardrails (required)

- [ ] This PR does **not** edit `electron/**` — OR it is a permission-gated, harness-validated migration step explicitly approved by the owner
- [ ] Shared files (`shared/csp.cjs`, `shared/office-rules.cjs`) unchanged — OR changed with proof the desktop-facing output is identical (CSP snapshot / rules-parity test green)
- [ ] No 3rd-party service secret reaches the browser bundle
- [ ] Shared-renderer changes branch on `isWeb`; desktop code path byte-identical

## Tests run

```
npx vitest run tests/parity
```
