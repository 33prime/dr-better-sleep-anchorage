// Mock data seed. 30 nights ending today (2026-05-06), with a clear "device fitted"
// inflection 21 days ago. Snore counts decline; deep sleep & efficiency drift up.

import { isoDate, pad2 } from './utils/format';

export interface Night {
  date: string;          // ISO YYYY-MM-DD
  totalSnores: number;
  sleepDurationMin: number;
  efficiency: number;    // 0..1
  hrv: number;           // ms
  restingHr: number;     // bpm
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  positions: { side_left: number; side_right: number; back: number; stomach: number }; // minutes
  positionSnores: { side_left: number; side_right: number; back: number; stomach: number };
  snoresByHour: number[]; // 8 hours bedtime → wake
  peakDb: number;
  strapPosition: number; // 1..5
  startedAt: string;     // HH:MM (the prior evening)
  endedAt: string;       // HH:MM
  alcohol: boolean;          // user logged drinks before bed
  partnerSleptThrough: boolean; // partner slept through the night without being woken
  // Acoustic snore-type mix (fractions, sum ~1). Vibration site:
  // palatal (soft palate, low rumble), tongue (tongue base, broadband), nasal (high flutter).
  snoreTypes: { palatal: number; tongue: number; nasal: number };
}

export interface ChatMessage {
  id: string;
  who: 'them' | 'me';
  text?: string;
  card?: ChatCard;
  ts: number;            // unix ms
}

export type ChatCard =
  | { kind: 'snore-summary'; date: string; total: number; baseline: number }
  | { kind: 'hypnogram'; date: string }
  | { kind: 'comparison' }
  | { kind: 'audio'; window: string; duration: number };

export interface Recommendation {
  id: string;
  name: string;          // "Magnesium glycinate"
  emphasis: string;      // "200 mg" — italicized portion
  quote: string;
  recommendedOn: string; // ISO date
  price: string;
  priceSubtext?: string;
  iconKind: 'pill' | 'pillow' | 'tablet';
}

export interface UserProfile {
  name: string;
  ageRange: string;
  sex: 'M' | 'F' | 'NB';
  bmiRange: string;
  shipTo: string;
}

export interface Partner {
  name: string;
  relation: 'spouse' | 'partner' | 'roommate';
  notifyAtMorning: boolean;
}

export interface DeviceState {
  fittedAt: string;       // ISO date
  strapPosition: number;
  lifespanNights: number; // ~365
  lastReplacement?: string;
}

export interface OnboardingState {
  complete: boolean;
  startedAt?: string;
  answers: {
    snoreFrequency?: 'every-night' | 'most-nights' | 'sometimes' | 'rarely';
    snorePositions?: ('back' | 'side' | 'stomach')[];
    partnerNoticedWorse?: boolean;
    feelsRested?: 'rarely' | 'sometimes' | 'usually';
    diagnosedApnea?: boolean;
    seenSleepDoc?: boolean;
    wantsDoctor?: boolean;
  };
  step: number; // 0..7 — for triage progress bar
  boilStep?: number; // 0..4
  boilCompleted?: boolean;
}

export interface AppState {
  user: UserProfile;
  partner: Partner;
  device: DeviceState;
  onboarding: OnboardingState;
  nights: Night[];           // chronologically sorted, oldest first
  chat: ChatMessage[];
  recommendations: Recommendation[];
  uiTheme: 'auto' | 'light' | 'dark';
  reorder: { ordered: boolean; orderedAt?: string; remindIn3mo: boolean };
  liveNight: { tracking: boolean; startedAt?: number } | null;
}

