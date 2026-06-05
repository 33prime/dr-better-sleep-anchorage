import { useState } from 'react';
import { useLocation } from 'wouter';
import { useStore, lastNight } from '../store';
import { Sparkline } from '../components/Sparkline';
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

  return (
    <div className={s.root}>
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
            <span><span className={s.sw} style={{ background: '#43BACA' }} />Nightly</span>
            <span><span className={s.sw} style={{ background: '#7FD1DE' }} />7-day avg</span>
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

        <div style={{ marginTop: 18, height: 180 }}>
          <Sparkline
            values={slice.map(n => n.totalSnores)}
            width={360}
            height={180}
            stroke="#43BACA"
            fill="#43BACA"
            strokeWidth={1.4}
          />
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
        <MiniCard label="Sleep efficiency" value={`${Math.round((last?.efficiency ?? 0) * 100)}`} unit="%" deltaText="↑ 3pt from last month" deltaClass="pos" trend={state.nights.slice(-14).map(n => n.efficiency)} />
        <MiniCard label="HRV (overnight)" value={String(last?.hrv ?? 0)} unit=" ms" deltaText="↑ 6 ms from baseline" deltaClass="pos" trend={state.nights.slice(-14).map(n => n.hrv)} />
        <MiniCard label="Resting HR" value={String(last?.restingHr ?? 0)} unit=" bpm" deltaText="→ stable" deltaClass="flat" trend={state.nights.slice(-14).map(n => n.restingHr)} stroke="#8A90A6" />
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
function MiniCard({ label, value, unit, deltaText, deltaClass, trend, stroke = '#43BACA' }: MiniProps) {
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
        <Sparkline values={trend} width={96} height={40} stroke={stroke} fill={stroke} />
      </div>
    </div>
  );
}
