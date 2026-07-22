import { useEffect, useRef, useState, type SVGProps } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { useStore, lastNight, baselineSnores, daysSince } from '../store';
import { snoreTimeTrend } from '../utils/insights';
import { TickNumber } from '../components/TickNumber';
import { PaperStar } from '../components/paper/PaperScene';
import { ArrowRight } from '../components/icons';
import { fmtDateLong, fmtDelta, fmtDuration, pad2, parseIsoDate } from '../utils/format';
import { clipsForNight, clipBlob, type SnoreClip } from '../lib/clipRecorder';
import s from './MorningReveal.module.css';

const easeOut = [0.22, 1, 0.36, 1] as const;
const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: easeOut, delay },
});

// "HH:MM" (24h, as stored on Night) → "h:mm AM/PM" for display.
function fmtTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

const meanDefined = (xs: (number | undefined)[]): number => {
  const clean = xs.filter((v): v is number => typeof v === 'number');
  return clean.length ? clean.reduce((a, v) => a + v, 0) / clean.length : 0;
};

export function MorningReveal() {
  const state = useStore();
  const [, navigate] = useLocation();
  const last = lastNight(state);
  // Loudest-snore playback card — clips are looked up by the revealed
  // night's date via clipsForNight(), which falls back to sample-backed
  // demo clips only for source:'demo' nights. Otherwise this naturally
  // comes back empty on local-seed nights or when the revealed night isn't
  // the one the mic most recently captured.
  const clip = useLoudestClip(last?.date, last?.source === 'demo');
  if (!last) return null;

  // The previous 14 nights, excluding the night being revealed.
  const prev14 = state.nights.slice(-15, -1);

  // Snores vs. the rolling baseline — mic-measured, always available.
  const baseline = baselineSnores(state);
  const snoreDelta = fmtDelta(last.totalSnores, baseline);

  // Sleep duration is session length from the mic pipeline, not a wearable
  // field, so it's safe to read on every recorded night.
  const avgSleep = meanDefined(prev14.map(n => n.sleepDurationMin));
  const sleepDiff = avgSleep ? Math.round(last.sleepDurationMin - avgSleep) : 0;
  const fmtMinDelta = (diff: number) =>
    `${diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} ${Math.abs(diff)}m`;

  // Deep sleep & resting HR are wearable-ingest placeholders — null on a
  // recorded night until a wearable is paired. Show a "connect" affordance
  // instead of fabricating (or silently zeroing) these for that case.
  const hasWearable = typeof last.deepMin === 'number' && typeof last.restingHr === 'number';
  const avgDeep = meanDefined(prev14.map(n => n.deepMin));
  const deepDiff = hasWearable && avgDeep ? Math.round((last.deepMin as number) - avgDeep) : 0;

  // Honest, graded read on the recent snoring trend — hedges the claim when
  // there isn't enough history yet instead of asserting a trend that isn't there.
  const trend = snoreTimeTrend(state.nights);

  // Headline reacts to the actual night instead of always claiming "quiet" —
  // a recorded night can be loud, and the copy shouldn't pretend otherwise.
  let headline: string;
  if (last.totalSnores === 0) headline = 'A silent night';
  else if (baseline === 0) headline = 'A steady night';
  else if (last.totalSnores <= baseline * 0.7) headline = 'A quiet night';
  else if (last.totalSnores <= baseline * 1.15) headline = 'A steady night';
  else headline = 'A louder night';

  const wakeTime = last.endedAt ? fmtTime12(last.endedAt) : null;

  return (
    <div className={s.root}>
      {/* pre-dawn sky — the last stars before sunrise (night theme only) */}
      <svg className={s.scene} viewBox="0 0 393 300" aria-hidden focusable="false">
        <PaperStar x={300} y={40} scale={1} delay={1.8} />
        <PaperStar x={344} y={92} scale={0.7} delay={2.6} />
        <PaperStar x={366} y={152} scale={0.6} delay={0.3} />
        <PaperStar x={286} y={128} scale={0.55} delay={3.1} />
        <PaperStar x={54} y={52} scale={0.7} delay={0.9} />
      </svg>

      <motion.div className={s.eyebrow} {...fadeUp(0.2)}>
        {fmtDateLong(parseIsoDate(last.date))}{wakeTime ? ` · ${wakeTime}` : ''}
      </motion.div>

      <motion.h1 className={s.headline} {...fadeUp(0.32)}>
        {headline},<br />
        <span className={s.it}>{state.user.name}.</span>
      </motion.h1>

      <motion.p className={s.sub} {...fadeUp(0.48)}>
        {trend.sentence}
      </motion.p>

      <div className={s.numbers}>
        <Cell label="Snores" value={String(last.totalSnores)} delta={`${snoreDelta.sign} ${snoreDelta.pct}`} deltaSub="vs. baseline" delay={0.62} />
        <Cell label="Time asleep" value={fmtDuration(last.sleepDurationMin)} delta={fmtMinDelta(sleepDiff)} deltaSub="vs. avg" delay={0.72} />
        {hasWearable ? (
          <>
            <Cell label="Deep sleep" value={fmtDuration(last.deepMin as number)} delta={fmtMinDelta(deepDiff)} deltaSub="vs. avg" delay={0.82} />
            <Cell label="Resting HR" value={String(last.restingHr)} unit="bpm" delta="→ stable" deltaClass="muted" delay={0.92} />
          </>
        ) : (
          <WearableCta delay={0.82} />
        )}
      </div>

      {clip && <SnoreClipCard clip={clip} delay={1.02} />}

      <motion.div className={s.footer} {...fadeUp(1.1)}>
        <button className={`${s.cta} tap`} onClick={() => navigate(`/night/${last.date}`)}>
          See the full night
          <ArrowRight />
        </button>
        <div className={s.dayLabel}>DAY {daysSince(state.device.fittedAt)}</div>
      </motion.div>
    </div>
  );
}

