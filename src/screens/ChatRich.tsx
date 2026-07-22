import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore, lastNight } from '../store';
import { Avatar } from '../components/Avatar';
import { ChevronLeft } from '../components/icons';
import { Menu } from '../components/Menu';
import { pad2 } from '../utils/format';
import { clipsForNight, clipBlob, type SnoreClip } from '../lib/clipRecorder';
import { shareLastNight } from '../lib/share';
import s from './Chat.module.css';
import r from './ChatRich.module.css';

// "1a 2:38 → 2:43 p.m." style window from a clip's real event time + duration.
function fmtClipWindow(clip: SnoreClip): string {
  const start = new Date(clip.ts);
  const end = new Date(clip.ts + clip.durationMs);
  const clock = (d: Date) => `${d.getHours() % 12 || 12}:${pad2(d.getMinutes())}`;
  const period = end.getHours() >= 12 ? 'p.m.' : 'a.m.';
  return `${clock(start)} → ${clock(end)} ${period}`;
}

function fmtClipTime(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  return `${m}:${pad2(totalSec % 60)}`;
}

// 20 pseudo-static bar heights (the original mock's two 8/12-bar arrays,
// concatenated) — decorative, since the Clip-store API doesn't expose a real
// waveform. Split point moves with real playback progress instead.
const CLIP_BAR_HEIGHTS = [6, 9, 5, 11, 8, 13, 10, 7, 14, 9, 11, 6, 10, 13, 8, 5, 9, 7, 11, 4];

/**
 * Chat with rich data cards — a "showcase" variant of the chat. Composer is
 * disabled (visual only) since it's a deep-link demo; back returns to /chat.
 */
