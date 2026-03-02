// src/components/ErrorBoundary.jsx
import React from "react";

/**
 * ErrorBoundary
 * Class component because only class components can be error boundaries.
 * - Logs to console by default. If you provide a global `window.__ERROR_REPORT__`
 *   function or SENTRY_DSN in env you can extend reporting.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Save stack/info in state for debugging UI
    this.setState({ error, info });

    // Default console logging
    // eslint-disable-next-line no-console
    console.error("Uncaught error in subtree:", error, info);

    // Optional hook: if you have a global reporting function (Sentry, etc.)
    try {
      if (typeof window.__ERROR_REPORT__ === "function") {
        window.__ERROR_REPORT__({ error, info, componentStack: info?.componentStack });
      }
      // If you want Sentry, setup Sentry and call Sentry.captureException(error)
    } catch (e) {
      // ignore reporting errors
    }
  }

  handleReload = () => {
    // Best-effort: reload app (user still at same URL)
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Fallback UI — simple, accessible, admin-styled
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#f7f8fb",
        color: "#0f172a",
      }}
      role="alert"
      aria-live="assertive"
      >
        <div style={{
          width: "100%",
          maxWidth: 920,
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 12px 40px rgba(2,6,23,0.08)",
        }}>
          <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#fff7ed",
              color: "#fb923c",
              fontWeight: 800,
              fontSize: 24,
            }}>⚠️</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Something went wrong</h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
                An unexpected error occurred while rendering the app. You can reload the page or continue.
              </p>
            </div>
          </header>

          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "flex-start", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={this.handleReload} style={{
                background: "linear-gradient(135deg,#4f46e5,#6366f1)",
                color: "#fff",
                border: "none",
                padding: "8px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 700,
              }}>
                Reload app
              </button>

              <button onClick={this.handleReset} style={{
                border: "1px solid #e6eef8",
                background: "#fff",
                padding: "8px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
              }}>
                Dismiss / Try continue
              </button>
            </div>

            <details style={{ background: "#f8fafc", padding: 12, borderRadius: 8, color: "#0f172a", width: "100%", overflow: "auto" }}>
              <summary style={{ fontWeight: 700 }}>Error details (expand)</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12, color: "#374151" }}>
{this.state.error?.stack || String(this.state.error)}
              </pre>
              {this.state.info?.componentStack && (
                <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12, color: "#374151" }}>
{this.state.info.componentStack}
                </pre>
              )}
            </details>
          </div>
        </div>
      </div>
    );
  }
}
