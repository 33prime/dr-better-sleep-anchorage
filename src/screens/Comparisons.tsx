import { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft } from '../components/icons';
import { TickNumber } from '../components/TickNumber';
import s from './Comparisons.module.css';

const COHORT_CHIPS = [
  { label: 'Age', value: '35–40', key: 'age' },
  { label: 'Sex', value: 'M', key: 'sex' },
  { label: 'BMI', value: '24–27', key: 'bmi' },
  { label: 'Device', value: 'Yes', key: 'device' },
];

export function Comparisons() {
  const [, navigate] = useLocation();
  const [active, setActive] = useState(new Set(['age', 'sex', 'bmi', 'device']));
  const [percentile, setPercentile] = useState(82);

  const toggle = (key: string) => {
    const next = new Set(active);
    if (next.has(key)) next.delete(key); else next.add(key);
    setActive(next);
    // Re-randomize percentile to feel responsive
    setPercentile(70 + Math.floor(Math.random() * 24));
  };

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
        <div className={s.label}>Comparison</div>
        <h1 className={s.h}>
          You're sleeping<br />
          <span className={s.it}>better than most.</span>
        </h1>
        <p className={s.lede}>
          Among <span className={s.em}>38-year-old men</span> with similar BMI and a confirmed snoring history —{' '}
          <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>about 2,400 people</strong> in our anonymized cohort. Here's where you fall.
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
            <div className={s.pct}>
              <TickNumber value={percentile} duration={0.5} />
              <span className={s.u}>th percentile</span>
            </div>
          </div>

          <div className={s.distChart}>
            <svg viewBox="0 0 320 110" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="cohortFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#43BACA" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#43BACA" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="100" x2="320" y2="100" stroke="rgba(30,37,68,0.15)" strokeWidth={0.6} />
              <path
                d="M0,100 C 40,100 70,90 90,75 C 110,60 130,30 160,20 C 190,30 210,60 230,75 C 250,90 280,100 320,100 Z"
                fill="url(#cohortFill)" stroke="#43BACA" strokeWidth={1.1}
              />
              <line x1="160" y1="14" x2="160" y2="100" stroke="#1E2544" strokeWidth={0.5} strokeDasharray="2 3" opacity="0.45" />
              <text x="164" y="18" fontFamily="Nunito" fontSize="8" fill="#6E7596">Median 31</text>

              <g>
                <line x1={86} y1="20" x2={86} y2="100" stroke="#43BACA" strokeWidth={1} />
                <circle cx={86} cy={76} r="6" fill="#43BACA" />
                <circle cx={86} cy={76} r="11" fill="#7FD1DE" opacity="0.25" />
                <text x={86} y="14" fontFamily="Nunito" fontStyle="italic" fontSize="14" fill="#1E2544" textAnchor="middle">You · 18</text>
              </g>
            </svg>
          </div>

          <div className={s.axis}>
            <span>0</span><span>15</span><span>30</span><span>45</span><span>60+</span>
          </div>
        </div>

        <p className={s.copy}>
          In plain terms — <span className={s.em}>{percentile} out of 100 people</span> who match your profile snore more than you do. That's mostly the device working. Pre-treatment, you sat near the median.
        </p>

        <div className={s.strip}>
          <Metric label={<>Sleep <span className={s.it}>efficiency</span></>} pct="71st pct" you="91%" cohort="84%" youPos={78} avgPos={60} scale={['60%','75%','90%','100%']} />
          <Metric label={<>Resting <span className={s.it}>heart rate</span></>} pct="64th pct" you="58 bpm" cohort="62 bpm" youPos={42} avgPos={54} scale={['50','60','70','80']} />
          <Metric label={<>Time to <span className={s.it}>fall asleep</span></>} pct="76th pct" you="12 min" cohort="18 min" youPos={30} avgPos={48} scale={['0','15','30','45m']} />
          <Metric label={<>Deep <span className={s.it}>sleep</span></>} pct="58th pct" you="1h 24m" cohort="1h 18m" youPos={58} avgPos={52} scale={['30m','1h','1h 30m','2h+']} />
        </div>
      </div>
    </div>
  );
}

interface MetricProps {
  label: React.ReactNode;
  pct: string;
  you: string;
  cohort: string;
  youPos: number;
  avgPos: number;
  scale: string[];
}
function Metric({ label, pct, you, cohort, youPos, avgPos, scale }: MetricProps) {
  return (
    <div className={s.metric}>
      <div className={s.row}>
        <div className={s.nm}>{label}<span className={s.pp}>— {pct}</span></div>
        <div className={s.vals}>
          <div><div className={s.vk}>You</div><div className={`${s.vv} ${s.you}`}>{you}</div></div>
          <div><div className={s.vk}>Cohort</div><div className={s.vv}>{cohort}</div></div>
        </div>
      </div>
      <div className={s.bar}>
        <div className={s.avg} style={{ left: `${avgPos}%` }} />
        <div className={s.you} style={{ left: `${youPos}%` }} />
      </div>
      <div className={s.scale}>
        {scale.map(t => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}
