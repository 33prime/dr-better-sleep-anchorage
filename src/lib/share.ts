// Real "share last night" action — Web Share API with a clipboard fallback.
// Shared by every screen that offers a "Share with <partner>" affordance so
// the partner's name and the summary text are computed in exactly one place
// (never hardcoded per-screen — see PLAN2.md Lane B item 4).

import { lastNight } from '../store';
import type { AppState } from '../seed';
import { showToast } from '../components/Toast';
import { fmtDuration, fmtPct } from '../utils/format';
import { renderShareCard, shareCardFileName } from './shareCard';

// Type-only sliver of the Web Share Level 2 surface (`files` in ShareData /
// canShare) — not yet in every TS DOM lib revision, so we widen locally
// instead of touching tsconfig for one optional field.
interface ShareDataWithFiles extends ShareData {
  files?: File[];
}
type NavigatorWithFileShare = Navigator & {
  canShare?: (data?: ShareDataWithFiles) => boolean;
  share?: (data?: ShareDataWithFiles) => Promise<void>;
};

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
  const nav = navigator as NavigatorWithFileShare;

  // Image share (Web Share Level 2 `files`) — attempted first, but only
  // when the platform actually declares file-share support via canShare();
  // the card is rendered on demand so unsupported platforms never pay for
  // the canvas work. Any failure here (render error, share rejection other
  // than a user cancel) falls through to the plain-text path below rather
  // than leaving the share attempt silently stuck.
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    try {
      const blob = await renderShareCard(state);
      if (blob) {
        const file = new File([blob], shareCardFileName(n.date), { type: 'image/png' });
        if (nav.canShare({ files: [file] })) {
          try {
            await nav.share({ title: "Last night's sleep", text, files: [file] });
            return;
          } catch (err) {
            if ((err as Error)?.name === 'AbortError') return; // user cancelled — no toast, no fallback
            // otherwise fall through to the text share / clipboard path
          }
        }
      }
    } catch {
      // Card render failed (e.g. canvas unavailable) — fall through.
    }
  }

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
