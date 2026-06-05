import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { store } from '../store';
import { Avatar } from '../components/Avatar';
import { CloseIcon, ArrowRight } from '../components/icons';
import { isoDate, pad2 } from '../utils/format';
import { showToast } from '../components/Toast';
import s from './BoilAndBite.module.css';

interface Step {
  name: string;
  headline: React.ReactNode;
  lede: React.ReactNode;
  tip: React.ReactNode;
  duration: number;
}

const STEPS: Step[] = [
  {
    name: 'Heat water',
    headline: <>Bring water to a soft boil.<br /><span style={{ fontStyle: 'italic' }}>Cut the heat once it gets there.</span></>,
    lede: <>Just shy of a rolling boil — bubbles, no roar. Hot enough to soften the silicone, gentle enough not to discolor it.</>,
    tip: <>Use a small saucepan with at least 4 inches of water. <em style={{ fontFamily: 'var(--serif)' }}>Don't use a kettle</em> — you can't lower the device cleanly into one.</>,
    duration: 90,
  },
  {
    name: 'Submerge',
    headline: <>Lower it in.<br /><span style={{ fontStyle: 'italic' }}>Hold for sixty seconds.</span></>,
    lede: <>The silicone softens and becomes pliable. <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Don't go past 90 seconds</strong> — too long and it loses shape memory.</>,
    tip: <>Use a slotted spoon or tongs to lower the device. <em style={{ fontFamily: 'var(--serif)' }}>Don't drop it in</em> — it can stick to the bottom of the pan and warp on one side.</>,
    duration: 60,
  },
  {
    name: 'Cool',
    headline: <>Lift it out and<br /><span style={{ fontStyle: 'italic' }}>count to ten.</span></>,
    lede: <>Ten seconds is the sweet spot — pliable, not hot. If it's burning, give it five more.</>,
    tip: <>Keep it on a paper towel. <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Don't skip this</strong> — the impression sets while it cools.</>,
    duration: 10,
  },
  {
    name: 'Bite & hold',
    headline: <>Press evenly. Hold<br /><span style={{ fontStyle: 'italic' }}>for two full minutes.</span></>,
    lede: <>Two minutes is all it takes to set. Start the timer and don't talk — moving your jaw distorts the impression.</>,
    tip: <>Bite straight down — don't shift side to side. The impression sets in the first 30 seconds; the rest is just for stability.</>,
    duration: 120,
  },
  {
    name: 'Cold rinse',
    headline: <>Cold water rinse.<br /><span style={{ fontStyle: 'italic' }}>It's yours now.</span></>,
    lede: <>Once it's cool to the touch, you're done. Rinse it again before bed tonight.</>,
    tip: <>Store it dry between uses. Heat warps it; moisture invites bacteria.</>,
    duration: 30,
  },
];

const RING_CIRCUMFERENCE = 2 * Math.PI * 110;

export function BoilAndBite() {
  const [, navigate] = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const [remaining, setRemaining] = useState(STEPS[0].duration);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const step = STEPS[stepIndex];

  // Countdown
  useEffect(() => {
    setRemaining(step.duration);
    if (paused) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          // auto-advance, or complete
          window.setTimeout(() => {
            if (stepIndex < STEPS.length - 1) {
              setStepIndex(stepIndex + 1);
            } else {
              complete();
            }
          }, 200);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, paused]);

  const complete = () => {
    store.set(s2 => {
      s2.onboarding.boilCompleted = true;
      s2.onboarding.boilStep = STEPS.length;
      s2.onboarding.complete = true;
      s2.device.fittedAt = isoDate(new Date());
      s2.device.strapPosition = 1;
    });
    playChime();
    showToast('Fitted! Welcome to the dashboard.');
    navigate('/onboarding/device');
  };

  const skipAhead = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      complete();
    }
  };

  const arcLength = RING_CIRCUMFERENCE * (1 - remaining / step.duration);

  return (
    <div className={s.root}>
      <div className={s.nav}>
        <button className={`${s.x} tap`} onClick={() => navigate('/onboarding')} aria-label="Close">
          <CloseIcon />
        </button>
        <div className={s.help}>Need help?</div>
      </div>

      <div className={s.progress}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`${s.pip} ${i < stepIndex ? s.pipDone : ''} ${i === stepIndex ? s.pipActive : ''} tap`}
            onClick={() => setStepIndex(i)}
          />
        ))}
      </div>

      <div className={s.stage}>
        <div className={s.stepMeta}>
          <div className={s.num}>Step {pad2(stepIndex + 1)} · {step.name}</div>
          <div className={s.of}>{stepIndex + 1} of {STEPS.length}</div>
        </div>

        <h1 className={s.h1}>{step.headline}</h1>
        <p className={s.lede}>{step.lede}</p>

        <div className={s.ringWrap}>
          <div className={s.ring}>
            <svg viewBox="0 0 240 240">
              <circle className={s.track} cx={120} cy={120} r={110} />
              <motion.circle
                className={s.arc}
                cx={120} cy={120} r={110}
                strokeDasharray={RING_CIRCUMFERENCE}
                animate={{ strokeDashoffset: -arcLength }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </svg>
            <div className={s.center}>
              <div>
                <div className={s.t}>{pad2(Math.floor(remaining / 60))}:{pad2(remaining % 60)}</div>
                <div className={s.cap}>Remaining</div>
              </div>
            </div>
          </div>
        </div>

        <div className={s.tip}>
          <Avatar size={22} />
          <div className={s.copy}>{step.tip}</div>
        </div>

        <div className={s.foot}>
          <button className={`${s.btn} ${s.btnGhost} tap`} onClick={() => setPaused(p => !p)}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button className={`${s.btn} ${s.btnPrimary} tap`} onClick={skipAhead}>
            <span>{stepIndex === STEPS.length - 1 ? 'Finish' : 'Skip ahead'} <ArrowRight /></span>
          </button>
        </div>
      </div>
    </div>
  );
}

function playChime() {
  try {
    const Ctx = (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).AudioContext ||
                (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch { /* ignore */ }
}
