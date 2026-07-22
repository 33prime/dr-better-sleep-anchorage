// Phase-1 smoke test: walk every screen logged-out and as the demo account.
// Usage: node smoke.mjs <shots-dir>
import { chromium } from 'playwright';

const BASE = 'http://localhost:4173';
const SHOTS = process.argv[2] ?? '.';
const routes = [
  ['dashboard', '/'],
  ['trends', '/trends'],
  ['compare', '/trends/compare'],
  ['science', '/trends/science'],
  ['chat', '/chat'],
  ['morning', '/morning'],
  ['reorder', '/reorder'],
  ['profile', '/profile'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

const problems = [];
page.on('console', msg => {
  if (msg.type() === 'error') problems.push(`console.error: ${msg.text().slice(0, 200)}`);
});
page.on('pageerror', err => problems.push(`pageerror: ${String(err).slice(0, 300)}`));

async function checkTextArtifacts(label) {
  const body = await page.evaluate(() => document.body.innerText);
  for (const bad of ['NaN', 'undefined', 'Infinity', '[object']) {
    if (body.includes(bad)) problems.push(`${label}: page text contains "${bad}"`);
  }
  if (body.trim().length < 40) problems.push(`${label}: page nearly empty (${body.trim().length} chars)`);
}

async function walk(prefix) {
  for (const [name, path] of routes) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await checkTextArtifacts(`${prefix}:${name}`);
    await page.screenshot({ path: `${SHOTS}/${prefix}-${name}.png` });
    console.log(`ok ${prefix}:${name} (${page.url()})`);
  }
}

// ---- 1. logged-out / local-demo mode -------------------------------------
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const firstUrl = page.url();
console.log('first-load lands on:', firstUrl);
if (firstUrl.includes('/onboarding')) {
  // complete onboarding quickly via the store to unblock the walk (local mode)
  await page.evaluate(() => {
    const raw = localStorage.getItem('dr-better-sleep:v5');
    if (raw) {
      const s = JSON.parse(raw);
      s.onboarding.complete = true;
      localStorage.setItem('dr-better-sleep:v5', JSON.stringify(s));
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
}
await walk('local');

// detailed night for the latest local night
const localDate = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('dr-better-sleep:v5'));
  return s.nights[s.nights.length - 1].date;
});
await page.goto(`${BASE}/night/${localDate}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await checkTextArtifacts('local:night-detail');
await page.screenshot({ path: `${SHOTS}/local-night-detail.png` });
console.log('ok local:night-detail', localDate);

// ---- 2. demo-account sign-in --------------------------------------------
// Production signs in via /api/demo-login (edge function, server-held
// credential). `vite preview` has no edge functions, so the smoke test does
// the password grant node-side using .env (never shipped to the page) and
// installs the session via supabase.auth.setSession in the page.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
const grant = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
  body: JSON.stringify({ email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD }),
});
const session = await grant.json();

await page.goto(BASE + '/auth', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/auth.png` });
const demoBtn = page.getByText(/explore the demo/i).first();
if (!(await demoBtn.count())) {
  problems.push('auth: "Explore the demo" button not found');
} else if (!session.access_token) {
  problems.push('demo login: node-side password grant failed');
} else {
  // Install the session through the same localStorage key the supabase
  // client reads, then reload to trigger INITIAL_SESSION -> hydrate.
  const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    `sb-${ref}-auth-token`,
    JSON.stringify(session),
  ]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000); // INITIAL_SESSION + hydrate
  const state = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dr-better-sleep:v5'));
    return { mode: s.mode, nights: s.nights.length, chat: s.chat.length, name: s.user.name, partner: s.partner.name, onboardingComplete: s.onboarding.complete };
  });
  console.log('post-login state:', JSON.stringify(state));
  if (state.mode !== 'account') problems.push(`demo login: mode is ${state.mode}, expected account`);
  if (state.nights !== 75) problems.push(`demo login: ${state.nights} nights hydrated, expected 75`);
  if (state.name !== 'Alex') problems.push(`demo login: profile name "${state.name}", expected Alex`);
  await walk('demo');
  const demoDate = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dr-better-sleep:v5'));
    return s.nights[s.nights.length - 1].date;
  });
  await page.goto(`${BASE}/night/${demoDate}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await checkTextArtifacts('demo:night-detail');
  await page.screenshot({ path: `${SHOTS}/demo-night-detail.png` });
  console.log('ok demo:night-detail', demoDate);
}

await browser.close();
console.log('\n=== PROBLEMS (' + problems.length + ') ===');
for (const p of [...new Set(problems)]) console.log('- ' + p);
process.exit(0);
