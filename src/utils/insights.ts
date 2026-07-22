// Pure, graded-confidence insight functions over Night[]. No React, no store
// access — screens (MorningReveal today, chatApi's buildDataContext later)
// call these with whatever slice of nights they have and render the returned
// `sentence` / `value` directly, honoring `confidence` in how boldly the copy
// is framed.
//
// Wearable-ingest fields (hrv, restingHr, efficiency, deepMin, remMin,
// lightMin, awakeMin, positions, positionSnores) are always treated as
// possibly-undefined here: a recorded night carries mic-measured fields only
// until a wearable is paired, and that is normal input, not an error. The
// newer mic-measured time-interval fields (`snoreTimePct`, `longestQuietMin`)
// are guarded the same way, since older/seed nights predate them and may not
// have them populated either.
//
// seed.ts (owned by the sync lane) is being edited in parallel and may not
// yet declare `snoreTimePct` / `longestQuietMin` / `source` on `Night` at the
// moment this file lands. `NightPlus` below declares them locally so this
// file type-checks either way, and always reads them defensively at runtime.

import type { Night } from '../seed';

export type Confidence = 'solid' | 'emerging' | 'insufficient';

export interface Insight<T> {
  value: T | null;
  confidence: Confidence;
  sentence: string;
}

type NightPlus = Night & {
  snoreTimePct?: number;
  longestQuietMin?: number;
  source?: 'recorded' | 'demo' | 'manual' | 'seed';
};

const asPlus = (nights: Night[]): NightPlus[] => nights as NightPlus[];

// ---------- shared helpers ----------

function mean(xs: (number | undefined | null)[]): number | null {
  const clean = xs.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  return clean.length ? clean.reduce((a, v) => a + v, 0) / clean.length : null;
}

function pctDelta(curr: number, base: number): number {
  if (base === 0) return 0;
  return (curr - base) / base;
}

function fmtPctAbs(v: number): string {
  return `${Math.round(Math.abs(v) * 100)}%`;
}

