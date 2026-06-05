import { useLocation } from 'wouter';
import { useStore, store, daysSince } from '../store';
import { Avatar } from '../components/Avatar';
import { Wordmark } from '../components/Wordmark';
import { ChevronRight } from '../components/icons';
import { showToast } from '../components/Toast';
import s from './Profile.module.css';

const THEMES: Array<'auto' | 'light' | 'dark'> = ['auto', 'light', 'dark'];

export function Profile() {
  const state = useStore();
  const [, navigate] = useLocation();

  const used = daysSince(state.device.fittedAt);
  const pctLife = Math.min(100, Math.round((used / state.device.lifespanNights) * 100));

  const setTheme = (t: 'auto' | 'light' | 'dark') => store.set(s2 => { s2.uiTheme = t; });
  const toggleNotify = () => store.set(s2 => { s2.partner.notifyAtMorning = !s2.partner.notifyAtMorning; });

  return (
    <div className={s.root}>
      <div className={s.header}>
        <Avatar size={60} />
        <div className={s.id}>
          <div className={s.name}>{state.user.name}</div>
          <div className={s.meta}>{state.user.ageRange} · {state.user.sex} · BMI {state.user.bmiRange}</div>
        </div>
      </div>

      {/* Device */}
      <div className={s.sectionLabel}>Your device</div>
      <button className={`${s.card} ${s.deviceCard} tap`} onClick={() => navigate('/onboarding/device')}>
        <div className={s.deviceTop}>
          <Wordmark size={16} tone="onLight" />
          <ChevronRight />
        </div>
        <div className={s.deviceStats}>
          <div><div className={s.k}>Strap</div><div className={s.v}>{state.device.strapPosition}<span className={s.of}> / 5</span></div></div>
          <div><div className={s.k}>In use</div><div className={s.v}>{used}<span className={s.of}> nights</span></div></div>
          <div><div className={s.k}>Life used</div><div className={s.v}>{pctLife}<span className={s.of}>%</span></div></div>
        </div>
        <div className={s.meter}><i style={{ width: `${pctLife}%` }} /></div>
      </button>
      <button className={`${s.rowLink} tap`} onClick={() => navigate('/reorder')}>
        <span>Reorder or replace device</span><ChevronRight />
      </button>

      {/* Sleep partner */}
      <div className={s.sectionLabel}>Sleep partner</div>
      <div className={s.card}>
        <div className={s.toggleRow}>
          <div className={s.toggleText}>
            <div className={s.rowTitle}>Notify {state.partner.name} each morning</div>
            <div className={s.rowSub}>A short recap of how the night went.</div>
          </div>
          <button
            className={`${s.switch} ${state.partner.notifyAtMorning ? s.on : ''}`}
            onClick={toggleNotify}
            aria-pressed={state.partner.notifyAtMorning}
            aria-label={`Toggle morning recap for ${state.partner.name}`}
          >
            <span className={s.knob} />
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className={s.sectionLabel}>Appearance</div>
      <div className={s.card}>
        <div className={s.seg} role="group" aria-label="Theme">
          {THEMES.map(t => (
            <button
              key={t}
              className={`${s.segBtn} ${state.uiTheme === t ? s.segOn : ''} tap`}
              onClick={() => setTheme(t)}
              aria-pressed={state.uiTheme === t}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className={s.rowSub} style={{ marginTop: 12 }}>Auto switches to a dark dashboard after 6 pm.</div>
      </div>

      {/* More */}
      <div className={s.sectionLabel}>More</div>
      <div className={s.card}>
        <button className={`${s.listRow} tap`} onClick={() => navigate('/trends/science')}>
          <span>The science behind your data</span><ChevronRight />
        </button>
        <button className={`${s.listRow} tap`} onClick={() => navigate('/onboarding/setup')}>
          <span>Re-fit the device</span><ChevronRight />
        </button>
        <button className={`${s.listRow} tap`} onClick={() => navigate('/onboarding')}>
          <span>Replay onboarding</span><ChevronRight />
        </button>
      </div>

      <button className={`${s.signout} tap`} onClick={() => showToast('You’ll stay signed in for this demo.')}>
        Sign out
      </button>

      <div className={s.scrollPad} />
    </div>
  );
}
