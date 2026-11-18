import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090B0E] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#11151C] border border-white/10 rounded-xl p-8 space-y-4">
            <h1 className="font-display text-2xl font-bold tracking-wide text-white">
              Application Recovery
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              The interface encountered a runtime error while synchronizing tournament data.
            </p>
            <pre className="text-xs font-mono bg-[#090B0E] border border-white/10 rounded-lg p-3 text-rose-300 overflow-x-auto">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