function cap(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ---------- snoreTimeTrend ----------

/**
 * Recent vs. prior window trend in snore-time percentage (the time-interval
 * metric research finding #2 favors over raw counts). Falls back to a
 * totalSnores-per-minute proxy when `snoreTimePct` hasn't been computed for
 * enough of these nights yet (older/seed data).
 */
export function snoreTimeTrend(nights: Night[], windowNights = 7): Insight<number> {
  const list = asPlus(nights);
  const recent = list.slice(-windowNights);
  const prior = list.slice(-2 * windowNights, -windowNights);

  const enoughPct = (xs: NightPlus[]) =>
    xs.filter(n => typeof n.snoreTimePct === 'number').length >= Math.ceil(xs.length / 2);
  const usePct = recent.length > 0 && prior.length > 0 && enoughPct(recent) && enoughPct(prior);

  const rate = (n: NightPlus): number | null =>
    n.sleepDurationMin > 0 ? n.totalSnores / n.sleepDurationMin : null;

  const recentVal = usePct ? mean(recent.map(n => n.snoreTimePct)) : mean(recent.map(rate));
  const priorVal = usePct ? mean(prior.map(n => n.snoreTimePct)) : mean(prior.map(rate));
  const metric = usePct ? 'snore time' : 'snore rate';

  if (recentVal === null || recent.length < 3) {
    return {
      value: null,
      confidence: 'insufficient',
      sentence: 'Not enough nights yet to call a trend — a few more and this will sharpen up.',
    };
  }

  if (priorVal === null || prior.length < 3) {
    const recentDisplay = usePct ? fmtPctAbs(recentVal) : `${recentVal.toFixed(2)} snores/min`;
    return {
      value: recentVal,
      confidence: 'emerging',
      sentence: `Averaging ${recentDisplay} ${metric} over the last ${recent.length} nights — too early yet to compare against a prior stretch.`,
    };
  }

  const delta = pctDelta(recentVal, priorVal);
  const confidence: Confidence = recent.length >= 7 && prior.length >= 7 ? 'solid' : 'emerging';

  if (Math.abs(delta) <= 0.05) {
    return {
      value: delta,
      confidence,
      sentence: `${cap(metric)} is holding steady over the last ${recent.length} nights vs. the ${prior.length} before that.`,
    };
  }
  const dir = delta < 0 ? 'down' : 'up';
  return {
    value: delta,
    confidence,
    sentence: `${cap(metric)} is ${dir} ${fmtPctAbs(delta)} over the last ${recent.length} nights vs. the ${prior.length} before that.`,
  };
}

// ---------- wineEffect ----------

/**
 * How much louder (or not) alcohol nights run vs. sober nights, over
 * whatever nights are passed in. Generalized from the old store.ts
 * `wineMultiplier` — callers that want a post-device-fit-only comparison
 * should slice `nights` to that range before calling.
 */
export function wineEffect(nights: Night[]): Insight<number> {
  const wine = nights.filter(n => n.alcohol);
  const sober = nights.filter(n => !n.alcohol);

  if (wine.length < 2 || sober.length < 2) {
    return {
      value: null,
      confidence: 'insufficient',
      sentence: 'Not enough logged drink-nights yet to say whether alcohol moves your snoring.',
    };
  }

  const wineAvg = mean(wine.map(n => n.totalSnores));
  const soberAvg = mean(sober.map(n => n.totalSnores));
  if (wineAvg === null || soberAvg === null || soberAvg === 0) {
    return {
      value: null,
      confidence: 'insufficient',
      sentence: 'Not enough sober nights logged yet to compare against.',
    };
  }

  const multiplier = wineAvg / soberAvg;
  const confidence: Confidence = wine.length >= 5 && sober.length >= 5 ? 'solid' : 'emerging';

  if (multiplier <= 1.1) {
    return {
      value: multiplier,
      confidence,
      sentence: `Nights with a drink logged look about the same as sober nights (${wine.length} vs. ${sober.length} nights compared).`,
    };
  }
  const pct = Math.round((multiplier - 1) * 100);
  return {
    value: multiplier,
    confidence,
    sentence: `On nights you log a drink, you snore about ${pct}% more than sober nights (${wine.length} vs. ${sober.length} nights compared).`,
  };
}

// ---------- typeMixShift ----------

type TypeKey = 'palatal' | 'tongue' | 'nasal';
type TypeMix = Record<TypeKey, number>;

export interface TypeMixShiftValue {
  type: TypeKey;
  deltaPts: number; // percentage points, recent minus prior
}

function meanMix(xs: Night[]): TypeMix | null {
  const withMix = xs.filter(n => n.snoreTypes);
  if (!withMix.length) return null;
  return {
    palatal: mean(withMix.map(n => n.snoreTypes.palatal)) ?? 0,
    tongue: mean(withMix.map(n => n.snoreTypes.tongue)) ?? 0,
    nasal: mean(withMix.map(n => n.snoreTypes.nasal)) ?? 0,
  };
}

function dominantType(mix: TypeMix): TypeKey {
  return (Object.entries(mix) as [TypeKey, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

/** Shift in acoustic snore-type mix over a 14-night window vs. the 14 before it. */
export function typeMixShift(nights: Night[], windowNights = 14): Insight<TypeMixShiftValue> {
  const withMix = nights.filter(n => n.snoreTypes);
  const recent = withMix.slice(-windowNights);
  const prior = withMix.slice(-2 * windowNights, -windowNights);

  const recentMix = recent.length >= 4 ? meanMix(recent) : null;
  const priorMix = prior.length >= 4 ? meanMix(prior) : null;

  if (!recentMix || !priorMix) {
    return {
      value: null,
      confidence: 'insufficient',
      sentence: 'Snore-type mix needs a couple more weeks of nights before a shift means anything.',
    };
  }

  const deltas: TypeMixShiftValue[] = (['palatal', 'tongue', 'nasal'] as TypeKey[]).map(type => ({
    type,
    deltaPts: (recentMix[type] - priorMix[type]) * 100,
  }));
  deltas.sort((a, b) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts));
  const top = deltas[0];
  const confidence: Confidence = recent.length >= windowNights && prior.length >= windowNights ? 'solid' : 'emerging';

  if (Math.abs(top.deltaPts) < 3) {
    return {
      value: top,
      confidence,
      sentence: `Your snore-type mix has held steady the last ${recent.length} nights — mostly ${dominantType(recentMix)}.`,
    };
  }
  const dir = top.deltaPts > 0 ? 'up' : 'down';
  return {
    value: top,
    confidence,
    sentence: `${cap(top.type)} snoring is ${dir} ${Math.round(Math.abs(top.deltaPts))} points over the last ${recent.length} nights vs. the ${prior.length} before.`,
  };
}

// ---------- quietProgress ----------

/** Trend in longest quiet stretch (mic-measured; may be absent on older nights). */
export function quietProgress(nights: Night[], windowNights = 7): Insight<number> {
  const list = asPlus(nights).filter(n => typeof n.longestQuietMin === 'number');
  const recent = list.slice(-windowNights);
  const prior = list.slice(-2 * windowNights, -windowNights);

  if (recent.length < 3) {
    return {
      value: null,
      confidence: 'insufficient',
      sentence: "Longest quiet stretch isn't tracked for enough recent nights yet.",
    };
  }
  const recentAvg = mean(recent.map(n => n.longestQuietMin)) ?? 0;

  if (prior.length < 3) {
    return {
      value: recentAvg,
      confidence: 'emerging',
      sentence: `Your longest quiet stretch has averaged ${recentAvg.toFixed(0)} min over the last ${recent.length} nights — a bit more history and we can compare it to before.`,
    };
  }
  const priorAvg = mean(prior.map(n => n.longestQuietMin)) ?? 0;
  const diff = recentAvg - priorAvg;
  const confidence: Confidence = recent.length >= 7 && prior.length >= 7 ? 'solid' : 'emerging';

  if (Math.abs(diff) < 2) {
    return {
      value: diff,
      confidence,
      sentence: `Longest quiet stretch is holding around ${recentAvg.toFixed(0)} min a night.`,
    };
  }
  const dir = diff > 0 ? 'stretched' : 'shrunk';
  return {
    value: diff,
    confidence,
    sentence: `Your longest quiet stretch has ${dir} to ${recentAvg.toFixed(0)} min a night, ${diff > 0 ? '+' : ''}${diff.toFixed(0)} vs. the ${prior.length} nights before.`,
  };
}

// ---------- deviceEffect ----------

/**
 * Pre/post fitted-date baseline delta. Unlike the other functions this needs
 * `fittedAt` alongside `nights` — the fit date isn't a Night field, so it
 * can't be derived from `Night[]` alone (still a pure function, just two args).
 */
export function deviceEffect(nights: Night[], fittedAt: string): Insight<number> {
  const pre = nights.filter(n => n.date < fittedAt);
  const post = nights.filter(n => n.date >= fittedAt);

  if (pre.length < 3 || post.length < 3) {
    return {
      value: null,
      confidence: 'insufficient',
      sentence: "Need a few more nights on both sides of the fitting date to measure the device's effect.",
    };
  }
  const preAvg = mean(pre.map(n => n.totalSnores));
  const postAvg = mean(post.map(n => n.totalSnores));
  if (preAvg === null || postAvg === null || preAvg === 0) {
    return {
      value: null,
      confidence: 'insufficient',
      sentence: 'No baseline snoring recorded before the device was fitted.',
    };
  }

  const delta = pctDelta(postAvg, preAvg);
  const confidence: Confidence = pre.length >= 7 && post.length >= 14 ? 'solid' : 'emerging';

  if (Math.abs(delta) <= 0.05) {
    return {
      value: delta,
      confidence,
      sentence: `Snoring since fitting the device is about the same as your ${pre.length}-night pre-fit baseline.`,
    };
  }
  const dir = delta < 0 ? 'down' : 'up';
  return {
    value: delta,
    confidence,
    sentence: `Snoring is ${dir} ${fmtPctAbs(delta)} since fitting the device, vs. your ${pre.length}-night pre-fit baseline.`,
  };
}

// ---------- bestNight ----------

export interface BestNightValue {
  date: string;
  totalSnores: number;
}

/** Quietest night (fewest total snores) within a trailing window. */
export function bestNight(nights: Night[], windowNights = 30): Insight<BestNightValue> {
  const list = nights.slice(-windowNights);
  if (list.length < 3) {
    return { value: null, confidence: 'insufficient', sentence: 'Not enough nights yet to call out a best one.' };
  }
  const best = list.reduce((a, b) => (b.totalSnores < a.totalSnores ? b : a));
  const confidence: Confidence = list.length >= 14 ? 'solid' : 'emerging';
  const isLatest = best.date === list[list.length - 1].date;

  const sentence = isLatest
    ? `Last night was your quietest of the last ${list.length} — ${best.totalSnores} snores.`
    : `Your quietest night of the last ${list.length} was ${best.date}, at ${best.totalSnores} snores.`;

  return { value: { date: best.date, totalSnores: best.totalSnores }, confidence, sentence };
}

// ---------- weekSummary ----------

export interface WeekSummaryValue {
  avgSnores: number;
  totalNights: number;
  quieterNights: number | null; // nights this week quieter than the prior week's avg
  partnerSleptThrough: { slept: number; total: number };
}

/** Rollup of the last 7 nights vs. the 7 before, for the morning "here's what stood out" line. */
export function weekSummary(nights: Night[]): Insight<WeekSummaryValue> {
  const week = nights.slice(-7);
  const prevWeek = nights.slice(-14, -7);

  if (week.length < 3) {
    return { value: null, confidence: 'insufficient', sentence: 'Not enough nights logged this week yet for a summary.' };
  }

  const avgSnores = mean(week.map(n => n.totalSnores)) ?? 0;
  const prevAvg = mean(prevWeek.map(n => n.totalSnores));
  const quieterNights = prevAvg !== null ? week.filter(n => n.totalSnores < prevAvg).length : null;
  const partnerSleptThrough = {
    slept: week.filter(n => n.partnerSleptThrough).length,
    total: week.length,
  };
  const confidence: Confidence = week.length >= 7 && prevWeek.length >= 5 ? 'solid' : 'emerging';

  const parts = [`averaging ${Math.round(avgSnores)} snores a night over the last ${week.length} nights`];
  if (quieterNights !== null) parts.push(`quieter than the week before on ${quieterNights} of ${week.length} nights`);
  if (partnerSleptThrough.total > 0) parts.push(`partner slept through ${partnerSleptThrough.slept} of ${partnerSleptThrough.total}`);

  return {
    value: { avgSnores, totalNights: week.length, quieterNights, partnerSleptThrough },
    confidence,
    sentence: cap(parts.join(' — ')) + '.',
  };
}