function Cell({ label, value, unit, delta, deltaSub, delay, deltaClass }: {
  label: string; value: string; unit?: string; delta: string; deltaSub?: string; delay: number; deltaClass?: 'muted';
}) {
  return (
    <motion.div className={s.cell} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: easeOut, delay }}>
      <div className={s.k}>{label}</div>
      <div className={s.v}>
        {/^[0-9:]+$/.test(value) && !value.includes(':')
          ? <TickNumber value={parseInt(value, 10)} duration={0.9} />
          : value}
        {unit && <span className={s.u}>{unit}</span>}
      </div>
      <div className={`${s.d}${deltaClass === 'muted' ? ` ${s.muted}` : ''}`}>
        {delta} {deltaSub && <span className={s.from}>{deltaSub}</span>}
      </div>
    </motion.div>
  );
}

// Deep sleep & resting HR are wearable-only signals. When a recorded night
// doesn't have them (no wearable paired yet), this replaces those two cells
// with an honest affordance rather than fabricated or zeroed numbers.
function WearableCta({ delay }: { delay: number }) {
  return (
    <motion.div
      className={s.wearCta}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: easeOut, delay }}
    >
      <WatchIcon className={s.wearIcon} aria-hidden focusable="false" />
      <div>
        <div className={s.wearTitle}>Connect a wearable</div>
        <div className={s.wearSub}>for deep sleep &amp; resting HR — this night's numbers come from the mic alone.</div>
      </div>
    </motion.div>
  );
}

function WatchIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="7" y="7" width="10" height="10" rx="2.4" />
      <path d="M9 7V4.6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7M9 17v2.4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V17" />
      <path d="M12 10v2l1.3 1.3" />
    </svg>
  );
}

// ---------- "Hear your loudest snore" playback card ----------
// Consumes the Clip-store API (src/lib/clipRecorder.ts, Lane A) — never
// autoplays, streams the blob only once the user taps play, and revokes the
// object URL on unmount / clip change so blobs never linger in memory.

/** Loudest clip for a given night's date, or null once resolved with none.
 *  undefined while the lookup is in flight. Falls back to a sample clip
 *  (via clipsForNight) only when `isDemoSource` — a real recorded night with
 *  no captured clip just stays empty. */
function useLoudestClip(nightDate: string | undefined, isDemoSource: boolean): SnoreClip | null {
  const [clip, setClip] = useState<SnoreClip | null>(null);
  useEffect(() => {
    if (!nightDate) { setClip(null); return; }
    let cancelled = false;
    clipsForNight(nightDate, isDemoSource)
      .then(clips => {
        if (cancelled) return;
        setClip(clips[0] ?? null);
      })
      .catch(() => { if (!cancelled) setClip(null); });
    return () => { cancelled = true; };
  }, [nightDate, isDemoSource]);
  return clip;
}

function fmtClipTime(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  return `${m}:${pad2(totalSec % 60)}`;
}

function SnoreClipCard({ clip, delay }: { clip: SnoreClip; delay: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  // Guards the post-await continuation in togglePlay below — if this screen
  // unmounts (e.g. "See the full night" tapped right after tapping play) or
  // the clip changes before clipBlob() resolves, we must not touch the
  // by-then-detached <audio> node or create an object URL nobody will ever
  // revoke.
  const aliveRef = useRef(true);

  // Revoke the object URL whenever the clip changes or the card unmounts —
  // clips never leave the device and shouldn't linger as blob: URLs either.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      audioRef.current?.pause();
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
  }, [clip.id]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); return; }
    if (!urlRef.current) {
      setLoading(true);
      const blob = await clipBlob(clip.id);
      if (!aliveRef.current) return; // unmounted/clip changed while awaiting — nothing to clean up, URL never created
      setLoading(false);
      if (!blob) return;
      urlRef.current = URL.createObjectURL(blob);
      audio.src = urlRef.current;
    }
    try { await audio.play(); } catch { /* blocked/unsupported — stay paused */ }
  };

  const progress = clip.durationMs > 0 ? Math.min(1, currentMs / clip.durationMs) : 0;

  return (
    <motion.div className={s.clipCard} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: easeOut, delay }}>
      <div className={s.clipHead}>
        <div className={s.clipTitle}>Hear your loudest snore</div>
        <div className={s.clipDb}>{Math.round(clip.peakDb)} dB peak</div>
      </div>
      <div className={s.clipRow}>
        <button
          className={`${s.clipPlay} tap`}
          onClick={togglePlay}
          disabled={loading}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <div className={s.clipTrack}>
          <div className={s.clipFill} style={{ width: `${progress * 100}%` }} />
        </div>
        <div className={s.clipTime}>{fmtClipTime(currentMs)} / {fmtClipTime(clip.durationMs)}</div>
      </div>
      {clip.isSample && <div className={s.sampleTag}>Sample audio — not tonight's recording</div>}
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentMs(0); }}
        onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
        style={{ display: 'none' }}
      />
    </motion.div>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
      <path d="M6 4l14 8-14 8z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}
