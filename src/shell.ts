// The persistent device shell. Mounts once, hosts every route's content.

import { back, navigate, type ResolvedRoute } from './router';
import { fmtClockHM } from './format';

const SHELL_HTML = `
<div class="device" id="device">
  <div class="screen day" id="screen-root">
    <div class="status-bar" id="status-bar">
      <div class="time" id="status-time">6:42</div>
      <div class="island"></div>
      <div class="right">
        <svg viewBox="0 0 18 12" fill="currentColor" style="width:18px;height:12px;"><rect x="0" y="8" width="3" height="4" rx="0.5"/><rect x="5" y="6" width="3" height="6" rx="0.5"/><rect x="10" y="3" width="3" height="9" rx="0.5"/><rect x="15" y="0" width="3" height="12" rx="0.5"/></svg>
        <svg viewBox="0 0 16 12" fill="currentColor" style="width:15px;height:11px;"><path d="M8 11.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z"/><path d="M8 7.5c1.4 0 2.7.5 3.7 1.4l1.5-1.5A8 8 0 0 0 8 5.3a8 8 0 0 0-5.2 2.1l1.5 1.5A5.4 5.4 0 0 1 8 7.5Z"/><path d="M8 3.6a10.4 10.4 0 0 1 7.4 3l-1.5 1.5A8.4 8.4 0 0 0 8 5.6a8.4 8.4 0 0 0-5.9 2.5L0.6 6.6A10.4 10.4 0 0 1 8 3.6Z"/></svg>
        <svg viewBox="0 0 26 12" fill="none" style="width:24px;height:11px;"><rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="16" height="8" rx="1.5" fill="currentColor"/><rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.4"/></svg>
      </div>
    </div>
    <div id="screen-content"></div>
  </div>
</div>
`;

let styleEl: HTMLStyleElement | null = null;

/** Mount the shell into #app. Returns content root for screens to write into. */
export function mountShell(host: HTMLElement): { content: HTMLElement; screen: HTMLElement; statusTime: HTMLElement } {
  host.innerHTML = SHELL_HTML;
  const screen = host.querySelector('#screen-root') as HTMLElement;
  const content = host.querySelector('#screen-content') as HTMLElement;
  const statusTime = host.querySelector('#status-time') as HTMLElement;
  startClock(statusTime);
  return { screen, content, statusTime };
}

function startClock(el: HTMLElement) {
  const tick = () => { el.textContent = fmtClockHM(new Date()); };
  tick();
  // Update every 30s; tab switch triggers refresh too.
  setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', tick);
}

/**
 * Fetch a screen template, extract its `.screen` content (minus the status bar)
 * and inline styles, and render into the shell.
 */
export async function renderScreen(
  screenName: string,
  theme: 'day' | 'night',
  shell: { screen: HTMLElement; content: HTMLElement }
): Promise<HTMLElement> {
  const html = await fetch(`/screens/${screenName}.html`).then(r => r.text());
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Inject the screen's <style> blocks under one swappable element.
  const styles = Array.from(doc.head.querySelectorAll('style'))
    .map(s => s.textContent || '')
    .join('\n');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'screen-styles';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = styles;

  // Extract content from .screen, dropping the status-bar (shell owns it).
  const sourceScreen = doc.querySelector('.screen');
  if (!sourceScreen) throw new Error(`No .screen in ${screenName}`);
  const sb = sourceScreen.querySelector('.status-bar');
  if (sb) sb.remove();

  // Update theme.
  shell.screen.classList.remove('day', 'night');
  shell.screen.classList.add(theme);

  // Move children (preserves event delegation on parent).
  shell.content.innerHTML = sourceScreen.innerHTML;
  shell.content.dataset.screen = screenName;

  return shell.content;
}

/**
 * Wire global click/keyboard delegation. Lives on document so it survives
 * screen swaps. Tab bar, back/close buttons, and [data-href] all route here.
 */
export function installDelegation(getRoute: () => ResolvedRoute) {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    // Tap-feedback flash
    const flashCandidate = target.closest<HTMLElement>('.tab, .back, .end, .device-pill, .btn, .chip, .rec, .hero, .context, .msg, .stat, .chart-card, .mini, [data-href], .toggle, .ship, .reorder-btn');
    if (flashCandidate) {
      flashCandidate.classList.add('tap-active');
      setTimeout(() => flashCandidate.classList.remove('tap-active'), 140);
    }

    // [data-href]
    const link = target.closest<HTMLElement>('[data-href]');
    if (link) {
      e.preventDefault();
      const href = link.dataset.href!;
      navigate(href);
      return;
    }

    // Tab bar (within current screen)
    const tab = target.closest<HTMLElement>('.tabbar .tab');
    if (tab) {
      e.preventDefault();
      const which = tab.dataset.tab as 'home' | 'trends' | 'chat' | 'profile' | undefined;
      if (which) {
        const path = which === 'home' ? '/'
          : which === 'trends' ? '/trends'
          : which === 'chat' ? '/chat'
          : '/profile';
        navigate(path, { dir: 'fade' });
      }
      return;
    }

    // Back button (header chevron-left). The right-side ".back" with three-dots
    // svg in 04/11 is just a more menu — distinguish by whether it has a chevron path.
    const backEl = target.closest<HTMLElement>('.nav .back, .header .back');
    if (backEl) {
      const svg = backEl.querySelector('svg path');
      const d = svg?.getAttribute('d') || '';
      if (d.includes('m15 6-6 6 6 6')) {
        e.preventDefault();
        back('/');
        return;
      }
    }

    // Close (×) buttons — used for modal-style flows like boil & bite
    const xEl = target.closest<HTMLElement>('.nav .x');
    if (xEl) {
      e.preventDefault();
      back('/');
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target as HTMLElement;
    if (!t) return;
    const link = t.closest<HTMLElement>('[data-href]');
    if (link) {
      e.preventDefault();
      navigate(link.dataset.href!);
    }
  });
}

/** Mark the active tab on the current screen's tab bar. */
export function syncTabBar(active: 'home' | 'trends' | 'chat' | 'profile' | null) {
  const tabs = document.querySelectorAll<HTMLElement>('.tabbar .tab');
  if (tabs.length !== 4) return;
  const labels: ('home' | 'trends' | 'chat' | 'profile')[] = ['home', 'trends', 'chat', 'profile'];
  tabs.forEach((tab, i) => {
    const which = labels[i];
    tab.dataset.tab = which;
    tab.classList.toggle('active', which === active);
  });
}
