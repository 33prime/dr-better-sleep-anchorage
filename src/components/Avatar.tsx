import { useId, type CSSProperties } from 'react';

interface Props {
  size?: number;
  withDot?: boolean;
  glow?: boolean;
  /** Ring treatment: 'light' (default, faint white) or 'coral' (chat persona) */
  ring?: 'light' | 'coral';
  style?: CSSProperties;
}

/* Papercraft mini-scene avatar: crescent moon and stars over layered hills.
   Scene colors are fixed (always a night vignette) so it reads as a badge
   on both themes, matching the mocks. */
export function Avatar({ size = 32, withDot, glow, ring = 'light', style }: Props) {
  const id = useId();
  const clipId = `av-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        position: 'relative',
        flex: 'none',
        boxShadow: ring === 'coral'
          ? '0 0 0 2px #E08A86, 0 3px 8px rgba(4,8,24,0.4)'
          : glow
            ? '0 0 0 2px rgba(247,248,251,0.85), 0 0 20px rgba(75,175,186,0.2), 0 3px 8px rgba(4,8,24,0.4)'
            : '0 0 0 2px rgba(247,248,251,0.7), 0 3px 8px rgba(4,8,24,0.35)',
        ...style,
      }}
    >
      <svg viewBox="0 0 40 40" width="100%" height="100%" style={{ display: 'block', borderRadius: '50%' }} aria-hidden focusable="false">
        <defs>
          <clipPath id={clipId}><circle cx="20" cy="20" r="20" /></clipPath>
          <linearGradient id={`${clipId}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D2850" />
            <stop offset="100%" stopColor="#101834" />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect width="40" height="40" fill={`url(#${clipId}-sky)`} />
          {/* stars */}
          <circle cx="9" cy="10" r="1" fill="#EFE7DB" />
          <circle cx="31" cy="7" r="0.8" fill="#EFE7DB" />
          <circle cx="34" cy="16" r="0.7" fill="#EFE7DB" opacity="0.8" />
          {/* crescent moon — full disc with a sky-colored disc masked out */}
          <mask id={`${clipId}-moon`}>
            <rect width="40" height="40" fill="#fff" />
            <circle cx="21.5" cy="8" r="5" fill="#000" />
          </mask>
          <circle cx="18" cy="10.5" r="5.5" fill="#EFE7DB" mask={`url(#${clipId}-moon)`} />
          {/* pale cloud band */}
          <path d="M4 19 a4 4 0 0 1 1-7.6 a5.4 5.4 0 0 1 10-1.8 a4.4 4.4 0 0 1 7 2.2 a3.6 3.6 0 0 1 1.8 7.2 Z" fill="#8E9BBE" opacity="0.85" />
          <path d="M22 21 a3.4 3.4 0 0 1 0.8-6.4 a4.6 4.6 0 0 1 8.4-1.5 a3.7 3.7 0 0 1 5.9 1.9 a3 3 0 0 1 1.5 6 Z" fill="#66739B" opacity="0.7" />
          {/* hills, back to front */}
          <path d="M0 27 Q10 21 20 25 Q30 29 40 24 L40 40 L0 40 Z" fill="#29586B" />
          <path d="M0 31 Q12 25 22 29 Q32 33 40 29 L40 40 L0 40 Z" fill="#D97A78" />
          <path d="M0 35 Q14 30 26 34 Q34 36.5 40 34 L40 40 L0 40 Z" fill="#161F44" />
        </g>
      </svg>
      {withDot && (
        <span
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            borderRadius: '50%',
            background: '#4BAFBA',
            boxShadow: '0 0 0 2px var(--bg-primary, #FFFFFF)',
          }}
        />
      )}
    </div>
  );
}
