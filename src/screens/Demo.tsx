import { useLocation } from 'wouter';
import { store, lastNight } from '../store';
import { isoDate, parseIsoDate } from '../utils/format';
import { showToast } from '../components/Toast';
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
    const prior = lastNight(st);
    if (!prior) return;
    const nextDate = parseIsoDate(prior.date);
    nextDate.setDate(nextDate.getDate() + 1);
    const next = {
      ...prior,
      date: isoDate(nextDate),
      totalSnores: Math.max(20, Math.round(prior.totalSnores * (0.85 + Math.random() * 0.2))),
      sleepDurationMin: prior.sleepDurationMin + Math.round((Math.random() - 0.5) * 30),
      efficiency: Math.min(0.98, prior.efficiency + (Math.random() - 0.4) * 0.04),
      deepMin: prior.deepMin + Math.round((Math.random() - 0.5) * 20),
      snoresByHour: prior.snoresByHour.map(v => Math.max(0, Math.round(v * (0.7 + Math.random() * 0.4)))),
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
        <h1 className={s.h}>Demo</h1>
        <p className={s.sub}>Stage the app for a walkthrough. Not part of the shipping product.</p>
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
