import { useLocation } from 'wouter';
import { store, lastNight } from '../store';
import { isoDate, parseIsoDate } from '../utils/format';
import { showToast } from '../components/Toast';
import { HeroScene, PaperMoon, PaperStar } from '../components/paper/PaperScene';
import s from './Demo.module.css';

const QUICK_JUMPS: Array<[string, string]> = [
  ['Home', '/'],
  ['Trends', '/trends'],
  ['Chat', '/chat'],
  ['Rich chat', '/chat/rich'],
  ['The science', '/trends/science'],
  ['Comparisons', '/trends/compare'],
  ['Morning', '/morning'],
  ['Detailed night', '/night/today'],
  ['Device', '/onboarding/device'],
  ['Boil & bite', '/onboarding/setup'],
  ['Reorder', '/reorder'],
  ['Profile', '/profile'],
];

export function Demo() {
  const [, navigate] = useLocation();

  const simulateNight = () => {
    const st = store.get();
    // Never fabricate data into a real signed-in account — this staging
    // tool is for the local-demo persona only. See PLAN.md non-negotiable:
    // "No fabricated data written as source='recorded'".
    if (st.mode === 'account') {
      showToast("Can't simulate on a signed-in account — sign out first.");
      return;
    }
    const prior = lastNight(st);
    if (!prior) return;
    const nextDate = parseIsoDate(prior.date);
    nextDate.setDate(nextDate.getDate() + 1);
    // Dev-only simulator — only extrapolates wearable fields (efficiency,
    // deepMin) when the prior night actually had them (seed/demo nights).
    // A real recorded night has no wearable data, so the simulated night
    // that follows it shouldn't invent any either.
    const next = {
      ...prior,
      date: isoDate(nextDate),
      totalSnores: Math.max(20, Math.round(prior.totalSnores * (0.85 + Math.random() * 0.2))),
      sleepDurationMin: prior.sleepDurationMin + Math.round((Math.random() - 0.5) * 30),
      efficiency: typeof prior.efficiency === 'number'
        ? Math.min(0.98, prior.efficiency + (Math.random() - 0.4) * 0.04)
        : undefined,
      deepMin: typeof prior.deepMin === 'number'
        ? prior.deepMin + Math.round((Math.random() - 0.5) * 20)
        : undefined,
      snoresByHour: prior.snoresByHour.map(v => Math.max(0, Math.round(v * (0.7 + Math.random() * 0.4)))),
      // Fabricated, not measured — must never carry 'recorded' (or any
      // source it happened to inherit from `prior`). 'manual' is the closest
      // existing tag for "not from the mic pipeline".
      source: 'manual' as const,
    };
    store.set(s2 => {
      s2.nights.push(next);
      if (s2.nights.length > 90) s2.nights = s2.nights.slice(-90);
    });
    showToast('New night logged.');
    navigate('/morning');
  };

  const replayOnboarding = () => {
    store.set(s2 => { s2.onboarding = { complete: false, step: 0, answers: {}, boilStep: 0, boilCompleted: false }; });
    showToast('Onboarding restarted.');
    navigate('/onboarding');
  };

  const resetAll = () => {
    store.reset();
    showToast('Reset to seed state.');
    navigate('/');
  };

  return (
    <div className={s.root}>
      <div className={s.header}>
        <svg viewBox="0 0 393 90" className={s.headerScene} aria-hidden focusable="false">
          <PaperStar x={296} y={22} scale={0.8} delay={0.8} />
          <PaperMoon x={330} y={16} scale={2} />
          <PaperStar x={378} y={58} scale={0.7} delay={2.4} />
        </svg>
        <h1 className={s.h}>Demo</h1>
        <p className={s.sub}>Stage the app for a walkthrough. Not part of the shipping product.</p>
      </div>

      {/* horizon ridge divider — the bottom band of the hero scene */}
      <div className={s.ridge} aria-hidden>
        <HeroScene style={{ height: 150, marginTop: -84 }} />
      </div>

      <div className={s.sectionLabel}>Scenarios</div>
      <div className={s.group}>
        <button className={`${s.action} tap`} onClick={simulateNight}>
          <span>Simulate a new night</span><span className={s.tagOk}>→ Morning</span>
        </button>
        <button className={`${s.action} tap`} onClick={() => navigate('/night')}>
          <span>Jump to live tracking</span><span className={s.tagOk}>Mic</span>
        </button>
        <button className={`${s.action} tap`} onClick={replayOnboarding}>
          <span>Replay onboarding</span><span className={s.tagOk}>Setup</span>
        </button>
        <button className={`${s.action} tap`} onClick={resetAll}>
          <span>Reset all data</span><span className={s.tagWarn}>Seed</span>
        </button>
      </div>

      <div className={s.sectionLabel}>Quick jump</div>
      <div className={s.grid}>
        {QUICK_JUMPS.map(([label, path]) => (
          <button key={path} className={`${s.chip} tap`} onClick={() => navigate(path)}>{label}</button>
        ))}
      </div>

      <div className={s.scrollPad} />
    </div>
  );
}
