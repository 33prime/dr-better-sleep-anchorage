// Reactive store with localStorage persistence. Tiny pub/sub.

import { useSyncExternalStore } from 'react';
import { buildSeedState, type AppState } from './seed';

// Bump this when the persisted shape changes so stale state from an older
// deploy is discarded instead of crashing on a missing field (e.g. a phone
// that cached state from before `partner` existed).
const KEY = 'dr-better-sleep:v4'; // v4: story-driven demo seed matching the papercraft mocks

type Listener = (state: AppState) => void;

class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor() {
    const loaded = this.load();
    // Merge over a fresh seed so any field missing from an older persisted
    // shape is backfilled with a default rather than being undefined at access.
    this.state = loaded ? { ...buildSeedState(), ...loaded } : buildSeedState();
    this.persist();
  }

  get(): AppState { return this.state; }

  /**
   * Apply an immutable update. The updater can return a new state or mutate
   * a draft in place (we apply via shallow clone after the call).
   */
  set(updater: (s: AppState) => AppState | void): void {
    const result = updater(this.state);
    this.state = result ?? { ...this.state };
    this.persist();
    this.listeners.forEach(l => l(this.state));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset(): void {
    this.state = buildSeedState();
    this.persist();
    this.listeners.forEach(l => l(this.state));
  }

  // ---------- persistence ----------

  private load(): AppState | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Light schema-version guard: if the seed shape changes, reseed.
      if (!parsed || typeof parsed !== 'object' || !('user' in parsed) || !('nights' in parsed)) {
        return null;
      }
      return parsed as AppState;
    } catch {
      return null;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // quota exceeded or unavailable — ignore for demo
    }
  }
}

export const store = new Store();

/** React hook: subscribe to the store and re-render when state changes. */
export function useStore<T = AppState>(selector: (s: AppState) => T = (s => s as unknown as T)): T {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => selector(store.get()),
    () => selector(store.get()),
  );
}

// ---------- derived helpers ----------

export function lastNight(s: AppState) {
  return s.nights[s.nights.length - 1];
}

export function baselineSnores(s: AppState, windowDays = 30): number {
  // Average of all but the last night, over the window.
  const window = s.nights.slice(-windowDays - 1, -1);
  if (window.length === 0) return 0;
  return window.reduce((a, n) => a + n.totalSnores, 0) / window.length;
}

export function streakNights(s: AppState): number {
  // Nights since fitting, capped at length.
  return Math.min(s.nights.length, daysSince(s.device.fittedAt));
}

export function daysSince(iso: string, ref: Date = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const ms = ref.getTime() - then;
  return Math.max(0, Math.floor(ms / (24 * 3600 * 1000)));
}

export function findNight(s: AppState, isoDate: string) {
  return s.nights.find(n => n.date === isoDate);
}

/** Partner slept-through stat over the last `n` nights. */
export function partnerSleptThroughLastN(s: AppState, n = 7): { slept: number; total: number } {
  const window = s.nights.slice(-n);
  return {
    slept: window.filter(x => x.partnerSleptThrough).length,
    total: window.length,
  };
}

/** Same stat but for the week before the last week — for week-over-week delta. */
export function partnerSleptThroughPrevWeek(s: AppState, n = 7): { slept: number; total: number } {
  const window = s.nights.slice(-2 * n, -n);
  return {
    slept: window.filter(x => x.partnerSleptThrough).length,
    total: window.length,
  };
}

/**
 * Ratio of average snores on alcohol nights vs. non-alcohol nights, post-device.
 * Returns null if either bucket is empty.
 */
export function wineMultiplier(s: AppState): number | null {
  const fitDate = s.device.fittedAt;
  const post = s.nights.filter(n => n.date >= fitDate);
  const wine = post.filter(n => n.alcohol);
  const sober = post.filter(n => !n.alcohol);
  if (wine.length === 0 || sober.length === 0) return null;
  const avg = (xs: typeof post) => xs.reduce((a, n) => a + n.totalSnores, 0) / xs.length;
  return avg(wine) / avg(sober);
}

type SnoreTypes = { palatal: number; tongue: number; nasal: number };

/** Snore-type mix for the last `n` nights — for the trend ribbon. */
export function snoreTypeSeries(s: AppState, n = 14): SnoreTypes[] {
  return s.nights.slice(-n).map(x => x.snoreTypes).filter(Boolean);
}

/**
 * Cosine similarity of the latest night's snore fingerprint vs. the prior
 * two-week mean (0..1). Low similarity flags a night that doesn't match the
 * user's usual pattern — worth a closer look.
 */
export function snoreFingerprintSimilarity(s: AppState): number | null {
  const nights = s.nights.filter(n => n.snoreTypes);
  if (nights.length < 4) return null;
  const last = nights[nights.length - 1].snoreTypes;
  const prior = nights.slice(-15, -1);
  if (!prior.length) return null;
  const mean: SnoreTypes = {
    palatal: prior.reduce((a, n) => a + n.snoreTypes.palatal, 0) / prior.length,
    tongue: prior.reduce((a, n) => a + n.snoreTypes.tongue, 0) / prior.length,
    nasal: prior.reduce((a, n) => a + n.snoreTypes.nasal, 0) / prior.length,
  };
  const a = [last.palatal, last.tongue, last.nasal];
  const b = [mean.palatal, mean.tongue, mean.nasal];
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ma = Math.hypot(...a), mb = Math.hypot(...b);
  if (ma === 0 || mb === 0) return null;
  return dot / (ma * mb);
}
