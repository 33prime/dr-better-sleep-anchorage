// Rule-based coach helpers for the chat screen: tappable starter questions and
// a single proactive opener from Dr. Sommers. Everything here is local and
// data-driven — none of it touches the Anthropic API. Keep the voice plain,
// calm, and lowercase-casual for the proactive line.

import type { AppState } from '../seed';
import {
  lastNight,
  baselineSnores,
  wineMultiplier,
  streakNights,
  partnerSleptThroughLastN,
} from '../store';

/**
 * 3–4 short, tappable starter questions, lightly tailored to the data.
 * Plain and calm — these read as something the user would actually tap.
 */
export function suggestedPrompts(state: AppState): string[] {
  const prompts: string[] = [];

  // Weekend + heavy wine pattern → surface the alcohol question first.
  const mult = wineMultiplier(state);
  const dow = new Date().getDay(); // 0=Sun … 5=Fri, 6=Sat
  const weekend = dow === 5 || dow === 6 || dow === 0;
  if (mult !== null && mult > 1.25 && weekend) {
    prompts.push('Why does alcohol matter?');
  }

  // An uptick last night → invite a look at what changed.
  const last = lastNight(state);
  const baseline = baselineSnores(state);
  if (last && baseline > 0 && last.totalSnores > baseline * 1.2) {
    prompts.push('Why was last night louder?');
  } else {
    prompts.push("How's my progress?");
  }

  prompts.push("What's my snore type?");
  prompts.push('What should I try tonight?');

  // Keep it to at most four, de-duped, preserving order.
  return [...new Set(prompts)].slice(0, 4);
}

/**
 * One short Dr. Sommers message chosen by rule from the data, or null if
 * nothing's notable. 1–2 sentences, lowercase-casual, warm/clinical, with
 * *asterisks* for light emphasis. No lists.
 *
 * All data access is guarded — lastNight can be null and wineMultiplier can
 * be null on a fresh/empty dataset.
 */
export function proactiveOpener(state: AppState): string | null {
  const last = lastNight(state);
  const baseline = baselineSnores(state);
  const mult = wineMultiplier(state);
  const dow = new Date().getDay(); // 0=Sun, 5=Fri, 6=Sat
  const weekend = dow === 5 || dow === 6 || dow === 0;

  // 1) Weekend + meaningful wine effect → a gentle heads-up.
  if (weekend && mult !== null && mult > 1.25) {
    const pct = Math.round((mult - 1) * 100);
    return `heads up — it's the weekend, and on the nights you've had a drink you've snored about *${pct}% more*. nothing dramatic, just something to keep in mind tonight.`;
  }

  // 2) Last night notably above baseline → note the uptick, ask what changed.
  if (last && baseline > 0 && last.totalSnores > baseline * 1.2) {
    return `last night ran a little louder — *${last.totalSnores}* snores against your usual ${Math.round(baseline)}. anything different before bed?`;
  }

  // 3) Streak milestone → quiet encouragement, mention Sarah if she's resting.
  const streak = streakNights(state);
  if (streak === 7 || streak === 14 || streak === 21 || streak === 30) {
    const partner = partnerSleptThroughLastN(state, streak >= 14 ? 14 : 7);
    const sarahResting = partner.total > 0 && partner.slept >= Math.ceil(partner.total * 0.7);
    if (sarahResting) {
      return `that's *${streak} nights* with the device now — and ${state.partner.name}'s slept through most of them. quietly proud of you.`;
    }
    return `*${streak} nights* in. you've built a real rhythm here — that's the part most people never get to.`;
  }

  // 4) Otherwise → a calm check-in referencing last night vs baseline.
  if (last && baseline > 0) {
    if (last.totalSnores < baseline * 0.9) {
      return `quiet one last night — *${last.totalSnores}* snores, under your ${Math.round(baseline)} baseline. you're trending the right way.`;
    }
    return `last night landed right around your usual — *${last.totalSnores}* snores vs a ${Math.round(baseline)} baseline. steady. anything on your mind?`;
  }

  return null;
}
