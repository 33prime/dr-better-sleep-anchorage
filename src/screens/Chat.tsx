import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useStore, store, lastNight } from '../store';
import { Avatar } from '../components/Avatar';
import { PaperCloud, PaperMoon, PaperStar } from '../components/paper/PaperScene';
import { ChevronLeft, ArrowRight } from '../components/icons';
import { Menu } from '../components/Menu';
import { fmtClockHM, fmtDateShort, pad2 } from '../utils/format';
import { streamChatReply, persistChatTurn, parseAssistantReply } from '../utils/chatApi';
import { suggestedPrompts, proactiveOpener } from '../utils/coachPrompts';
import { clipsForNight, clipBlob, type SnoreClip } from '../lib/clipRecorder';
import { writeDevice, writeChatMessage } from '../lib/sync';
import { SNORE_TYPES, BAND_MAX_HZ } from '../utils/snoreScience';
import s from './Chat.module.css';

// Guards the account-mode proactive morning opener against a double-fire
// from a fast remount before the first assistant message has landed in the
// store. The store-based "already opened for this night" check in the
// effect below is what actually makes this "at most once per night" durable
// across reloads — this flag only covers the same-session race while the
// first request is still in flight.
let openerInFlight = false;

// Decorative bar heights for the clip-card waveform (Chat's `{{card:clip}}`
// renderer doesn't have a real waveform any more than ChatRich.tsx's does —
// see that file's identical constant). Split point tracks real playback.
const CLIP_BAR_HEIGHTS = [6, 9, 5, 11, 8, 13, 10, 7, 14, 9, 11, 6, 10, 13, 8, 5, 9, 7, 11, 4];

function fmtClipTime(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  return `${m}:${pad2(totalSec % 60)}`;
}

/** "Today" / "Yesterday" / "Jul 20" — for the per-day divider between chat sessions. */
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return fmtDateShort(d);
}

/**
 * The `{{card:clip}}` renderer — always the latest night's loudest clip.
 * Resolved via Lane C's `clipsForNight()` seam: real capture wins when it
 * exists, otherwise a `source: 'demo'` night falls back to a deterministic
 * sample clip. Hidden entirely (renders null) when neither exists, per the
 * contract — no dead "play it" card. The "sample audio" caption below is
 * the non-negotiable honesty rule for any sample-backed playback.
 */
/**
 * The `{{card:science}}` renderer — the sound science, in the conversation.
 * Compact version of the Science screen's type rows: tap-to-play each snore
 * type's sample, its frequency band on a 0–3 kHz axis, and the user's own
 * measured share. Samples are synthesized — labeled, per the honesty rule.
 */
function ScienceCard() {
  const types = useStore(st => lastNight(st)?.snoreTypes) ?? { palatal: 0, tongue: 0, nasal: 0 };
  const [, navigate] = useLocation();
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const toggle = (key: string, src: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => setPlaying(null));
      audioRef.current.addEventListener('error', () => setPlaying(null));
    }
    const a = audioRef.current;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    a.src = src;
    a.play().then(() => setPlaying(key)).catch(() => setPlaying(null));
  };

  return (
    <div className={s.scienceCard}>
      <div className={s.scienceTitle}>Three snores, three places <span className={s.scienceSample}>· sample audio</span></div>
      {SNORE_TYPES.map(t => (
        <div key={t.key} className={s.scienceRow}>
          <button
            className={`${s.sciencePlay} ${playing === t.key ? s.sciencePlaying : ''} tap`}
            onClick={() => toggle(t.key, t.sample)}
            aria-label={playing === t.key ? `Pause ${t.name} sample` : `Play ${t.name} sample`}
          >
            {playing === t.key ? (
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 11, height: 11 }}><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 12, height: 12, marginLeft: 1 }}><path d="M6 4l14 8-14 8z" /></svg>
            )}
          </button>
          <div className={s.scienceInfo}>
            <div className={s.scienceName}>
              {t.name}
              {types[t.key] > 0 && <span className={s.scienceShare}>{Math.round(types[t.key] * 100)}% of yours</span>}
            </div>
            <div className={s.scienceBand} aria-hidden>
              <i style={{
                left: `${(t.loHz / BAND_MAX_HZ) * 100}%`,
                width: `${((t.hiHz - t.loHz) / BAND_MAX_HZ) * 100}%`,
              }} />
            </div>
          </div>
        </div>
      ))}
      <button className={`${s.scienceMore} tap`} onClick={() => navigate('/trends/science')}>
        The full science <ArrowRight />
      </button>
    </div>
  );
}

