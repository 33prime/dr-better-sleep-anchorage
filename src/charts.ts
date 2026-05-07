// SVG path/bar generators for the various charts used across screens.

export interface SparkOptions {
  width: number;
  height: number;
  pad?: { top: number; right: number; bottom: number; left: number };
}

const DEFAULT_PAD = { top: 6, right: 0, bottom: 6, left: 0 };

/** Compute a polyline points string + an area path for a sparkline. */
export function spark(values: number[], opts: SparkOptions): { points: string; areaPath: string; lastX: number; lastY: number } {
  const pad = { ...DEFAULT_PAD, ...(opts.pad ?? {}) };
  const w = opts.width - pad.left - pad.right;
  const h = opts.height - pad.top - pad.bottom;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastX = pad.left + (values.length - 1) * stepX;
  const lastY = parseFloat(points[points.length - 1].split(',')[1]);
  const areaPath =
    `M${points[0]} ` +
    `L${points.slice(1).join(' L')} ` +
    `L${lastX.toFixed(1)},${opts.height} ` +
    `L${pad.left.toFixed(1)},${opts.height} Z`;
  return { points: points.join(' '), areaPath, lastX, lastY };
}

/** Inverse: snore counts use "down is good" — render so calmer nights sit lower. */
export function sparkInverse(values: number[], opts: SparkOptions) {
  const max = Math.max(...values);
  return spark(values.map(v => max - v), opts);
}
