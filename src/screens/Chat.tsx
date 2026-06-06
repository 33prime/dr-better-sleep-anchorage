import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useStore, store } from '../store';
import { Avatar } from '../components/Avatar';
import { ChevronLeft, ArrowRight } from '../components/icons';
import { Menu } from '../components/Menu';
import { fmtClockHM } from '../utils/format';
import { streamChatReply } from '../utils/chatApi';
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
      }
    } catch (err) {
      console.error('Chat error:', err);
      store.set(s2 => { s2.chat = [...s2.chat, { id: replyId, who: 'them', text: "lost you for a second — try that again?", ts: Date.now() }]; });
      setTyping(false);
    }
  };

  return (
    <div className={s.root}>
      <div className={s.header}>
        <button className={`${s.back} tap`} onClick={() => navigate('/')}>
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
                <Avatar size={22} style={{ marginBottom: 4 }} />
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
