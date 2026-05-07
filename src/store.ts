// Reactive store with localStorage persistence. Tiny pub/sub.

import { useSyncExternalStore } from 'react';
import { buildSeedState, type AppState } from './seed';

const KEY = 'dr-better-sleep:v1';

type Listener = (state: AppState) => void;

class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = this.load() ?? buildSeedState();
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
