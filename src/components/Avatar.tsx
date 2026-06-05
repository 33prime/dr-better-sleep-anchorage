import type { CSSProperties } from 'react';

interface Props {
  size?: number;
  withDot?: boolean;
  glow?: boolean;
  style?: CSSProperties;
}

export function Avatar({ size = 32, withDot, glow, style }: Props) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #B8E4EC, #2E8C9E 55%, #1E4A55)',
        boxShadow: glow
          ? '0 0 0 0.5px rgba(67,186,202,0.3), 0 0 24px rgba(67,186,202,0.15)'
          : 'inset 0 0 0 0.5px rgba(0,0,0,0.2)',
        position: 'relative',
        flex: 'none',
        ...style,
      }}
    >
      {withDot && (
        <span
          style={{
            content: '""',
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: '#7FD1DE',
            boxShadow: '0 0 0 2px #FFFFFF',
          }}
        />
      )}
    </div>
  );
}
