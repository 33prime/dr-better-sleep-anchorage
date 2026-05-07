import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore, store, lastNight } from '../store';
import { fmtClockHM, isoDate, pad2 } from '../utils/format';
import s from './Night.module.css';

export function Night() {
  const state = useStore();
  const [, navigate] = useLocation();

  // Initialize the live night session if it doesn't exist.
  useEffect(() => {
    if (!state.liveNight?.tracking) {
      store.set(s2 => {
        s2.liveNight = {
          tracking: true,
          startedAt: Date.now() - 3600_000 * 4 - 21 * 60_000,
        };
      });
    }
  }, [state.liveNight?.tracking]);

  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const live = state.liveNight;
  if (!live?.startedAt) return null;
  const elapsed = Date.now() - live.startedAt;
  const h = Math.floor(elapsed / 3_600_000);
  const m = Math.floor((elapsed % 3_600_000) / 60_000);
  const startedDate = new Date(live.startedAt);
  const startedAt = `${startedDate.getHours() % 12 || 12}:${pad2(startedDate.getMinutes())} ${startedDate.getHours() >= 12 ? 'pm' : 'am'}`;

  const endNight = () => {
    const prior = lastNight(state);
    if (!prior) return;
    const today = new Date();
    const newNight = {
      ...prior,
      date: isoDate(today),
      totalSnores: Math.max(20, Math.round(prior.totalSnores * (0.85 + Math.random() * 0.2))),
      sleepDurationMin: prior.sleepDurationMin + Math.round((Math.random() - 0.5) * 30),
      efficiency: Math.min(0.98, prior.efficiency + (Math.random() - 0.4) * 0.04),
      deepMin: prior.deepMin + Math.round((Math.random() - 0.5) * 20),
      snoresByHour: prior.snoresByHour.map(v => Math.max(0, Math.round(v * (0.7 + Math.random() * 0.4)))),
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
        <div className="label-mono" style={{ color: 'var(--night-text-3)' }}>Tracking</div>
        <div className={s.moon}>Tue · {pad2(new Date().getHours())}:{pad2(new Date().getMinutes())}</div>
      </div>

      <div className={s.center}>
        <div className={s.verb}>Sleeping.</div>
        <div className={s.orb} />
        <div className={s.clock}>{pad2(h)}:{pad2(m)}</div>
        <div className={s.clockCap}>Asleep · Since {startedAt}</div>
      </div>

      <div className={s.signals}>
        <div className={s.s}>
          <div className={s.k}>Stage</div>
          <div className={s.v}>Deep</div>
          <div className={s.t}>22 min in</div>
        </div>
        <div className={s.s}>
          <div className={s.k}>Snores</div>
          <div className={s.v}>8</div>
          <div className={s.t}>last hour</div>
        </div>
        <div className={s.s}>
          <div className={s.k}>Pulse</div>
          <div className={s.v}>52</div>
          <div className={s.t}>↓ from 58</div>
        </div>
      </div>

      <div className={s.footerRow}>
        <button className={`${s.end} tap`} onClick={endNight}>End night</button>
        <button className={`${s.devicePill} tap`} onClick={() => navigate('/onboarding/device')}>
          Device · Pos. {state.device.strapPosition}
        </button>
      </div>
    </div>
  );
}
