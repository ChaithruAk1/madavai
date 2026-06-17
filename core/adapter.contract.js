// Madav shared-core — PLATFORM ADAPTER contract (the seam).
//
// The platform-agnostic core (turn/agent/tool/prompt logic) depends ONLY on this
// interface. All platform mechanics live in an adapter implementation:
//   - desktop adapter  -> Node/Electron (fs, child_process, IPC, OS keychain)
//   - web adapter      -> browser/server (File System Access, Pyodide, /proxy, IndexedDB)
//
// This file is pure: no platform code, no imports. See docs/adr/0001-architecture.md.

/** The methods every PlatformAdapter must provide, grouped by namespace. */
export const ADAPTER_SPEC = {
  fs:      ["readFile", "writeFile", "listDir", "deleteFile", "exists"],
  exec:    ["run"],             // run(code, opts) -> { stdout, stderr, code }
  net:     ["fetch"],           // fetch(url, opts) -> { status, text }
  persist: ["get", "set"],      // get(key) -> value ; set(key, value) -> void
  emit:    ["event"],           // event(kind, data) -> void   (UI event stream)
  secrets: ["get"],             // get(name) -> string|null     (host-side only, never browser)
  paths:   ["scratchDir"],      // scratchDir() -> path|handle
  env:     ["now", "randomId"], // now() -> ms ; randomId(prefix?) -> string
};

export const ADAPTER_NAMESPACES = Object.keys(ADAPTER_SPEC);

/** Returns { ok, missing[] } — does `adapter` implement the full ADAPTER_SPEC? */
export function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    return { ok: false, missing: ["(adapter is not an object)"] };
  }
  const missing = [];
  for (const [ns, methods] of Object.entries(ADAPTER_SPEC)) {
    const bag = adapter[ns];
    if (!bag || typeof bag !== "object") { missing.push(`${ns} (namespace)`); continue; }
    for (const m of methods) {
      if (typeof bag[m] !== "function") missing.push(`${ns}.${m}`);
    }
  }
  return { ok: missing.length === 0, missing };
}

/** Throws if `adapter` is incomplete; returns it otherwise (for fluent use). */
export function assertAdapter(adapter) {
  const r = validateAdapter(adapter);
  if (!r.ok) throw new Error("PlatformAdapter incomplete; missing: " + r.missing.join(", "));
  return adapter;
}