function ClipCard() {
  const [ready, setReady] = useState(false);
  const [clip, setClip] = useState<SnoreClip | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipUrlRef = useRef<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const night = lastNight(store.get());
    if (!night) { setReady(true); return; }
    // clipsForNight() is already loudest-first, real capture preferred, demo
    // sample only for a source:'demo' night — the Lane C seam, not
    // re-derived here.
    clipsForNight(night.date, night.source === 'demo')
      .then(clips => {
        if (!aliveRef.current) return;
        setClip(clips[0] ?? null);
        setReady(true);
      })
      .catch(() => { if (aliveRef.current) setReady(true); });
    return () => {
      aliveRef.current = false;
      audioRef.current?.pause();
      if (clipUrlRef.current) { URL.revokeObjectURL(clipUrlRef.current); clipUrlRef.current = null; }
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !clip) return;
    if (playing) { audio.pause(); return; }
    if (!clipUrlRef.current) {
      setLoadingAudio(true);
      const blob = await clipBlob(clip.id);
      if (!aliveRef.current) return; // unmounted while awaiting — nothing to clean up
      setLoadingAudio(false);
      if (!blob) return;
      clipUrlRef.current = URL.createObjectURL(blob);
      audio.src = clipUrlRef.current;
    }
    try { await audio.play(); } catch { /* blocked/unsupported — stay paused */ }
  };

  if (!ready || !clip) return null;

  const progress = clip.durationMs > 0 ? Math.min(1, currentMs / clip.durationMs) : 0;
  const filledBars = Math.round(progress * CLIP_BAR_HEIGHTS.length);

  return (
    <div className={s.clipCard}>
      <button
        className={`${s.clipPlay} tap`}
        aria-label={playing ? 'Pause' : 'Play'}
        disabled={loadingAudio}
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
      <div className={s.clipBody}>
        <div className={s.clipMeta}>{fmtClockHM(new Date(clip.ts))} · {Math.round(clip.peakDb)} dB peak</div>
        <div className={s.clipRow}>
          <div className={s.clipBars}>
            {CLIP_BAR_HEIGHTS.map((h, i) => (
              <i key={i} className={s.clipBar} style={{ height: h, opacity: i < filledBars ? 1 : 0.4 }} />
            ))}
          </div>
          <div className={s.clipTime}>{fmtClipTime(currentMs)} / {fmtClipTime(clip.durationMs)}</div>
        </div>
        {clip.isSample && <div className={s.clipCaption}>sample audio</div>}
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
  );
}

