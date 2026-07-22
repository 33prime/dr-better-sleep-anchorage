import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useStore, store } from '../store';
import { Avatar } from '../components/Avatar';
import { PaperCloud, PaperMoon, PaperStar } from '../components/paper/PaperScene';
import { ChevronLeft, ArrowRight } from '../components/icons';
import { Menu } from '../components/Menu';
import { fmtClockHM } from '../utils/format';
import { streamChatReply, persistChatTurn } from '../utils/chatApi';
import { suggestedPrompts, proactiveOpener } from '../utils/coachPrompts';
import s from './Chat.module.css';

export function Chat() {
  const messages = useStore(st => st.chat);
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const convoRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tappable starter questions, lightly tailored to the data. Recomputed when
  // the chat changes (so a fresh opener can shift them) — they're cheap.
  const prompts = suggestedPrompts(store.get());

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = convoRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  // Proactive opener: a local, rule-based Dr. Sommers message appended once on
  // mount when something's notable. Uses a stable id so a remount can't dupe it
  // — and we never fire the API for this. Immutable array update so the chat
  // view re-renders (see the send() note below).
  useEffect(() => {
    const text = proactiveOpener(store.get());
    if (!text) return;
    const id = `proactive-${new Date().toDateString()}`;
    if (store.get().chat.some(m => m.id === id)) return;
    // The seeded conversation may already say the same thing — don't repeat it.
    if (store.get().chat.some(m => m.text === text)) return;
    store.set(s2 => { s2.chat = [...s2.chat, { id, who: 'them', text, ts: Date.now() }]; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (text?: string) => {
    const body = (text ?? draft).trim();
    if (!body) return;
    setDraft('');

    const userId = `m${Date.now()}`;
    const replyId = `m${Date.now() + 1}`;

    // IMPORTANT: replace the chat array immutably on every update (new array +
    // new message object). The store subscriber here selects `s.chat`, so it
    // only re-renders when that reference changes — mutating in place would
    // make the whole reply appear at once instead of streaming token-by-token.
    store.set(s2 => { s2.chat = [...s2.chat, { id: userId, who: 'me', text: body, ts: Date.now() }]; });
    setTyping(true);
    void persistChatTurn(store.get(), 'me', body);

    try {
      const history = [...store.get().chat];
      const stream = streamChatReply(body, history, store.get());
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
      } else {
        // Persist the finished reply once streaming settles (see
        // persistChatTurn's note on why this bypasses the write queue).
        void persistChatTurn(store.get(), 'them', acc);
      }
    } catch (err) {
      console.error('Chat error:', err);
      store.set(s2 => { s2.chat = [...s2.chat, { id: replyId, who: 'them', text: "lost you for a second — try that again?", ts: Date.now() }]; });
      setTyping(false);
    }
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
        <div className={s.dayRule}>— Today —</div>

        {messages.map((m, i) => {
          if (m.who === 'them') {
            return (
              <motion.div
                key={m.id}
                className={s.row}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <Avatar size={34} ring="coral" style={{ marginBottom: 4 }} />
                <div className={s.stack}>
                  {m.text && <div className={`${s.bubble} ${s.bubbleThem}`}>{m.text}</div>}
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
                </div>
              </motion.div>
            );
          }
          return (
            <motion.div
              key={m.id}
              className={`${s.row} ${s.rowMe}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={`${s.bubble} ${s.bubbleMe}`}>{m.text}</div>
            </motion.div>
          );
        })}

        {typing && (
          <div className={s.row}>
            <div className={s.avSpacer} />
            <div className={s.typing}><span /><span /><span /></div>
          </div>
        )}

        {messages.length > 0 && (
          <div className={s.ts}>{fmtClockHM(new Date(messages[messages.length - 1].ts))}</div>
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
