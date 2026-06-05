import { useLocation } from 'wouter';
import { useStore, store, daysSince } from '../store';
import { ChevronLeft } from '../components/icons';
import { Menu } from '../components/Menu';
import { isoDate } from '../utils/format';
import { showToast } from '../components/Toast';
import s from './Reorder.module.css';

export function Reorder() {
  const state = useStore();
  const [, navigate] = useLocation();

  const totalNights = state.device.lifespanNights;
  const used = daysSince(state.device.fittedAt);
  const remaining = Math.max(0, totalNights - used);
  const pctUsed = Math.min(100, (used / totalNights) * 100);
  const monthsLeft = Math.max(0, Math.round(remaining / 30));

  const reorder = () => {
    if (state.reorder.ordered) {
      showToast('Already ordered — ships in 2 days.');
      return;
    }
    store.set(s2 => {
      s2.reorder = { ...s2.reorder, ordered: true, orderedAt: isoDate(new Date()) };
    });
    showToast('Ordered. Confirmation in your email.');
  };

  const toggleRemind = () => {
    store.set(s2 => { s2.reorder.remindIn3mo = !s2.reorder.remindIn3mo; });
  };

  return (
    <div className={s.root}>
      <div className={s.nav}>
        <button className={`${s.back} tap`} onClick={() => navigate('/profile')}>
          <ChevronLeft />
          <span>Profile</span>
        </button>
        <Menu className={s.more} ariaLabel="More" items={[
          { label: 'Manage subscription', onClick: () => showToast('No subscription — you only order when you need to.') },
          { label: 'Order history', onClick: () => showToast('No past orders yet.') },
        ]} />
      </div>

      <div className={s.body}>
        <div className={s.label}>Reorder</div>
        <h1 className={s.h}>
          Your device has<br />
          <span className={s.it}>about {monthsLeft} month{monthsLeft === 1 ? '' : 's'}</span> left.
        </h1>

        <div className={s.wear}>
          <div className={s.top}>
            <div className={s.l}>
              <div className={s.k}>In use since</div>
              <div className={s.v}>
                {fmtFullDate(state.device.fittedAt)} · <span className={s.it}>{used} nights</span>
              </div>
            </div>
            <svg className={s.icon} viewBox="0 0 64 48" aria-hidden>
              <ellipse cx="32" cy="40" rx="24" ry="3" fill="rgba(30,37,68,0.06)" />
              <path d="M10,20 Q32,4 54,20 Q53,28 46,32 Q32,24 18,32 Q11,28 10,20 Z" fill="rgba(67,186,202,0.2)" stroke="#43BACA" strokeWidth={0.9} />
              <path d="M14,28 Q32,42 50,28 Q51,36 44,38 Q32,42 20,38 Q13,36 14,28 Z" fill="rgba(255,255,255,0.7)" stroke="#1E2544" strokeWidth={0.7} />
              <rect x="2" y="26" width="6" height="3" rx="1" fill="#F0F2F7" stroke="#1E2544" strokeWidth={0.5} />
              <rect x="56" y="26" width="6" height="3" rx="1" fill="#F0F2F7" stroke="#1E2544" strokeWidth={0.5} />
            </svg>
          </div>
          <div className={s.meter}><i style={{ width: `${pctUsed}%` }} /></div>
          <div className={s.metaRow}>
            <span>New</span>
            <span className={s.now}>≈ {Math.round(pctUsed)}% through · ~{remaining} nights left</span>
            <span>Replace</span>
          </div>
          <div className={s.reason}>
            Silicone holds its shape for about <span className={s.em}>a year of nightly wear</span>. Past that, the strap geometry softens and the bite becomes less precise — you'll snore more, even at the same position.
          </div>
        </div>

        <div className={s.primary}>
          <button className={`${s.btn} tap ${state.reorder.ordered ? s.ordered : ''}`} onClick={reorder}>
            <div className={s.lab}>
              {state.reorder.ordered ? 'Ordered' : 'Reorder one device'}
              <span className={s.sub}>
                {state.reorder.ordered ? 'Ships in 2 days · arrives before yours wears out' : 'Ships in 2 days · arrives before yours wears out'}
              </span>
            </div>
            <div className={s.price}>{state.reorder.ordered ? '✓' : '$89'}</div>
          </button>
        </div>

        <div className={s.toggleRow}>
          <div>
            <div className={s.ttl}>Remind me in three months</div>
            <div className={s.sub}>No subscription, just a nudge.</div>
          </div>
          <button
            className={`${s.switch} ${state.reorder.remindIn3mo ? s.on : ''}`}
            onClick={toggleRemind}
            aria-pressed={state.reorder.remindIn3mo}
            aria-label="Toggle reminder"
          >
            <span className={s.knob} />
          </button>
        </div>

        <div className={s.ship}>
          <div className={s.l}>
            <div className={s.k}>Ship to</div>
            <div className={s.v}>{state.user.shipTo}</div>
          </div>
          <button className={`${s.edit} tap`} onClick={() => showToast('We’ll text a secure link to update your address.')}>Edit</button>
        </div>

        <div className={s.shelf}>
          <div className={s.h2}>
            Things I've <span className={s.it}>recommended</span>
          </div>
          <div className={s.lede}>Only what came up in our conversations. Each one tied to the night I noticed something.</div>

          {state.recommendations.map(r => (
            <div className={s.rec} key={r.id}>
              <div className={s.thumb}>
                <RecIcon kind={r.iconKind} />
              </div>
              <div className={s.body}>
                <div className={s.nm}>
                  {r.name} <span className={s.it}>{r.emphasis}</span>
                </div>
                <div className={s.quote}>{r.quote}</div>
                <div className={s.meta}>
                  <span className={s.when}>Recommended {fmtShortRecDate(r.recommendedOn)}</span>
                  <span className={s.price}>{r.price}{r.priceSubtext ? ` · ${r.priceSubtext}` : ''}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className={s.footnote}>I don't show you anything I haven't talked through with you first. If something here feels random, tap it — I'll show you the night it came up.</p>
      </div>
    </div>
  );
}

function RecIcon({ kind }: { kind: 'pill' | 'pillow' | 'tablet' }) {
  const props = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 };
  if (kind === 'pill') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M8 3v6a4 4 0 0 0 8 0V3" /><path d="M8 21h8" /><path d="M12 15v6" />
      </svg>
    );
  }
  if (kind === 'pillow') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M3 12c4-2 6-2 9 0s5 2 9 0" />
        <path d="M3 17c4-2 6-2 9 0s5 2 9 0" />
        <path d="M3 7c4-2 6-2 9 0s5 2 9 0" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  );
}

function fmtFullDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}
function fmtShortRecDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${String(d).padStart(2, '0')}`;
}
