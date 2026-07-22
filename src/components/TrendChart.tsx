import { motion } from 'framer-motion';
import { SceneHills } from './paper/PaperScene';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  /** papercraft dunes along the chart floor (behind the lines) */
  hills?: boolean;
}

/* Trends chart: teal nightly line with dot terminals + dashed coral 7-day
   average, floating above papercraft dunes. Matches mock 02. */
export function TrendChart({ values, width = 360, height = 200, hills = true }: Props) {
  if (!values.length) return null;

  const rolling = values.map((_, i) => {
    const win = values.slice(Math.max(0, i - 6), i + 1);
    return win.reduce((a, v) => a + v, 0) / win.length;
  });

  const all = [...values, ...rolling];
  const max = Math.max(...all);
  const min = Math.min(...all);
  const range = Math.max(1, max - min);
  const padTop = 10, padBottom = 14, padX = 4;
  const stepX = values.length > 1 ? (width - 2 * padX) / (values.length - 1) : 0;
  const toXY = (v: number, i: number): [number, number] => [
    padX + i * stepX,
    padTop + (height - padTop - padBottom) * (1 - (v - min) / range),
  ];

  const pts = values.map(toXY);
  const avgPts = rolling.map(toXY);
  const lineD = `M${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')}`;
  const avgD = `M${avgPts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')}`;
  const showDots = values.length <= 45;

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      {hills && (
        <div style={{ position: 'absolute', left: -8, right: -8, bottom: -4, height: Math.min(80, height * 0.36), pointerEvents: 'none' }} aria-hidden>
          <SceneHills />
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ position: 'relative', width: '100%', height, display: 'block' }}
      >
        <motion.path
          d={avgD}
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 6"
          strokeLinecap="round"
          style={{ stroke: 'var(--chart-avg)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.9 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        />
        <motion.path
          d={lineD}
          fill="none"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ stroke: 'var(--accent)' }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        {showDots && pts.map(([x, y], i) => (
          <motion.circle
            key={i}
            cx={x} cy={y} r={3.6}
            style={{ fill: 'var(--accent)' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.25 + (i / pts.length) * 0.8, duration: 0.25 }}
          />
        ))}
      </svg>
    </div>
  );
}
