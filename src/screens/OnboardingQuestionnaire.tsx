import { useState } from 'react';
import { useLocation } from 'wouter';
import { store } from '../store';
import { Avatar } from '../components/Avatar';
import { ArrowRight, ChevronLeft } from '../components/icons';
import { Wordmark } from '../components/Wordmark';
import { PaperStar, PaperCloud } from '../components/paper/PaperScene';
import type { OnboardingState } from '../seed';
import s from './OnboardingQuestionnaire.module.css';

type Answers = OnboardingState['answers'];

const TOTAL_STEPS = 7;

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m5 13 4 4 10-11" />
  </svg>
);

export function OnboardingQuestionnaire() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});

  const goBack = () => setStep(i => Math.max(0, i - 1));

  // Auto-advance after a single-select tap; finish on the last step.
  const advance = (next: Answers) => {
    setAnswers(next);
    window.setTimeout(() => {
      if (step < TOTAL_STEPS - 1) {
        setStep(step + 1);
      } else {
        finish(next);
      }
    }, 220);
  };

  const finish = (final: Answers) => {
    store.set(s2 => {
      s2.onboarding.answers = { ...s2.onboarding.answers, ...final };
      s2.onboarding.step = TOTAL_STEPS;
      s2.onboarding.startedAt = new Date().toISOString();
    });
    navigate('/onboarding/findings');
  };

  // --- single-select option card ---
  const Option = ({ selected, label, hint, onClick }: {
    selected: boolean; label: string; hint?: string; onClick: () => void;
  }) => (
    <button className={`${s.opt} ${selected ? s.optSelected : ''} tap`} onClick={onClick}>
      <span className={s.optLabel}>{label}</span>
      {hint && <span className={s.optHint}>{hint}</span>}
      <span className={s.check}><Check /></span>
    </button>
  );

  // --- per-step content ---
  let headline: React.ReactNode = null;
  let sub: React.ReactNode = null;
  let body: React.ReactNode = null;

  if (step === 0) {
    headline = <>How often does the<br /><span className={s.it}>snoring show up?</span></>;
    sub = <>No judgment — just the honest baseline. It tells me how much room we have to work with.</>;
    body = (
      <div className={s.options}>
        {([
          ['every-night', 'Just about every night', 'Nightly'],
          ['most-nights', 'Most nights', '4–6 / wk'],
          ['sometimes', 'Some nights', '1–3 / wk'],
          ['rarely', 'Only now and then', 'Rarely'],
        ] as const).map(([val, label, hint]) => (
          <Option
            key={val}
            label={label}
            hint={hint}
            selected={answers.snoreFrequency === val}
            onClick={() => advance({ ...answers, snoreFrequency: val })}
          />
        ))}
      </div>
    );
  }

  if (step === 1) {
    const positions = answers.snorePositions ?? [];
    const toggle = (p: 'back' | 'side' | 'stomach') => {
      const next = positions.includes(p)
        ? positions.filter(x => x !== p)
        : [...positions, p];
      setAnswers({ ...answers, snorePositions: next });
    };
    headline = <>When is it<br /><span className={s.it}>worst?</span></>;
    sub = <>Pick every position that sounds like you. Back-snorers have the most leverage — that's the kind I can quiet fastest.</>;
    body = (
      <div className={s.options}>
        {([
          ['back', 'On my back'],
          ['side', 'On my side'],
          ['stomach', 'On my stomach'],
        ] as const).map(([val, label]) => (
          <Option
            key={val}
            label={label}
            selected={positions.includes(val)}
            onClick={() => toggle(val)}
          />
        ))}
      </div>
    );
  }

  if (step === 2) {
    headline = <>Has it gotten<br /><span className={s.it}>worse lately?</span></>;
    sub = <>Whoever shares your bed usually notices the trend before you do. What have they said?</>;
    body = (
      <div className={s.options}>
        <Option label="Yes — it's gotten louder" hint="Worse" selected={answers.partnerNoticedWorse === true} onClick={() => advance({ ...answers, partnerNoticedWorse: true })} />
        <Option label="No — about the same" hint="Steady" selected={answers.partnerNoticedWorse === false} onClick={() => advance({ ...answers, partnerNoticedWorse: false })} />
      </div>
    );
  }

  if (step === 3) {
    headline = <>How do you feel<br /><span className={s.it}>when you wake up?</span></>;
    sub = <>Snoring and rest are tied together. This tells me whether your nights are actually restoring you.</>;
    body = (
      <div className={s.options}>
        {([
          ['rarely', 'Rarely rested', 'Rarely'],
          ['sometimes', 'Sometimes rested', 'Mixed'],
          ['usually', 'Usually rested', 'Usually'],
        ] as const).map(([val, label, hint]) => (
          <Option
            key={val}
            label={label}
            hint={hint}
            selected={answers.feelsRested === val}
            onClick={() => advance({ ...answers, feelsRested: val })}
          />
        ))}
      </div>
    );
  }

  if (step === 4) {
    headline = <>Have you been<br /><span className={s.it}>diagnosed with apnea?</span></>;
    sub = <>If you have, we work alongside your care — never around it. If not, that's perfectly common.</>;
    body = (
      <div className={s.options}>
        <Option label="Yes, diagnosed" hint="Apnea" selected={answers.diagnosedApnea === true} onClick={() => advance({ ...answers, diagnosedApnea: true })} />
        <Option label="No, not diagnosed" hint="None" selected={answers.diagnosedApnea === false} onClick={() => advance({ ...answers, diagnosedApnea: false })} />
      </div>
    );
  }

  if (step === 5) {
    headline = <>Have you seen a<br /><span className={s.it}>sleep doctor?</span></>;
    sub = <>Either way is fine. It just helps me know where you're starting from.</>;
    body = (
      <div className={s.options}>
        <Option label="Yes, I've seen one" hint="Seen" selected={answers.seenSleepDoc === true} onClick={() => advance({ ...answers, seenSleepDoc: true })} />
        <Option label="No, not yet" hint="Not yet" selected={answers.seenSleepDoc === false} onClick={() => advance({ ...answers, seenSleepDoc: false })} />
      </div>
    );
  }

  if (step === 6) {
    headline = <>Want a referral to<br /><span className={s.it}>a sleep doctor?</span></>;
    sub = <>Most people in your shoes start here with me and do real work without one. But the door's always open if you'd like one.</>;
    body = (
      <div className={s.options}>
        <Option label="Yes, point me to one" hint="Refer" selected={answers.wantsDoctor === true} onClick={() => advance({ ...answers, wantsDoctor: true })} />
        <Option label="No, let's start here" hint="Start" selected={answers.wantsDoctor === false} onClick={() => advance({ ...answers, wantsDoctor: false })} />
      </div>
    );
  }

  // The multi-select step needs an explicit Continue button.
  const isMulti = step === 1;
  const canContinue = (answers.snorePositions?.length ?? 0) > 0;

  return (
    <div className={s.root}>
      {/* night-only papercraft cluster tucked behind the header */}
      <svg viewBox="0 0 340 96" className={s.scene} aria-hidden focusable="false">
        <PaperStar x={26} y={30} scale={0.9} delay={0.4} />
        <PaperStar x={306} y={20} scale={0.8} delay={1.6} />
        <PaperStar x={322} y={56} scale={0.6} delay={2.6} />
        <PaperCloud x={244} y={14} scale={0.7} drift={2} />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 16px', position: 'relative' }}>
        <Wordmark size={19} tone="auto" />
      </div>

      <div className={s.progress}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className={`${s.pip} ${i < step ? s.pipDone : ''} ${i === step ? s.pipActive : ''}`}
          />
        ))}
      </div>

      <div className={s.topRow}>
        {step > 0 ? (
          <button className={`${s.back} tap`} onClick={goBack} aria-label="Back">
            <ChevronLeft /> Back
          </button>
        ) : <span />}
        <span className={s.count}>{step + 1} of {TOTAL_STEPS}</span>
      </div>

      <div className={s.whoLine}>
        <Avatar size={28} />
        <div className={s.name}>Dr. Sommers</div>
      </div>

      <h1 className={s.h}>{headline}</h1>
      <p className={s.sub}>{sub}</p>

      {body}

      {isMulti && (
        <div className={s.foot}>
          <button
            className={`${s.btn} ${s.btnPrimary} tap`}
            disabled={!canContinue}
            onClick={() => advance(answers)}
          >
            <span>Continue <ArrowRight /></span>
          </button>
        </div>
      )}
    </div>
  );
}
