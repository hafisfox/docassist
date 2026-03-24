"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/shared/ErrorState";

interface Props {
  children: ReactNode;
  /** Custom fallback rendered instead of the default ErrorState */
  fallback?: ReactNode;
  /** Optional label used in console.error output (e.g. "Dashboard", "Leads") */
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Class-based React error boundary.
 * Catches render/lifecycle errors in its subtree and displays ErrorState.
 *
 * Usage:
 *   <ErrorBoundary section="Dashboard">
 *     <DashboardContent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const label = this.props.section ? ` [${this.props.section}]` : "";
    console.error(`ErrorBoundary${label}`, error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <ErrorState
        message={this.state.error?.message}
        onRetry={this.handleReset}
      />
    );
  }
}
