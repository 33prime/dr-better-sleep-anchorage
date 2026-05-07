// Boot. Mount the shell, install delegation, react to hash changes.

import { mountShell, renderScreen, installDelegation, syncTabBar } from './shell';
import { onRoute, parseHash, type ResolvedRoute } from './router';
import { hydrate, cleanup } from './screens';
import { installDemoControls } from './demo';
import { store } from './store';
import { shouldUseDarkDashboard } from './format';

let prevScreen: string | undefined;
let prevContent: HTMLElement | null = null;

async function boot() {
  const app = document.getElementById('app')!;
  const shell = mountShell(app);

  installDelegation(parseHash);
  installDemoControls();

  // Hide boot spinner once first screen is mounted.
  let booted = false;

  onRoute(async (resolved) => {
    let route = resolved.route;

    // Auto-pick light/dark dashboard based on time-of-day or user override
    if (route.path === '/') {
      const theme = store.get().uiTheme;
      const dark = theme === 'dark' || (theme === 'auto' && shouldUseDarkDashboard());
      if (dark) {
        route = { ...route, screen: '02-dashboard-dark', theme: 'night' };
      }
    }

    // Onboarding gating: if onboarding is incomplete and the user lands somewhere
    // outside the onboarding flow, send them to triage.
    const s = store.get();
    if (!s.onboarding.complete && !route.path.startsWith('/onboarding') && route.path !== '/') {
      // allow forward — they pressed something. but show toast.
    }

    cleanup(prevScreen, prevContent);

    const content = await renderScreen(route.screen, route.theme, shell);
    syncTabBar(route.activeTab);
    hydrate(route.screen, content, resolved);

    prevScreen = route.screen;
    prevContent = content;

    if (!booted) {
      booted = true;
      const boot = document.getElementById('boot');
      if (boot) {
        boot.classList.add('hide');
        setTimeout(() => boot.remove(), 220);
      }
    }
  });
}

boot().catch((err) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = `<div style="color:#DCE6E2;font-family:monospace;font-size:12px;text-align:center;padding:24px;">Failed to boot.<br/><br/>${String(err)}</div>`;
});
