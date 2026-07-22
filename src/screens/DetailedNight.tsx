import { useEffect, useRef, useState, type SVGProps } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useStore, lastNight, baselineSnores, findNight } from '../store';
import { ChevronLeft } from '../components/icons';
import { Avatar } from '../components/Avatar';
import { Menu } from '../components/Menu';
import { showToast } from '../components/Toast';
import { fmtDelta, fmtDuration, parseIsoDate, pad2 } from '../utils/format';
import { SceneHills } from '../components/paper/PaperScene';
import { latestClips, clipBlob, type SnoreClip } from '../lib/clipRecorder';
import { shareLastNight } from '../lib/share';
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

  // Timeline clip chips — latestClips() only ever holds the newest recorded
  // night's clips, so this comes back empty for any night that isn't it
  // (seed/demo nights, older recorded nights). Honest fallback: no chips.
  const nDate = n?.date;
  const [clips, setClips] = useState<SnoreClip[]>([]);
  useEffect(() => {
    if (!nDate) { setClips([]); return; }
    let cancelled = false;
    latestClips()
      .then(all => { if (!cancelled) setClips(all.filter(c => c.nightDate === nDate)); })
      .catch(() => { if (!cancelled) setClips([]); });
    return () => { cancelled = true; };
  }, [nDate]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipUrlRef = useRef<string | null>(null);
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  // Guards the post-await continuation in playClip below — if this screen
  // unmounts (e.g. navigating away right after tapping a clip) before
  // clipBlob() resolves, we must not touch the by-then-detached <audio>
  // node or create an object URL nobody will ever revoke.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      audioRef.current?.pause();
      if (clipUrlRef.current) { URL.revokeObjectURL(clipUrlRef.current); clipUrlRef.current = null; }
    };
  }, []);

  const playClip = async (clip: SnoreClip) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingClipId === clip.id) { audio.pause(); setPlayingClipId(null); return; }
    if (clipUrlRef.current) { URL.revokeObjectURL(clipUrlRef.current); clipUrlRef.current = null; }
    const blob = await clipBlob(clip.id);
    if (!aliveRef.current) return; // unmounted while awaiting — nothing to clean up, URL never created
    if (!blob) return;
    clipUrlRef.current = URL.createObjectURL(blob);
    audio.src = clipUrlRef.current;
    try { await audio.play(); setPlayingClipId(clip.id); } catch { setPlayingClipId(null); }
  };

  if (!n) return null;

  const baseline = baselineSnores(state);
  const delta = fmtDelta(n.totalSnores, baseline);

  const d = parseIsoDate(n.date);
  const prevDay = new Date(d); prevDay.setDate(d.getDate() - 1);
  const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // positions/positionSnores/sleep-stage minutes are wearable-ingest fields —
  // the mic can never produce them (PLAN.md finding #1). Undefined for a
  // recorded night until a wearable is connected; render an honest
  // "connect a wearable" affordance for those sections instead of fabricating
  // numbers.
  const hasWearable = n.positions !== undefined && n.positionSnores !== undefined;
  const positions = n.positions && n.positionSnores ? [
    { label: 'Side · left',  mins: n.positions.side_left,  snores: n.positionSnores.side_left  },
    { label: 'Side · right', mins: n.positions.side_right, snores: n.positionSnores.side_right },
    { label: 'Back',         mins: n.positions.back,       snores: n.positionSnores.back       },
    { label: 'Stomach',      mins: n.positions.stomach,    snores: n.positionSnores.stomach    },
  ] : [];
  const totalMin = positions.reduce((a, p) => a + p.mins, 0);
  const hasStages = typeof n.awakeMin === 'number' && typeof n.deepMin === 'number'
    && typeof n.remMin === 'number' && typeof n.lightMin === 'number';
  // Stages and position always arrive together once a wearable is paired
  // (see PLAN.md finding #1) — treat them as one bundle so a recorded night
  // gets exactly one "connect a wearable" affordance instead of two partial
  // section stubs.
  const hasWearableStory = hasStages && hasWearable;

  // Real peak-snoring hour, shared by the wearable and mic-only narratives —
  // neither one fabricates a fixed time regardless of the actual data.
  const peakIdx = peakHourIndex(n.snoresByHour);
  const dominant = hasWearableStory && n.positionSnores ? dominantPosition(n.positionSnores) : null;
  const hypMarkerFrac = peakIdx !== null && n.snoresByHour.length > 0 ? (peakIdx + 0.5) / n.snoresByHour.length : null;
  const hypMarkerLabel = hypMarkerFrac !== null && dominant
    ? `${peakClockShort(n.snoresByHour, n.startedAt)} — ${dominant.short}`
    : null;

  const nightSpan = nightSpanMs(n.date, n.startedAt, n.endedAt);

  return (
    <div className={s.root}>
      <div className={s.nav}>
        <button className={`${s.back} tap`} onClick={() => navigate('/')}>
          <ChevronLeft />
          <span>Home</span>
        </button>
        <Menu className={s.more} ariaLabel="More" items={[
          { label: `Share with ${state.partner.name}`, onClick: () => { void shareLastNight(state); } },
          { label: 'Add a note', onClick: () => showToast('Note saved to this night') },
        ]} />
      </div>

      <div className={s.body}>
        <div className={s.head}>
          <div className={s.label}>
            {dayShort[prevDay.getDay()]} → {dayShort[d.getDay()]} · {fmtTime(n.startedAt)} – {fmtTime(n.endedAt)}
          </div>
          <h1>Last night</h1>
          <div className={s.sub}>
            {hasStages
              ? `${fmtDuration(n.sleepDurationMin + n.awakeMin!)} in bed · ${fmtDuration(n.sleepDurationMin)} asleep · device worn the full night`
              : `${fmtDuration(n.sleepDurationMin)} asleep · device worn the full night`}
          </div>
        </div>

        <div className={s.hero}>
          <div className={s.num}>{n.totalSnores}</div>
          <div className={s.unit}>snores</div>
          <div className={s.delta}>{delta.sign} {delta.pct}</div>
        </div>

        {/* Hypnogram — sleep-stage + position data is wearable-ingest only.
            Recorded nights without a wearable get the acoustic story below
            plus one compact affordance instead of a NaN/dead section. */}
        {hasWearableStory ? (
          <div className={s.hyp}>
            <div className={s.row}>
              <div className={s.k}>Sleep stages</div>
              <div className={s.total}>{fmtDuration(n.sleepDurationMin)}</div>
            </div>
            <Hypnogram markerFrac={hypMarkerFrac} markerLabel={hypMarkerLabel} />
            <div className={s.hypX}>
              <span>10 PM</span><span>12 AM</span><span>2 AM</span><span>4 AM</span><span>6 AM</span>
            </div>
            <div className={s.hypLegend}>
              <div className={s.l}><div className={s.k}>Deep</div><div className={s.v}>{fmtDuration(n.deepMin!)}</div></div>
              <div className={s.l}><div className={s.k}>REM</div><div className={s.v}>{fmtDuration(n.remMin!)}</div></div>
              <div className={s.l}><div className={s.k}>Light</div><div className={s.v}>{fmtDuration(n.lightMin!)}</div></div>
              <div className={s.l}><div className={s.k}>Awake</div><div className={s.v}>{fmtDuration(n.awakeMin!)}</div></div>
            </div>
          </div>
        ) : (
          <WearableConnectCard />
        )}

        {/* Snore intensity — the acoustic story, always available from the mic */}
        <div className={s.section}>
          <div className={s.h}>
            <h2>Snoring intensity</h2>
            <div className={s.meta}>{n.totalSnores > 0 ? `${n.totalSnores} events · ${n.peakDb} dB peak` : 'No snore events — a silent night'}</div>
          </div>
          <div className={s.snore}>
            <div className={s.hills} aria-hidden><SceneHills variant="low" /></div>
            <SnoreBars hourlyValues={n.snoresByHour} />
            <div className={s.legend}>
              <span>10 PM</span><span>2 AM</span><span>6 AM</span>
            </div>
            {clips.length > 0 && (
              <div className={s.clipChips}>
                {clips.map((c) => {
                  const pct = clipPct(nightSpan, c.ts);
                  if (pct === null) return null;
                  const isPlaying = playingClipId === c.id;
                  return (
                    <button
                      key={c.id}
                      className={`${s.clipChip} tap`}
                      style={{ left: `${pct}%` }}
                      onClick={() => playClip(c)}
                      aria-label={`${isPlaying ? 'Pause' : 'Play'} snore clip recorded ${fmtTime(clipClockHM(c.ts))}, ${Math.round(c.peakDb)} dB peak`}
                    >
                      {isPlaying ? <PauseGlyph /> : <PlayGlyph />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className={s.insight}>
            <Avatar size={24} />
            <div className={s.copy}>
              {hasWearableStory && dominant ? (
                <>The peak around <span className={s.data}>{peakClockShort(n.snoresByHour, n.startedAt)}</span> lines up with time on <span className={s.data}>{dominant.phrase}</span> — {dominant.pct}% of tonight's snores happened there. <span className={s.em}>The thing is</span> — the strap held. Last week, position 2 would have slipped right there.</>
              ) : (
                <>The peak was around <span className={s.data}>{peakHourLabel(n.snoresByHour, n.startedAt)}</span>. <span className={s.em}>Worth knowing</span> — connect a wearable and I can tell you what position you were in when it happened.</>
              )}
            </div>
          </div>
        </div>

        {/* Position breakdown — wearable-ingest only; the mic can't sense body position */}
        {hasWearableStory && (
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
        )}

        <audio ref={audioRef} preload="none" onEnded={() => setPlayingClipId(null)} style={{ display: 'none' }} />

        {hasWearableStory ? (
          <div className={s.aside}>
            <div className={s.label}>Why this matters</div>
            <h3>Most of your snoring still happens on your back.</h3>
            <p>That's normal — gravity pulls the soft palate and tongue base into the airway. The device counters that. As we tighten the strap over the next two weeks, that back-sleeping number is the one to watch.</p>
          </div>
        ) : (
          <div className={s.aside}>
            <div className={s.label}>Why this matters</div>
            <h3>The mic can tell you when — not what position.</h3>
            <p>Snore timing and intensity are measured straight from tonight's audio. Body position (and whether it's mostly happening on your back, the usual culprit) needs a wearable — connect one to see that breakdown.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Index into snoresByHour with the most events, or null when there's no
// clear peak (empty array or a silent night). Shared by the wearable and
// mic-only narratives, plus the hypnogram marker, so none of them fabricate
// a fixed hour regardless of what the night actually looked like.
function peakHourIndex(snoresByHour: number[]): number | null {
  if (snoresByHour.length === 0) return null;
  let idx = 0;
  for (let i = 1; i < snoresByHour.length; i++) {
    if (snoresByHour[i] > snoresByHour[idx]) idx = i;
  }
  return snoresByHour[idx] > 0 ? idx : null;
}

// Honest fallback for the no-wearable case: which clock hour had the most
// mic-measured snores (real data), rather than a fabricated body-position
// claim the mic can't back up.
function peakHourLabel(snoresByHour: number[], startedAt: string): string {
  if (!startedAt) return 'no clear peak';
  const peakIdx = peakHourIndex(snoresByHour);
  if (peakIdx === null) return 'no clear peak — a quiet night';
  const [h, m] = startedAt.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 'no clear peak';
  const peakHour = (h + peakIdx) % 24;
  return fmtTime(`${pad2(peakHour)}:${pad2(m)}`);
}

// Same clock math as peakHourLabel but without the am/pm suffix — used
// inline where the surrounding copy or SVG label already implies "night".
function peakClockShort(snoresByHour: number[], startedAt: string): string {
  const peakIdx = peakHourIndex(snoresByHour);
  if (peakIdx === null || !startedAt) return '—';
  const [h, m] = startedAt.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '—';
  const peakHour = (h + peakIdx) % 24;
  const h12 = ((peakHour + 11) % 12) + 1;
  return `${h12}:${pad2(m)}`;
}

type PositionCounts = { side_left: number; side_right: number; back: number; stomach: number };

/** Which position took the most snores tonight — real data, not the
 *  previously-hardcoded "your back" claim. `short` is the compact word used
 *  in the hypnogram's SVG marker; `phrase` is the sentence-form used in the
 *  insight copy. */
function dominantPosition(ps: PositionCounts): { phrase: string; short: string; pct: number } {
  const total = ps.side_left + ps.side_right + ps.back + ps.stomach;
  const entries: [string, string, number][] = [
    ['your back', 'back', ps.back],
    ['your left side', 'L side', ps.side_left],
    ['your right side', 'R side', ps.side_right],
    ['your stomach', 'stomach', ps.stomach],
  ];
  entries.sort((a, b) => b[2] - a[2]);
  const [phrase, short, count] = entries[0];
  return { phrase, short, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
}

/** The night's real start/end span in epoch ms, handling the usual
 *  before-midnight → after-midnight rollover. Null when either clock time
 *  is missing/malformed — callers skip anything that needs it rather than
 *  place a marker at a fabricated position. */
function nightSpanMs(dateIso: string, startedAt: string, endedAt: string): { startMs: number; endMs: number } | null {
  if (!dateIso || !startedAt || !endedAt) return null;
  const [sh, sm] = startedAt.split(':').map(Number);
  const [eh, em] = endedAt.split(':').map(Number);
  if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return null;
  const base = parseIsoDate(dateIso);
  const start = new Date(base); start.setHours(sh, sm, 0, 0);
  let end = new Date(base); end.setHours(eh, em, 0, 0);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 3600 * 1000);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** A clip's timestamp as a 0..100 position along the night's real span, for
 *  placing timeline chips — null (chip not rendered) if the span or the
 *  clip's timestamp falls outside anything we can honestly place. */
function clipPct(span: { startMs: number; endMs: number } | null, ts: number): number | null {
  if (!span) return null;
  const range = span.endMs - span.startMs;
  if (range <= 0) return null;
  return Math.min(100, Math.max(0, ((ts - span.startMs) / range) * 100));
}

function clipClockHM(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Guards against "NaN:NaN am" — a night recovered from a malformed session
// (or one still missing its startedAt/endedAt) shouldn't render garbage.
function fmtTime(hhmm: string): string {
  const [h, m] = (hhmm || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '—:—';
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad2(m)} ${ap}`;
}

// Stages/position are wearable-ingest only (PLAN.md finding #1) — this one
// compact card replaces what used to be two separate stub messages (one
// under "Sleep stages", one under "By position") on a recorded night with no
// wearable paired.
function WearableConnectCard() {
  return (
    <div className={s.wearCard}>
      <WatchIcon className={s.wearIcon} aria-hidden focusable="false" />
      <div>
        <div className={s.wearTitle}>Connect a wearable</div>
        <div className={s.wearSub}>for sleep stages &amp; body position — tonight's story below comes from the mic alone.</div>
      </div>
    </div>
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

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9">
      <path d="M6 4l14 8-14 8z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}

function Hypnogram({ markerFrac, markerLabel }: { markerFrac: number | null; markerLabel: string | null }) {
  const markerX = markerFrac !== null ? Math.min(352, Math.max(8, markerFrac * 360)) : null;
  return (
    <svg viewBox="0 0 360 132" preserveAspectRatio="none" style={{ width: '100%', height: 132, display: 'block' }}>
      <g className={s.grid} strokeWidth={1}>
        <line x1="0" y1="20" x2="360" y2="20" />
        <line x1="0" y1="50" x2="360" y2="50" />
        <line x1="0" y1="80" x2="360" y2="80" />
        <line x1="0" y1="110" x2="360" y2="110" />
      </g>
      <g className={s.axisLabel} fontSize="9">
        <text x="0" y="17">AWAKE</text>
        <text x="0" y="47">REM</text>
        <text x="0" y="77">LIGHT</text>
        <text x="0" y="107">DEEP</text>
      </g>
      <polyline
        fill="none" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"
        style={{ stroke: 'var(--accent)' }}
        points="40,20 40,80 60,80 60,110 95,110 95,80 130,80 130,110 165,110 165,50 195,50 195,80 225,80 225,110 250,110 250,80 280,80 280,50 305,50 305,80 325,80 325,20 360,20"
      />
      {markerX !== null && markerLabel && (
        <>
          <line x1={markerX} y1="0" x2={markerX} y2="132" strokeWidth="1" strokeDasharray="2 3" style={{ stroke: 'var(--coral)', opacity: 0.55 }} />
          <text x={markerX + 3} y="11" className={s.marker} fontSize="9" letterSpacing="1" style={{ fill: 'var(--coral)' }}>{markerLabel}</text>
        </>
      )}
    </svg>
  );
}

function SnoreBars({ hourlyValues }: { hourlyValues: number[] }) {
  const max = Math.max(...hourlyValues, 1);
  // Render ~21 visual bars across 360 width, sampled from the 8 hourly buckets.
  const visualCount = 21;
  return (
    <svg viewBox="0 0 360 110" preserveAspectRatio="none" style={{ width: '100%', height: 110, display: 'block', position: 'relative', zIndex: 1 }}>
      <g style={{ fill: 'var(--accent)' }}>
        {Array.from({ length: visualCount }, (_, i) => {
          const hourIdx = Math.min(hourlyValues.length - 1, Math.floor((i / visualCount) * hourlyValues.length));
          const v = hourlyValues[hourIdx] ?? 0;
          const h = Math.max(2, (v / max) * 50);
          const x = 20 + (i / (visualCount - 1)) * 320;
          const y = 55 - h / 2;
          return <rect key={i} x={x} y={y} width={1.5} height={h} rx={0.5} />;
        })}
      </g>
      <line x1="0" y1="55" x2="360" y2="55" className={s.baseline} strokeWidth="0.75" />
    </svg>
  );
}
