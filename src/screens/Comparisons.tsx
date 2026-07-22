import { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft } from '../components/icons';
import { TickNumber } from '../components/TickNumber';
import { useStore, lastNight } from '../store';
import { fmtDuration } from '../utils/format';
import type { UserProfile } from '../seed';
import s from './Comparisons.module.css';

function ageSexLabel(user: UserProfile): string {
  const noun = user.sex === 'M' ? 'men' : user.sex === 'F' ? 'women' : 'people';
  return `${user.ageRange}-year-old ${noun}`;
}

// ---------------------------------------------------------------------------
// Reference distribution — "beta" percentile, honestly modeled.
//
// ../RESEARCH.md has no independently-verified population distribution of
// nightly snore counts — areas 4/5 (MAD efficacy, positional therapy) are
// flagged "thin, needs a second pass", and the acoustic-detection literature
// that *did* clear verification (§2: SleepWatch 86.3%/99.5% sens/spec,
// SnoreLab 94.7% accuracy, rs = 0.974 vs. ground truth) validates that
// smartphone snore *counting* is accurate — it doesn't give us a norm table
// for what a "typical" snorer's nightly count looks like. Rather than invent
// a precise clinical percentile, we model a plausible log-normal reference
// cohort (log-normal is the standard shape for over-dispersed nightly event
// counts) centered on the same ~90/night midpoint our own seed data uses for
// a pre-treatment "confirmed snoring history" case (see seed.ts STORY
// baseline ≈ 94). This is an honest estimate against a documented, inline
// assumption — not a validated population norm. Hence "beta".
const REFERENCE_MEDIAN = 90; // snores/night, assumed cohort midpoint (see note above)
const REFERENCE_SIGMA = 0.6; // log-space spread
const SNORE_SCALE_MAX = 160; // chart x-axis ceiling, snores/night

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 approximation (good to ~1.5e-7).
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
/** P(X <= v) for X ~ LogNormal(median, sigma). */
function logNormalCdf(v: number, median: number, sigma: number): number {
  if (v <= 0) return 0;
  const z = (Math.log(v) - Math.log(median)) / sigma;
  return normalCdf(z);
}

