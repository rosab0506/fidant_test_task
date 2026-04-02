"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback. If omitted, the default dark-themed UI is shown. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // In production this would forward to an error tracking service (e.g. Sentry)
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return <DefaultFallback error={error} reset={this.reset} />;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div
      role="alert"
      style={{
        background: "#0f172a",
        border: "1px solid #7f1d1d",
        borderRadius: 16,
        padding: 28,
        maxWidth: 740,
        width: "100%",
        fontFamily: "'Inter', system-ui, sans-serif",
        boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 28, margin: "0 0 8px" }}>⚠️</p>
      <p style={{ fontSize: 16, fontWeight: 600, color: "#fca5a5", margin: "0 0 6px" }}>
        Something went wrong
      </p>
      <p style={{ fontSize: 13, color: "#475569", margin: "0 0 20px", fontFamily: "monospace" }}>
        {error.message}
      </p>
      <button
        onClick={reset}
        style={{
          background: "linear-gradient(135deg, #312e81, #4338ca)",
          border: "1px solid #4338ca",
          borderRadius: 8,
          color: "#c7d2fe",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          padding: "8px 20px",
        }}
      >
        Try again
      </button>
    </div>
  );
}
