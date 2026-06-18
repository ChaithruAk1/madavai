// src/bridge/providerPing.js — decide the active provider's online/offline chip (web).
// The browser's DIRECT ping to a provider's /models can CORS-fail even while chat works, because chat falls
// back to the server proxy and the ping did not. So: try the direct ping; if it fails AND the user is signed
// in, confirm reachability the SAME way chat does — a server-side /proxy/models call (no CORS there).
// Reserves "offline" for a genuine outage. Pure + injectable (no network here) -> unit-tested deterministically.
export async function resolveProviderOnline({ directPing, hasToken, proxyModels }) {
  try { if (await directPing()) return true; } catch {}          // direct reachability (fast path)
  if (!hasToken || !hasToken()) return false;                    // no server proxy available -> trust direct
  try { const j = await proxyModels(); return !!(j && !j.error); } catch { return false; } // server reached it?
}