export function Chat() {
  const messages = useStore(st => st.chat);
  const currentStrapPosition = useStore(st => st.device.strapPosition);
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [clipsAvailable, setClipsAvailable] = useState(false);
  // Action chips are ephemeral, per-message, client-only UI state — never
  // persisted (the chip itself must never auto-apply, and once tapped it's
  // gone), so these live in React state rather than on ChatMessage.
  const [pendingActions, setPendingActions] = useState<Record<string, number>>({});
  // Same reasoning for the "system-style" styling of an applied-action
  // confirmation line — it's a rendering choice for messages created this
  // session, not a persisted field.
  const [systemLineIds, setSystemLineIds] = useState<Set<string>>(new Set());
  const [revealedTsId, setRevealedTsId] = useState<string | null>(null);
  const convoRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<number | null>(null);

  // Tappable starter questions, lightly tailored to the data. Recomputed when
  // the chat changes (so a fresh opener can shift them) — they're cheap.
  const prompts = suggestedPrompts(store.get(), { clipsAvailable });

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = convoRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  // Whether the latest night has anything for "{{card:clip}}"/"Play my
  // loudest snore" to actually play — real capture, or (for a demo-mode
  // night) Lane C's sample fallback. Drives the dynamic suggestion chip.
  useEffect(() => {
    let cancelled = false;
    const night = lastNight(store.get());
    if (!night) return;
    clipsForNight(night.date, night.source === 'demo')
      .then(clips => { if (!cancelled) setClipsAvailable(clips.length > 0); })
      .catch(() => { if (!cancelled) setClipsAvailable(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stale-chip guard: a pending strap-position action chip is only ever
  // valid while its target is still exactly ±1 from the LIVE device
  // position — the position can move out from under an already-offered chip
  // via a later chat turn, or independently via the Device page's own advice
  // button (both write through the same writeDevice()). Re-checked here on
  // every device-position change (auto-invalidates/greys-out a stale chip
  // without the user having to tap it) AND again at tap time in
  // applyStrapAction below (the actual write must never trust a stale
  // closure) — never trust the position captured when the chip was offered.
  useEffect(() => {
    setPendingActions(prev => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [id, target] of Object.entries(prev)) {
        if (Math.abs(target - currentStrapPosition) === 1) next[id] = target;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [currentStrapPosition]);

  // A long-pressed timestamp reveal auto-hides after a couple seconds rather
  // than needing a second tap to dismiss.
  useEffect(() => {
    if (!revealedTsId) return;
    const t = window.setTimeout(() => setRevealedTsId(null), 2500);
    return () => window.clearTimeout(t);
  }, [revealedTsId]);

  const startPress = (id: string) => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => setRevealedTsId(id), 420);
  };
  const endPress = () => {
    if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  /**
   * Runs one assistant turn against the real streaming path and settles it:
   * appends/updates the reply bubble token-by-token exactly as before, then
   * — only once the stream is fully done — strips any card/action tokens
   * and attaches the resolved card / offers the resolved action chip. Shared
   * by both the user-driven `send()` below and the account-mode proactive
   * opener, so both go through the identical parse-after-completion path.
   */
  const runCoachTurn = async (userText: string) => {
    const replyId = `m${Date.now() + 1}`;
    try {
      const history = [...store.get().chat];
      const stream = streamChatReply(userText, history, store.get());
      let acc = '';
      let started = false;
      for await (const chunk of stream) {
        acc += chunk;
        if (!started) {
          // First token: drop the typing indicator and add the reply bubble.
          started = true;
          setTyping(false);
          store.set(s2 => { s2.chat = [...s2.chat, { id: replyId, who: 'them', text: acc, ts: Date.now() }]; });
        } else {
          store.set(s2 => { s2.chat = s2.chat.map(x => (x.id === replyId ? { ...x, text: acc } : x)); });
        }
      }
      if (!started) {
        store.set(s2 => { s2.chat = [...s2.chat, { id: replyId, who: 'them', text: '…', ts: Date.now() }]; });
        setTyping(false);
        return;
      }
      // Card/action tokens are resolved here, once, against the fully
      // settled reply — never against a partially-streamed chunk, and the
      // chip below is never auto-applied, only ever offered.
      const finalState = store.get();
      const { text: cleanText, card, actionStrapPosition } = parseAssistantReply(
        acc,
        finalState.nights,
        finalState.device.strapPosition,
      );
      store.set(s2 => { s2.chat = s2.chat.map(x => (x.id === replyId ? { ...x, text: cleanText, card } : x)); });
      if (actionStrapPosition !== undefined) {
        // Supersede rather than merge — only the newest offered action stays
        // tappable, so an older chip from an earlier turn doesn't linger
        // alongside it as a second landmine.
        setPendingActions({ [replyId]: actionStrapPosition });
      }
      void persistChatTurn(store.get(), 'them', cleanText);
    } catch (err) {
      console.error('Chat error:', err);
      store.set(s2 => { s2.chat = [...s2.chat, { id: replyId, who: 'them', text: "lost you for a second — try that again?", ts: Date.now() }]; });
      setTyping(false);
    }
  };

  // Proactive opener: once per Chat mount, either the existing rule-based
  // local-demo line, or — for a signed-in account — a real streamed morning
  // observation, gated so it fires at most once per night and never while a
  // night is actively recording.
  useEffect(() => {
    const st = store.get();

    if (st.mode !== 'account') {
      const text = proactiveOpener(st);
      if (!text) return;
      const id = `proactive-${new Date().toDateString()}`;
      if (st.chat.some(m => m.id === id)) return;
      // The seeded conversation may already say the same thing — don't repeat it.
      if (st.chat.some(m => m.text === text)) return;
      store.set(s2 => { s2.chat = [...s2.chat, { id, who: 'them', text, ts: Date.now() }]; });
      return;
    }

    if (st.liveNight?.tracking) return; // never while a night is recording
    const night = lastNight(st);
    if (!night) return;
    const nightStart = new Date(`${night.date}T00:00:00`).getTime();
    const lastCoachMsg = [...st.chat].reverse().find(m => m.who === 'them');
    if (lastCoachMsg && lastCoachMsg.ts >= nightStart) return; // already opened for this night
    if (openerInFlight) return;
    openerInFlight = true;
    setTyping(true);
    void runCoachTurn('give the morning observation for the latest night').finally(() => {
      openerInFlight = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (text?: string) => {
    const body = (text ?? draft).trim();
    if (!body) return;
    setDraft('');

    // IMPORTANT: replace the chat array immutably on every update (new array +
    // new message object). The store subscriber here selects `s.chat`, so it
    // only re-renders when that reference changes — mutating in place would
    // make the whole reply appear at once instead of streaming token-by-token.
    store.set(s2 => { s2.chat = [...s2.chat, { id: `m${Date.now()}`, who: 'me', text: body, ts: Date.now() }]; });
    setTyping(true);
    void persistChatTurn(store.get(), 'me', body);
    await runCoachTurn(body);
  };

  // Tap-to-confirm strap-position action chip — never auto-applied, and
  // never applied on a stale reading either: the chip is re-validated
  // against the LIVE device position right here, at the one point where the
  // write actually happens, not against whatever the position was when the
  // chip was first offered.
  const applyStrapAction = (messageId: string, targetPosition: number) => {
    setPendingActions(prev => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
    const live = store.get().device.strapPosition;
    if (Math.abs(targetPosition - live) !== 1) return; // went stale between offer and tap — dropped, not applied
    writeDevice({ strapPosition: targetPosition });
    const sysMsg = writeChatMessage({ who: 'them', text: `Strap moved to position ${targetPosition}` });
    setSystemLineIds(prev => new Set(prev).add(sysMsg.id));
  };

  return (
    <div className={s.root}>
      {/* star / moon / cloud margin decorations, behind the conversation */}
      <svg viewBox="0 0 393 780" className={s.scene} aria-hidden focusable="false">
        <PaperStar x={30} y={150} scale={0.8} delay={0.6} />
        <PaperMoon x={334} y={108} scale={2} />
        <PaperCloud x={310} y={148} scale={0.85} drift={1} />
        <PaperCloud x={-14} y={228} scale={0.9} drift={2} />
        <PaperStar x={352} y={470} scale={0.7} delay={2.2} />
        <PaperCloud x={322} y={560} scale={0.9} drift={1} />
      </svg>

      <div className={s.header}>
        <button className={`${s.back} tap`} onClick={() => navigate('/')}>
          <ChevronLeft />
        </button>
        <div className={s.who}>
          <Avatar size={44} ring="coral" />
          <div>
            <div className={s.name}>Dr. Sommers</div>
            <div className={s.status}>Listening</div>
          </div>
        </div>
        <Menu className={s.back} ariaLabel="More" items={[
          { label: 'Detailed night report', onClick: () => navigate('/chat/rich') },
        ]} />
      </div>

      <div className={s.convo} ref={convoRef}>
        {messages.map((m, i) => {
          const divider = (i === 0 || dayLabel(m.ts) !== dayLabel(messages[i - 1].ts))
            ? <div className={s.dayRule}>— {dayLabel(m.ts)} —</div>
            : null;

          if (m.who === 'them') {
            const isSystemLine = systemLineIds.has(m.id);
            const strapAction = pendingActions[m.id];
            if (isSystemLine) {
              return (
                <Fragment key={m.id}>
                  {divider}
                  <div className={s.systemLine}>{m.text}</div>
                </Fragment>
              );
            }
            return (
              <Fragment key={m.id}>
                {divider}
                <motion.div
                  className={s.row}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Avatar size={34} ring="coral" style={{ marginBottom: 4 }} />
                  <div className={s.stack}>
                    {m.text && (
                      <div
                        className={`${s.bubble} ${s.bubbleThem}`}
                        onPointerDown={() => startPress(m.id)}
                        onPointerUp={endPress}
                        onPointerLeave={endPress}
                      >
                        {m.text}
                      </div>
                    )}
                    {m.card?.kind === 'snore-summary' && (
                      <div className={s.card}>
                        <div className={s.k}>Snores · {m.card.date}</div>
                        <div className={s.row2}>
                          <div className={s.v}>{m.card.total}</div>
                          <div className={s.u}>vs. {m.card.baseline} baseline</div>
                        </div>
                        <div className={s.delta}>↓ {Math.round((1 - m.card.total / m.card.baseline) * 100)}%</div>
                      </div>
                    )}
                    {m.card?.kind === 'comparison' && (
                      <button
                        className={`${s.card} tap`}
                        style={{ textAlign: 'left', width: '100%', border: 0, cursor: 'pointer' }}
                        onClick={() => navigate('/trends/compare')}
                      >
                        <div className={s.k}>Two-week comparison</div>
                        <div className={s.row2}>
                          <div className={s.u}>Tap to see how you stack up against a similar cohort</div>
                        </div>
                      </button>
                    )}
                    {m.card?.kind === 'hypnogram' && (
                      <button
                        className={`${s.card} tap`}
                        style={{ textAlign: 'left', width: '100%', border: 0, cursor: 'pointer' }}
                        onClick={() => navigate(`/night/${m.card && m.card.kind === 'hypnogram' ? m.card.date : 'today'}`)}
                      >
                        <div className={s.k}>Sleep stages · {m.card.date}</div>
                        <div className={s.row2}>
                          <div className={s.u}>Tap to see the full night breakdown</div>
                        </div>
                      </button>
                    )}
                    {m.card?.kind === 'audio' && (
                      <div className={s.card}>
                        <div className={s.k}>Audio clip · {m.card.window}</div>
                        <div className={s.row2}>
                          <div className={s.v}>{m.card.duration}s</div>
                          <div className={s.u}>recorded snore sample</div>
                        </div>
                      </div>
                    )}
                    {m.card?.kind === 'clip' && <ClipCard />}
                    {m.card?.kind === 'science' && <ScienceCard />}
                    {strapAction !== undefined && Math.abs(strapAction - currentStrapPosition) === 1 && (
                      <button
                        className={`${s.actionChip} tap`}
                        onClick={() => applyStrapAction(m.id, strapAction)}
                      >
                        Move strap to position {strapAction}
                      </button>
                    )}
                    {revealedTsId === m.id && (
                      <div className={s.ts}>{fmtClockHM(new Date(m.ts))}</div>
                    )}
                  </div>
                </motion.div>
              </Fragment>
            );
          }
          return (
            <Fragment key={m.id}>
              {divider}
              <motion.div
                className={`${s.row} ${s.rowMe}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className={s.stackMe}>
                  <div
                    className={`${s.bubble} ${s.bubbleMe}`}
                    onPointerDown={() => startPress(m.id)}
                    onPointerUp={endPress}
                    onPointerLeave={endPress}
                  >
                    {m.text}
                  </div>
                  {revealedTsId === m.id && (
                    <div className={`${s.ts} ${s.tsRight}`}>{fmtClockHM(new Date(m.ts))}</div>
                  )}
                </div>
              </motion.div>
            </Fragment>
          );
        })}

        {typing && (
          <div className={s.row}>
            <div className={s.avSpacer} />
            <div className={s.typing}><span /><span /><span /></div>
          </div>
        )}
      </div>

      {!typing && !draft.trim() && prompts.length > 0 && (
        <div className={s.prompts}>
          {prompts.map(p => (
            <button key={p} className={`${s.chip} tap`} onClick={() => send(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      <div className={s.composer}>
        <div className={s.field}>
          <input
            ref={inputRef}
            className={s.fieldInput}
            type="text"
            placeholder="Ask Dr. Sommers…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            autoComplete="off"
          />
        </div>
        <button className={`${s.send} tap`} onClick={() => send()} disabled={!draft.trim()}>
          <ArrowRight />
        </button>
      </div>
    </div>
  );
}
