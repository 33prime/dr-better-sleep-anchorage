import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { useStore, lastNight, baselineSnores, daysSince } from '../store';
import { TickNumber } from '../components/TickNumber';
import { ArrowRight } from '../components/icons';
import { fmtDateLong, fmtDelta, fmtDuration, parseIsoDate } from '../utils/format';
import s from './MorningReveal.module.css';

const easeOut = [0.22, 1, 0.36, 1] as const;
const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: easeOut, delay },
});

export function MorningReveal() {
  const state = useStore();
  const [, navigate] = useLocation();
  const last = lastNight(state);
  if (!last) return null;

  // The previous 14 nights, excluding the night being revealed.
  const prev14 = state.nights.slice(-15, -1);
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : 0;

  // Snores vs. the rolling baseline.
  const snoreDelta = fmtDelta(last.totalSnores, baselineSnores(state));

  // Sleep duration & deep sleep vs. the mean of the previous 14 nights.
  const avgSleep = mean(prev14.map(n => n.sleepDurationMin));
  const avgDeep = mean(prev14.map(n => n.deepMin));
  const sleepDiff = avgSleep ? Math.round(last.sleepDurationMin - avgSleep) : 0;
  const deepDiff = avgDeep ? Math.round(last.deepMin - avgDeep) : 0;
  const fmtMinDelta = (diff: number) =>
    `${diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} ${Math.abs(diff)}m`;

  // How many of the previous 14 nights were louder than last night.
  const quieterThan = prev14.filter(n => n.totalSnores > last.totalSnores).length;

  return (
    <div className={s.root}>
      <motion.div className={s.eyebrow} {...fadeUp(0.2)}>
        {fmtDateLong(parseIsoDate(last.date))} · 6:42 AM
      </motion.div>

      <motion.h1 className={s.headline} {...fadeUp(0.32)}>
        A quiet night,<br />
        <span className={s.it}>{state.user.name}.</span>
      </motion.h1>

      <motion.p className={s.sub} {...fadeUp(0.48)}>
        You were quieter than {quieterThan} of the last {prev14.length} nights. Here's what stood out.
      </motion.p>

      <div className={s.numbers}>
        <Cell label="Snores" value={String(last.totalSnores)} delta={`${snoreDelta.sign} ${snoreDelta.pct}`} deltaSub="vs. baseline" delay={0.62} />
        <Cell label="Time asleep" value={fmtDuration(last.sleepDurationMin)} delta={fmtMinDelta(sleepDiff)} deltaSub="vs. avg" delay={0.72} />
        <Cell label="Deep sleep" value={fmtDuration(last.deepMin)} delta={fmtMinDelta(deepDiff)} deltaSub="vs. avg" delay={0.82} />
        <Cell label="Resting HR" value={String(last.restingHr)} unit="bpm" delta="→ stable" deltaClass="muted" delay={0.92} />
      </div>

      <motion.div className={s.footer} {...fadeUp(1.1)}>
        <button className={`${s.cta} tap`} onClick={() => navigate(`/night/${last.date}`)}>
          See the full night
          <ArrowRight />
        </button>
        <div className={s.dayLabel}>DAY {daysSince(state.device.fittedAt)}</div>
      </motion.div>
    </div>
  );
}

function Cell({ label, value, unit, delta, deltaSub, delay, deltaClass }: {
  label: string; value: string; unit?: string; delta: string; deltaSub?: string; delay: number; deltaClass?: 'muted';
}) {
  return (
    <motion.div className={s.cell} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: easeOut, delay }}>
      <div className={s.k}>{label}</div>
      <div className={s.v}>
        {/^[0-9:]+$/.test(value) && !value.includes(':')
          ? <TickNumber value={parseInt(value, 10)} duration={0.9} />
          : value}
        {unit && <span className={s.u}>{unit}</span>}
      </div>
      <div className={s.d} style={deltaClass === 'muted' ? { color: 'var(--text-tertiary)' } : undefined}>
        {delta} {deltaSub && <span className={s.from}>{deltaSub}</span>}
      </div>
    </motion.div>
  );
}
