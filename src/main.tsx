/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

import { supabase } from './lib/supabase';
import { hydrate, unhydrate, writeNight, writeSleepSession, writeSnoreEvents } from './lib/sync';
import { store } from './store';
import { configureSessionPersistence, type NightSummaryPatch } from './lib/sessionRecorder';
import type { Night } from './seed';

// ---------------------------------------------------------------------------
// Auth state -> sync bridge (PLAN.md "Client architecture"). Wired once at
// boot so every sign-in/out is caught regardless of what triggered it —
// Auth.tsx's OTP/demo-password flows, a session Supabase restores from
// localStorage on a cold load ("INITIAL_SESSION"), or a manual sign-out from
// Profile. `hydrate`/`unhydrate` (owned by the sync lane) do the rest: pull
// account data into AppState, or drop back to the local-demo seed.
// ---------------------------------------------------------------------------
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      void hydrate(session.user.id, session.user.email ?? '');
    } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
      unhydrate();
    }
    // TOKEN_REFRESHED / USER_UPDATED: session is still the same account: no
    // need to re-hydrate and clobber any not-yet-flushed optimistic writes.
  });
}

// ---------------------------------------------------------------------------
// sessionRecorder persistence wiring (PLAN.md "Night tracking v2"). The
// recorder (owned by the recorder lane) never imports Supabase itself — its
// `SessionRecorderPersistence` hooks are the seam for that, filled in here.
//
// RECONCILIATION NOTE: the recorder's hooks are row-shaped and split across
// three calls per session (`createSession`, then later `closeSession`, then
// `upsertNight`) while sync.ts's `writeSleepSession` expects one full
// `sleep_sessions` row each time (conflict target `id`, a true upsert — see
// sync.ts's DB-ACCESS CONTRACT comment). `closeSession` receives the
// session's original `started_at`/`strap_position` directly as its `meta`
// argument (sourced by sessionRecorder.ts from the IndexedDB-persisted
// buffer) rather than from in-memory state here — an in-memory map keyed by
// session id doesn't survive the reload that's the normal path for orphan
// recovery, which would otherwise silently corrupt those two fields on
// every session recovered after a crash/force-quit.
// ---------------------------------------------------------------------------

/** NightSummaryPatch is snake_case (Omit<TablesInsert<'nights'>, 'user_id'>)
 *  — sync.writeNight wants the camelCase `Night` shape, so this reverses the
 *  sessionRecorder's own `toNightPatch` mapping. */
function nightSummaryPatchToNight(p: NightSummaryPatch): Partial<Night> & { date: string } {
  const hasTypeMix =
    typeof p.type_palatal === 'number' && typeof p.type_tongue === 'number' && typeof p.type_nasal === 'number';
  return {
    date: p.date,
    totalSnores: p.total_snores ?? undefined,
    snoresByHour: (p.snores_by_hour as unknown as number[] | undefined) ?? undefined,
    peakDb: p.peak_db ?? undefined,
    startedAt: p.started_at ?? undefined,
    endedAt: p.ended_at ?? undefined,
    sleepDurationMin: p.duration_min ?? undefined,
    snoreTimePct: p.snore_time_pct ?? undefined,
    longestQuietMin: p.longest_quiet_min ?? undefined,
    snoreTypes: hasTypeMix
      ? { palatal: p.type_palatal as number, tongue: p.type_tongue as number, nasal: p.type_nasal as number }
      : undefined,
    source: (p.source as Night['source']) ?? 'recorded',
  };
}

configureSessionPersistence({
  async createSession(input) {
    const userId = store.get().auth?.userId;
    if (!userId) return null; // logged out / local-demo — recording stays local-only
    const id = crypto.randomUUID();
    const started_at = input.started_at;
    const strap_position = input.strap_position ?? null;
    writeSleepSession({
      id,
      user_id: userId,
      started_at,
      ended_at: null,
      status: 'active',
      source: 'recorded',
      strap_position,
    });
    return id;
  },
  async closeSession(sessionId, status, endedAt, meta) {
    const userId = store.get().auth?.userId;
    if (!userId) return;
    writeSleepSession({
      id: sessionId,
      user_id: userId,
      started_at: meta.startedAt,
      ended_at: endedAt,
      status,
      source: 'recorded',
      strap_position: meta.strapPosition,
    });
  },
  async upsertNight(patch) {
    writeNight(nightSummaryPatchToNight(patch));
  },
  async insertEvents(sessionId, events) {
    const userId = store.get().auth?.userId;
    // snore_events.session_id is a NOT NULL foreign key — with no remote
    // session there's nowhere for these to land. Skip rather than enqueue
    // writes that would fail forever (the queue retries with backoff, but
    // never gives up on an op).
    if (!userId || !sessionId) return;
    writeSnoreEvents(sessionId, events.map(e => ({
      session_id: sessionId,
      user_id: userId,
      ts: new Date(e.ts).toISOString(),
      duration_ms: e.durationMs,
      peak_db: e.peakDb,
      band_palatal: e.bandPalatal,
      band_tongue: e.bandTongue,
      band_nasal: e.bandNasal,
    })));
  },
});

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
