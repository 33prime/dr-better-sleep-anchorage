// Pure, graded-confidence helpers over Night[] + device state for the
// titration journey (DeviceOverview.tsx). No React, no store access — same
// contract as src/utils/insights.ts, which this file borrows the
// `Confidence` vocabulary from (type-only import, no coupling to its
// internals).
//
// Wearable-ingest fields (awakeMin) and the newer mic-measured interval field
// (snoreTimePct) are always treated as possibly-undefined here, exactly as
// insights.ts documents — a recorded night may predate a wearable pairing or
// the Night tracking v2 rollout, and that is normal input, not an error.

import type { Night } from '../seed';
import type { Confidence } from './insights';

function mean(xs: (number | undefined | null)[]): number | null {
  const clean = xs.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  return clean.length ? clean.reduce((a, v) => a + v, 0) / clean.length : null;
}

// ---------- positionHistory ----------

export interface PositionSegment {
  position: number;
  nightCount: number;
  startDate: string;
  endDate: string;
  avgSnores: number;
  /** null when snoreTimePct wasn't recorded for enough (or any) nights in this segment. */
  avgSnoreTimePct: number | null;
  /** null when peakDb wasn't recorded — shouldn't happen for recorded/seed nights, but guarded anyway. */
  avgPeakDb: number | null;
  /** null when this segment has no wearable-connected nights. */
  avgAwakeMin: number | null;
}

/**
 * Groups nights into consecutive-run segments by `strapPosition`, oldest
 * first. Nights with `strapPosition <= 0` (pre-fitting, per seed.ts) are
 * excluded — there's no titration story before the device exists.
 */
export function positionHistory(nights: Night[]): PositionSegment[] {
  const list = [...nights]
    .filter(n => n.strapPosition > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const segments: PositionSegment[] = [];
  let bucket: Night[] = [];

  const flush = () => {
    if (bucket.length === 0) return;
    segments.push({
      position: bucket[0].strapPosition,
      nightCount: bucket.length,
      startDate: bucket[0].date,
      endDate: bucket[bucket.length - 1].date,
      avgSnores: mean(bucket.map(n => n.totalSnores)) ?? 0,
      avgSnoreTimePct: mean(bucket.map(n => n.snoreTimePct)),
      avgPeakDb: mean(bucket.map(n => n.peakDb)),
      avgAwakeMin: mean(bucket.map(n => n.awakeMin)),
    });
    bucket = [];
  };

  for (const n of list) {
    if (bucket.length > 0 && bucket[bucket.length - 1].strapPosition !== n.strapPosition) flush();
    bucket.push(n);
  }
  flush();

  return segments;
}

/**
 * One-line delta story spanning the full recorded arc ("Position 1 → 3:
 * snores down 68% since fitting"). Null when there's nothing to compare
 * (fewer than two segments, no movement, or a zero-snore starting baseline
 * that would make a percentage meaningless).
 */
export function journeyStory(segments: PositionSegment[]): string | null {
  if (segments.length < 2) return null;
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first.position === last.position) return null;
  if (first.avgSnores <= 0) return null;

  const deltaPct = Math.round(((first.avgSnores - last.avgSnores) / first.avgSnores) * 100);
  if (deltaPct <= 0) {
    return `Position ${first.position} → ${last.position}: snoring hasn't come down yet.`;
  }
  return `Position ${first.position} → ${last.position}: snores down ${deltaPct}% since fitting.`;
}

// ---------- titrationAdvice ----------

export type TitrationRecommendation = 'hold' | 'advance' | 'back-off';

export interface TitrationAdvice {
  recommendation: TitrationRecommendation;
  targetPosition: number;
  sentence: string;
  confidence: Confidence;
}

/** Minimum 7-night rolling average of totalSnores among post-fit nights — the "best week" baseline. */
function bestWeekAvgSnores(nights: Night[], fittedAt: string): number | null {
  const post = [...nights].filter(n => n.date >= fittedAt).sort((a, b) => a.date.localeCompare(b.date));
  if (post.length < 7) return null;
  let best = Infinity;
  for (let i = 0; i <= post.length - 7; i++) {
    const window = post.slice(i, i + 7);
    const avg = window.reduce((a, n) => a + n.totalSnores, 0) / 7;
    if (avg < best) best = avg;
  }
  return best === Infinity ? null : best;
}

const clampPosition = (p: number): number => Math.min(5, Math.max(1, p));

/**
 * {recommendation, targetPosition, sentence, confidence} for "what should the
 * strap do next" — using deviceEffect/quietProgress-style logic (see
 * insights.ts) but scoped to the current position segment specifically:
 *
 * - advance: only once the current position has held >=7 nights (a
 *   plateau) AND its average snores is still meaningfully above the best
 *   7-night stretch achieved since fitting.
 * - back-off: only when the current segment followed an ADVANCE (position
 *   went up from the previous segment) and peakDb or awakeMin trended worse
 *   since that move — overrides the advance/hold call.
 * - hold: everything else, including all "not enough data" cases, which are
 *   marked 'insufficient' rather than dressed up as a real recommendation.
 */
