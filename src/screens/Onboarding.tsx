import { useLocation } from 'wouter';
import { useStore } from '../store';
import { Avatar } from '../components/Avatar';
import { ArrowRight } from '../components/icons';
import s from './Onboarding.module.css';

export function Onboarding() {
  const state = useStore();
  const [, navigate] = useLocation();

  return (
    <div className={s.root}>
      <div className={s.progress}>
        {[0, 1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className={`${s.pip} ${i < 6 ? s.pipDone : ''}`} />
        ))}
      </div>

      <div className={s.whoLine}>
        <Avatar size={28} />
        <div className={s.name}>Dr. Sommers</div>
      </div>

      <h1 className={s.h}>
        Here's what I picked up,<br />
        <span className={s.it}>{state.user.name}.</span>
      </h1>

      <p className={s.bodyCopy}>
        Six questions isn't a lot, but it's enough to start.{' '}
        <span className={s.em}>Honest read:</span> you're a textbook positional snorer. That's a good thing — it means we have leverage.
      </p>

      <div className={s.findings}>
        <div className={s.finding}>
          <div className={s.num}>01</div>
          <div className={s.copy}>You snore <span className={s.em}>most nights</span>, loudest on your back, and your partner has noticed it getting worse over the last two years.</div>
        </div>
        <div className={s.finding}>
          <div className={s.num}>02</div>
          <div className={s.copy}>You wake feeling <span className={s.em}>unrested</span> more often than not, even at <span className={s.data}>7+ hours</span>.</div>
        </div>
        <div className={s.finding}>
          <div className={s.num}>03</div>
          <div className={s.copy}>No diagnosed sleep apnea, no recent sleep study. <span className={s.em}>Worth flagging</span> — we'll keep an eye on it.</div>
        </div>
        <div className={s.finding}>
          <div className={s.num}>04</div>
          <div className={s.copy}>You'd rather not see a sleep doctor right now. Fine. Most people in your shoes don't, and we can do real work without one.</div>
        </div>
      </div>

      <div className={s.path}>
        <div className={s.label}>Recommended path</div>
        <h2>
          Start with the <span className={s.it}>device</span>. We titrate together over four weeks.
        </h2>
        <p>I'll watch every night and adjust the strap position with you. If we're not seeing a real drop by week three, we change course — together.</p>

        <div className={s.steps}>
          <div className={s.step}><div className={s.dot}>1</div><div className={s.l}>Fit the device tonight</div><div className={s.when}>Tonight</div></div>
          <div className={s.step}><div className={s.dot}>2</div><div className={s.l}>Three nights at position 1</div><div className={s.when}>Wed–Fri</div></div>
          <div className={s.step}><div className={s.dot}>3</div><div className={s.l}>Daily 90-second check-ins</div><div className={s.when}>Mornings</div></div>
          <div className={s.step}><div className={s.dot}>4</div><div className={s.l}>Re-evaluate together</div><div className={s.when}>In 4 weeks</div></div>
        </div>
      </div>

      <div className={s.actions}>
        <button className={`${s.btn} ${s.btnPrimary} tap`} onClick={() => navigate('/onboarding/setup')}>
          <span>Start with this plan <ArrowRight /></span>
        </button>
        <button className={`${s.btn} ${s.btnGhost} tap`} onClick={() => navigate('/onboarding/device')}>
          Tell me more first
        </button>
      </div>

      <div style={{ height: 16 }} />
    </div>
  );
}
