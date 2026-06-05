import { useLocation, useRoute } from 'wouter';
import { useStore, lastNight, baselineSnores, findNight } from '../store';
import { ChevronLeft, PlusIcon } from '../components/icons';
import { Avatar } from '../components/Avatar';
import { fmtDelta, fmtDuration, parseIsoDate, pad2 } from '../utils/format';
import s from './DetailedNight.module.css';

export function DetailedNight() {
  const state = useStore();
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ date: string }>('/night/:date');
  const dateParam = params?.date;

  const n = (() => {
    if (!dateParam || dateParam === 'today') return lastNight(state);
    const found = findNight(state, dateParam);
    return found ?? lastNight(state);
  })();
  if (!n) return null;

  const baseline = baselineSnores(state);
  const delta = fmtDelta(n.totalSnores, baseline);

  const d = parseIsoDate(n.date);
  const prevDay = new Date(d); prevDay.setDate(d.getDate() - 1);
  const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const totalMin = n.positions.side_left + n.positions.side_right + n.positions.back + n.positions.stomach;
  const positions = [
    { label: 'Side · left',  mins: n.positions.side_left,  snores: n.positionSnores.side_left  },
    { label: 'Side · right', mins: n.positions.side_right, snores: n.positionSnores.side_right },
    { label: 'Back',         mins: n.positions.back,       snores: n.positionSnores.back       },
    { label: 'Stomach',      mins: n.positions.stomach,    snores: n.positionSnores.stomach    },
  ];

  return (
    <div className={s.root}>
      <div className={s.nav}>
        <button className={`${s.back} tap`} onClick={() => navigate('/')}>
          <ChevronLeft />
          <span>Home</span>
        </button>
        <button className={`${s.more} tap`} aria-label="More">
          <PlusIcon />
        </button>
      </div>

      <div className={s.body}>
        <div className={s.head}>
          <div className={s.label}>
            {dayShort[prevDay.getDay()]} → {dayShort[d.getDay()]} · {fmtTime(n.startedAt)} – {fmtTime(n.endedAt)}
          </div>
          <h1>Last night</h1>
          <div className={s.sub}>
            {fmtDuration(n.sleepDurationMin + n.awakeMin)} in bed · {fmtDuration(n.sleepDurationMin)} asleep · device worn the full night
          </div>
        </div>

        <div className={s.hero}>
          <div className={s.num}>{n.totalSnores}</div>
          <div className={s.unit}>snores</div>
          <div className={s.delta}>{delta.sign} {delta.pct}</div>
        </div>

        {/* Hypnogram */}
        <div className={s.hyp}>
          <div className={s.row}>
            <div className={s.k}>Sleep stages</div>
            <div className={s.total}>{fmtDuration(n.sleepDurationMin)}</div>
          </div>
          <Hypnogram />
          <div className={s.hypX}>
            <span>10 PM</span><span>12 AM</span><span>2 AM</span><span>4 AM</span><span>6 AM</span>
          </div>
          <div className={s.hypLegend}>
            <div className={s.l}><div className={s.k}>Deep</div><div className={s.v}>{fmtDuration(n.deepMin)}</div></div>
            <div className={s.l}><div className={s.k}>REM</div><div className={s.v}>{fmtDuration(n.remMin)}</div></div>
            <div className={s.l}><div className={s.k}>Light</div><div className={s.v}>{fmtDuration(n.lightMin)}</div></div>
            <div className={s.l}><div className={s.k}>Awake</div><div className={s.v}>{fmtDuration(n.awakeMin)}</div></div>
          </div>
        </div>

        {/* Snore intensity */}
        <div className={s.section}>
          <div className={s.h}>
            <h2>Snoring intensity</h2>
            <div className={s.meta}>{n.totalSnores} events · {n.peakDb} dB peak</div>
          </div>
          <div className={s.snore}>
            <SnoreBars hourlyValues={n.snoresByHour} />
            <div className={s.legend}>
              <span>10 PM</span><span>2 AM</span><span>6 AM</span>
            </div>
          </div>
          <div className={s.insight}>
            <Avatar size={24} />
            <div className={s.copy}>
              The peak around <span className={s.data}>2:40</span> is when you rolled onto your back. <span className={s.em}>The thing is</span> — the strap held. Last week, position 2 would have slipped right there.
            </div>
          </div>
        </div>

        {/* Position breakdown */}
        <div className={s.section}>
          <div className={s.h}>
            <h2>By position</h2>
            <div className={s.meta}>Where you slept</div>
          </div>
          <div className={s.posGrid}>
            {positions.map((p) => {
              const pct = totalMin > 0 ? Math.round((p.mins / totalMin) * 100) : 0;
              return (
                <div className={s.pos} key={p.label}>
                  <div className={s.k}>{p.label}</div>
                  <div className={s.v}>{fmtDuration(p.mins)}</div>
                  <div className={s.bar}><div style={{ width: `${pct}%` }} /></div>
                  <div className={s.pct}>{pct}% · {p.snores} snore{p.snores === 1 ? '' : 's'}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={s.aside}>
          <div className={s.label}>Why this matters</div>
          <h3>Most of your snoring still happens on your back.</h3>
          <p>That's normal — gravity pulls the soft palate and tongue base into the airway. The device counters that. As we tighten the strap over the next two weeks, that back-sleeping number is the one to watch.</p>
        </div>
      </div>
    </div>
  );
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad2(m)} ${ap}`;
}

function Hypnogram() {
  return (
    <svg viewBox="0 0 360 132" preserveAspectRatio="none" style={{ width: '100%', height: 132, display: 'block' }}>
      <g stroke="rgba(30,37,68,0.06)" strokeWidth={1}>
        <line x1="0" y1="20" x2="360" y2="20" />
        <line x1="0" y1="50" x2="360" y2="50" />
        <line x1="0" y1="80" x2="360" y2="80" />
        <line x1="0" y1="110" x2="360" y2="110" />
      </g>
      <g fontFamily="Nunito" fontSize="9" fill="#8A90A6">
        <text x="0" y="17">AWAKE</text>
        <text x="0" y="47">REM</text>
        <text x="0" y="77">LIGHT</text>
        <text x="0" y="107">DEEP</text>
      </g>
      <polyline
        fill="none" stroke="#43BACA" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"
        points="40,20 40,80 60,80 60,110 95,110 95,80 130,80 130,110 165,110 165,50 195,50 195,80 225,80 225,110 250,110 250,80 280,80 280,50 305,50 305,80 325,80 325,20 360,20"
      />
      <line x1="155" y1="0" x2="155" y2="132" stroke="rgba(67,186,202,0.35)" strokeWidth="1" strokeDasharray="2 3" />
      <text x="158" y="11" fontFamily="Nunito" fontSize="9" fill="#43BACA" letterSpacing="1">2:40 — back</text>
    </svg>
  );
}

function SnoreBars({ hourlyValues }: { hourlyValues: number[] }) {
  const max = Math.max(...hourlyValues, 1);
  // Render ~21 visual bars across 360 width, sampled from the 8 hourly buckets.
  const visualCount = 21;
  return (
    <svg viewBox="0 0 360 110" preserveAspectRatio="none" style={{ width: '100%', height: 110, display: 'block' }}>
      <g fill="#43BACA">
        {Array.from({ length: visualCount }, (_, i) => {
          const hourIdx = Math.floor((i / visualCount) * hourlyValues.length);
          const v = hourlyValues[hourIdx];
          const h = Math.max(2, (v / max) * 50);
          const x = 20 + (i / (visualCount - 1)) * 320;
          const y = 55 - h / 2;
          return <rect key={i} x={x} y={y} width={1.5} height={h} rx={0.5} />;
        })}
      </g>
      <line x1="0" y1="55" x2="360" y2="55" stroke="rgba(30,37,68,0.18)" strokeWidth="0.75" />
    </svg>
  );
}
