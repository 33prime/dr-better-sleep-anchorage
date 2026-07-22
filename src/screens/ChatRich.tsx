import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useStore, lastNight } from '../store';
import { Avatar } from '../components/Avatar';
import { ChevronLeft } from '../components/icons';
import { Menu } from '../components/Menu';
import { showToast } from '../components/Toast';
import s from './Chat.module.css';
import r from './ChatRich.module.css';

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

  useEffect(() => {
    if (convoRef.current) convoRef.current.scrollTop = convoRef.current.scrollHeight;
  }, []);

  if (!last) return null;

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
          { label: 'Share with Sarah', onClick: () => showToast('Last night shared with Sarah ✓') },
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
                Cluster at <span className={r.noteEm} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic' }}>2 a.m.</span> — same hour you flipped to your back. The strap held; the sound didn't.
              </div>
            </div>
            <div className={`${s.bubble} ${s.bubbleThem}`} style={{ borderTopLeftRadius: 18 }}>
              Want me to read you what was happening at that hour?
            </div>
          </div>
        </div>

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
                aria-label="Play"
                onClick={() => showToast('Playing 2:38–2:43 a.m. · soft snoring')}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14, marginLeft: 2 }}>
                  <path d="M6 4l14 8-14 8z" />
                </svg>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={r.clipTitle} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15 }}>
                  2:38 → 2:43 a.m. · soft snoring
                </div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
                    {[6, 9, 5, 11, 8, 13, 10, 7].map((h, i) => (
                      <i key={i} style={{ width: 2, height: h, background: 'var(--accent)', borderRadius: 1 }} />
                    ))}
                    {[14, 9, 11, 6, 10, 13, 8, 5, 9, 7, 11, 4].map((h, i) => (
                      <i key={i + 8} style={{ width: 2, height: h, background: 'var(--accent)', borderRadius: 1, opacity: 0.45 }} />
                    ))}
                  </div>
                  <div className={r.clipTime} style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>0:18 / 0:42</div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
