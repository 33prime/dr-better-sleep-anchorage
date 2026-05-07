// Hash-based router with view-transition direction tracking.

export type Route = {
  path: string;            // pattern with optional :params
  screen: string;          // file in /screens/
  showTabBar: boolean;
  activeTab: 'home' | 'trends' | 'chat' | 'profile' | null;
  theme: 'day' | 'night';
};

export const ROUTES: Route[] = [
  { path: '/',                 screen: '01-dashboard-light',  showTabBar: true,  activeTab: 'home',    theme: 'day'   },
  { path: '/dashboard/dark',   screen: '02-dashboard-dark',   showTabBar: true,  activeTab: 'home',    theme: 'night' },
  { path: '/morning',          screen: '03-morning-reveal',   showTabBar: false, activeTab: null,      theme: 'day'   },
  { path: '/chat',             screen: '04-chat',             showTabBar: false, activeTab: 'chat',    theme: 'day'   },
  { path: '/chat/rich',        screen: '11-chat-rich',        showTabBar: false, activeTab: 'chat',    theme: 'day'   },
  { path: '/trends',           screen: '05-trends',           showTabBar: true,  activeTab: 'trends',  theme: 'day'   },
  { path: '/trends/compare',   screen: '12-comparisons',      showTabBar: false, activeTab: 'trends',  theme: 'day'   },
  { path: '/trends/science',   screen: '14-science',          showTabBar: false, activeTab: 'trends',  theme: 'day'   },
  { path: '/night',            screen: '06-night',            showTabBar: false, activeTab: null,      theme: 'night' },
  { path: '/night/:date',      screen: '08-detailed-night',   showTabBar: false, activeTab: 'home',    theme: 'day'   },
  { path: '/onboarding',       screen: '07-onboarding-triage',showTabBar: false, activeTab: null,      theme: 'day'   },
  { path: '/onboarding/setup', screen: '09-boil-and-bite',    showTabBar: false, activeTab: null,      theme: 'day'   },
  { path: '/onboarding/device',screen: '10-device-overview',  showTabBar: false, activeTab: null,      theme: 'day'   },
  { path: '/profile',          screen: '13-reorder',          showTabBar: true,  activeTab: 'profile', theme: 'day'   },
];

export interface ResolvedRoute {
  route: Route;
  params: Record<string, string>;
  hash: string;
}

export function parseHash(): ResolvedRoute {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  for (const route of ROUTES) {
    const tplSegments = route.path.split('/').filter(Boolean);
    if (tplSegments.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < tplSegments.length; i++) {
      const t = tplSegments[i];
      const s = segments[i];
      if (t.startsWith(':')) params[t.slice(1)] = s;
      else if (t !== s) { ok = false; break; }
    }
    if (ok) return { route, params, hash: pathPart };
  }
  // Fallback to dashboard.
  return { route: ROUTES[0], params: {}, hash: '/' };
}

export type Direction = 'forward' | 'back' | 'up' | 'fade';

export interface NavOptions {
  replace?: boolean;
  dir?: Direction;
}

const history: string[] = [];

export function navigate(target: string, opts: NavOptions = {}): void {
  const dir: Direction = opts.dir ?? 'forward';
  const newHash = '#' + (target.startsWith('/') ? target : `/${target}`);
  if (location.hash === newHash) return;
  document.documentElement.dataset.vtDir = dir;

  const apply = () => {
    if (opts.replace) location.replace(newHash);
    else location.hash = newHash;
  };

  const startVt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (typeof startVt === 'function') {
    startVt.call(document, apply);
  } else {
    apply();
  }

  if (!opts.replace) history.push(newHash);
}

export function back(fallback: string = '/'): void {
  document.documentElement.dataset.vtDir = 'back';
  if (history.length > 1) {
    history.pop();
    const prev = history[history.length - 1] ?? fallback;
    const startVt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (typeof startVt === 'function') {
      startVt.call(document, () => { location.hash = prev; });
    } else {
      location.hash = prev;
    }
  } else {
    navigate(fallback, { dir: 'back' });
  }
}

export function onRoute(handler: (r: ResolvedRoute) => void | Promise<void>): void {
  const fire = () => { void handler(parseHash()); };
  window.addEventListener('hashchange', fire);
  // Fire once at boot.
  queueMicrotask(fire);
}
