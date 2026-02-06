import React from 'react';

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render/runtime errors and shows a friendly overlay instead of a blank screen.
 * Also logs the error to the console for debugging.
 */
class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App error boundary caught:', error, info);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="w-full h-screen bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-lg font-semibold">Something went wrong</div>
          <pre className="text-sm bg-white/10 border border-white/10 rounded-md p-3 max-w-3xl overflow-auto">
            {error.message}
          </pre>
          <div className="text-xs text-white/70 max-w-2xl">
            The app hit a runtime error. Please copy the first error from your browser console and share it so we can fix it.
          </div>
          <button
            onClick={this.handleReload}
            className="px-4 py-2 bg-white text-black rounded-md font-semibold hover:bg-slate-100"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
