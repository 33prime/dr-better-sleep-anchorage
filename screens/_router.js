// Shared in-app router for the Anchorage screens.
// Wires tab bars, back/close buttons, and any [data-href] element to a target screen.
// Uses history.back() when the previous page is same-origin, otherwise the configured fallback.
(function () {
  const file = location.pathname.split('/').pop() || '';

  // Per-screen navigation config. Tab order is [Home, Trends, Chat, Profile];
  // null means "this screen is already that tab — no navigation".
  const config = {
    '01-dashboard-light.html': {
      tabs: [null, '05-trends.html', '04-chat.html', '13-reorder.html'],
    },
    '02-dashboard-dark.html': {
      tabs: [null, '05-trends.html', '04-chat.html', '13-reorder.html'],
    },
    '03-morning-reveal.html': {
      stage: '/',
    },
    '04-chat.html': { back: '/' },
    '05-trends.html': {
      tabs: ['/', null, '04-chat.html', '13-reorder.html'],
    },
    '06-night.html': {},
    '07-onboarding-triage.html': {},
    '08-detailed-night.html': { back: '/' },
    '09-boil-and-bite.html': { back: '07-onboarding-triage.html' },
    '10-device-overview.html': { back: '07-onboarding-triage.html' },
    '11-chat-rich.html': { back: '/' },
    '12-comparisons.html': { back: '05-trends.html' },
    '13-reorder.html': { back: '/' },
    '14-science.html': { back: '05-trends.html' },
  };

  const cfg = config[file] || {};

  function go(href, opts) {
    if (opts && opts.useHistory) {
      try {
        const ref = document.referrer && new URL(document.referrer);
        if (ref && ref.host === location.host && ref.pathname !== location.pathname) {
          history.back();
          return;
        }
      } catch (_) {}
    }
    location.href = href;
  }

  function wire(el, href, opts) {
    if (!el) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', function (e) {
      if (e.defaultPrevented) return;
      e.preventDefault();
      go(href, opts);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go(href, opts);
      }
    });
  }

  // Tab bar: 4 tabs in fixed order.
  const tabs = document.querySelectorAll('.tabbar .tab');
  if (cfg.tabs && tabs.length === 4) {
    tabs.forEach(function (tab, i) {
      const dest = cfg.tabs[i];
      if (dest) wire(tab, dest);
    });
  }

  // Back buttons (chevron-left in .nav .back, .header .back) and close (.nav .x).
  if (cfg.back) {
    // Only the *first* .header .back is the back arrow (some screens use the same class for the right-side menu icon).
    const headerBack = document.querySelector('.header .back, .nav .back');
    wire(headerBack, cfg.back, { useHistory: true });
    document.querySelectorAll('.nav .x').forEach(function (x) {
      wire(x, cfg.back, { useHistory: true });
    });
  }

  // Whole-stage tap (used by 03 morning reveal to advance to the dashboard).
  if (cfg.stage) {
    const stage = document.querySelector('.stage');
    if (stage) {
      stage.style.cursor = 'pointer';
      stage.addEventListener('click', function (e) {
        // Don't hijack the REPLAY button or any explicit links inside.
        if (e.target.closest('[data-href], a, button, .replay')) return;
        go(cfg.stage);
      });
    }
  }

  // Generic [data-href] elements anywhere in the screen.
  document.querySelectorAll('[data-href]').forEach(function (el) {
    wire(el, el.dataset.href);
  });
})();
