import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore, store, lastNight } from '../store';
import { useSnoreDetector } from '../hooks/useSnoreDetector';
import { fmtClockHM, isoDate, parseIsoDate, pad2 } from '../utils/format';
import s from './Night.module.css';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Night() {
  const state = useStore();
  const [, navigate] = useLocation();
  const det = useSnoreDetector();

  // Initialize the live-night session if it doesn't exist.
  useEffect(() => {
    if (!state.liveNight?.tracking) {
      store.set(s2 => {
        s2.liveNight = { tracking: true, startedAt: Date.now() - 3600_000 * 4 - 21 * 60_000 };
      });
    }
  }, [state.liveNight?.tracking]);

  // 1s heartbeat so the clock and "last snore" age stay fresh even when silent.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const live = det.status === 'listening' || det.status === 'simulated';
  const blocked = det.status === 'denied' || det.status === 'unsupported';

  const liveNight = state.liveNight;
  if (!liveNight?.startedAt) return null;
  const elapsed = Date.now() - liveNight.startedAt;
  const h = Math.floor(elapsed / 3_600_000);
  const m = Math.floor((elapsed % 3_600_000) / 60_000);
  const startedDate = new Date(liveNight.startedAt);
  const startedAt = `${startedDate.getHours() % 12 || 12}:${pad2(startedDate.getMinutes())} ${startedDate.getHours() >= 12 ? 'pm' : 'am'}`;
  const now = new Date();

  const flashing = det.lastEventTs > 0 && Date.now() - det.lastEventTs < 450;
  const lastAgo = det.lastEventTs > 0 ? Math.max(0, Math.round((Date.now() - det.lastEventTs) / 1000)) : null;

  const verb = live ? 'Listening.'
    : det.status === 'requesting' ? 'One moment.'
    : blocked ? 'No mic — no problem.'
    : 'Ready when you are.';

  const endNight = () => {
    det.stop();
    const prior = lastNight(state);
    if (!prior) { navigate('/'); return; }
    const count = det.snoreCount;
    const baseSum = prior.snoresByHour.reduce((a, b) => a + b, 0) || 1;
    const scale = count / (prior.totalSnores || 1);
    const nextDate = parseIsoDate(prior.date);
    nextDate.setDate(nextDate.getDate() + 1);
    const newNight = {
      ...prior,
      date: isoDate(nextDate),
      totalSnores: count,
      snoresByHour: prior.snoresByHour.map(v => Math.round((v / baseSum) * count)),
      positionSnores: {
        side_left: Math.round(prior.positionSnores.side_left * scale),
        side_right: Math.round(prior.positionSnores.side_right * scale),
        back: Math.round(prior.positionSnores.back * scale),
        stomach: Math.round(prior.positionSnores.stomach * scale),
      },
      peakDb: det.peakDb > 0 ? Math.round(det.peakDb) : prior.peakDb,
      startedAt: '23:14',
      endedAt: fmtClockHM(new Date()),
    };
    store.set(s2 => {
      s2.nights.push(newNight);
      if (s2.nights.length > 90) s2.nights = s2.nights.slice(-90);
      s2.liveNight = null;
    });
    navigate('/morning');
  };

  return (
    <div className={s.root}>
      <div className={s.top}>
        <div className="label-mono" style={{ color: 'var(--night-text-3)' }}>{live ? 'Listening' : 'Tracking'}</div>
        <div className={s.moon}>{DAY_SHORT[now.getDay()]} · {pad2(now.getHours())}:{pad2(now.getMinutes())}</div>
      </div>

      <div className={s.center}>
        <div className={s.verb}>{verb}</div>

        <div
          className={`${s.orb} ${live ? s.live : ''}`}
          style={live ? { transform: `scale(${1 + det.level * 0.3})`, filter: `brightness(${1 + det.level * 0.6})` } : undefined}
        >
          {det.lastEventTs > 0 && <span key={det.lastEventTs} className={s.ripple} />}
        </div>

        <div className={s.clock}>{pad2(h)}:{pad2(m)}</div>
        <div className={s.clockCap}>{live ? `Asleep · since ${startedAt}` : 'Place me on the nightstand'}</div>

        {!live && det.status !== 'requesting' && (
          <button className={`${s.startBtn} tap`} onClick={det.start}>
            {blocked ? 'Try the microphone again' : 'Start listening'}
          </button>
        )}
        {det.status === 'requesting' && <div className={s.hint}>Allow microphone access…</div>}
        {blocked && (
          <button className={`${s.simLink} tap`} onClick={det.startSimulated}>or continue in demo mode</button>
        )}
        {det.status === 'idle' && (
          <div className={s.hint}>Your audio never leaves the phone</div>
        )}
      </div>

      {/* Live loudness waveform — driven by the mic in real time */}
      <div className={s.wave} aria-hidden>
        {det.levels.map((l, i) => (
          <i key={i} style={{ transform: `scaleY(${0.06 + Math.min(1, l)})` }} />
        ))}
      </div>

      <div className={s.signals}>
        <div className={s.s}>
          <div className={s.k}>Snores</div>
          <div className={`${s.v} ${flashing ? s.flash : ''}`}>{det.snoreCount}</div>
          <div className={s.t}>tonight</div>
        </div>
        <div className={s.s}>
          <div className={s.k}>Peak</div>
          <div className={s.v}>{det.peakDb > 0 ? det.peakDb : '—'}</div>
          <div className={s.t}>{det.peakDb > 0 ? 'dB' : 'quiet'}</div>
        </div>
        <div className={s.s}>
          <div className={s.k}>Last snore</div>
          <div className={s.v}>{lastAgo !== null ? `${lastAgo}s` : '—'}</div>
          <div className={s.t}>{lastAgo !== null ? 'ago' : 'none yet'}</div>
        </div>
      </div>

      {live && det.snoreCount > 0 && (
        <div className={s.types}>
          <div className={s.typesK}>Snore type · live</div>
          {([['Palatal', det.typeMix.palatal], ['Tongue', det.typeMix.tongue], ['Nasal', det.typeMix.nasal]] as const).map(([label, frac]) => (
            <div key={label} className={s.typeRow}>
              <span className={s.typeLabel}>{label}</span>
              <span className={s.typeBar}><i style={{ width: `${Math.round(frac * 100)}%` }} /></span>
              <span className={s.typePct}>{Math.round(frac * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className={s.footerRow}>
        <button className={`${s.end} tap`} onClick={endNight}>End night</button>
        <button className={`${s.devicePill} tap`} onClick={() => navigate('/onboarding/device')}>
          Device · Pos. {state.device.strapPosition}
        </button>
      </div>
    </div>
  );
}
