// Per-screen hydration. Each function runs after the screen's HTML is rendered
// into #screen-content. It mutates the DOM so the static template reflects
// real store state and live interactivity.

import { store, lastNight, baselineSnores, streakNights, daysSince, findNight } from './store';
import {
  fmtClockHM, fmtDateLong, fmtDuration, fmtPct, isoDate, parseIsoDate,
  fmtDelta, timeOfDayGreeting, pad2,
} from './format';
import type { ResolvedRoute } from './router';
import { navigate } from './router';
import { pickReply } from './replies';
import { spark } from './charts';
import { showToast } from './toast';
import { tickNumber, drawPath, installPullToRefresh } from './animate';

type Hydrator = (root: HTMLElement, route: ResolvedRoute) => void | Promise<void>;

// ============================================================
// 01 — Dashboard light
// 02 — Dashboard dark (same hydrator, theme set by router)
// ============================================================

const dashboard: Hydrator = (root) => {
  const s = store.get();
  const last = lastNight(s);
  if (!last) return;
  const baseline = baselineSnores(s);

  const greeting = root.querySelector('.greeting h1');
  if (greeting) {
    greeting.innerHTML = `${timeOfDayGreeting()} <span class="name">${escapeHtml(s.user.name)}.</span>`;
  }
  setText(root, '.greeting .date', fmtDateLong(new Date()).toUpperCase());

  // Hero number + delta — animate the number on entry
  tickNumber(root.querySelector('.hero .num'), String(last.totalSnores), 700);
  const delta = fmtDelta(last.totalSnores, baseline);
  const deltaEl = root.querySelector<HTMLElement>('.hero .delta');
  if (deltaEl) {
    deltaEl.innerHTML = `
      <span class="arrow">${delta.sign}</span>
      <span>${delta.pct}</span>
      <span class="from">from baseline</span>
    `;
  }

  // Sparkline — last 14 nights of snore counts
  const last14 = s.nights.slice(-14).map(n => n.totalSnores);
  const sparkSvg = root.querySelector<SVGSVGElement>('.hero .spark');
  if (sparkSvg && last14.length > 1) {
    const { width, height } = svgViewBox(sparkSvg, 360, 36);
    const max = Math.max(...last14);
    const points = last14.map((v, i) => {
      const x = (i / (last14.length - 1)) * width;
      const y = height - 8 - (v / max) * (height - 16);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const polyline = sparkSvg.querySelector('polyline');
    if (polyline) polyline.setAttribute('points', points.join(' '));
    const areaPath = sparkSvg.querySelector('path');
    if (areaPath) {
      const d = `M${points[0]} L${points.slice(1).join(' L')} L${width},${height} L0,${height} Z`;
      areaPath.setAttribute('d', d);
    }
    const lastDot = sparkSvg.querySelector('circle');
    if (lastDot) {
      const [lx, ly] = points[points.length - 1].split(',');
      lastDot.setAttribute('cx', lx);
      lastDot.setAttribute('cy', ly);
    }
    // Draw the line in
    const polylineEl = sparkSvg.querySelector('polyline') as SVGPolylineElement | null;
    drawPath(polylineEl, 900);
  }

  // Status row — also animate
  tickNumber(root.querySelector('.status-row .stat:nth-child(1) .v'), fmtDuration(last.sleepDurationMin), 600);
  tickNumber(root.querySelector('.status-row .stat:nth-child(2) .v'), `${Math.round(last.efficiency * 100)}%`, 600);
  tickNumber(root.querySelector('.status-row .stat:nth-child(3) .v'), String(streakNights(s)), 600);

  // Active context
  setText(root, '.context .copy', '');
  const ctxCopy = root.querySelector<HTMLElement>('.context .copy');
  if (ctxCopy) {
    ctxCopy.innerHTML = `Day ${daysSince(s.device.fittedAt)} of <strong>strap position ${s.device.strapPosition}</strong>. I'll check in tomorrow morning.`;
  }

  // Hero → detailed night for this date
  const hero = root.querySelector<HTMLElement>('.hero');
  if (hero) hero.dataset.href = `/night/${last.date}`;

  // Latest agent message preview
  const lastThemMsg = [...s.chat].reverse().find(m => m.who === 'them' && m.text);
  const msgBubble = root.querySelector<HTMLElement>('.msg .bubble .text');
  if (msgBubble && lastThemMsg?.text) {
    msgBubble.textContent = lastThemMsg.text;
  }

  // Pull-to-refresh on the scroll container — simulates a new night.
  const content = root.querySelector<HTMLElement>('.content');
  if (content) {
    installPullToRefresh(content, () => {
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
      navigate('/morning', { dir: 'fade' });
    });
  }
};

// ============================================================
// 03 — Morning reveal
// ============================================================

const morningReveal: Hydrator = (root) => {
  const s = store.get();
  const last = lastNight(s);
  if (!last) return;

  setText(root, '.eyebrow', `${fmtDateLong(parseIsoDate(last.date))} · 6:42 AM`);
  setText(root, '.headline', '');
  const headline = root.querySelector<HTMLElement>('.headline');
  if (headline) headline.innerHTML = `A quiet night,<br/><span class="it">${escapeHtml(s.user.name)}.</span>`;

  // Numbers
  setNum(root, '.num-cell.n1 .ticker', String(last.totalSnores));
  setNum(root, '.num-cell.n2 .ticker', fmtDuration(last.sleepDurationMin));
  setNum(root, '.num-cell.n3 .ticker', fmtDuration(last.deepMin));
  setNum(root, '.num-cell.n4 .ticker', String(last.restingHr));

  // Footer "Day N"
  setText(root, '.footer .mono', `DAY ${daysSince(s.device.fittedAt)}`);

  // CTA → detailed night
  const cta = root.querySelector<HTMLElement>('.cta');
  if (cta) cta.dataset.href = `/night/${last.date}`;

  // Replay button
  const replay = root.querySelector<HTMLElement>('.replay');
  replay?.addEventListener('click', () => {
    const screen = root.closest<HTMLElement>('.screen');
    const stage = root.querySelector<HTMLElement>('.stage');
    if (!screen || !stage) return;
    screen.style.animation = 'none';
    stage.style.display = 'none';
    void screen.offsetWidth;
    screen.style.animation = '';
    stage.style.display = '';
  });
};

// ============================================================
// 04 — Chat
// ============================================================

const chat: Hydrator = (root) => {
  const convo = root.querySelector<HTMLElement>('.convo');
  if (!convo) return;
  convo.innerHTML = '';

  const dayRule = document.createElement('div');
  dayRule.className = 'day-rule';
  dayRule.textContent = '— Today —';
  convo.appendChild(dayRule);

  const renderMessages = () => {
    convo.querySelectorAll('.row, .ts, .typing-row').forEach(el => el.remove());
    const s = store.get();
    s.chat.forEach((msg, i) => {
      if (msg.who === 'them') {
        const row = document.createElement('div');
        row.className = 'row them';
        row.innerHTML = `
          <div class="av"></div>
          <div class="stack">
            ${msg.text ? `<div class="bubble them solo">${linkifyEm(escapeHtml(msg.text))}</div>` : ''}
            ${msg.card ? renderCard(msg.card) : ''}
          </div>
        `;
        convo.appendChild(row);
      } else {
        const row = document.createElement('div');
        row.className = 'row me';
        row.innerHTML = `<div class="bubble me">${escapeHtml(msg.text || '')}</div>`;
        convo.appendChild(row);
      }
      // Insert timestamp every few messages.
      if (i === s.chat.length - 1) {
        const t = new Date(msg.ts);
        const ts = document.createElement('div');
        ts.className = 'ts';
        ts.textContent = fmtClockHM(t);
        convo.appendChild(ts);
      }
    });
    convo.scrollTop = convo.scrollHeight;
  };
  renderMessages();

  // Composer
  const composer = root.querySelector<HTMLElement>('.composer');
  if (composer) {
    composer.innerHTML = `
      <div class="field" style="padding: 0 16px;">
        <input class="field-input" type="text" placeholder="Ask Dr. Sommers…" autocomplete="off"
               style="flex:1; background: transparent; border: 0; outline: none; font: inherit;
                      color: var(--text-primary); padding: 11px 0; min-width: 0;" />
      </div>
      <div class="send" role="button" tabindex="0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </div>
    `;
    const input = composer.querySelector<HTMLInputElement>('.field-input')!;
    const send = composer.querySelector<HTMLElement>('.send')!;
    const fire = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const userMsg = { id: `m${Date.now()}`, who: 'me' as const, text, ts: Date.now() };
      store.set(s => { s.chat.push(userMsg); });
      renderMessages();
      // Typing indicator + delayed reply
      addTypingRow(convo);
      setTimeout(() => {
        removeTypingRow(convo);
        const reply = pickReply(text);
        store.set(s => { s.chat.push({ id: `m${Date.now()}`, who: 'them', text: reply, ts: Date.now() }); });
        renderMessages();
      }, 900 + Math.random() * 700);
    };
    send.addEventListener('click', fire);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
    input.focus();
  }
};

function renderCard(card: any): string {
  if (card.kind === 'snore-summary') {
    return `
      <div class="card">
        <div class="k">Snores · ${escapeHtml(card.date)}</div>
        <div class="row2">
          <div class="v">${card.total}</div>
          <div class="u">vs. ${card.baseline} baseline</div>
        </div>
        <div class="delta">↓ ${Math.round((1 - card.total / card.baseline) * 100)}%</div>
      </div>
    `;
  }
  return '';
}

function addTypingRow(convo: HTMLElement) {
  const row = document.createElement('div');
  row.className = 'row them typing-row';
  row.innerHTML = `
    <div class="av-spacer"></div>
    <div class="typing"><span></span><span></span><span></span></div>
  `;
  convo.appendChild(row);
  convo.scrollTop = convo.scrollHeight;
}
function removeTypingRow(convo: HTMLElement) {
  convo.querySelector('.typing-row')?.remove();
}

// ============================================================
// 05 — Trends
// ============================================================

const trends: Hydrator = (root) => {
  const s = store.get();

  // Range chips
  const tabs = root.querySelectorAll<HTMLElement>('.tabs .t');
  tabs.forEach(t => t.dataset.range = t.textContent?.trim() || '');
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      const range = t.dataset.range || '30d';
      renderRange(range);
    });
  });

  const renderRange = (range: string) => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : s.nights.length;
    const slice = s.nights.slice(-days);
    if (slice.length === 0) return;
    const avg = slice.reduce((a, n) => a + n.totalSnores, 0) / slice.length;
    const monthStart = slice[0].totalSnores;
    setText(root, '.chart-card .num-row .big', String(Math.round(avg)));
    const deltaEl = root.querySelector<HTMLElement>('.chart-card .num-row .delta');
    if (deltaEl) {
      const d = fmtDelta(slice[slice.length - 1].totalSnores, monthStart);
      deltaEl.innerHTML = `${d.sign} ${d.pct} <span class="from">vs. range start</span>`;
    }

    // Hero chart polyline + area
    const svg = root.querySelector<SVGSVGElement>('.chart-card .chart-svg');
    if (svg) {
      const { width, height } = svgViewBox(svg, 360, 180);
      const values = slice.map(n => n.totalSnores);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const range2 = Math.max(1, max - min);
      const points = values.map((v, i) => {
        const x = values.length > 1 ? (i / (values.length - 1)) * width : 0;
        const y = 28 + (height - 56) * (1 - (max - v) / range2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const polyline = svg.querySelectorAll('polyline')[0];
      if (polyline) polyline.setAttribute('points', points.join(' '));
      const areaPath = svg.querySelectorAll('path')[0];
      if (areaPath) {
        const d = `M${points[0]} L${points.slice(1).join(' L')} L${width},${height} L0,${height} Z`;
        areaPath.setAttribute('d', d);
      }
      // 7d MA line
      const movavgPath = svg.querySelectorAll('path')[1];
      if (movavgPath && values.length >= 7) {
        const ma: number[] = [];
        for (let i = 0; i < values.length; i++) {
          const window = values.slice(Math.max(0, i - 6), i + 1);
          ma.push(window.reduce((a, b) => a + b, 0) / window.length);
        }
        const maPoints = ma.map((v, i) => {
          const x = (i / (ma.length - 1)) * width;
          const y = 28 + (height - 56) * (1 - (max - v) / range2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        movavgPath.setAttribute('d', `M${maPoints.join(' L')}`);
      }
      // last point dot
      const lastDot = svg.querySelectorAll('circle');
      if (lastDot.length > 0) {
        const last = points[points.length - 1].split(',');
        const dot = lastDot[lastDot.length - 1];
        dot.setAttribute('cx', last[0]);
        dot.setAttribute('cy', last[1]);
      }
    }

    // X-axis labels
    const xs = root.querySelectorAll<HTMLElement>('.x-axis span');
    if (xs.length === 3 && slice.length > 0) {
      xs[0].textContent = fmtDateAxis(parseIsoDate(slice[0].date));
      xs[1].textContent = fmtDateAxis(parseIsoDate(slice[Math.floor(slice.length / 2)].date));
      xs[2].textContent = fmtDateAxis(parseIsoDate(slice[slice.length - 1].date));
    }
  };

  renderRange('30d');

  // Mini cards
  const last = lastNight(s);
  if (last) {
    setText(root, '.mini-grid .mini:nth-child(1) .v', `${Math.round(last.efficiency * 100)}`);
    setText(root, '.mini-grid .mini:nth-child(2) .v', String(last.hrv));
    setText(root, '.mini-grid .mini:nth-child(3) .v', String(last.restingHr));
  }
};

function fmtDateAxis(d: Date): string {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// ============================================================
// 06 — Night live tracking
// ============================================================

const night: Hydrator = (root) => {
  const s = store.get();

  // Start tracking if not yet
  if (!s.liveNight?.tracking) {
    store.set(s2 => { s2.liveNight = { tracking: true, startedAt: Date.now() - 3600_000 * 4 - 21 * 60_000 }; });
  }

  const stop = root.querySelector<HTMLElement>('.end');
  stop?.addEventListener('click', () => endNight());

  const clockEl = root.querySelector<HTMLElement>('.clock');
  const capEl = root.querySelector<HTMLElement>('.clock-cap');
  const update = () => {
    const live = store.get().liveNight;
    if (!live?.startedAt) return;
    const elapsed = Date.now() - live.startedAt;
    const h = Math.floor(elapsed / 3_600_000);
    const m = Math.floor((elapsed % 3_600_000) / 60_000);
    if (clockEl) clockEl.textContent = `${pad2(h)}:${pad2(m)}`;
    if (capEl) {
      const start = new Date(live.startedAt);
      capEl.textContent = `Asleep · Since ${start.getHours() % 12 || 12}:${pad2(start.getMinutes())} ${start.getHours() >= 12 ? 'pm' : 'am'}`;
    }
  };
  update();
  const tick = setInterval(update, 30_000);
  // Cleanup: stash on the root so route change can clear it
  (root as any).__nightTick = tick;
};

function endNight() {
  // Generate a new night entry based on slight variation of prior, append, navigate.
  const s = store.get();
  const prior = lastNight(s);
  const today = new Date();
  const newNight = {
    ...prior,
    date: isoDate(today),
    totalSnores: Math.max(20, Math.round(prior.totalSnores * (0.85 + Math.random() * 0.2))),
    sleepDurationMin: prior.sleepDurationMin + Math.round((Math.random() - 0.5) * 30),
    efficiency: Math.min(0.98, prior.efficiency + (Math.random() - 0.4) * 0.04),
    deepMin: prior.deepMin + Math.round((Math.random() - 0.5) * 20),
    snoresByHour: prior.snoresByHour.map(v => Math.max(0, Math.round(v * (0.7 + Math.random() * 0.4)))),
    startedAt: '23:14',
    endedAt: fmtClockHM(new Date()),
  };
  store.set(s2 => {
    s2.nights.push(newNight);
    if (s2.nights.length > 90) s2.nights = s2.nights.slice(-90);
    s2.liveNight = null;
  });
  navigate('/morning', { dir: 'fade' });
}

// ============================================================
// 07 — Onboarding triage
// ============================================================

const onboardingTriage: Hydrator = (root) => {
  const s = store.get();

  // Wire CTAs
  const primary = root.querySelector<HTMLElement>('.btn.primary');
  if (primary) primary.dataset.href = '/onboarding/setup';
  const ghost = root.querySelector<HTMLElement>('.btn.ghost');
  if (ghost) ghost.dataset.href = '/onboarding/device';

  // Personalize headline
  const h1 = root.querySelector<HTMLElement>('h1');
  if (h1) h1.innerHTML = `Here's what I picked up,<br/><span class="it">${escapeHtml(s.user.name)}.</span>`;
};

// ============================================================
// 08 — Detailed night
// ============================================================

const detailedNight: Hydrator = (root, route) => {
  const s = store.get();
  const param = route.params.date;
  const date = !param || param === 'today' ? lastNight(s)?.date : param;
  const n = date ? findNight(s, date) : lastNight(s);
  if (!n) return;

  const d = parseIsoDate(n.date);
  const prevDay = new Date(d); prevDay.setDate(d.getDate() - 1);
  const dayShort = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  setText(root, '.head .label-mono', `${dayShort[prevDay.getDay()]} → ${dayShort[d.getDay()]} · ${formatNarrowTime(n.startedAt)} – ${formatNarrowTime(n.endedAt)}`);
  setText(root, '.head .sub', `${fmtDuration(n.sleepDurationMin + n.awakeMin)} in bed · ${fmtDuration(n.sleepDurationMin)} asleep · device worn the full night`);

  setText(root, '.hero .num', String(n.totalSnores));
  const baseline = baselineSnores(s);
  const delta = fmtDelta(n.totalSnores, baseline);
  setText(root, '.hero .delta', `${delta.sign} ${delta.pct}`);

  setText(root, '.hyp .row .total', fmtDuration(n.sleepDurationMin));
  setText(root, '.hyp-legend .l:nth-child(1) .v', fmtDuration(n.deepMin));
  setText(root, '.hyp-legend .l:nth-child(2) .v', fmtDuration(n.remMin));
  setText(root, '.hyp-legend .l:nth-child(3) .v', fmtDuration(n.lightMin));
  setText(root, '.hyp-legend .l:nth-child(4) .v', fmtDuration(n.awakeMin));

  setText(root, '.section:nth-child(4) .meta-mono', `${n.totalSnores} events · ${n.peakDb} dB peak`);

  // Position breakdown
  const totalMin = n.positions.side_left + n.positions.side_right + n.positions.back + n.positions.stomach;
  const positions = [
    { sel: 1, mins: n.positions.side_left, snores: n.positionSnores.side_left },
    { sel: 2, mins: n.positions.side_right, snores: n.positionSnores.side_right },
    { sel: 3, mins: n.positions.back, snores: n.positionSnores.back },
    { sel: 4, mins: n.positions.stomach, snores: n.positionSnores.stomach },
  ];
  positions.forEach(p => {
    const card = root.querySelector<HTMLElement>(`.pos-grid .pos:nth-child(${p.sel})`);
    if (!card) return;
    setText(card, '.v', fmtDuration(p.mins));
    const pct = totalMin > 0 ? Math.round((p.mins / totalMin) * 100) : 0;
    setText(card, '.pct', `${pct}% · ${p.snores} snore${p.snores === 1 ? '' : 's'}`);
    const bar = card.querySelector<HTMLElement>('.bar > div');
    if (bar) bar.style.width = `${pct}%`;
  });

  // Snore intensity bars — redraw from data
  const intensitySvg = root.querySelector<SVGSVGElement>('.snore-card svg');
  if (intensitySvg) {
    const { width: vbW } = svgViewBox(intensitySvg, 360, 110);
    const bars = Array.from(intensitySvg.querySelectorAll<SVGRectElement>('g rect'));
    if (bars.length === n.snoresByHour.length * 2 || bars.length >= 8) {
      // Original has 21 bars; map our 8 hour buckets to 21 visual bars by interpolation.
      const max = Math.max(...n.snoresByHour, 1);
      const visualBars = bars.length;
      const stepX = vbW / (visualBars + 1);
      bars.forEach((rect, i) => {
        const hourIdx = Math.floor((i / visualBars) * n.snoresByHour.length);
        const v = n.snoresByHour[hourIdx];
        const h = Math.max(2, Math.round((v / max) * 50));
        rect.setAttribute('x', String((i + 1) * stepX));
        rect.setAttribute('y', String(55 - h / 2));
        rect.setAttribute('height', String(h));
      });
    }
  }
};

function formatNarrowTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad2(m)} ${ap}`;
}

// ============================================================
// 09 — Boil & bite
// ============================================================

const STEPS = [
  { name: 'Heat water', headline: 'Bring water to a soft boil.\n<span class="it">Cut the heat once it gets there.</span>', tip: 'Use a small saucepan with at least 4 inches of water. <span class="em">Don\'t use a kettle</span> — you can\'t lower the device cleanly into one.', duration: 90 },
  { name: 'Submerge',   headline: 'Lower it in.\n<span class="it">Hold for sixty seconds.</span>', tip: 'Use a slotted spoon or tongs to lower the device. <span class="em">Don\'t drop it in</span> — it can stick to the bottom of the pan and warp on one side.', duration: 60 },
  { name: 'Cool',       headline: 'Lift it out and<br/><span class="it">count to ten.</span>', tip: 'Ten seconds is the sweet spot — pliable, not hot. If it\'s burning, give it five more.', duration: 10 },
  { name: 'Bite & hold',headline: 'Press evenly. Hold<br/><span class="it">for two full minutes.</span>', tip: 'Bite straight down — don\'t shift side to side. The impression sets in the first 30 seconds; the rest is just for stability.', duration: 120 },
  { name: 'Cold rinse', headline: 'Cold water rinse.<br/><span class="it">It\'s yours now.</span>', tip: 'Once it\'s cool to the touch, you\'re done. Rinse it again before bed tonight.', duration: 30 },
];

let boilTimerId: number | null = null;

const boilAndBite: Hydrator = (root) => {
  const s = store.get();
  let step = s.onboarding.boilStep ?? 1;
  if (step < 0) step = 0;
  if (step >= STEPS.length) step = STEPS.length - 1;

  const renderStep = (idx: number) => {
    const cfg = STEPS[idx];
    // Progress pips
    const pips = root.querySelectorAll<HTMLElement>('.progress .pip');
    pips.forEach((p, i) => {
      p.classList.remove('done', 'active');
      if (i < idx) p.classList.add('done');
      else if (i === idx) p.classList.add('active');
    });
    // Step meta
    setText(root, '.step-meta .num', `Step ${pad2(idx + 1)} · ${cfg.name}`);
    // Headline
    const h1 = root.querySelector<HTMLElement>('h1');
    if (h1) h1.innerHTML = cfg.headline;
    // Lede & tip
    const lede = root.querySelector<HTMLElement>('.lede');
    if (lede) {
      lede.innerHTML = idx === 1
        ? 'The silicone softens and becomes pliable. <strong style="color:var(--text-primary); font-weight:500;">Don\'t go past 90 seconds</strong> — too long and it loses shape memory.'
        : idx === 0
        ? 'Just shy of a rolling boil — bubbles, no roar. Hot enough to soften the silicone, gentle enough not to discolor it.'
        : idx === 3
        ? 'Two minutes is the cure time. Set the timer and don\'t talk — moving your jaw distorts the impression.'
        : 'Keep it on a paper towel. <strong style="color:var(--text-primary); font-weight:500;">Don\'t skip this</strong> — the impression sets while it cools.';
    }
    const tip = root.querySelector<HTMLElement>('.tip .copy');
    if (tip) tip.innerHTML = cfg.tip;

    // Restart timer
    if (boilTimerId) { clearInterval(boilTimerId); boilTimerId = null; }
    let remaining = cfg.duration;
    const tEl = root.querySelector<HTMLElement>('.ring .center .t');
    const updateTimer = () => {
      if (!tEl) return;
      tEl.textContent = `${pad2(Math.floor(remaining / 60))}:${pad2(remaining % 60)}`;
    };
    updateTimer();
    // Reset arc animation
    const arc = root.querySelector<SVGCircleElement>('.ring .arc');
    if (arc) {
      arc.style.animation = 'none';
      void arc.getBoundingClientRect();
      arc.style.animationName = 'drain';
      arc.style.animationDuration = `${cfg.duration}s`;
      arc.style.animationTimingFunction = 'linear';
      arc.style.animationFillMode = 'forwards';
    }
    boilTimerId = window.setInterval(() => {
      remaining -= 1;
      if (remaining < 0) {
        remaining = 0;
        if (boilTimerId) { clearInterval(boilTimerId); boilTimerId = null; }
        // auto-advance
        if (idx < STEPS.length - 1) {
          step = idx + 1;
          store.set(s2 => { s2.onboarding.boilStep = step; });
          renderStep(step);
        } else {
          completeBoil();
        }
      }
      updateTimer();
    }, 1000);
  };

  // Wire skip
  const skip = root.querySelector<HTMLElement>('.btn.primary');
  skip?.addEventListener('click', () => {
    if (step < STEPS.length - 1) {
      step += 1;
      store.set(s2 => { s2.onboarding.boilStep = step; });
      renderStep(step);
    } else {
      completeBoil();
    }
  });

  // Wire pause
  const pause = root.querySelector<HTMLElement>('.btn.ghost');
  pause?.addEventListener('click', () => {
    if (boilTimerId) { clearInterval(boilTimerId); boilTimerId = null; }
    showToast('Paused — tap Skip ahead when ready.');
  });

  // Wire pip taps to jump
  root.querySelectorAll<HTMLElement>('.progress .pip').forEach((pip, i) => {
    pip.addEventListener('click', () => {
      step = i;
      store.set(s2 => { s2.onboarding.boilStep = step; });
      renderStep(step);
    });
  });

  renderStep(step);
};

function completeBoil() {
  if (boilTimerId) { clearInterval(boilTimerId); boilTimerId = null; }
  store.set(s => {
    s.onboarding.boilCompleted = true;
    s.onboarding.boilStep = STEPS.length;
    s.onboarding.complete = true;
    s.device.fittedAt = isoDate(new Date());
    s.device.strapPosition = 1;
  });
  playChime();
  showToast('Fitted! Welcome to the dashboard.');
  navigate('/onboarding/device', { dir: 'forward' });
}

/** Brief chime via Web Audio API — used for boil-and-bite step completion. */
function playChime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
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

// ============================================================
// 10 — Device overview
// ============================================================

const deviceOverview: Hydrator = (root) => {
  const s = store.get();
  setText(root, '.diagram .meta', '');
  const meta = root.querySelector<HTMLElement>('.diagram .meta');
  if (meta) meta.innerHTML = `<span>Top view</span><span>Pos. ${s.device.strapPosition} of 5</span>`;

  // Position-indicator callout reflects state
  const co5 = root.querySelector<HTMLElement>('.callouts .co:last-child .desc');
  if (co5) co5.innerHTML = `Tiny dot on the right strap. Right now: <strong style="color:var(--text-primary); font-weight:500;">position ${s.device.strapPosition} of 5</strong>.`;
};

// ============================================================
// 11 — Chat rich (mostly static; same composer as 04)
// ============================================================

const chatRich: Hydrator = (root) => {
  // Composer behaves like /chat
  const composer = root.querySelector<HTMLElement>('.composer');
  if (!composer) return;
  composer.innerHTML = `
    <div class="field" style="padding: 0 16px;">
      <input class="field-input" type="text" placeholder="Ask Dr. Sommers…" autocomplete="off"
             style="flex:1; background: transparent; border: 0; outline: none; font: inherit;
                    color: var(--text-primary); padding: 11px 0; min-width: 0;" />
    </div>
    <div class="send" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </div>
  `;
  const input = composer.querySelector<HTMLInputElement>('.field-input')!;
  const send = composer.querySelector<HTMLElement>('.send')!;
  const fire = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    store.set(s => { s.chat.push({ id: `m${Date.now()}`, who: 'me', text, ts: Date.now() }); });
    setTimeout(() => {
      store.set(s => { s.chat.push({ id: `m${Date.now()+1}`, who: 'them', text: pickReply(text), ts: Date.now() }); });
      navigate('/chat', { dir: 'back' });
    }, 600);
    showToast('Sent — opening chat…');
  };
  send.addEventListener('click', fire);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });

  // Suggested chips also navigate to chat with prefilled history
  root.querySelectorAll<HTMLElement>('.suggest .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.textContent || '';
      store.set(s => { s.chat.push({ id: `m${Date.now()}`, who: 'me', text: q, ts: Date.now() }); });
      setTimeout(() => {
        store.set(s => { s.chat.push({ id: `m${Date.now()+1}`, who: 'them', text: pickReply(q), ts: Date.now() }); });
      }, 700);
      navigate('/chat', { dir: 'back' });
    });
  });
};

// ============================================================
// 12 — Comparisons
// ============================================================

const comparisons: Hydrator = (root) => {
  // Make cohort chips toggleable
  root.querySelectorAll<HTMLElement>('.cohort .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      chip.style.borderColor = chip.classList.contains('active') ? 'var(--accent)' : '';
      chip.style.color = chip.classList.contains('active') ? 'var(--accent)' : '';
      // Tweak the percentile pseudo-randomly to feel responsive
      const pct = root.querySelector<HTMLElement>('.dist .pct');
      if (pct) {
        const next = 70 + Math.floor(Math.random() * 24);
        pct.firstChild!.textContent = String(next);
      }
    });
  });
};

// ============================================================
// 13 — Reorder
// ============================================================

const reorder: Hydrator = (root) => {
  const s = store.get();
  // Days remaining
  const totalNights = s.device.lifespanNights;
  const used = daysSince(s.device.fittedAt);
  const remaining = Math.max(0, totalNights - used);
  setText(root, '.wear .meta-row .now', `≈ ${Math.round((used / totalNights) * 100)}% through · ~${remaining} nights left`);
  const meter = root.querySelector<HTMLElement>('.wear .meter > i');
  if (meter) meter.style.width = `${Math.min(100, (used / totalNights) * 100)}%`;

  // Headline computed
  const monthsLeft = Math.max(0, Math.round(remaining / 30));
  const h1 = root.querySelector<HTMLElement>('h1');
  if (h1) h1.innerHTML = `Your device has<br/><span class="it">about ${monthsLeft} month${monthsLeft === 1 ? '' : 's'}</span> left.`;

  // Ship-to from profile
  setText(root, '.ship .l .v', s.user.shipTo);

  // Primary CTA
  const cta = root.querySelector<HTMLElement>('.primary .btn');
  if (cta) {
    cta.classList.add('reorder-btn');
    cta.addEventListener('click', () => {
      if (s.reorder.ordered) {
        showToast('Already ordered — ships in 2 days.');
        return;
      }
      store.set(s2 => { s2.reorder = { ...s2.reorder, ordered: true, orderedAt: isoDate(new Date()) }; });
      cta.innerHTML = `
        <div class="lab">Ordered<span class="sub">Confirmation sent — ships in 2 days</span></div>
        <div class="price">✓</div>
      `;
      cta.style.background = 'var(--accent)';
      cta.style.color = 'var(--bg-primary)';
      showToast('Ordered. Confirmation in your email.');
    });
    if (s.reorder.ordered) {
      cta.innerHTML = `
        <div class="lab">Ordered<span class="sub">Ships in 2 days</span></div>
        <div class="price">✓</div>
      `;
      cta.style.background = 'var(--accent)';
      cta.style.color = 'var(--bg-primary)';
    }
  }

  // Toggle remind — replace the .toggle with a real switch we can style.
  const toggle = root.querySelector<HTMLElement>('.toggle');
  if (toggle) {
    toggle.innerHTML = '';
    const knob = document.createElement('span');
    Object.assign(knob.style, {
      position: 'absolute', top: '3px', width: '18px', height: '18px',
      borderRadius: '50%', background: 'var(--bg-primary)',
      transition: 'right 200ms cubic-bezier(0.4, 0, 0.2, 1), background 200ms',
    });
    toggle.style.position = 'relative';
    toggle.appendChild(knob);
    const apply = () => {
      const on = store.get().reorder.remindIn3mo;
      toggle.style.background = on ? 'var(--accent)' : 'rgba(11,20,22,0.18)';
      knob.style.right = on ? '3px' : '21px';
    };
    apply();
    toggle.addEventListener('click', () => {
      store.set(s2 => { s2.reorder.remindIn3mo = !s2.reorder.remindIn3mo; });
      apply();
    });
  }
};

// ============================================================
// 14 — Science (mostly static)
// ============================================================

const science: Hydrator = (root) => {
  const s = store.get();
  setText(root, '.nav .badge', `On-device · ${s.nights.length} nights`);
};

// ============================================================
// Registry
// ============================================================

const HYDRATORS: Record<string, Hydrator> = {
  '01-dashboard-light': dashboard,
  '02-dashboard-dark':  dashboard,
  '03-morning-reveal':  morningReveal,
  '04-chat':            chat,
  '05-trends':          trends,
  '06-night':           night,
  '07-onboarding-triage': onboardingTriage,
  '08-detailed-night':  detailedNight,
  '09-boil-and-bite':   boilAndBite,
  '10-device-overview': deviceOverview,
  '11-chat-rich':       chatRich,
  '12-comparisons':     comparisons,
  '13-reorder':         reorder,
  '14-science':         science,
};

export function hydrate(screenName: string, root: HTMLElement, route: ResolvedRoute) {
  const fn = HYDRATORS[screenName];
  if (!fn) return;
  void fn(root, route);
}

// Cleanup hook (called before next screen mounts)
export function cleanup(prevScreen: string | undefined, prevRoot: HTMLElement | null) {
  if (prevScreen === '06-night' && prevRoot && (prevRoot as any).__nightTick) {
    clearInterval((prevRoot as any).__nightTick);
  }
  if (prevScreen === '09-boil-and-bite' && boilTimerId) {
    clearInterval(boilTimerId);
    boilTimerId = null;
  }
}

// ============================================================
// Helpers
// ============================================================

function setText(root: HTMLElement, selector: string, text: string) {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
}

function setNum(root: HTMLElement, selector: string, text: string) {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function linkifyEm(html: string): string {
  // Emphasize *text* with serif italic span
  return html.replace(/\*(.+?)\*/g, '<span class="em">$1</span>');
}

function svgViewBox(svg: SVGSVGElement, defW: number, defH: number): { width: number; height: number } {
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : defW;
  const h = vb && vb.height ? vb.height : defH;
  return { width: w, height: h };
}
