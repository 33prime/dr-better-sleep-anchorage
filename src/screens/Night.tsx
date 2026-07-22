import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore, store } from '../store';
import { useSnoreDetector, type SnoreEventRecord } from '../hooks/useSnoreDetector';
import { sessionRecorder, nightFromSummary } from '../lib/sessionRecorder';
import { useWakeLock } from '../lib/wakeLock';
import { pad2 } from '../utils/format';
import { PaperStar } from '../components/paper/PaperScene';
import s from './Night.module.css';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// After this many idle ms while listening, the screen dims — it's face-down
// on a nightstand all night, no reason to stay bright. Any tap wakes it.
const IDLE_DIM_MS = 30_000;

export function Night() {
  const state = useStore();
  const [, navigate] = useLocation();

  const handleSnoreEvent = useCallback((ev: SnoreEventRecord) => {
    sessionRecorder.addEvent(ev);
  }, []);
  const det = useSnoreDetector(handleSnoreEvent);

  // Recover any night lost to a crash (IndexedDB buffer with no matching
  // `end()`), then start — or resume — tonight's recording session. Runs
  // once; `sessionRecorder` is a module-level singleton so it survives
  // navigating away from and back to this screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { recovered, resumed, resumedStartedAtMs } = await sessionRecorder.recoverOrphans();
      if (!cancelled && recovered.length > 0) {
        store.set(s2 => {
          for (const r of recovered) {
            if (s2.nights.some(n => n.date === r.date)) continue;
            s2.nights.push(nightFromSummary(r, s2.device.strapPosition));
          }
          s2.nights.sort((a, b) => (a.date < b.date ? -1 : 1));
        });
      }
      if (cancelled) return;
      if (resumed && resumedStartedAtMs) {
        // A crash-orphaned buffer belonging to tonight was adopted as the
        // active session (see sessionRecorder.recoverOrphans) — line up
        // `liveNight.startedAt` with its real, original start time so the
        // on-screen elapsed clock reflects the whole night, not just the
        // time since this reload.
        store.set(s2 => { s2.liveNight = { tracking: true, startedAt: resumedStartedAtMs }; });
      } else if (!store.get().liveNight?.tracking) {
        const startedAt = Date.now();
        store.set(s2 => { s2.liveNight = { tracking: true, startedAt }; s2.authLostMidSession = false; });
        await sessionRecorder.start({ strapPosition: store.get().device.strapPosition });
      } else if (!sessionRecorder.active) {
        // liveNight state survived (e.g. a hot reload) but the recorder
        // singleton didn't, and there was no IndexedDB buffer to resume
        // (e.g. private browsing) — resume buffering under a fresh session
        // rather than losing tonight's events from this point forward.
        await sessionRecorder.start({ strapPosition: store.get().device.strapPosition });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 1s heartbeat so the clock and "last snore" age stay fresh even when silent.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const live = det.status === 'listening' || det.status === 'simulated';
  const blocked = det.status === 'denied' || det.status === 'unsupported';
  const wakeLockStatus = useWakeLock(live);

  // Dim after IDLE_DIM_MS of no touch while listening; any tap wakes it.
  const [dim, setDim] = useState(false);
  useEffect(() => {
    if (!live) { setDim(false); return; }
    let timer: number;
    const wake = () => {
      setDim(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setDim(true), IDLE_DIM_MS);
    };
    wake();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, [live]);

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

  const endNight = async () => {
    det.stop();
    const summary = await sessionRecorder.end();
    if (!summary) { navigate('/'); return; }
    const newNight = nightFromSummary(summary, state.device.strapPosition);
    store.set(s2 => {
      // Defensive — guards against ending twice for the same calendar night.
      s2.nights = s2.nights.filter(n => n.date !== newNight.date);
      s2.nights.push(newNight);
      s2.nights.sort((a, b) => (a.date < b.date ? -1 : 1));
      if (s2.nights.length > 90) s2.nights = s2.nights.slice(-90);
      s2.liveNight = null;
    });
    navigate('/morning');
  };

  return (
    <div className={`${s.root} ${dim ? s.dim : ''}`}>
      {/* quiet cream starfield drifting over the sleeping sky */}
      <svg className={s.starscape} viewBox="0 0 393 760" aria-hidden focusable="false">
        <PaperStar x={40} y={70} scale={0.8} delay={0.6} />
        <PaperStar x={352} y={54} scale={0.9} delay={1.9} />
        <PaperStar x={300} y={120} scale={0.6} delay={3.1} />
        <PaperStar x={62} y={150} scale={0.55} delay={2.3} />
        <PaperStar x={366} y={210} scale={0.7} delay={0.9} />
        <PaperStar x={26} y={300} scale={0.6} delay={2.7} />
        <PaperStar x={358} y={430} scale={0.55} delay={1.4} />
        <PaperStar x={34} y={500} scale={0.7} delay={3.4} />
      </svg>

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
        {live && (wakeLockStatus === 'unsupported' || wakeLockStatus === 'denied') && (
          <div className={s.hint}>Keep this screen powered — your phone may dim on its own</div>
        )}
        {state.authLostMidSession && (
          <div className={s.hint}>Signed out mid-recording — tonight is saved on this phone, but not syncing. Sign back in when you wake up.</div>
        )}

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
        <button className={`${s.end} tap`} onClick={() => { void endNight(); }}>End night</button>
        <button className={`${s.devicePill} tap`} onClick={() => navigate('/onboarding/device')}>
          Device · Pos. {state.device.strapPosition}
        </button>
      </div>
    </div>
  );
}
