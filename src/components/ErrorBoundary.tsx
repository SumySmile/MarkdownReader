import { Component, ReactNode } from 'react';

interface Props {
  fallback: ReactNode | ((ctx: { error: Error | null; reset: () => void }) => ReactNode);
  children: ReactNode;
  resetKeys?: unknown[];
  onError?: (error: Error, info: { componentStack: string }) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(): State {
    return { hasError: true, error: null };
  }

  componentDidUpdate(prevProps: Props) {
    if (!this.state.hasError) return;
    if (!this.props.resetKeys || !prevProps.resetKeys) return;
    if (this.props.resetKeys.length !== prevProps.resetKeys.length) {
      this.resetErrorBoundary();
      return;
    }
    for (let i = 0; i < this.props.resetKeys.length; i += 1) {
      if (!Object.is(this.props.resetKeys[i], prevProps.resetKeys[i])) {
        this.resetErrorBoundary();
        return;
      }
    }
  }

  componentDidCatch(err: Error, info: { componentStack: string }) {
    this.setState({ error: err });
    this.props.onError?.(err, info);
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({ error: this.state.error, reset: this.resetErrorBoundary });
      }
      return this.props.fallback;
    }
    return this.props.children;
  }
}