// ---------- helpers ----------

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Snore counts following an exponential decline post-fit, plus per-night noise.
function simulateNights(today: Date, count: number, fitDaysAgo: number): Night[] {
  const r = rng(0x5ee5);
  const out: Night[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const daysSinceFit = (count - 1 - i) - (count - 1 - fitDaysAgo);
    const isPostFit = daysSinceFit >= 0;
    const dow = date.getDay(); // 0=Sun, 5=Fri, 6=Sat
    // Alcohol logged: more likely on Fri/Sat; deterministic for clean demo patterns.
    const alcohol = (dow === 5 || dow === 6) && r() < 0.7;
    // baseline ~110 snores → drops to ~42 by today
    const t = isPostFit ? daysSinceFit / fitDaysAgo : 0;
    const trend = isPostFit ? 110 - 70 * Math.min(1, t) : 110 + (r() - 0.5) * 20;
    const noise = (r() - 0.5) * 22;
    // Alcohol amplifies snoring meaningfully — the demo wants this pattern visible.
    const alcoholMult = alcohol ? (isPostFit ? 1.7 : 1.5) : 1;
    const totalSnores = Math.max(28, Math.round((trend + noise) * alcoholMult));

    const sleepDurationMin = 6 * 60 + Math.round(40 + (r() - 0.5) * 60);
    const efficiency = 0.82 + (isPostFit ? 0.06 * t : 0) + (r() - 0.5) * 0.04;
    const deepMin = Math.round(95 + (isPostFit ? 12 * t : 0) + (r() - 0.5) * 16);
    const remMin = Math.round(80 + (r() - 0.5) * 20);
    const awakeMin = Math.round(18 + (r() - 0.5) * 16);
    const lightMin = sleepDurationMin - deepMin - remMin - awakeMin;
    const hrv = Math.round(40 + (isPostFit ? 8 * t : 0) + (r() - 0.5) * 6);
    const restingHr = Math.round(58 + (r() - 0.5) * 4);

    const onBack = 50 + Math.round((r() - 0.5) * 40);
    const onStomach = 8 + Math.round(r() * 10);
    const onLeft = Math.round((sleepDurationMin - onBack - onStomach) * 0.6);
    const onRight = sleepDurationMin - onBack - onStomach - onLeft;
    // most snores happen on the back
    const backSnoreShare = 0.78 - (isPostFit ? 0.15 * t : 0);
    const sLeft = Math.round(totalSnores * 0.10);
    const sStomach = Math.round(totalSnores * 0.02);
    const sBack = Math.round(totalSnores * backSnoreShare);
    const sRight = Math.max(0, totalSnores - sLeft - sBack - sStomach);

    const snoresByHour = [];
    let remaining = totalSnores;
    for (let h = 0; h < 8; h++) {
      // shape: low → peak around 3h in → fade
      const weight = Math.exp(-Math.pow(h - 3, 2) / 4);
      const v = Math.max(0, Math.min(remaining, Math.round(weight * (totalSnores / 6) + r() * 4)));
      snoresByHour.push(v);
      remaining -= v;
    }
    if (remaining > 0) snoresByHour[3] += remaining;

    const startHour = 22 + (r() < 0.5 ? 0 : 1);
    const startMin = Math.round(r() * 50);
    // Partner slept through when snore intensity stayed below a wake threshold.
    // Threshold scales with whether the device is fitted (post-fit nights are quieter).
    const wakeThreshold = isPostFit ? 70 : 95;
    const partnerSleptThrough = totalSnores < wakeThreshold && r() < 0.92;

    // Snore-type mix. The mandibular advancement device treats PALATAL snoring
    // best, so its share declines after the fit; tongue-base is the holdout and
    // its share rises. Nasal drifts with a mild seasonal (pollen) bump.
    let palatal = (isPostFit ? 0.72 - 0.20 * Math.min(1, t) : 0.72) + (r() - 0.5) * 0.06;
    let nasal = 0.07 + (r() - 0.5) * 0.04 + ((dow === 0 || dow === 3) ? 0.05 : 0);
    palatal = Math.max(0.35, Math.min(0.80, palatal));
    nasal = Math.max(0.03, Math.min(0.22, nasal));
    const tongue = Math.max(0.08, 1 - palatal - nasal);
    const typeSum = palatal + tongue + nasal;
    const snoreTypes = {
      palatal: +(palatal / typeSum).toFixed(3),
      tongue: +(tongue / typeSum).toFixed(3),
      nasal: +(nasal / typeSum).toFixed(3),
    };

    out.push({
      date: isoDate(date),
      totalSnores,
      sleepDurationMin,
      efficiency: Math.max(0.7, Math.min(0.96, efficiency)),
      hrv,
      restingHr,
      deepMin,
      remMin,
      lightMin,
      awakeMin,
      positions: { side_left: onLeft, side_right: onRight, back: onBack, stomach: onStomach },
      positionSnores: { side_left: sLeft, side_right: sRight, back: sBack, stomach: sStomach },
      snoresByHour,
      peakDb: Math.round(34 + r() * 6),
      strapPosition: isPostFit ? Math.min(5, 1 + Math.floor(daysSinceFit / 7)) : 0,
      startedAt: `${pad2(startHour)}:${pad2(startMin)}`,
      endedAt: '06:42',
      alcohol,
      partnerSleptThrough,
      snoreTypes,
    });
  }
  return out;
}

