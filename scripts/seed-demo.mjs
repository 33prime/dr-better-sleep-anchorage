// scripts/seed-demo.mjs
//
// Idempotent demo-data seed for investor walkthroughs. Wipes and reseeds the
// demo user (DEMO_EMAIL / DEMO_PASSWORD from .env) with a 75-night story arc,
// synthetic typed snore_events + sleep_sessions for the last 14 nights, chat
// history, and recommendations. Plain Node ESM, service-role admin client.
//
// Usage: node scripts/seed-demo.mjs
// (NOT run automatically — the integrate lane runs this after everything lands.)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// .env parsing (no dotenv dep — per PLAN.md)
// ---------------------------------------------------------------------------

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...parseEnvFile(join(ROOT, '.env')), ...process.env };

function requireEnv(key) {
  const v = env[key];
  if (!v) {
    console.error(`Missing required env var: ${key} (check .env)`);
    process.exit(1);
  }
  return v;
}

const SUPABASE_URL = requireEnv('VITE_SUPABASE_URL');
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const DEMO_EMAIL = requireEnv('DEMO_EMAIL');
const DEMO_PASSWORD = requireEnv('DEMO_PASSWORD');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// small helpers (self-contained — this script owns no src/ imports)
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}
function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
// Seeded LCG so re-runs produce the same shaped story (still "wipe and
// reseed" idempotent — the numbers don't drift run to run).
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertChunked(table, rows, opts = {}) {
  if (rows.length === 0) return [];
  const results = [];
  for (const part of chunk(rows, 500)) {
    const { data, error } = await admin.from(table).insert(part, opts).select();
    if (error) throw new Error(`insert ${table} failed: ${error.message}`);
    results.push(...(data ?? []));
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. Ensure the demo auth user exists
// ---------------------------------------------------------------------------

async function findUserByEmail(email) {
  // No admin.getUserByEmail in supabase-js v2 — page through listUsers.
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureDemoUser() {
  let user = await findUserByEmail(DEMO_EMAIL);
  if (user) {
    // Keep credentials in sync with .env on every reseed.
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUserById failed: ${error.message}`);
    return data.user;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  return data.user;
}

// ---------------------------------------------------------------------------
// 2. Wipe existing demo rows for this user (idempotent reseed)
// ---------------------------------------------------------------------------

async function wipeDemoData(userId) {
  // Order matters: nights.session_id -> sleep_sessions has no cascade, so
  // nights must go before sleep_sessions. snore_events cascades from
  // sleep_sessions but we clear it explicitly too for a clean slate.
  const tables = [
    'chat_messages',
    'recommendations',
    'nights',
    'snore_events',
    'sleep_sessions',
    'devices',
  ];
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`wipe ${table} failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Story arc generation
// ---------------------------------------------------------------------------

const TOTAL_NIGHTS = 75;
const BASELINE_NIGHTS = 14; // idx 0..13, pre-device
const FIT_IDX = 14; // idx of first post-device night ("device fitted day 15")
const LAST_N_WITH_EVENTS = 14; // idx 61..74 get synthetic snore_events + sessions
const BAD_WEEK_START_DAY = 42; // 1-indexed day number, "around day 45"
const BAD_WEEK_LEN = 7;

function isWineNight(date) {
  const dow = date.getDay();
  return dow === 5 || dow === 6; // Fri, Sat — ~2x/week
}

function isBadWeek(dayNumber) {
  return dayNumber >= BAD_WEEK_START_DAY && dayNumber < BAD_WEEK_START_DAY + BAD_WEEK_LEN;
}

// 8-bucket hourly distribution (bedtime -> wake), gaussian-ish peak ~3h in.
function snoresByHour(totalSnores, r) {
  const out = [];
  let remaining = totalSnores;
  for (let h = 0; h < 8; h++) {
    const weight = Math.exp(-((h - 3) ** 2) / 4);
    const v = Math.max(0, Math.min(remaining, Math.round(weight * (totalSnores / 6) + r() * 3)));
    out.push(v);
    remaining -= v;
  }
  if (remaining > 0) out[3] += remaining;
  return out;
}

function buildNights(lastNightDate) {
  const r = rng(0x123456); // deterministic across runs; tuned so the partner
  // "slept through" ratio actually lands near the 2/7 -> 6/7 story beat
  const startDate = addDays(lastNightDate, -(TOTAL_NIGHTS - 1));
  const nights = [];

  for (let idx = 0; idx < TOTAL_NIGHTS; idx++) {
    const date = addDays(startDate, idx);
    const dayNumber = idx + 1;
    const isPreFit = idx < FIT_IDX;
    const t = isPreFit ? 0 : (idx - FIT_IDX) / (TOTAL_NIGHTS - 1 - FIT_IDX); // 0..1 post-fit
    const wine = isWineNight(date);
    const badWeek = !isPreFit && isBadWeek(dayNumber);

    // --- total snores -------------------------------------------------
    let base = isPreFit
      ? 150 + (r() - 0.5) * 60 // ~120-180
      : 30 + 120 * Math.exp(-4 * t) + (r() - 0.5) * 14; // exponential-ish decline to ~25-45
    if (badWeek) base *= 2.0 + r() * 0.5; // strap slipped: 2.0-2.5x
    if (wine) base *= 1.8 + r() * 0.5; // 1.8-2.3x
    const totalSnores = Math.round(clamp(base, 3, 260));

    // --- derived severity metrics --------------------------------------
    const snoreTimePct = +clamp(totalSnores * 0.00147 + (r() - 0.5) * 0.02, 0.02, 0.35).toFixed(3);
    const peakDb = +clamp(30 + 0.09 * totalSnores + (r() - 0.5) * 4, 26, 58).toFixed(1);

    // --- sleep session shape --------------------------------------------
    const overallT = idx / (TOTAL_NIGHTS - 1);
    const durationMin = Math.round(clamp(390 + 40 * overallT + (r() - 0.5) * 30, 350, 470));
    const longestQuietMin = +clamp(
      durationMin * (1 - snoreTimePct) * (0.5 + r() * 0.35),
      8,
      durationMin * 0.95
    ).toFixed(1);

    // --- snore-type mix (device targets palatal best) --------------------
    let palatal = clamp((isPreFit ? 0.70 : 0.70 - 0.28 * t) + (r() - 0.5) * 0.06, 0.4, 0.75);
    let nasal = clamp(0.08 + (r() - 0.5) * 0.05 + (wine ? 0.02 : 0), 0.03, 0.2);
    let tongue = Math.max(0.08, 1 - palatal - nasal);
    const typeSum = palatal + tongue + nasal;
    palatal = +(palatal / typeSum).toFixed(3);
    tongue = +(tongue / typeSum).toFixed(3);
    nasal = +(1 - palatal - tongue).toFixed(3);

    // --- wearable-ingest fields (FILLED — demo source represents a
    //     connected wearable) --------------------------------------------
    const efficiency = +clamp(
      (isPreFit ? 0.76 : 0.8 + 0.13 * t - (badWeek ? 0.05 : 0)) + (r() - 0.5) * 0.03,
      0.68,
      0.94
    ).toFixed(3);
    const hrv = Math.round(
      clamp((isPreFit ? 34 : 36 + 16 * t - (badWeek ? 4 : 0)) + (r() - 0.5) * 4, 28, 62)
    );
    const restingHr = Math.round(
      clamp((isPreFit ? 64 : 64 - 9 * t + (badWeek ? 3 : 0)) + (r() - 0.5) * 3, 50, 70)
    );
    let deepMin = Math.round(durationMin * (0.14 + 0.05 * (isPreFit ? 0 : t)) + (r() - 0.5) * 10);
    let remMin = Math.round(durationMin * 0.2 + (r() - 0.5) * 15);
    let awakeMin = Math.round(
      durationMin * (isPreFit ? 0.09 : 0.09 - 0.04 * t) + (r() - 0.5) * 8
    );
    deepMin = Math.max(30, deepMin);
    remMin = Math.max(30, remMin);
    awakeMin = Math.max(4, awakeMin);
    let lightMin = durationMin - deepMin - remMin - awakeMin;
    if (lightMin < 40) {
      // rebalance rather than emit a negative stage
      const deficit = 40 - lightMin;
      awakeMin = Math.max(4, awakeMin - deficit);
      lightMin = durationMin - deepMin - remMin - awakeMin;
    }

    const onBack = Math.round(clamp(durationMin * (0.42 - 0.08 * (isPreFit ? 0 : t)) + (r() - 0.5) * 30, 40, durationMin * 0.7));
    const onStomach = Math.round(clamp(durationMin * 0.08 + r() * 20, 10, durationMin * 0.2));
    const onLeft = Math.round((durationMin - onBack - onStomach) * 0.6);
    const onRight = Math.max(0, durationMin - onBack - onStomach - onLeft);

    const backShare = clamp(0.78 - (isPreFit ? 0 : 0.18 * t), 0.45, 0.8);
    const sBack = Math.round(totalSnores * backShare);
    const sLeft = Math.round(totalSnores * 0.1);
    const sStomach = Math.round(totalSnores * 0.02);
    const sRight = Math.max(0, totalSnores - sBack - sLeft - sStomach);

    const startHour = 22 + (r() < 0.5 ? 0 : 1);
    const startMin = Math.round(r() * 55);
    const bedtime = new Date(addDays(date, -1));
    bedtime.setHours(startHour, startMin, 0, 0);
    const wake = new Date(bedtime.getTime() + durationMin * 60_000);

    // 2/7 -> 6/7 improvement across the arc
    const sleptThroughProb = 2 / 7 + (6 / 7 - 2 / 7) * overallT;
    const partnerSleptThrough = r() < sleptThroughProb;

    nights.push({
      idx,
      date,
      dateIso: isoDate(date),
      isPreFit,
      wine,
      badWeek,
      totalSnores,
      snoresByHour: snoresByHour(totalSnores, r),
      peakDb,
      startedAt: `${pad2(bedtime.getHours())}:${pad2(bedtime.getMinutes())}`,
      endedAt: `${pad2(wake.getHours())}:${pad2(wake.getMinutes())}`,
      bedtime,
      wake,
      durationMin,
      snoreTimePct,
      longestQuietMin,
      typePalatal: palatal,
      typeTongue: tongue,
      typeNasal: nasal,
      alcohol: wine,
      partnerSleptThrough,
      efficiency,
      hrv,
      restingHr,
      deepMin,
      remMin,
      lightMin,
      awakeMin,
      positions: { side_left: onLeft, side_right: onRight, back: onBack, stomach: onStomach },
      positionSnores: { side_left: sLeft, side_right: sRight, back: sBack, stomach: sStomach },
    });
  }
  return { nights, r };
}

// ---------------------------------------------------------------------------
// 4. Synthetic snore_events for the last N nights
// ---------------------------------------------------------------------------

function buildEventsForNight(night, sessionId, userId, r) {
  const events = [];
  const segmentMs = (night.wake.getTime() - night.bedtime.getTime()) / 8;
  const typeWeights = [
    ['palatal', night.typePalatal],
    ['tongue', night.typeTongue],
    ['nasal', night.typeNasal],
  ];

  for (let h = 0; h < 8; h++) {
    const count = night.snoresByHour[h];
    const segStart = night.bedtime.getTime() + h * segmentMs;
    for (let i = 0; i < count; i++) {
      const ts = new Date(segStart + r() * segmentMs);
      const durationMs = Math.round(700 + r() * 3500);
      const peakDb = +clamp(night.peakDb + (r() - 0.5) * 6, 22, 62).toFixed(1);

      // Pick a dominant band per-event, weighted by the night's type mix.
      const pick = r();
      let cum = 0;
      let dominant = 'palatal';
      for (const [name, weight] of typeWeights) {
        cum += weight;
        if (pick <= cum) {
          dominant = name;
          break;
        }
      }
      const energy = 20 + peakDb * 0.6;
      const bands = { palatal: 0, tongue: 0, nasal: 0 };
      for (const [name] of typeWeights) {
        bands[name] =
          name === dominant ? +(energy * (0.75 + r() * 0.25)).toFixed(2) : +(energy * (0.05 + r() * 0.25)).toFixed(2);
      }

      events.push({
        session_id: sessionId,
        user_id: userId,
        ts: ts.toISOString(),
        duration_ms: durationMs,
        peak_db: peakDb,
        band_palatal: bands.palatal,
        band_tongue: bands.tongue,
        band_nasal: bands.nasal,
      });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// 5. Chat history + recommendations
// ---------------------------------------------------------------------------

function buildChatMessages(nights, userId) {
  const at = (idx, hour = 7, min = 15) => {
    const d = new Date(nights[idx].wake);
    d.setHours(hour, min, 0, 0);
    return d;
  };
  const n = (idx) => nights[idx];

  const msgs = [];
  const push = (idx, who, text, card, hour, min) => {
    msgs.push({
      user_id: userId,
      who,
      text: text ?? null,
      card: card ?? null,
      created_at: at(idx, hour, min).toISOString(),
    });
  };

  // Pre-device (idx 0-13)
  push(1, 'coach', "morning, alex. first full night with the app — 118 snores, mostly on your back. let's get a couple weeks of baseline before we talk fixes.");
  push(3, 'user', "is this normal? feels like a lot.");
  push(3, 'coach', `it's on the higher side, yeah — you're averaging in the 120s. that's exactly the range the device tends to help with most.`);
  push(6, 'coach', `${n(6).totalSnores} last night, and sam mentioned getting woken up again. two weeks of this baseline and we'll have a clean before/after once your device ships.`);
  push(11, 'coach', "quick heads up before we wrap baseline: wine nights are running noticeably louder than the rest — worth keeping an eye on once we're comparing.");
  push(13, 'coach', undefined, {
    kind: 'snore-summary',
    date: n(13).dateIso,
    total: n(13).totalSnores,
    baseline: n(13).totalSnores,
  });

  // Fit + early decline
  push(FIT_IDX, 'coach', "device fitted today — strap position 1 to start. give it a week to feel normal in your mouth before we judge anything.");
  push(FIT_IDX + 3, 'coach', `${n(FIT_IDX + 3).totalSnores} last night, down from your ${n(1).totalSnores}-ish baseline. early, but that's the shape we want.`);
  push(FIT_IDX + 8, 'user', "does it matter which position i sleep in with this thing?");
  push(FIT_IDX + 8, 'coach', "less than before — the device holds your jaw forward regardless of position. you'll still see more snores on your back, just fewer overall.");
  push(FIT_IDX + 12, 'coach', `nice stretch — ${n(FIT_IDX + 12).totalSnores} snores, ${Math.round(n(FIT_IDX + 12).snoreTimePct * 100)}% of the night. sam slept through more of it this week too.`);
  push(FIT_IDX + 20, 'coach', undefined, { kind: 'comparison' });
  push(FIT_IDX + 20, 'coach', "worth a look — the two-week comparison since the fit is up in insights. palatal snoring specifically has dropped the most, which tracks: that's what this device targets.");

  // Bad week (strap slipped) — find its actual index
  const badWeekIdx = nights.findIndex((night) => night.badWeek);
  if (badWeekIdx >= 0) {
    push(badWeekIdx + 1, 'coach', `rougher night — ${n(badWeekIdx + 1).totalSnores} snores, well above where you'd been. check the strap position on the device; it can slip loose over a few weeks of wear.`);
    push(badWeekIdx + 3, 'user', "yeah it had definitely loosened, refit it tighter last night");
    push(badWeekIdx + 3, 'coach', "that'll do it. give it a couple nights to settle back down — this kind of bump is almost always mechanical, not a step backward.");
    const recoverIdx = Math.min(badWeekIdx + 9, TOTAL_NIGHTS - 1);
    push(recoverIdx, 'coach', `back on track — ${n(recoverIdx).totalSnores} snores last night, right in line with before the slip.`);
  }

  // Titration check-in — mid-arc, well after the fit has settled and roughly
  // where the strap-position formula (see device/session inserts below) has
  // it stepping from position 3 to 4. One clean question-and-answer exchange
  // so the chat has a real titration beat, distinct from the bad-week/refit
  // thread above.
  const titrationIdx = clamp(FIT_IDX + 36, FIT_IDX + 4, TOTAL_NIGHTS - 2);
  push(titrationIdx, 'user', 'is it time to move the strap forward again?', undefined, 8, 5);
  push(
    titrationIdx,
    'coach',
    "you've held position 3 for a couple weeks now and snoring's still trending down — one more notch to position 4 makes sense at your next check-in, but there's no rush.",
    undefined,
    8,
    6
  );

  // "Play my loudest snore" — the clip-card exchange (Lane A/C). Placed near
  // the end of the arc so it reads naturally as a recent ask; the clip card
  // itself always renders the latest tracked night's loudest clip regardless
  // of which chat message it's attached to.
  const clipIdx = TOTAL_NIGHTS - 4;
  push(clipIdx, 'user', 'play my loudest snore', undefined, 7, 40);
  push(
    clipIdx,
    'coach',
    "here's the loudest one — right in the middle of the night, and loud enough that i get why sam brought it up.",
    undefined,
    7,
    41
  );
  push(clipIdx, 'coach', undefined, { kind: 'clip' }, 7, 42);

  // Recent nights / wrap-up
  const lastWineIdx = [...nights].reverse().find((night) => night.wine)?.idx ?? TOTAL_NIGHTS - 8;
  push(lastWineIdx, 'coach', `heads up — nights with a drink are still running about ${Math.round((1.8 + 0.5 / 2 - 1) * 100)}% louder than the rest, even this far in. nothing dramatic, just something to keep in mind.`);
  push(TOTAL_NIGHTS - 5, 'coach', `${n(TOTAL_NIGHTS - 5).totalSnores} snores, longest quiet stretch ${Math.round(n(TOTAL_NIGHTS - 5).longestQuietMin)} minutes. this is close to your best week yet.`);
  push(TOTAL_NIGHTS - 3, 'user', "feels like a totally different sleeper than two months ago");
  push(TOTAL_NIGHTS - 3, 'coach', "the numbers agree — snore time is down from about a fifth of the night to under a tenth, and sam's sleeping through almost every night now.");
  push(TOTAL_NIGHTS - 1, 'coach', `morning, alex. the data agrees with you — ${n(TOTAL_NIGHTS - 1).totalSnores} snores, ${Math.round(n(TOTAL_NIGHTS - 1).snoreTimePct * 100)}% snore time, and sam slept through again.`);
  push(
    TOTAL_NIGHTS - 1,
    'coach',
    undefined,
    {
      kind: 'snore-summary',
      date: n(TOTAL_NIGHTS - 1).dateIso,
      total: n(TOTAL_NIGHTS - 1).totalSnores,
      baseline: n(1).totalSnores,
    },
    7,
    20
  );

  return msgs;
}

// Client-side Recommendation type gained an additive `sourceNightDate` field
// (see src/seed.ts) so Reorder can navigate "show me the night" -> a real
// night. The `recommendations` table has no `source_night_date` column yet
// (that's a schema change outside this lane's file ownership — see PLAN2.md
// "File ownership"), so we don't send one here. It's not needed for the demo
// account: every `recommended_on` below is built from `at(idx)`, i.e. it's
// already the dateIso of a real row in `nights` (all 75 nights get a `nights`
// row, not just the last 14 with events), so Reorder's client-side fallback
// chain (sourceNightDate -> recommendedOn -> latest night) resolves correctly
// via `recommendedOn` alone once that data is read back through sync.ts.
function buildRecommendations(userId, nights) {
  const at = (idx) => nights[idx].dateIso;
  return [
    {
      user_id: userId,
      name: 'Magnesium',
      emphasis: 'glycinate · 200 mg',
      quote: '"Your deep sleep is still climbing but not there yet — this is the form that doesn\'t upset most stomachs."',
      recommended_on: at(FIT_IDX + 10),
      price: '$24',
      price_subtext: '60 ct',
      icon_kind: 'pill',
    },
    {
      user_id: userId,
      name: 'Side-sleep',
      emphasis: 'positional pillow',
      quote: '"You\'re still rolling onto your back a few times a night — this catches you before you do."',
      recommended_on: at(FIT_IDX + 24),
      price: '$58',
      price_subtext: null,
      icon_kind: 'pillow',
    },
    {
      user_id: userId,
      name: 'Cleaning',
      emphasis: 'tablets · 60 ct',
      quote: '"You asked how to clean the tray after the strap refit. These dissolve in cold water — never warm, it\'ll warp the silicone."',
      recommended_on: at(TOTAL_NIGHTS - 6),
      price: '$14',
      price_subtext: null,
      icon_kind: 'tablet',
    },
  ];
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Seeding demo user ${DEMO_EMAIL}...`);

  const user = await ensureDemoUser();
  console.log(`  user id: ${user.id}`);

  await wipeDemoData(user.id);
  console.log('  wiped prior demo rows');

  // profile row is normally auto-created by the on_auth_user_created trigger;
  // upsert (rather than update) so a reseed is still correct if that ever
  // hasn't fired yet.
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({
      id: user.id,
      name: 'Alex',
      age_range: '35-44',
      sex: 'M',
      bmi_range: '25-28',
      ship_to: 'Alex Rivera · 1200 Harbor View Dr, Anchorage, AK',
      partner_name: 'Sam',
      partner_relation: 'spouse',
      partner_notify_morning: true,
      ui_theme: 'auto',
      onboarding: {
        complete: true,
        step: 7,
        answers: {
          snoreFrequency: 'every-night',
          snorePositions: ['back', 'side'],
          partnerNoticedWorse: true,
          feelsRested: 'sometimes',
          diagnosedApnea: false,
          seenSleepDoc: false,
          wantsDoctor: false,
        },
        boilCompleted: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (profileErr) throw new Error(`profile update failed: ${profileErr.message}`);
  console.log('  profile updated');

  // today's "night" hasn't happened yet — story ends last night (yesterday)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastNightDate = addDays(today, -1);

  const { nights, r } = buildNights(lastNightDate);

  const fitDate = nights[FIT_IDX].date;
  const { error: deviceErr } = await admin.from('devices').insert({
    user_id: user.id,
    fitted_at: isoDate(fitDate),
    strap_position: clamp(1 + Math.floor((TOTAL_NIGHTS - 1 - FIT_IDX) / 18), 1, 3),
    lifespan_nights: 365,
    last_replacement: null,
  });
  if (deviceErr) throw new Error(`device insert failed: ${deviceErr.message}`);
  console.log('  device inserted');

  // sleep_sessions for EVERY post-fit night (they carry the per-night strap
  // position, which is what draws the titration journey on DeviceOverview and
  // gives hydrate() real historical positions) — snore_events only for the
  // last N nights to keep the row count sane.
  const eventNightsStart = TOTAL_NIGHTS - LAST_N_WITH_EVENTS;
  const sessionNights = nights.filter(n => n.idx >= FIT_IDX);
  const sessionRows = sessionNights.map((night) => ({
    user_id: user.id,
    started_at: night.bedtime.toISOString(),
    ended_at: night.wake.toISOString(),
    status: 'ended',
    strap_position: clamp(1 + Math.floor((night.idx - FIT_IDX) / 18), 1, 3),
    source: 'demo',
  }));
  const insertedSessions = await insertChunked('sleep_sessions', sessionRows);
  // Within a single insert() call (<=500 rows; we have ~60) return order
  // matches insert order, so positional zip against sessionNights is safe.
  sessionNights.forEach((night, i) => { night.sessionId = insertedSessions[i].id; });
  console.log(`  ${insertedSessions.length} sleep_sessions inserted`);

  const allEvents = [];
  for (let i = 0; i < LAST_N_WITH_EVENTS; i++) {
    const night = nights[eventNightsStart + i];
    allEvents.push(...buildEventsForNight(night, night.sessionId, user.id, r));
  }
  const insertedEvents = await insertChunked('snore_events', allEvents);
  console.log(`  ${insertedEvents.length} snore_events inserted`);

  // nights
  const nightRows = nights.map((night) => ({
    user_id: user.id,
    date: night.dateIso,
    session_id: night.sessionId ?? null,
    source: 'demo',
    total_snores: night.totalSnores,
    snores_by_hour: night.snoresByHour,
    peak_db: night.peakDb,
    started_at: night.startedAt,
    ended_at: night.endedAt,
    duration_min: night.durationMin,
    snore_time_pct: night.snoreTimePct,
    longest_quiet_min: night.longestQuietMin,
    type_palatal: night.typePalatal,
    type_tongue: night.typeTongue,
    type_nasal: night.typeNasal,
    alcohol: night.alcohol,
    partner_slept_through: night.partnerSleptThrough,
    efficiency: night.efficiency,
    hrv: night.hrv,
    resting_hr: night.restingHr,
    deep_min: night.deepMin,
    rem_min: night.remMin,
    light_min: night.lightMin,
    awake_min: night.awakeMin,
    positions: night.positions,
    position_snores: night.positionSnores,
  }));
  const insertedNights = await insertChunked('nights', nightRows);
  console.log(`  ${insertedNights.length} nights inserted`);

  // chat + recommendations
  const chatRows = buildChatMessages(nights, user.id);
  const insertedChat = await insertChunked('chat_messages', chatRows);
  console.log(`  ${insertedChat.length} chat_messages inserted`);

  const recRows = buildRecommendations(user.id, nights);
  const insertedRecs = await insertChunked('recommendations', recRows);
  console.log(`  ${insertedRecs.length} recommendations inserted`);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
