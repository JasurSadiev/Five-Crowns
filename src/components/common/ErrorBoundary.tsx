import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a rendering crash should never leave a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the detail in the console for developers, never on screen.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-surface px-4 text-center">
        <div className="max-w-md">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-rose-500/15 text-rose-400">
            <AlertTriangle className="h-7 w-7" />
          </span>
          <h1 className="font-display text-2xl font-bold text-ink">Something broke</h1>
          <p className="mt-2 text-ink-muted">
            The page hit an unexpected error. Your game is safe on the server — reloading usually
            puts you right back where you were.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gold-sheen px-5 font-semibold text-felt-950"
          >
            <RefreshCw className="h-4 w-4" /> Reload the page
          </button>
        </div>
      </div>
    );
  }
}
