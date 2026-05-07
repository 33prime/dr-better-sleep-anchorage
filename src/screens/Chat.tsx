import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useStore, store } from '../store';
import { Avatar } from '../components/Avatar';
import { ChevronLeft, ArrowRight, DotsIcon } from '../components/icons';
import { fmtClockHM } from '../utils/format';
import { pickReply } from '../utils/replies';
import s from './Chat.module.css';

export function Chat() {
  const messages = useStore(st => st.chat);
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const convoRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = convoRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    store.set(s2 => {
      s2.chat.push({ id: `m${Date.now()}`, who: 'me', text, ts: Date.now() });
    });
    setTyping(true);
    window.setTimeout(() => {
      const reply = pickReply(text);
      store.set(s2 => {
        s2.chat.push({ id: `m${Date.now() + 1}`, who: 'them', text: reply, ts: Date.now() });
      });
      setTyping(false);
    }, 900 + Math.random() * 700);
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
        <button className={`${s.back} tap`} aria-label="More">
          <DotsIcon />
        </button>
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
        <button className={`${s.send} tap`} onClick={send} disabled={!draft.trim()}>
          <ArrowRight />
        </button>
      </div>
    </div>
  );
}
