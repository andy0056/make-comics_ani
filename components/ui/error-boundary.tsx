"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

export class GlobalErrorBoundary extends React.Component<
    { children: React.ReactNode },
    ErrorBoundaryState
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("[KaBoom Error Boundary]", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
                        <AlertTriangle className="h-8 w-8 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
                        <p className="mt-2 max-w-md text-sm text-muted-foreground">
                            We hit an unexpected error. Your work is safe — try reloading the page.
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: undefined });
                            window.location.reload();
                        }}
                        className="flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Reload page
                    </button>
                    {process.env.NODE_ENV === "development" && this.state.error && (
                        <pre className="mt-4 max-w-lg overflow-x-auto rounded-lg border border-border/40 bg-background/80 p-4 text-left text-xs text-rose-300">
                            {this.state.error.message}
                            {"\n\n"}
                            {this.state.error.stack}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
