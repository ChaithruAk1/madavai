// Picks the real Electron bridge (window.brainedge) when running in the desktop app,
// otherwise the WEB bridge (browser implementation backed by the auth server + localStorage +
// direct-to-provider streaming). The UI imports ONLY from here.
import { webBridge } from "./webBridge.js";

const real = typeof window !== "undefined" ? window.brainedge : null;

export const bridge = real || webBridge;
export const isReal = Boolean(real);   // true in the desktop app
export const isWeb = !isReal;          // true in the browser web app
