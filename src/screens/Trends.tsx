import { useState } from 'react';
import { useLocation } from 'wouter';
import { useStore, lastNight } from '../store';
import { Sparkline } from '../components/Sparkline';
import { TrendChart } from '../components/TrendChart';
import { PaperCloud, PaperMoon, PaperStar } from '../components/paper/PaperScene';
import { TickNumber } from '../components/TickNumber';
import { fmtDateShort, fmtDelta, parseIsoDate } from '../utils/format';
import s from './Trends.module.css';

type Range = '7d' | '30d' | '90d' | 'All';

export function Trends() {
  const state = useStore();
  const [, navigate] = useLocation();
  const [range, setRange] = useState<Range>('30d');

  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : state.nights.length;
  const slice = state.nights.slice(-days);
  const avg = slice.reduce((a, n) => a + n.totalSnores, 0) / Math.max(1, slice.length);
  // Compare the mean of the first half of the range vs. the mean of the second
  // half, so a single endpoint night can't whipsaw the headline delta.
  const mid = Math.floor(slice.length / 2);
  const mean = (xs: typeof slice) =>
    xs.length ? xs.reduce((a, n) => a + n.totalSnores, 0) / xs.length : 0;
  const firstHalf = mean(slice.slice(0, mid));
  const secondHalf = mean(slice.slice(mid));
  const d = fmtDelta(secondHalf, firstHalf);
  const last = lastNight(state);

  // Mini-card deltas vs the earliest week (pre-device baseline).
  const early = state.nights.slice(0, Math.min(7, state.nights.length));
  const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : 0);
  const effDeltaPts = Math.round(((last?.efficiency ?? 0) - meanOf(early.map(n => n.efficiency))) * 100);
  const hrvDelta = Math.round((last?.hrv ?? 0) - meanOf(early.map(n => n.hrv)));
  const rhrDelta = Math.round((last?.restingHr ?? 0) - meanOf(early.map(n => n.restingHr)));
  const higherBetter = (v: number, unit: string) =>
    v >= 1 ? { text: `↑ ${v}${unit} from baseline`, cls: 'pos' as const }
    : v <= -1 ? { text: `↓ ${Math.abs(v)}${unit} from baseline`, cls: 'flat' as const }
    : { text: '→ stable', cls: 'flat' as const };
  const lowerBetter = (v: number, unit: string) =>
    v <= -1 ? { text: `↓ ${Math.abs(v)}${unit} from baseline`, cls: 'pos' as const }
    : v >= 1 ? { text: `↑ ${v}${unit} from baseline`, cls: 'flat' as const }
    : { text: '→ stable', cls: 'flat' as const };
  const effD = higherBetter(effDeltaPts, 'pt');
  const hrvD = higherBetter(hrvDelta, ' ms');
  const rhrD = lowerBetter(rhrDelta, ' bpm');

  return (
    <div className={s.root}>
      {/* drifting clouds, stars, and the coral moon around the header */}
      <svg viewBox="0 0 393 130" className={s.scene} aria-hidden focusable="false">
        <PaperStar x={122} y={16} scale={0.9} delay={0.7} />
        <PaperStar x={196} y={52} scale={0.7} delay={2.1} />
        <PaperStar x={352} y={112} scale={0.8} delay={3.4} />
        <PaperCloud x={40} y={8} scale={0.85} drift={1} />
        <PaperCloud x={214} y={24} scale={0.75} drift={2} />
        <PaperMoon x={316} y={54} scale={2.2} />
        {/* this cloud tucks in front of the moon's lower edge, like the mock */}
        <PaperCloud x={282} y={98} scale={0.8} drift={1} />
      </svg>

      <div className={s.head}>
        <h1>Trends</h1>
        <div className={s.sub}>
          {fmtDateShort(new Date()).toUpperCase()} · DAY {state.nights.length}
        </div>
      </div>

      <div className={s.tabs} role="tablist">
        {(['7d', '30d', '90d', 'All'] as Range[]).map(r => (
          <button
            key={r}
            className={`${s.t} tap ${range === r ? s.on : ''}`}
            onClick={() => setRange(r)}
            role="tab"
            aria-selected={range === r}
          >
            {r}
          </button>
        ))}
      </div>

      <div className={`${s.chartCard} tap`} role="button" onClick={() => navigate('/trends/compare')}>
        <div className={s.chartHead}>
          <div className={s.k}>Snoring · {slice.length} nights</div>
          <div className={s.legend}>
            <span><span className={s.sw} style={{ background: 'var(--accent)' }} />Nightly</span>
            <span><span className={s.sw} style={{ background: 'none', borderTop: '2px dashed var(--chart-avg)', height: 0 }} />7-day avg</span>
          </div>
        </div>

        <div className={s.numRow}>
          <div className={s.big}>
            <TickNumber value={Math.round(avg)} />
          </div>
          <div className={s.bigUnit}>average / night</div>
          <div className={s.delta}>
            {d.sign} {d.pct} <span className={s.from}>vs. range first half</span>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <TrendChart values={slice.map(n => n.totalSnores)} width={320} height={210} />
        </div>

        <div className={s.xAxis}>
          {slice.length > 0 && (
            <>
              <span>{fmtDateShort(parseIsoDate(slice[0].date)).toUpperCase()}</span>
              <span>{fmtDateShort(parseIsoDate(slice[Math.floor(slice.length / 2)].date)).toUpperCase()}</span>
              <span>{fmtDateShort(parseIsoDate(slice[slice.length - 1].date)).toUpperCase()}</span>
            </>
          )}
        </div>
      </div>

      <div className={s.row2}>Other signals</div>
      <div className={s.miniGrid}>
        <MiniCard label="Sleep efficiency" value={`${Math.round((last?.efficiency ?? 0) * 100)}`} unit="%" deltaText={effD.text} deltaClass={effD.cls} trend={state.nights.slice(-14).map(n => n.efficiency)} />
        <MiniCard label="HRV (overnight)" value={String(last?.hrv ?? 0)} unit=" ms" deltaText={hrvD.text} deltaClass={hrvD.cls} trend={state.nights.slice(-14).map(n => n.hrv)} />
        <MiniCard label="Resting HR" value={String(last?.restingHr ?? 0)} unit=" bpm" deltaText={rhrD.text} deltaClass={rhrD.cls} trend={state.nights.slice(-14).map(n => n.restingHr)} />
      </div>
    </div>
  );
}

interface MiniProps {
  label: string;
  value: string;
  unit: string;
  deltaText: string;
  deltaClass: 'pos' | 'flat';
  trend: number[];
  stroke?: string;
}
function MiniCard({ label, value, unit, deltaText, deltaClass, trend, stroke = '#4BAFBA' }: MiniProps) {
  return (
    <div className={s.mini}>
      <div className={s.col}>
        <div className={s.k}>{label}</div>
        <div className={s.v}>{value}<span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{unit}</span></div>
        <div className={s.d}>
          <span className={s[deltaClass]}>{deltaText}</span>
        </div>
      </div>
      <div className={s.spark}>
        <Sparkline values={trend} width={96} height={40} stroke={stroke} fill={stroke} dots />
      </div>
    </div>
  );
}
