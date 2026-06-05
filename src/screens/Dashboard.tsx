import { useLocation } from 'wouter';
import {
  useStore, baselineSnores, lastNight, daysSince, streakNights,
  partnerSleptThroughLastN, partnerSleptThroughPrevWeek, wineMultiplier,
} from '../store';
import { Avatar } from '../components/Avatar';
import { Sparkline } from '../components/Sparkline';
import { TickNumber } from '../components/TickNumber';
import { ChevronRight, PillIcon } from '../components/icons';
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
      {/* top bar */}
      <div className={s.topbar}>
        <button
          className="tap"
          onClick={() => navigate('/profile')}
          aria-label="Your profile"
          style={{ display: 'grid', placeItems: 'center', background: 'none', border: 0, padding: 0 }}
        >
          <Avatar withDot={!isNight} glow={isNight} />
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
        <div
          className={s.partnerAvatar}
          aria-label={`${partner.name} avatar`}
        />
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
        <div style={{ marginTop: 18 }}>
          <Sparkline
            values={last14}
            width={360}
            height={36}
            stroke={isNight ? '#7FD1DE' : '#43BACA'}
            fill="#7FD1DE"
          />
        </div>
        <div className={s.sparkAxis}>
          <span>14 NIGHTS AGO</span>
          <span>TONIGHT</span>
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
          <div>
            <div className={s.k}>Sleep</div>
            <div className={s.v}>{fmtDuration(last.sleepDurationMin)}</div>
          </div>
          <div className={s.t}><span className={s.up}>↑</span> from avg</div>
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
            <div className={s.v}>{Math.round(last.efficiency * 100)}%</div>
          </div>
          <div className={s.t}><span className={s.flat}>→</span> stable</div>
        </div>
        <div
          className={`${s.stat} tap`}
          role="button"
          tabIndex={0}
          onClick={() => navigate('/trends')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/trends'); }}
        >
          <div>
            <div className={s.k}>Streak</div>
            <div className={s.v}>{streakNights(state)}</div>
          </div>
          <div className={s.t}>nights with device</div>
        </div>
      </div>

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
            Day {daysSince(state.device.fittedAt)} of <strong>strap position {state.device.strapPosition}</strong>. I'll check in tomorrow morning.
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

      {/* recommendation */}
      <div className={`${s.rec} tap`} role="button" tabIndex={0} onClick={() => navigate('/profile')}>
        <div className={s.ico}><PillIcon /></div>
        <div className={s.body}>
          <div className={s.title}>Try magnesium glycinate</div>
          <div className={s.sub}>Based on your deep-sleep patterns this month.</div>
        </div>
        <div className={s.chev}><ChevronRight /></div>
      </div>

      <div className={s.scrollPad} />
    </div>
  );
}
