import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/**
 * Catches render-time errors so a crash shows a branded, recoverable screen
 * instead of a blank white page. The reload button also clears any stale
 * service worker + caches, which fixes most "stuck" PWA states.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error('App error boundary caught:', error);
  }

  private recover = async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(regs.map(r => r.unregister()));
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {
      // ignore — best effort
    }
    location.reload();
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: '#1B2340', color: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: 28,
        font: '15px/1.5 "Nunito", system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 34 }}>🌙</div>
        <h1 style={{ fontWeight: 800, fontSize: 22, margin: '14px 0 6px' }}>We hit a snag</h1>
        <p style={{ color: '#B7BDD6', maxWidth: 320, margin: '0 0 20px' }}>
          Something went wrong. A reload usually clears it.
        </p>
        <button
          onClick={this.recover}
          style={{
            background: '#4BAFBA', color: '#1B2340', border: 0,
            borderRadius: 999, padding: '13px 26px', fontWeight: 800, fontSize: 15, cursor: 'pointer',
          }}
        >
          Reload
        </button>
        <pre style={{
          marginTop: 18, maxWidth: 340, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          color: '#74C7D0', fontSize: 12, opacity: 0.85,
        }}>{String(error.message || error)}</pre>
      </div>
    );
  }
}