function defaultChat(today: Date): ChatMessage[] {
  const t = today.getTime();
  return [
    { id: 'm1', who: 'them', text: 'Morning, Matt. Solid night.', ts: t - 3 * 60_000 },
    { id: 'm2', who: 'them', text: 'You were quieter than nine of the last fourteen. Down 38%.', ts: t - 2 * 60_000 },
    {
      id: 'm3',
      who: 'them',
      card: { kind: 'snore-summary', date: isoDate(today), total: 42, baseline: 68 },
      ts: t - 90_000,
    },
    {
      id: 'm4',
      who: 'them',
      text: "Two thoughts on this — want me to walk you through what changed at hour three? It's worth a look.",
      ts: t - 60_000,
    },
  ];
}

function defaultRecommendations(today: Date): Recommendation[] {
  const apr21 = new Date(today); apr21.setDate(today.getDate() - 14);
  const apr9 = new Date(today); apr9.setDate(today.getDate() - 26);
  const mar28 = new Date(today); mar28.setDate(today.getDate() - 38);
  return [
    {
      id: 'r1',
      name: 'Magnesium',
      emphasis: 'glycinate · 200 mg',
      quote: '"Your deep sleep dipped two weeks running. This is the form that doesn\'t upset most stomachs."',
      recommendedOn: isoDate(apr21),
      price: '$24',
      priceSubtext: '60 ct',
      iconKind: 'pill',
    },
    {
      id: 'r2',
      name: 'Side-sleep',
      emphasis: 'positional pillow',
      quote: '"Position 3 still slips when you flip to your back around 2 a.m. — this catches you before you do."',
      recommendedOn: isoDate(apr9),
      price: '$58',
      iconKind: 'pillow',
    },
    {
      id: 'r3',
      name: 'Cleaning',
      emphasis: 'tablets · 60 ct',
      quote: '"You asked how to clean the tray properly. These dissolve in cold water — never warm, it\'ll warp the silicone."',
      recommendedOn: isoDate(mar28),
      price: '$14',
      iconKind: 'tablet',
    },
  ];
}

// ---------- factory ----------

export function buildSeedState(today: Date = new Date()): AppState {
  const fitDaysAgo = 21;
  const fitted = new Date(today);
  fitted.setDate(today.getDate() - fitDaysAgo);

  return {
    user: {
      name: 'Matt',
      ageRange: '35–40',
      sex: 'M',
      bmiRange: '24–27',
      shipTo: 'Matt Lassiter · 1410 Folsom St, Apt 4',
    },
    partner: {
      name: 'Sarah',
      relation: 'spouse',
      notifyAtMorning: true,
    },
    device: {
      fittedAt: isoDate(fitted),
      strapPosition: 3,
      lifespanNights: 365,
    },
    onboarding: {
      complete: true,
      step: 7,
      answers: {
        snoreFrequency: 'most-nights',
        snorePositions: ['back', 'side'],
        partnerNoticedWorse: true,
        feelsRested: 'sometimes',
        diagnosedApnea: false,
        seenSleepDoc: false,
        wantsDoctor: false,
      },
      boilCompleted: true,
    },
    nights: simulateNights(today, 30, fitDaysAgo),
    chat: defaultChat(today),
    recommendations: defaultRecommendations(today),
    uiTheme: 'auto',
    reorder: { ordered: false, remindIn3mo: true },
    liveNight: null,
  };
}
