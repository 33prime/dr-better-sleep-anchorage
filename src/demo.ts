// Demo control panel — hidden gear icon, expands to a settings sheet.

import { store } from './store';
import { showToast } from './toast';
import { navigate } from './router';
import { isoDate } from './format';
import { lastNight } from './store';

const PANEL_HTML = `
  <h3>Demo controls</h3>
  <button id="demo-simulate-night">Simulate a new night<span class="hint">→ /morning</span></button>
  <button id="demo-jump-night">Jump to live tracking<span class="hint">→ /night</span></button>
  <button id="demo-trigger-onboarding">Replay onboarding<span class="hint">→ /onboarding</span></button>
  <button id="demo-reset">Reset all data<span class="hint">starts fresh</span></button>

  <div class="label-mono">Theme</div>
  <div class="row">
    <button id="demo-theme-auto">Auto</button>
    <button id="demo-theme-light">Light</button>
    <button id="demo-theme-dark">Dark</button>
  </div>

  <div class="label-mono">Quick jump</div>
  <div class="row">
    <button data-go="/">Home</button>
    <button data-go="/trends">Trends</button>
    <button data-go="/chat">Chat</button>
  </div>
  <div class="row">
    <button data-go="/profile">Profile</button>
    <button data-go="/trends/science">Science</button>
    <button data-go="/onboarding/device">Device</button>
  </div>
`;

export function installDemoControls() {
  const fab = document.getElementById('demo-fab') as HTMLElement;
  const panel = document.getElementById('demo-panel') as HTMLElement;
  if (!fab || !panel) return;
  panel.innerHTML = PANEL_HTML;

  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target as Node) && e.target !== fab) {
      panel.classList.remove('open');
    }
  });

  panel.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const id = btn.id;
    const go = btn.dataset.go;
    if (go) {
      navigate(go);
      panel.classList.remove('open');
      return;
    }
    switch (id) {
      case 'demo-simulate-night': simulateNight(); break;
      case 'demo-jump-night':     navigate('/night', { dir: 'up' }); break;
      case 'demo-trigger-onboarding': replayOnboarding(); break;
      case 'demo-reset':          resetAll(); break;
      case 'demo-theme-auto':     setTheme('auto'); break;
      case 'demo-theme-light':    setTheme('light'); break;
      case 'demo-theme-dark':     setTheme('dark'); break;
    }
    panel.classList.remove('open');
  });
}

function simulateNight() {
  const s = store.get();
  const prior = lastNight(s);
  if (!prior) return;
  const today = new Date();
  const newNight = {
    ...prior,
    date: isoDate(today),
    totalSnores: Math.max(20, Math.round(prior.totalSnores * (0.85 + Math.random() * 0.2))),
    sleepDurationMin: prior.sleepDurationMin + Math.round((Math.random() - 0.5) * 30),
    efficiency: Math.min(0.98, prior.efficiency + (Math.random() - 0.4) * 0.04),
    deepMin: prior.deepMin + Math.round((Math.random() - 0.5) * 20),
    snoresByHour: prior.snoresByHour.map(v => Math.max(0, Math.round(v * (0.7 + Math.random() * 0.4)))),
  };
  store.set(s2 => {
    s2.nights.push(newNight);
    if (s2.nights.length > 90) s2.nights = s2.nights.slice(-90);
  });
  showToast('New night logged.');
  navigate('/morning', { dir: 'fade' });
}

function replayOnboarding() {
  store.set(s => { s.onboarding = { complete: false, step: 0, answers: {}, boilStep: 0, boilCompleted: false }; });
  navigate('/onboarding', { dir: 'fade' });
  showToast('Onboarding restarted.');
}

function resetAll() {
  store.reset();
  showToast('Reset to seed state.');
  navigate('/', { dir: 'fade' });
  // Force full re-render
  setTimeout(() => location.reload(), 300);
}

function setTheme(theme: 'auto' | 'light' | 'dark') {
  store.set(s => { s.uiTheme = theme; });
  showToast(`Theme: ${theme}`);
  // Re-trigger router to apply
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