export function titrationAdvice(
  nights: Night[],
  device: { strapPosition: number; fittedAt: string },
): TitrationAdvice {
  const current = device.strapPosition;
  const hold = (sentence: string, confidence: Confidence): TitrationAdvice =>
    ({ recommendation: 'hold', targetPosition: current, sentence, confidence });

  if (!current || current <= 0) {
    return hold('No strap position on record yet — keep collecting nights.', 'insufficient');
  }

  const segments = positionHistory(nights);
  if (segments.length === 0) {
    return hold('Keep collecting nights — there’s no titration history to work from yet.', 'insufficient');
  }

  const currentSeg = segments[segments.length - 1];
  if (currentSeg.position !== current) {
    // No tracked night reflects the strap's current position yet (e.g. a
    // just-made adjustment, or a per-night position history that hasn't
    // caught up to the device record) — say so honestly rather than
    // reasoning from a segment that doesn't match where the strap is now.
    return hold(`No tracked nights yet at position ${current} — keep collecting nights before the next call.`, 'insufficient');
  }

  if (currentSeg.nightCount < 4) {
    const n = currentSeg.nightCount;
    return hold(
      `Only ${n} night${n === 1 ? '' : 's'} at position ${current} so far — keep collecting nights before adjusting.`,
      'insufficient',
    );
  }

  // Back-off check: only meaningful right after an advance (position increase).
  const prevSeg = segments.length >= 2 ? segments[segments.length - 2] : null;
  if (prevSeg && current > prevSeg.position) {
    const peakWorse =
      currentSeg.avgPeakDb !== null && prevSeg.avgPeakDb !== null && currentSeg.avgPeakDb > prevSeg.avgPeakDb + 2;
    const awakeWorse =
      currentSeg.avgAwakeMin !== null && prevSeg.avgAwakeMin !== null && currentSeg.avgAwakeMin > prevSeg.avgAwakeMin * 1.15;
    if (peakWorse || awakeWorse) {
      const target = clampPosition(current - 1);
      const cause = peakWorse ? 'peak volume' : 'restlessness';
      return {
        recommendation: 'back-off',
        targetPosition: target,
        sentence: `Since moving to position ${current}, ${cause} crept up instead of down — worth trying position ${target} instead.`,
        confidence: currentSeg.nightCount >= 7 ? 'solid' : 'emerging',
      };
    }
  }

  if (currentSeg.nightCount < 7) {
    return hold(`${currentSeg.nightCount} nights at position ${current} so far — a few more before the next call.`, 'emerging');
  }

  // Plateau reached (>=7 nights held). Compare against the best week since fitting.
  const bestWeek = bestWeekAvgSnores(nights, device.fittedAt);
  if (bestWeek === null) {
    return hold(`Holding steady at position ${current} for ${currentSeg.nightCount} nights.`, 'emerging');
  }

  const aboveBaseline = currentSeg.avgSnores > bestWeek * 1.1;
  if (aboveBaseline && current < 5) {
    const target = clampPosition(current + 1);
    return {
      recommendation: 'advance',
      targetPosition: target,
      sentence: `You’ve held position ${current} for ${currentSeg.nightCount} nights and snoring is still above your best week (${Math.round(currentSeg.avgSnores)} vs. ${Math.round(bestWeek)} avg) — worth trying position ${target}.`,
      confidence: 'solid',
    };
  }

  return {
    recommendation: 'hold',
    targetPosition: current,
    sentence: `Position ${current} has held for ${currentSeg.nightCount} nights near your best week (${Math.round(currentSeg.avgSnores)} avg) — no adjustment needed right now.`,
    confidence: 'solid',
  };
}

// ---------- replacementProjection ----------

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ReplacementProjection {
  iso: string;   // YYYY-MM-DD
  label: string; // "Month YYYY"
}

/** `fittedAt + lifespanNights` (or the last replacement date, if any), as a month/year projection. */
export function replacementProjection(device: { fittedAt: string; lifespanNights: number; lastReplacement?: string }): ReplacementProjection | null {
  const anchor = device.lastReplacement || device.fittedAt;
  if (!anchor || !device.lifespanNights) return null;
  const [y, m, d] = anchor.split('-').map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d);
  const target = new Date(start);
  target.setDate(start.getDate() + device.lifespanNights);
  const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
  return { iso, label: `${SHORT_MONTHS[target.getMonth()]} ${target.getFullYear()}` };
}
