import { useState } from 'react';
import { useLocation } from 'wouter';
import { store, lastNight } from '../store';
import { isoDate } from '../utils/format';
import { showToast } from './Toast';
import { Cog } from './icons';

export function DemoControls() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const simulateNight = () => {
    const s = store.get();
    const prior = lastNight(s);
    if (!prior) return;
    const today = new Date();
    const next = {
      ...prior,
      date: isoDate(today),
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
    setOpen(false);
  };

  const replayOnboarding = () => {
    store.set(s2 => { s2.onboarding = { complete: false, step: 0, answers: {}, boilStep: 0, boilCompleted: false }; });
    navigate('/onboarding');
    showToast('Onboarding restarted.');
    setOpen(false);
  };

  const resetAll = () => {
    store.reset();
    showToast('Reset to seed state.');
    navigate('/');
    setOpen(false);
  };

  const setTheme = (t: 'auto' | 'light' | 'dark') => {
    store.set(s => { s.uiTheme = t; });
    showToast(`Theme: ${t}`);
    setOpen(false);
  };

  const goTo = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <>
      <button
        className="demo-fab"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="Demo controls"
      >
        <Cog />
      </button>
      {open && (
        <div className="demo-panel" onClick={(e) => e.stopPropagation()}>
          <h3>Demo controls</h3>
          <button onClick={simulateNight}>Simulate a new night</button>
          <button onClick={() => goTo('/night')}>Jump to live tracking</button>
          <button onClick={replayOnboarding}>Replay onboarding</button>
          <button onClick={resetAll}>Reset all data</button>

          <div className="label-mono">Theme</div>
          <div className="row">
            <button onClick={() => setTheme('auto')}>Auto</button>
            <button onClick={() => setTheme('light')}>Light</button>
            <button onClick={() => setTheme('dark')}>Dark</button>
          </div>

          <div className="label-mono">Quick jump</div>
          <div className="row">
            <button onClick={() => goTo('/')}>Home</button>
            <button onClick={() => goTo('/trends')}>Trends</button>
            <button onClick={() => goTo('/chat')}>Chat</button>
          </div>
          <div className="row">
            <button onClick={() => goTo('/profile')}>Profile</button>
            <button onClick={() => goTo('/trends/science')}>Science</button>
            <button onClick={() => goTo('/onboarding/device')}>Device</button>
          </div>
        </div>
      )}
    </>
  );
}
