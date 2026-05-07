import { motion } from 'framer-motion';
import { useId } from 'react';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;       // gradient fill color (semi-transparent area under line)
  strokeWidth?: number;
  showLastDot?: boolean;
  invertY?: boolean;   // when "down is good" — calmer nights sit lower
  className?: string;
}

export function Sparkline({
  values,
  width = 360,
  height = 36,
  stroke = '#3E7565',
  fill = '#86C8B8',
  strokeWidth = 1.25,
  showLastDot = true,
  invertY = false,
  className,
}: Props) {
  const id = useId();
  const gradId = `spark-${id.replace(/[^a-zA-Z0-9]/g, '')}`;

  if (!values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const pad = 6;
  const w = width;
  const h = height;
  const stepX = values.length > 1 ? (w / (values.length - 1)) : 0;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = invertY
      ? pad + ((v - min) / range) * (h - 2 * pad)
      : pad + (h - 2 * pad) - ((v - min) / range) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lineD = `M${points.join(' L')}`;
  const areaD = `${lineD} L${(values.length - 1) * stepX},${h} L0,${h} Z`;
  const lastPoint = points[points.length - 1].split(',');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.22" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <motion.path
        d={lineD}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      {showLastDot && (
        <motion.circle
          cx={lastPoint[0]} cy={lastPoint[1]} r={2.4}
          fill={stroke}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </svg>
  );
}
