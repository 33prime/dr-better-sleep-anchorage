import { motion, useMotionValue, useTransform, animate as fmAnimate } from 'framer-motion';
import { useEffect } from 'react';

interface Props {
  value: number;
  duration?: number;
  suffix?: string;
  format?: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
}

/** Number that animates 0 → value on mount, with optional formatter. */
export function TickNumber({ value, duration = 0.7, suffix = '', format, className, style }: Props) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => (format ? format(v) : Math.round(v).toString()) + suffix);

  useEffect(() => {
    const controls = fmAnimate(mv, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [value, duration, mv]);

  return <motion.span className={className} style={style}>{display}</motion.span>;
}
