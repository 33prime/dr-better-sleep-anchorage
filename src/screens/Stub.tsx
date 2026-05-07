import { useLocation } from 'wouter';
import { ChevronLeft } from '../components/icons';

interface Props { title: string }

export function Stub({ title }: Props) {
  const [, navigate] = useLocation();
  return (
    <div>
      <div style={{ padding: '4px 16px 0' }}>
        <button
          className="tap"
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', padding: '8px 8px' }}
        >
          <ChevronLeft style={{ width: 22, height: 22 }} />
          <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14 }}>Home</span>
        </button>
      </div>
      <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 12 }}>
          {title}
        </h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
          Coming in commit 2
        </p>
      </div>
    </div>
  );
}
