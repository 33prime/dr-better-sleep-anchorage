// Real "share last night" action — Web Share API with a clipboard fallback.
// Shared by every screen that offers a "Share with <partner>" affordance so
// the partner's name and the summary text are computed in exactly one place
// (never hardcoded per-screen — see PLAN2.md Lane B item 4).

import { lastNight } from '../store';
import type { AppState } from '../seed';
import { showToast } from '../components/Toast';
import { fmtDuration, fmtPct } from '../utils/format';

export async function shareLastNight(state: AppState): Promise<void> {
  const n = lastNight(state);
  if (!n) {
    showToast('No nights tracked yet.');
    return;
  }
  const bits = [`${n.totalSnores} snores over ${fmtDuration(n.sleepDurationMin)}`];
  if (typeof n.efficiency === 'number') bits.push(`${fmtPct(n.efficiency)} sleep efficiency`);
  if (n.partnerSleptThrough) bits.push('you slept through it 🎉');
  const text = `Last night: ${bits.join(' · ')}. 🌙`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: "Last night's sleep", text });
      return;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // user cancelled — no toast
      // otherwise fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied — paste it to ${state.partner.name}.`);
  } catch {
    showToast("Couldn't share — try again.");
  }
}