export function ChatRich() {
  const state = useStore();
  const [, navigate] = useLocation();
  // The rich report narrates a night with snore events (clusters, audio clip);
  // the seeded story's last night is 0 snores, so chart the most recent night
  // that actually had something to hear.
  const last = [...state.nights].reverse().find(n => n.totalSnores > 0) ?? lastNight(state);
  const convoRef = useRef<HTMLDivElement>(null);

  // Sleep-stage minutes and body position are wearable-ingest fields — never
  // available from the mic alone (same gate DetailedNight.tsx uses for its
  // "Connect a wearable" fallback). Without this gate the "Sleep stages"
  // card below was a hardcoded illustration presented as this user's real
  // last night regardless of whether any wearable was ever connected.
  const hasWearableStory = last != null
    && typeof last.deepMin === 'number' && typeof last.remMin === 'number'
    && typeof last.lightMin === 'number' && typeof last.awakeMin === 'number'
    && last.positions !== undefined;

  // Real, data-derived loudest hour (used by the "Cluster at ___" note below)
  // instead of a hardcoded "2 a.m." — the one claim in that note that mic-only
  // data actually supports.
  const HOUR_LABELS = ['11p', '12a', '1a', '2a', '3a', '4a', '5a', '6a'];
  const peakHourIdx = last && last.snoresByHour.some(v => v > 0)
    ? last.snoresByHour.reduce((best, v, i) => (v > last.snoresByHour[best] ? i : best), 0)
    : -1;
  const peakHourLabel = peakHourIdx >= 0 ? HOUR_LABELS[peakHourIdx] ?? null : null;

  useEffect(() => {
    if (convoRef.current) convoRef.current.scrollTop = convoRef.current.scrollHeight;
  }, []);

  // Real loudest-clip playback replaces the old toast stub. clipsForNight()
  // falls back to a sample-backed clip only when this night's source is the
  // server-side demo account — a real recorded night with no captured clip
  // still hides the "play it" exchange below rather than ending in a dead
  // card or grafting on audio that isn't tonight's.
  const nightDate = last?.date;
  const isDemoSource = last?.source === 'demo';
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipUrlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  // Guards the post-await continuation in togglePlay below — if this screen
  // unmounts (or the clip changes) before clipBlob() resolves, we must not
  // touch the by-then-detached <audio> node or create an object URL nobody
  // will ever revoke.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      audioRef.current?.pause();
      if (clipUrlRef.current) { URL.revokeObjectURL(clipUrlRef.current); clipUrlRef.current = null; }
    };
  }, [clip?.id]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !clip) return;
    if (playing) { audio.pause(); return; }
    if (!clipUrlRef.current) {
      setLoading(true);
      const blob = await clipBlob(clip.id);
      if (!aliveRef.current) return; // unmounted/clip changed while awaiting — nothing to clean up, URL never created
      setLoading(false);
      if (!blob) return;
      clipUrlRef.current = URL.createObjectURL(blob);
      audio.src = clipUrlRef.current;
    }
    try { await audio.play(); } catch { /* blocked/unsupported — stay paused */ }
  };

  if (!last) return null;

  const clipProgress = clip && clip.durationMs > 0 ? Math.min(1, currentMs / clip.durationMs) : 0;
  const filledBars = Math.round(clipProgress * CLIP_BAR_HEIGHTS.length);

  return (
    <div className={s.root}>
      <div className={s.header}>
        <button className={`${s.back} tap`} onClick={() => navigate('/chat')}>
          <ChevronLeft />
        </button>
        <div className={s.who}>
          <Avatar size={36} />
          <div>
            <div className={s.name}>Dr. Sommers</div>
            <div className={s.status}>Listening</div>
          </div>
        </div>
        <Menu className={s.back} ariaLabel="More" items={[
          { label: `Share with ${state.partner.name}`, onClick: () => { void shareLastNight(state); } },
        ]} />
      </div>

      <div className={s.convo} ref={convoRef}>
        <div className={s.dayRule}>— Today —</div>

        <div className={`${s.row} ${s.rowMe}`}>
          <div className={`${s.bubble} ${s.bubbleMe}`}>Walk me through last night.</div>
        </div>

        <div className={s.row}>
          <Avatar size={22} style={{ marginBottom: 4 }} />
          <div className={s.stack}>
            <div className={`${s.bubble} ${s.bubbleThem}`}>Sure. Here's the shape of it.</div>
            {hasWearableStory ? (
              <>
                <div className={s.card}>
                  <div className={s.k}>Sleep stages · {last.startedAt} → {last.endedAt}</div>
                  <svg viewBox="0 0 320 70" preserveAspectRatio="none" style={{ width: '100%', height: 70, marginTop: 10 }}>
                    <g className={r.grid} strokeWidth={0.8}>
                      <line x1="0" y1="14" x2="320" y2="14" />
                      <line x1="0" y1="32" x2="320" y2="32" />
                      <line x1="0" y1="50" x2="320" y2="50" />
                    </g>
                    <polyline
                      fill="none" strokeWidth={1.4}
                      strokeLinejoin="round" strokeLinecap="round"
                      style={{ stroke: 'var(--accent)' }}
                      points="0,14 18,32 36,54 56,54 72,32 90,32 108,54 128,54 142,14 156,32 174,32 188,54 206,32 220,14 236,32 252,32 268,54 282,32 296,14 310,32 320,32"
                    />
                    <line x1="166" y1="4" x2="166" y2="66" strokeWidth={0.6} strokeDasharray="2 2" style={{ stroke: 'var(--coral)', opacity: 0.6 }} />
                    <text x="170" y="10" fontFamily="Nunito" fontSize="7" style={{ fill: 'var(--coral)' }}>2:40 — rolled to back</text>
                  </svg>
                  <div className={r.chartLegend}>
                    <span><i style={{ display: 'inline-block', width: 8, height: 2, background: 'var(--accent)', verticalAlign: 'middle', marginRight: 5 }} />Stages</span>
                    <span><i className={r.swSnore} style={{ display: 'inline-block', width: 8, height: 2, verticalAlign: 'middle', marginRight: 5 }} />Snore events</span>
                  </div>
                </div>
                <div className={`${s.bubble} ${s.bubbleThem}`}>
                  Three things stand out — but the headline is{' '}
                  <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic' }}>deep sleep doubled</span> compared to your two-week average.
                </div>
              </>
            ) : (
              // No wearable connected for this night — sleep stages and body
              // position were never measured. Say so honestly instead of
              // showing the illustrative stage chart as if it were real.
              <div className={`${s.bubble} ${s.bubbleThem}`}>
                No wearable connected for {last.startedAt} → {last.endedAt}, so this is mic-only — no sleep-stage or body-position breakdown to show, just what got picked up.
              </div>
            )}
          </div>
        </div>

        <div className={s.row}>
          <div style={{ width: 22, flex: 'none' }} />
          <div className={s.stack}>
            <div className={s.card}>
              <div className={s.k}>Snores per hour</div>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, alignItems: 'end', height: 64 }}>
                {last.snoresByHour.map((v, i) => {
                  const max = Math.max(...last.snoresByHour, 1);
                  const pct = (v / max) * 100;
                  return (
                    <div key={i} style={{ height: `${pct}%`, background: 'rgba(75,175,186,0.16)', borderRadius: '2px 2px 0 0', position: 'relative' }}>
                      <i style={{ position: 'absolute', inset: 0, background: 'var(--accent)', borderRadius: '2px 2px 0 0' }} />
                    </div>
                  );
                })}
              </div>
              <div className={r.chartAxis} style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, fontFamily: 'var(--mono)', fontSize: 9, textAlign: 'center' }}>
                <span>11p</span><span>12a</span><span>1a</span><span>2a</span><span>3a</span><span>4a</span><span>5a</span><span>6a</span>
              </div>
              <div className={r.note} style={{ marginTop: 8, fontSize: 12 }}>
                {peakHourLabel ? (
                  <>
                    Cluster at <span className={r.noteEm} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic' }}>{peakHourLabel}</span>
                    {hasWearableStory
                      ? " — same hour you flipped to your back. The strap held; the sound didn't."
                      : ' — the loudest stretch of the night, mic-only.'}
                  </>
                ) : 'Not enough snore activity tonight to call out a cluster.'}
              </div>
            </div>
            {clip && (
              <div className={`${s.bubble} ${s.bubbleThem}`} style={{ borderTopLeftRadius: 18 }}>
                Want me to read you what was happening at that hour?
              </div>
            )}
          </div>
        </div>

        {/* Real loudest-clip playback (Clip-store API) — this whole exchange
            is hidden when the night has no captured clip, rather than ending
            in a "play it" reply with nothing to play. */}
        {clip && (
          <>
            <div className={`${s.row} ${s.rowMe}`}>
              <div className={`${s.bubble} ${s.bubbleMe}`}>Yeah, play it.</div>
            </div>

            <div className={s.row}>
              <Avatar size={22} style={{ marginBottom: 4 }} />
              <div className={s.stack}>
                <div className={s.card} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    className="tap"
                    style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', color: '#1B2340', display: 'grid', placeItems: 'center', flex: 'none', border: 0 }}
                    aria-label={playing ? 'Pause' : 'Play'}
                    disabled={loading}
                    onClick={togglePlay}
                  >
                    {playing ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 13, height: 13 }}>
                        <rect x="5" y="4" width="5" height="16" rx="1" />
                        <rect x="14" y="4" width="5" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14, marginLeft: 2 }}>
                        <path d="M6 4l14 8-14 8z" />
                      </svg>
                    )}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={r.clipTitle} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15 }}>
                      {fmtClipWindow(clip)} · {Math.round(clip.peakDb)} dB peak
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
                        {CLIP_BAR_HEIGHTS.map((h, i) => (
                          <i key={i} style={{ width: 2, height: h, background: 'var(--accent)', borderRadius: 1, opacity: i < filledBars ? 1 : 0.4 }} />
                        ))}
                      </div>
                      <div className={r.clipTime} style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{fmtClipTime(currentMs)} / {fmtClipTime(clip.durationMs)}</div>
                    </div>
                    {clip.isSample && <div className={r.sampleTag}>Sample audio — not tonight's recording</div>}
                  </div>
                  <audio
                    ref={audioRef}
                    preload="none"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => { setPlaying(false); setCurrentMs(0); }}
                    onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* the report is read-only — the composer hands off to the live chat */}
      <div className={s.composer} role="button" tabIndex={0} onClick={() => navigate('/chat')} onKeyDown={(e) => { if (e.key === 'Enter') navigate('/chat'); }}>
        <div className={s.field}>
          <input className={s.fieldInput} type="text" placeholder="Ask Dr. Sommers…" readOnly style={{ pointerEvents: 'none' }} />
        </div>
        <button className={`${s.send} tap`} aria-label="Continue in chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
