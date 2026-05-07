import { useLocation } from 'wouter';
import { useStore, baselineSnores, lastNight, daysSince, streakNights } from '../store';
import { Avatar } from '../components/Avatar';
import { Sparkline } from '../components/Sparkline';
import { TickNumber } from '../components/TickNumber';
import { SearchIcon, ChevronRight, PillIcon } from '../components/icons';
import {
  fmtDateLong, fmtDelta, fmtDuration, timeOfDayGreeting, fmtClockHM, shouldUseDarkDashboard,
} from '../utils/format';
import s from './Dashboard.module.css';

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

  return (
    <div className={`${s.root} ${isNight ? s.night : ''}`}>
      {/* top bar */}
      <div className={s.topbar}>
        <Avatar withDot={!isNight} glow={isNight} />
        <button className={`${s.iconBtn} tap`} aria-label="Search">
          <SearchIcon />
        </button>
      </div>

      {/* greeting */}
      <div className={s.greeting}>
        <h1>
          {timeOfDayGreeting()} <span className="serif">{state.user.name}.</span>
        </h1>
        <div className={s.date}>{fmtDateLong(new Date())}</div>
      </div>

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
            stroke={isNight ? '#86C8B8' : '#3E7565'}
            fill="#86C8B8"
          />
        </div>
        <div className={s.sparkAxis}>
          <span>14 NIGHTS AGO</span>
          <span>TONIGHT</span>
        </div>
      </div>

      {/* status row */}
      <div className={s.statusRow}>
        <div className={`${s.stat} tap`}>
          <div>
            <div className={s.k}>Sleep</div>
            <div className={s.v}>{fmtDuration(last.sleepDurationMin)}</div>
          </div>
          <div className={s.t}><span className={s.up}>↑</span> from avg</div>
        </div>
        <div className={`${s.stat} tap`}>
          <div>
            <div className={s.k}>Efficiency</div>
            <div className={s.v}>{Math.round(last.efficiency * 100)}%</div>
          </div>
          <div className={s.t}><span className={s.flat}>→</span> stable</div>
        </div>
        <div className={`${s.stat} tap`}>
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
