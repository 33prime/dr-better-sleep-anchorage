import { useLocation } from 'wouter';
import { useStore } from '../store';
import { Avatar } from '../components/Avatar';
import { ArrowRight } from '../components/icons';
import { Wordmark } from '../components/Wordmark';
import s from './Onboarding.module.css';

export function Onboarding() {
  const state = useStore();
  const [, navigate] = useLocation();

  const a = state.onboarding.answers ?? {};

  // --- derive the honest read from the actual answers ---
  const positions = a.snorePositions ?? [];
  const snoresOnBack = positions.includes('back');

  const freqWord =
    a.snoreFrequency === 'every-night' ? 'just about every night'
    : a.snoreFrequency === 'most-nights' ? 'most nights'
    : a.snoreFrequency === 'sometimes' ? 'some nights'
    : a.snoreFrequency === 'rarely' ? 'now and then'
    : 'on a regular basis';

  // Lede: positional snorers are the most treatable; otherwise frame from frequency.
  const lede = snoresOnBack ? (
    <>you're a textbook positional snorer. That's a good thing — it means we have leverage.</>
  ) : a.snoreFrequency === 'every-night' || a.snoreFrequency === 'most-nights' ? (
    <>the snoring is showing up {freqWord}, and that consistency is exactly what makes it trackable.</>
  ) : (
    <>the snoring comes and goes, which gives us a clear pattern to work with.</>
  );

  // Finding 01 — frequency + position + partner trend.
  const positionPhrase = snoresOnBack
    ? 'loudest on your back'
    : positions.includes('side')
      ? 'showing up even on your side'
      : 'across the positions you sleep in';
  const partnerPhrase = a.partnerNoticedWorse === true
    ? <>, and your partner has noticed it getting worse lately</>
    : a.partnerNoticedWorse === false
      ? <>, and your partner says it's held about steady</>
      : null;

  // Finding 02 — how rested they feel.
  const rested02 = a.feelsRested === 'rarely' ? (
    <>You wake feeling <span className={s.em}>unrested</span> more often than not, even at <span className={s.data}>7+ hours</span>.</>
  ) : a.feelsRested === 'sometimes' ? (
    <>You feel <span className={s.em}>rested some mornings</span> and flat on others — the inconsistency is the tell.</>
  ) : a.feelsRested === 'usually' ? (
    <>You <span className={s.em}>usually wake rested</span>, which means we're protecting good sleep, not rebuilding it.</>
  ) : (
    <>How rested you wake is the next thing I'll watch closely.</>
  );

  // Finding 03 — apnea / sleep-study status.
  const apnea03 = a.diagnosedApnea === true ? (
    <>You've a <span className={s.em}>diagnosed</span> sleep apnea on record. We'll work alongside your care, never around it.</>
  ) : (
    <>No diagnosed sleep apnea{a.seenSleepDoc === true ? ', though you have seen a sleep doctor' : ', no recent sleep study'}. <span className={s.em}>Worth flagging</span> — we'll keep an eye on it.</>
  );

  // Finding 04 — referral preference.
  const doctor04 = a.wantsDoctor === true ? (
    <>You'd like a line to a sleep doctor. Good — I'll get you a referral, and we can start real work tonight in the meantime.</>
  ) : (
    <>You'd rather not see a sleep doctor right now. Fine. Most people in your shoes don't, and we can do real work without one.</>
  );

  return (
    <div className={s.root}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 16px' }}>
        <Wordmark size={19} tone="onLight" />
      </div>
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
        Seven questions isn't a lot, but it's enough to start.{' '}
        <span className={s.em}>Honest read:</span> {lede}
      </p>

      <div className={s.findings}>
        <div className={s.finding}>
          <div className={s.num}>01</div>
          <div className={s.copy}>You snore <span className={s.em}>{freqWord}</span>, {positionPhrase}{partnerPhrase}.</div>
        </div>
        <div className={s.finding}>
          <div className={s.num}>02</div>
          <div className={s.copy}>{rested02}</div>
        </div>
        <div className={s.finding}>
          <div className={s.num}>03</div>
          <div className={s.copy}>{apnea03}</div>
        </div>
        <div className={s.finding}>
          <div className={s.num}>04</div>
          <div className={s.copy}>{doctor04}</div>
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
