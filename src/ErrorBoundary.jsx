// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// App-wide error boundary: a render crash anywhere below shows a friendly card
// instead of a blank white window. Reload restores the app (state is persisted).
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    try { console.error("[brainedge] render crash:", error, info && info.componentStack); } catch {}
  }
  render() {
    if (!this.state.error) return this.props.children;
    const msg = String((this.state.error && this.state.error.message) || this.state.error);
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
        <div style={{ maxWidth: 480, padding: "22px 24px", borderRadius: 12, border: "1px solid color-mix(in srgb, currentColor 16%, transparent)", background: "var(--bg-2, rgba(127,127,127,.08))" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>Something went wrong on this screen</h2>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-2, inherit)" }}>
            Your conversations and settings are safe — reloading usually fixes it.
          </p>
          <details style={{ margin: "0 0 14px", fontSize: 12 }}>
            <summary style={{ cursor: "pointer" }}>Error details</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "8px 0 0", fontSize: 11 }}>{msg}</pre>
          </details>
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
