// Picks the real Electron bridge (window.thinkflux) when running in the desktop app,
// otherwise the in-browser mock. The UI imports ONLY from here.
import { mockBridge } from "./mockBridge.js";

const real = typeof window !== "undefined" ? window.thinkflux : null;

export const bridge = real || mockBridge;
export const isReal = Boolean(real);
