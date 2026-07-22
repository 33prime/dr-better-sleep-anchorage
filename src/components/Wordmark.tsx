import type { CSSProperties } from 'react';

interface Props {
  /** Cap height of the lockup in px. */
  size?: number;
  /** Color treatment for the "Dr" prefix: white on dark surfaces, midnight on
      light, or 'auto' to inherit the parent's color (theme-aware). */
  tone?: 'onDark' | 'onLight' | 'auto';
  style?: CSSProperties;
}

/**
 * Dr. Never Snore brand lockup.
 *
 * Per the brand guidelines:
 *  - "Dr." establishes medical authority; the crescent-moon motif is embedded in
 *    the period after it (symbolising nighttime, sleep, rest).
 *  - The product name renders in Restful Teal (#4BAFBA), the product's signature accent.
 *  - Nunito Black (900) for maximum display impact.
 */
export function Wordmark({ size = 22, tone = 'onDark', style }: Props) {
  const drColor = tone === 'auto' ? 'currentColor' : tone === 'onDark' ? 'var(--night-text-1)' : 'var(--text-primary)';
  const moon = Math.round(size * 0.36);
  return (
    <span
      aria-label="Dr. Never Snore"
      style={{
        fontFamily: 'var(--serif)',
        fontWeight: 900,
        fontSize: size,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span aria-hidden style={{ color: drColor }}>Dr</span>
      {/* Crescent moon as the period after "Dr." */}
      <svg
        width={moon} height={moon} viewBox="0 0 24 24" aria-hidden
        style={{ verticalAlign: 'baseline', margin: '0 0.10em 0 0.02em' }}
      >
        <path
          d="M22 14.6A8.6 8.6 0 1 1 10.9 3.1a6.9 6.9 0 0 0 11.1 11.5Z"
          style={{ fill: 'var(--coral)' }}
        />
      </svg>
      <span aria-hidden style={{ color: 'var(--accent)' }}>Never&nbsp;Snore</span>
    </span>
  );
}