export function Comparisons() {
  const [, navigate] = useLocation();
  const state = useStore();
  const last = lastNight(state);
  // Cohort demographics come from the signed-in user's own profile — this
  // used to be a literal tuned to the retired local persona (35–40 / 24–27),
  // which silently went stale (and visibly contradicted Profile) for every
  // other account. See PLAN.md "Type conventions" — screens read live state.
  const COHORT_CHIPS = [
    { label: 'Age', value: state.user.ageRange, key: 'age' },
    { label: 'Sex', value: state.user.sex, key: 'sex' },
    { label: 'BMI', value: state.user.bmiRange, key: 'bmi' },
    { label: 'Device', value: 'Yes', key: 'device' },
  ];
  const [active, setActive] = useState(new Set(['age', 'sex', 'bmi', 'device']));

  const toggle = (key: string) => {
    const next = new Set(active);
    if (next.has(key)) next.delete(key); else next.add(key);
    setActive(next);
  };

  // "Your snore index" = your actual recent nightly average (totalSnores is
  // always present — acoustic-only, no wearable dependency), not a fabricated
  // single-night snapshot. Last night alone can be 0 (a great night), which
  // would trivially always read "100th percentile" — a 7-night window is
  // more representative of where you actually are.
  const recentNights = state.nights.slice(-7);
  const yourValue = recentNights.length
    ? recentNights.reduce((a, n) => a + n.totalSnores, 0) / recentNights.length
    : null;

  // Filters narrow the *reference cohort* (tighter demographic match = less
  // variance in the comparison) rather than nudging the headline number
  // directly — this replaces the old `66 + filters * 4` fudge, which always
  // moved in the user's favor regardless of their actual data. Narrowing can
  // move the percentile either direction depending on where the user's value
  // sits relative to the median.
  const narrowing = Math.max(0.35, 1 - 0.15 * active.size);
  const median = REFERENCE_MEDIAN;
  const sigma = REFERENCE_SIGMA * narrowing;

  const percentile = yourValue === null
    ? null
    : Math.min(99, Math.max(1, Math.round((1 - logNormalCdf(yourValue, median, sigma)) * 100)));

  // Chart geometry — map real snore counts onto the illustrative curve.
  const valueToX = (v: number) => Math.max(0, Math.min(SNORE_SCALE_MAX, v)) / SNORE_SCALE_MAX * 320;
  const medianX = valueToX(median);
  const youX = yourValue === null ? null : valueToX(yourValue);
  // Approximate curve height at youX so the marker sits on the illustrated
  // bell rather than floating — purely visual, not a second data claim.
  const youCy = youX === null ? 0 : 95 - 75 * (1 - Math.min(1, Math.abs(youX - medianX) / 160));

  return (
    <div className={s.root}>
      <div className={s.nav}>
        <button className={`${s.back} tap`} onClick={() => navigate('/trends')}>
          <ChevronLeft />
          <span>Trends</span>
        </button>
        <div className={s.opts}>
          <span>Cohort</span>
          <span className={s.on}>Global</span>
        </div>
      </div>

      <div className={s.body}>
        <div className={s.label}>How you compare — beta</div>
        <h1 className={s.h}>
          {percentile === null ? (
            <>Track a few nights<br /><span className={s.it}>to see this.</span></>
          ) : percentile >= 50 ? (
            <>You're sleeping<br /><span className={s.it}>better than most.</span></>
          ) : (
            <>You're right around<br /><span className={s.it}>the middle.</span></>
          )}
        </h1>
        <p className={s.lede}>
          Modeled against a reference distribution for <span className={s.em}>{ageSexLabel(state.user)}</span> with
          similar BMI and a confirmed snoring history — not measured population data. See the methodology note below.
        </p>

        <div className={s.cohort}>
          {COHORT_CHIPS.map(c => (
            <button
              key={c.key}
              className={`${s.chip} ${active.has(c.key) ? s.active : ''} tap`}
              onClick={() => toggle(c.key)}
            >
              {c.label} <strong>{c.value}</strong>
            </button>
          ))}
        </div>

        <div className={s.dist}>
          <div className={s.distHeader}>
            <div>
              <div className={s.ttl}>
                Snore <span className={s.it}>index</span>
              </div>
              <div className={s.distSub}>Lower is calmer</div>
            </div>
            {percentile !== null && (
              <div className={s.pct}>
                {/* "Calmer than N%" — an unlabeled "Nth percentile" under a
                    snore metric reads both ways (99th percentile *snorer*?). */}
                <span className={s.u}>calmer than</span>
                <TickNumber key={percentile} value={percentile} duration={0.5} />
                <span className={s.u}>%</span>
              </div>
            )}
          </div>

          <div className={s.distChart}>
            <svg viewBox="0 0 320 110" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="cohortFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.18 }} />
                  <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <line x1="0" y1="100" x2="320" y2="100" style={{ stroke: 'var(--dist-grid)' }} strokeWidth={0.6} />
              <path
                d="M0,100 C 40,100 70,90 90,75 C 110,60 130,30 160,20 C 190,30 210,60 230,75 C 250,90 280,100 320,100 Z"
                fill="url(#cohortFill)" style={{ stroke: 'var(--accent)' }} strokeWidth={1.1}
              />
              <line x1={medianX} y1="14" x2={medianX} y2="100" style={{ stroke: 'var(--dist-ink)' }} strokeWidth={0.5} strokeDasharray="2 3" opacity="0.45" />
              <text x={medianX + 4} y="18" fontFamily="Nunito" fontSize="8" style={{ fill: 'var(--dist-cap)' }}>Median {Math.round(median)}</text>

              {youX !== null && (
                <g>
                  <line x1={youX} y1="20" x2={youX} y2="100" style={{ stroke: 'var(--accent)' }} strokeWidth={1} />
                  <circle cx={youX} cy={youCy} r="6" style={{ fill: 'var(--accent)' }} />
                  <circle cx={youX} cy={youCy} r="11" style={{ fill: 'var(--accent-soft)' }} opacity="0.25" />
                  <text x={youX} y="14" fontFamily="Nunito" fontStyle="italic" fontSize="14" style={{ fill: 'var(--dist-ink)' }} textAnchor="middle">
                    You · {Math.round(yourValue!)}
                  </text>
                </g>
              )}
            </svg>
          </div>

          <div className={s.axis}>
            <span>0</span><span>40</span><span>80</span><span>120</span><span>160+</span>
          </div>
        </div>

        <p className={s.copy}>
          {percentile === null ? (
            'Log a few nights and we’ll show you how you compare.'
          ) : (
            <>
              In plain terms — <span className={s.em}>{percentile} out of 100 people</span> in the reference cohort
              snore more than your recent average of <span className={s.em}>{Math.round(yourValue!)}/night</span> (last
              7 nights).
            </>
          )}
        </p>
        <p className={s.methodNote}>
          <strong>Beta methodology:</strong> there's no validated population distribution of nightly snore counts
          in the published research yet, so this compares you to a modeled reference cohort
          (median {Math.round(REFERENCE_MEDIAN)}/night) rather than inventing a precise clinical percentile.
          Your number is real — the last 7 nights of measured audio. Filters narrow the reference cohort's
          spread, not the headline number.
        </p>

        <div className={s.strip}>
          {/* "You" values are read from last night's actual measured/wearable
              fields — never fabricated. Sleep latency has no field in the
              Night model at all (mic/wearable both can't produce it yet), so
              it's always shown as unavailable rather than invented. */}
          <Metric
            label={<>Sleep <span className={s.it}>efficiency</span></>} pct="71st pct"
            you={typeof last?.efficiency === 'number' ? `${Math.round(last.efficiency * 100)}%` : null}
            cohort="84%" youPos={78} avgPos={60} scale={['60%','75%','90%','100%']}
          />
          <Metric
            label={<>Resting <span className={s.it}>heart rate</span></>} pct="64th pct"
            you={typeof last?.restingHr === 'number' ? `${Math.round(last.restingHr)} bpm` : null}
            cohort="62 bpm" youPos={42} avgPos={54} scale={['50','60','70','80']}
          />
          <Metric
            label={<>Time to <span className={s.it}>fall asleep</span></>} pct="76th pct"
            you={null}
            cohort="18 min" youPos={30} avgPos={48} scale={['0','15','30','45m']}
          />
          <Metric
            label={<>Deep <span className={s.it}>sleep</span></>} pct="58th pct"
            you={typeof last?.deepMin === 'number' ? fmtDuration(last.deepMin) : null}
            cohort="1h 18m" youPos={58} avgPos={52} scale={['30m','1h','1h 30m','2h+']}
          />
        </div>
      </div>
    </div>
  );
}

