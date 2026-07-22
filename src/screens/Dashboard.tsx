import { useLocation } from 'wouter';
import {
  useStore, baselineSnores, lastNight, daysSince, streakNights,
  partnerSleptThroughLastN, partnerSleptThroughPrevWeek, wineMultiplier,
} from '../store';
import { Avatar } from '../components/Avatar';
import { SceneHills, PaperStar } from '../components/paper/PaperScene';
import { Sparkline } from '../components/Sparkline';
import { TickNumber } from '../components/TickNumber';
import { ChevronRight, PillIcon } from '../components/icons';
import { ScienceNote } from '../components/ScienceNote';
import {
  fmtDateLong, fmtDelta, fmtDuration, timeOfDayGreeting, fmtClockHM, shouldUseDarkDashboard,
} from '../utils/format';
import s from './Dashboard.module.css';

// Evening hours — when the predictive nudge appears.
function isEvening(d: Date = new Date()): boolean {
  const h = d.getHours();
  return h >= 16 && h < 23;
}

// Saturday = the night a wine-drinker is most likely to drink. Tweak as needed.
function isWineDay(d: Date = new Date()): boolean {
  const dow = d.getDay();
  return dow === 5 || dow === 6 || dow === 0;
}

export function Dashboard() {
  const state = useStore();
  const [location, navigate] = useLocation();
  const last = lastNight(state);
  if (!last) return null;

  const baseline = baselineSnores(state);
  const delta = fmtDelta(last.totalSnores, baseline);
  const last14 = state.nights.slice(-14).map(n => n.totalSnores);
  const latestRec = state.recommendations.length > 0
    ? [...state.recommendations].sort((a, b) => b.recommendedOn.localeCompare(a.recommendedOn))[0]
    : null;

  // Stat-tile deltas, derived vs the prior 14 nights (excluding last night).
  const prior14 = state.nights.slice(-15, -1);
  const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : 0);
  const sleepDiff = last.sleepDurationMin - meanOf(prior14.map(n => n.sleepDurationMin));
  // Efficiency is a wearable-ingest field — undefined for recorded nights
  // until a wearable is connected. Never fabricate a number for it.
  const numericEfficiency = (xs: (number | undefined)[]): number[] =>
    xs.filter((v): v is number => typeof v === 'number');
  const hasEfficiency = typeof last.efficiency === 'number';
  const effDiffPts = hasEfficiency
    ? Math.round((last.efficiency! - meanOf(numericEfficiency(prior14.map(n => n.efficiency)))) * 100)
    : 0;
  const isNight =
    location === '/dashboard/dark' ||
    (location === '/' && (state.uiTheme === 'dark' || (state.uiTheme === 'auto' && shouldUseDarkDashboard())));
  const lastThemMsg = [...state.chat].reverse().find(m => m.who === 'them' && m.text);

  const partner = state.partner;
  const partnerWeek = partnerSleptThroughLastN(state, 7);
  const partnerPrev = partnerSleptThroughPrevWeek(state, 7);
  const partnerDelta = partnerWeek.slept - partnerPrev.slept;

  const wineMult = wineMultiplier(state);
  const showWineNudge = isEvening() && isWineDay() && wineMult !== null && wineMult > 1.25;

  return (
    <div className={`${s.root} ${isNight ? s.night : ''}`}>
      {/* papercraft horizon behind the header — real paper art harvested from
         the design handoff (light/dark swap + edge fades handled in CSS) */}
      <div className={s.scene} aria-hidden />
      {/* a few animated stars twinkle over the static horizon */}
      <svg className={s.sky} viewBox="0 0 393 118" aria-hidden focusable="false">
        <PaperStar x={150} y={30} scale={0.9} delay={0.6} />
        <PaperStar x={228} y={54} scale={0.7} delay={2.1} />
        <PaperStar x={300} y={26} scale={0.8} delay={3.3} />
      </svg>

      {/* top bar */}
      <div className={s.topbar}>
        <button
          className="tap"
          onClick={() => navigate('/profile')}
          aria-label="Your profile"
          style={{ display: 'grid', placeItems: 'center', background: 'none', border: 0, padding: 0 }}
        >
          <Avatar size={44} withDot={!isNight} glow={isNight} />
        </button>
        <button className={`${s.trackBtn} tap`} onClick={() => navigate('/night')} aria-label="Start sleep tracking">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden className={s.trackMoon}>
            <path d="M21 14.5A8.5 8.5 0 1 1 10.9 3.1a6.9 6.9 0 0 0 11.1 11.4Z" fill="currentColor" />
          </svg>
          Track sleep
        </button>
      </div>

      {/* greeting */}
      <div className={s.greeting}>
        <h1>
          {timeOfDayGreeting()} <span className="serif">{state.user.name}.</span>
        </h1>
        <div className={s.date}>{fmtDateLong(new Date())}</div>
      </div>

      {/* partner card — the emotional anchor */}
      <div className={s.partner}>
        {/* Sarah — sleeping papercraft face */}
        <svg viewBox="0 0 48 48" className={s.partnerAvatar} role="img" aria-label={`${partner.name} avatar`}>
          <circle cx="24" cy="24" r="23" fill="#E48C87" />
          <circle cx="24" cy="24" r="23" fill="none" stroke="rgba(247,248,251,0.85)" strokeWidth="2" />
          {/* closed eyes, lashes fanning below */}
          <g stroke="#7C3B41" strokeWidth="1.7" strokeLinecap="round" fill="none">
            <path d="M13.5 21.5 q3.5 3.5 7 0" />
            <path d="M27.5 21.5 q3.5 3.5 7 0" />
            <path d="M14.5 26 l-1 1.6 M17 26.8 l-0.3 1.7 M19.5 26 l0.7 1.6" />
            <path d="M28.5 26 l-0.7 1.6 M31 26.8 l0.3 1.7 M33.5 26 l1 1.6" />
          </g>
          {/* gentle smile */}
          <path d="M20.5 34 q3.5 2.6 7 0" stroke="#7C3B41" strokeWidth="1.7" strokeLinecap="round" fill="none" />
        </svg>
        <div className={s.partnerBody}>
          <div className={s.partnerLine}>
            <span className="serif" style={{ fontStyle: 'italic' }}>{partner.name}</span>
            {' slept through '}
            <strong>{partnerWeek.slept} of {partnerWeek.total}</strong>
            {' nights this week.'}
          </div>
          {partnerDelta !== 0 && (
            <div className={s.partnerSub}>
              <span className={partnerDelta > 0 ? s.up : s.down}>
                {partnerDelta > 0 ? '↑' : '↓'} {Math.abs(partnerDelta)}
              </span>
              {' from last week'}
            </div>
          )}
        </div>
      </div>

      {/* predictive wine nudge — only appears on weekend evenings when pattern is real */}
      {showWineNudge && wineMult && (
        <div
          className={`${s.nudge} tap`}
          role="button"
          tabIndex={0}
          onClick={() => navigate('/chat')}
        >
          <div className={s.nudgeIcon}>🍷</div>
          <div className={s.nudgeBody}>
            <div className={s.nudgeTitle}>
              Wine tonight? You snored <strong>{wineMult.toFixed(1)}×</strong> more on past wine nights.
            </div>
            <div className={s.nudgeSub}>
              Want me to give {partner.name} a heads-up?
            </div>
          </div>
          <div className={s.chev}><ChevronRight /></div>
        </div>
      )}

      {/* hero */}
      <div
        className={`${s.hero} tap`}
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/night/${last.date}`)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/night/${last.date}`); }}
      >
        <div className={s.label}>Last Night</div>
        <div className={s.numRow}>
          <div className={s.num}>
            <TickNumber value={last.totalSnores} duration={0.7} />
          </div>
          <div className={s.unit}>snores</div>
        </div>
        <div className={s.delta}>
          <span className={s.arrow}>{delta.sign}</span>
          <span>{delta.pct}</span>
          <span className={s.from}>from baseline</span>
        </div>
        {/* dunes along the card floor, behind the sparkline */}
        <div className={s.heroHills} aria-hidden>
          <SceneHills variant="low" />
        </div>
        <div style={{ marginTop: 18, position: 'relative' }}>
          <Sparkline
            values={last14}
            width={360}
            height={44}
            strokeWidth={1.8}
            stroke={isNight ? '#74C7D0' : '#4BAFBA'}
            fill="#74C7D0"
            dots
          />
        </div>
        <div className={s.sparkAxis}>
          <span>14 NIGHTS AGO</span>
          <span>TONIGHT</span>
        </div>
        {/* the whole card navigates — this row just says so out loud */}
        <div className={s.heroCta}>
          <span>See the full night — every snore, timestamped</span>
          <ChevronRight />
        </div>
      </div>

      {/* status row */}
      <div className={s.statusRow}>
        <div
          className={`${s.stat} tap`}
          role="button"
          tabIndex={0}
          onClick={() => navigate('/trends')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/trends'); }}
        >
          <svg viewBox="0 0 40 20" className={s.statDecor} aria-hidden>
            <path d="M8 16 a6 6 0 0 1 1.5-11 a8 8 0 0 1 14.5-2.5 a6.5 6.5 0 0 1 10 3.5 a5 5 0 0 1 2.5 10 Z" style={{ fill: 'var(--scene-cloud)' }} />
          </svg>
          <div>
            <div className={s.k}>Sleep</div>
            <div className={s.v}>{fmtDuration(last.sleepDurationMin)}</div>
          </div>
          <div className={s.t}>
            {sleepDiff > 6
              ? <><span className={s.up}>↑</span> from avg</>
              : sleepDiff < -6
                ? <><span className={s.down}>↓</span> from avg</>
                : <><span className={s.flat}>→</span> on avg</>}
          </div>
        </div>
        <div
          className={`${s.stat} tap`}
          role="button"
          tabIndex={0}
          onClick={() => navigate('/trends')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/trends'); }}
        >
          <div>
            <div className={s.k}>Efficiency</div>
            <div className={s.v}>{hasEfficiency ? `${Math.round(last.efficiency! * 100)}%` : '—'}</div>
          </div>
          <div className={s.t}>
            {!hasEfficiency
              ? <span className={s.flat}>connect a wearable</span>
              : effDiffPts >= 1
                ? <><span className={s.up}>↑</span> {effDiffPts}pt vs avg</>
                : effDiffPts <= -1
                  ? <><span className={s.down}>↓</span> {Math.abs(effDiffPts)}pt vs avg</>
                  : <><span className={s.flat}>→</span> stable</>}
          </div>
        </div>
        <div
          className={`${s.stat} tap`}
          role="button"
          tabIndex={0}
          onClick={() => navigate('/trends')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/trends'); }}
        >
          <svg viewBox="0 0 40 24" className={s.statDecor} aria-hidden>
            <path d="M30 18.5 A8 8 0 1 1 21.3 9.8 A6.2 6.2 0 0 0 30 18.5 Z" style={{ fill: 'var(--cream)' }} transform="translate(4 -4)" />
            <PaperStar x={8} y={8} scale={0.55} delay={1.2} />
            <PaperStar x={16} y={18} scale={0.4} delay={2.8} />
          </svg>
          <div>
            <div className={s.k}>Streak</div>
            <div className={s.v}>{streakNights(state)}</div>
          </div>
          <div className={s.t}>nights with device</div>
        </div>
      </div>

      <ScienceNote kind={last.alcohol ? 'alcohol' : 'site'} />

      {/* active context */}
      <div
        className={`${s.context} tap`}
        role="button"
        tabIndex={0}
        onClick={() => navigate('/onboarding/device')}
      >
        <div className={s.body}>
          <div className={s.label}>Where you are</div>
          <div className={s.copy}>
            Day {daysSince(state.device.fittedAt)} with the device · <strong>strap position {state.device.strapPosition}</strong>. I'll check in tomorrow morning.
          </div>
        </div>
        <div className={s.chev}><ChevronRight /></div>
      </div>

      {/* agent message preview */}
      {lastThemMsg && (
        <div className={`${s.msg} tap`} role="button" tabIndex={0} onClick={() => navigate('/chat')}>
          <Avatar size={28} />
          <div className={s.bubble}>
            <div className={s.who}>
              <span>Dr. Sommers</span>
              <span className={s.ts}>{fmtClockHM(new Date(lastThemMsg.ts))}</span>
            </div>
            <div className={s.text}>{lastThemMsg.text}</div>
          </div>
        </div>
      )}

      {/* recommendation — most recent entry from state.recommendations
          (synced/hydrated per-user), not a hardcoded claim shown to
          everyone regardless of whether the underlying data exists. */}
      {latestRec && (
        <div className={`${s.rec} tap`} role="button" tabIndex={0} onClick={() => navigate('/reorder')}>
          <div className={s.ico}><PillIcon /></div>
          <div className={s.body}>
            <div className={s.title}>Try {latestRec.name}</div>
            <div className={s.sub}>{latestRec.quote}</div>
          </div>
          <div className={s.chev}><ChevronRight /></div>
        </div>
      )}

      <div className={s.scrollPad} />
    </div>
  );
}
