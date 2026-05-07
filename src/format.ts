// Number/date/time formatters — keep all the demo's display logic in one place.

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${pad2(m)}`;
}

export function fmtPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function fmtClockHM(d: Date): string {
  return `${d.getHours()}:${pad2(d.getMinutes())}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDateLong(d: Date): string {
  return `${DAY_NAMES[d.getDay()]} · ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function fmtDateShort(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDelta(curr: number, baseline: number): { sign: '↓' | '↑' | '→'; pct: string } {
  if (baseline === 0) return { sign: '→', pct: '0%' };
  const diff = (curr - baseline) / baseline;
  const sign = diff < -0.02 ? '↓' : diff > 0.02 ? '↑' : '→';
  return { sign, pct: `${Math.round(Math.abs(diff) * 100)}%` };
}

export function timeOfDayGreeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Sleeping in,';
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  if (h < 22) return 'Good evening,';
  return 'Settling in,';
}

export function shouldUseDarkDashboard(d: Date = new Date()): boolean {
  const h = d.getHours();
  return h >= 18 || h < 5;
}