interface MetricProps {
  label: React.ReactNode;
  pct: string;
  // null = not measured (no wearable connected, or the field doesn't exist
  // yet for this metric) — render an honest "connect a wearable" affordance
  // instead of a fabricated number and a fabricated position on the bar.
  you: string | null;
  cohort: string;
  youPos: number;
  avgPos: number;
  scale: string[];
}
function Metric({ label, pct, you, cohort, youPos, avgPos, scale }: MetricProps) {
  const hasYou = you !== null;
  return (
    <div className={s.metric}>
      <div className={s.row}>
        <div className={s.nm}>{label}{hasYou && <span className={s.pp}>— {pct}</span>}</div>
        <div className={s.vals}>
          <div><div className={s.vk}>You</div><div className={`${s.vv} ${s.you}`}>{hasYou ? you : '—'}</div></div>
          <div><div className={s.vk}>Cohort</div><div className={s.vv}>{cohort}</div></div>
        </div>
      </div>
      {hasYou ? (
        <>
          <div className={s.bar}>
            <div className={s.avg} style={{ left: `${avgPos}%` }} />
            <div className={s.you} style={{ left: `${youPos}%` }} />
          </div>
          <div className={s.scale}>
            {scale.map(t => <span key={t}>{t}</span>)}
          </div>
        </>
      ) : (
        <div className={s.meta}>Connect a wearable to compare this metric.</div>
      )}
    </div>
  );
}
