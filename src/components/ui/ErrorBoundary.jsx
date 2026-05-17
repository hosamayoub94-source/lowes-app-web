// =============================================================
// ErrorBoundary — catches React render errors and shows them
// instead of a blank white screen. Visible in DEV + PROD.
// =============================================================
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[ErrorBoundary] Caught:', error, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        padding: '24px',
        fontFamily: 'monospace',
        background: '#0f172a',
        color: '#f1f5f9',
        minHeight: '100vh',
        direction: 'ltr',
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          background: '#1e293b',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid #ef4444',
        }}>
          <h1 style={{ color: '#ef4444', margin: '0 0 16px', fontSize: '20px' }}>
            💥 App Error — Open DevTools Console for full trace
          </h1>
          <div style={{
            background: '#0f172a',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            overflowX: 'auto',
          }}>
            <strong style={{ color: '#fbbf24' }}>Error:</strong>
            <pre style={{ margin: '8px 0 0', color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {error?.toString?.() ?? String(error)}
            </pre>
          </div>
          {info?.componentStack && (
            <div style={{
              background: '#0f172a',
              borderRadius: '8px',
              padding: '16px',
              overflowX: 'auto',
            }}>
              <strong style={{ color: '#fbbf24' }}>Component Stack:</strong>
              <pre style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                {info.componentStack}
              </pre>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            🔄 Reload App
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
