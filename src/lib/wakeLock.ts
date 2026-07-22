// Screen Wake Lock — keeps the phone's display on overnight so the mic-listening
// screen doesn't get killed by the OS. Falls back gracefully where unsupported
// (iOS Safari pre-16.4 has no Wake Lock API at all).

import { useEffect, useRef, useState } from 'react';

export type WakeLockStatus = 'unsupported' | 'idle' | 'active' | 'denied';

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Requests a screen wake lock while `active` is true, and reacquires it
 * automatically when the tab regains visibility — the OS force-releases the
 * lock whenever the page is backgrounded (e.g. the user glances away and
 * back), which is the normal case overnight.
 *
 * Returns a status the Night screen can use to show a "keep this screen on"
 * hint when the API is missing or the request was denied, rather than
 * silently letting the phone sleep.
 */
export function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>(supported() ? 'idle' : 'unsupported');
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!supported()) {
      setStatus('unsupported');
      return;
    }
    if (!active) {
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
      setStatus('idle');
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          // The OS released it (backgrounded, low battery, etc). Clear the
          // ref so `onVisibility`'s `!sentinelRef.current` guard can fire
          // again — otherwise it keeps pointing at this now-dead sentinel
          // forever, and every subsequent visibilitychange back to
          // 'visible' silently no-ops, permanently ending wake-lock
          // protection after the very first OS-initiated release.
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
          if (!cancelled) setStatus('idle');
        });
        setStatus('active');
      } catch {
        if (!cancelled) setStatus('denied');
      }
    };

    acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active && !sentinelRef.current) acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [active]);

  return status;
}
