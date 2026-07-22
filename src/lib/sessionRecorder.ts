// Owns a night's recording session end-to-end: buffers snore events in
// memory, mirrors them to IndexedDB incrementally so a crash mid-night loses
// at most ~30s, and — on end (or on recovering an orphaned buffer after a
// crash) — computes the honest `NightSummary` the rest of the app persists
// and displays. No fabricated numbers: everything here is either measured
// from real event timestamps or a fixed, documented default.
//
// This module never imports Supabase directly. It accepts persistence hooks
// (`SessionRecorderPersistence`) so it stays testable and so the actual
// wiring to the sync queue / db lives in the integrate lane's code, not
// here — see `configureSessionPersistence` below.

import type { TablesInsert } from './database.types';
import type { SnoreEventRecord } from '../hooks/useSnoreDetector';
import type { Night } from '../seed';
import { fmtClockHM, isoDate } from '../utils/format';

const DB_NAME = 'dns-sessions';
const DB_VERSION = 1;
const STORE = 'events';

/** What's mirrored to IndexedDB — one record per in-progress session. */
interface SessionBuffer {
  sessionId: string;              // local id; the IDB key. Independent of the remote row.
  remoteSessionId: string | null; // `sleep_sessions.id`, once/if it's been created
  startedAtMs: number;
  strapPosition: number | null;
  events: SnoreEventRecord[];
  updatedAtMs: number;
}

export interface NightSummary {
  date: string;          // ISO YYYY-MM-DD — the evening the session started
  startedAt: string;      // "H:MM", 24h
  endedAt: string;        // "H:MM", 24h
  durationMin: number;
  totalSnores: number;
  snoresByHour: number[]; // real counts, bucketed by clock-hour offset from start
  peakDb: number;
  typeMix: { palatal: number; tongue: number; nasal: number };
  snoreTimePct: number;   // 0..1, fraction of the session inside <60s-gap runs
  longestQuietMin: number;
  /** Strap position captured when this session *started* — matters for
   *  recovered nights, where "now" may be a different position than the
   *  device was set to that night. */
  strapPosition: number | null;
  /** Always 'recorded' — this pipeline only ever emits measured data. */
  source: 'recorded';
  /** True if this summary came from `recoverOrphans` (the app never called
   *  `end()` — crash, force-quit, tab killed) rather than a clean end. */
  recovered: boolean;
}

/** The `nights` row this module can fill in — everything except `user_id`,
 *  which only the caller (who knows the signed-in user) can supply. */
export type NightSummaryPatch = Omit<TablesInsert<'nights'>, 'user_id'>;

export interface SessionRecorderPersistence {
  /** Best-effort: insert the `sleep_sessions` row. Return its id, or null if
   *  it couldn't be created (offline / not signed in) — recording continues
   *  locally regardless of whether this succeeds. */
  createSession?(input: Pick<TablesInsert<'sleep_sessions'>, 'started_at' | 'strap_position'>): Promise<string | null>;
  /** Flip `sleep_sessions.status` once the night is over or recovered.
   *  `meta` is the session's original `started_at`/`strap_position` — always
   *  sourced from the (IndexedDB-persisted) `SessionBuffer`, never from
   *  caller-side in-memory state, so a fresh page load (recovering an
   *  orphaned buffer after a crash) still closes the row with its real,
   *  original values instead of corrupting them. */
  closeSession?(
    sessionId: string,
    status: 'ended' | 'abandoned',
    endedAt: string,
    meta: { startedAt: string; strapPosition: number | null },
  ): Promise<void>;
  /** Upsert the summarized `nights` row (natural key `user_id, date`). */
  upsertNight?(night: NightSummaryPatch): Promise<void>;
  /** Bulk-insert this session's `snore_events`. `sessionId` is null if a
   *  remote session was never created (offline the whole night) — the
   *  caller decides whether to create one retroactively; the summary in
   *  `upsertNight` is what matters, these are supplementary raw events. */
  insertEvents?(sessionId: string | null, events: SnoreEventRecord[]): Promise<void>;
}

// ---------- IndexedDB (no dependency — one small object store) ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('indexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'sessionId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(buffer: SessionBuffer): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(buffer);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Private-mode / unavailable IndexedDB — recording continues in memory
    // for this session; a crash just loses more than the usual ~30s.
  }
}

async function idbDelete(sessionId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* nothing to clean up if it was never persisted */ }
}

async function idbGetAll(): Promise<SessionBuffer[]> {
  try {
    const db = await openDb();
    const result = await new Promise<SessionBuffer[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as SessionBuffer[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}

// ---------- summarization ----------

function nightDateFor(started: Date): string {
  // A session that begins after midnight but before noon still belongs to
  // the previous evening's date (nobody starts a night's sleep at 9am).
  const d = new Date(started);
  if (d.getHours() < 12) d.setDate(d.getDate() - 1);
  return isoDate(d);
}

function summarize(buffer: SessionBuffer, endedAtMs: number, recovered: boolean): NightSummary {
  const events = buffer.events.slice().sort((a, b) => a.ts - b.ts);
  const startedAtMs = buffer.startedAtMs;
  const durationMs = Math.max(0, endedAtMs - startedAtMs);
  const durationMin = Math.round(durationMs / 60_000);

  const totalSnores = events.length;
  const peakDb = events.reduce((m, e) => Math.max(m, e.peakDb), 0);

  const hourBuckets = Math.max(1, Math.ceil(durationMs / 3_600_000));
  const snoresByHour = new Array(hourBuckets).fill(0) as number[];
  for (const e of events) {
    const offsetMs = e.ts - startedAtMs;
    const idx = Math.min(hourBuckets - 1, Math.max(0, Math.floor(offsetMs / 3_600_000)));
    snoresByHour[idx] += 1;
  }

  // Type mix: energy-weighted across events (louder, longer snores count more).
  let palatal = 0, tongue = 0, nasal = 0;
  for (const e of events) {
    const weight = Math.max(1, e.durationMs) * Math.max(1, e.peakDb);
    palatal += e.bandPalatal * weight;
    tongue += e.bandTongue * weight;
    nasal += e.bandNasal * weight;
  }
  const typeSum = palatal + tongue + nasal;
  const typeMix = typeSum > 0
    ? { palatal: palatal / typeSum, tongue: tongue / typeSum, nasal: nasal / typeSum }
    : { palatal: 0, tongue: 0, nasal: 0 };

  // snore_time_pct: fraction of the session inside "runs" of events with
  // gaps under 60s. longest_quiet_min: the longest gap anywhere, including
  // before the first event and after the last.
  let snoreMs = 0;
  let longestQuietMs = durationMs;
  if (events.length > 0) {
    longestQuietMs = events[0].ts - startedAtMs;
    let runStart = events[0].ts;
    let runEnd = events[0].ts + events[0].durationMs;
    for (let i = 1; i < events.length; i++) {
      const e = events[i];
      const gap = e.ts - runEnd;
      if (gap < 60_000) {
        runEnd = Math.max(runEnd, e.ts + e.durationMs);
      } else {
        snoreMs += runEnd - runStart;
        longestQuietMs = Math.max(longestQuietMs, gap);
        runStart = e.ts;
        runEnd = e.ts + e.durationMs;
      }
    }
    snoreMs += runEnd - runStart;
    longestQuietMs = Math.max(longestQuietMs, endedAtMs - runEnd);
  }
  const snoreTimePct = durationMs > 0 ? Math.min(1, snoreMs / durationMs) : 0;
  const longestQuietMin = Math.round((Math.max(0, longestQuietMs) / 60_000) * 10) / 10;

  const startDate = new Date(startedAtMs);
  return {
    date: nightDateFor(startDate),
    startedAt: fmtClockHM(startDate),
    endedAt: fmtClockHM(new Date(endedAtMs)),
    durationMin,
    totalSnores,
    snoresByHour,
    peakDb,
    typeMix,
    snoreTimePct,
    longestQuietMin,
    strapPosition: buffer.strapPosition,
    source: 'recorded',
    recovered,
  };
}

function toNightPatch(summary: NightSummary, remoteSessionId: string | null): NightSummaryPatch {
  return {
    date: summary.date,
    session_id: remoteSessionId,
    source: 'recorded',
    total_snores: summary.totalSnores,
    snores_by_hour: summary.snoresByHour,
    peak_db: summary.peakDb,
    started_at: summary.startedAt,
    ended_at: summary.endedAt,
    duration_min: summary.durationMin,
    snore_time_pct: summary.snoreTimePct,
    longest_quiet_min: summary.longestQuietMin,
    type_palatal: summary.typeMix.palatal,
    type_tongue: summary.typeMix.tongue,
    type_nasal: summary.typeMix.nasal,
  };
}

/** Maps a `NightSummary` into the local `Night` shape the store/UI use —
 *  measured fields only. Wearable-ingest fields are simply omitted (they're
 *  optional on `Night`); logged fields the mic can't measure (alcohol,
 *  partner-slept-through) default to their "not logged yet" value.
 *  `fallbackStrapPosition` is used only if the session predates strap-
 *  position tracking; normally `summary.strapPosition` (captured when the
 *  session started) wins — important for recovered nights, where the
 *  device's *current* position may differ from that night's. */
export function nightFromSummary(summary: NightSummary, fallbackStrapPosition: number): Night {
  return {
    date: summary.date,
    totalSnores: summary.totalSnores,
    snoresByHour: summary.snoresByHour,
    peakDb: summary.peakDb,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    sleepDurationMin: summary.durationMin,
    snoreTimePct: summary.snoreTimePct,
    longestQuietMin: summary.longestQuietMin,
    snoreTypes: summary.typeMix,
    strapPosition: summary.strapPosition ?? fallbackStrapPosition,
    alcohol: false,
    partnerSleptThrough: false,
    source: summary.source,
  };
}

// ---------- the recorder ----------

export class SessionRecorder {
  private persistence: SessionRecorderPersistence;
  private buffer: SessionBuffer | null = null;
  private flushTimer: number | undefined;

  constructor(persistence: SessionRecorderPersistence = {}) {
    this.persistence = persistence;
  }

  get active(): boolean {
    return this.buffer !== null;
  }

  setPersistence(persistence: SessionRecorderPersistence): void {
    this.persistence = persistence;
  }

  /** Starts a new session. Buffers locally immediately; the remote
   *  `sleep_sessions` row (if any) is created best-effort in the background. */
  async start(opts: { strapPosition: number | null }): Promise<void> {
    if (this.buffer) return; // already recording — start() is idempotent
    const sessionId = crypto.randomUUID();
    const startedAtMs = Date.now();
    const buffer: SessionBuffer = {
      sessionId,
      remoteSessionId: null,
      startedAtMs,
      strapPosition: opts.strapPosition,
      events: [],
      updatedAtMs: startedAtMs,
    };
    this.buffer = buffer;
    await idbPut(buffer);
    this.flushTimer = window.setInterval(() => this.flush(), 30_000);

    try {
      const remoteId = await this.persistence.createSession?.({
        started_at: new Date(startedAtMs).toISOString(),
        strap_position: opts.strapPosition,
      });
      if (remoteId && this.buffer === buffer) {
        buffer.remoteSessionId = remoteId;
        await idbPut(buffer);
      }
    } catch {
      // Offline or anonymous — fine, we keep recording locally.
    }
  }

  /** Buffers one finished snore event. Flushes to IndexedDB every 20 events
   *  (and on the 30s timer started in `start`). */
  addEvent(event: SnoreEventRecord): void {
    if (!this.buffer) return;
    this.buffer.events.push(event);
    this.buffer.updatedAtMs = Date.now();
    if (this.buffer.events.length % 20 === 0) this.flush();
  }

  private flush(): void {
    if (this.buffer) idbPut(this.buffer);
  }

  /** Ends the active session: summarizes it, persists (best-effort), and
   *  clears the IndexedDB buffer. Returns null if nothing was recording. */
  async end(): Promise<NightSummary | null> {
    if (!this.buffer) return null;
    window.clearInterval(this.flushTimer);
    const buffer = this.buffer;
    this.buffer = null;
    const endedAtMs = Date.now();
    const summary = summarize(buffer, endedAtMs, false);
    await this.persistSummary(buffer, summary, endedAtMs, 'ended');
    await idbDelete(buffer.sessionId);
    return summary;
  }

  /**
   * Call on app/screen mount, before starting tonight's session. Finds any
   * IndexedDB buffer left over from a session that never called `end()`
   * (crash, force-quit, tab killed).
   *
   * A buffer whose calendar night (per `nightDateFor`) is still *tonight* is
   * **resumed** — adopted as the active session, with its events and
   * original `startedAtMs` intact — rather than finalized. The alternative
   * (finalize it as an 'abandoned' night, then start a brand-new empty
   * session under the same date) silently destroys the pre-crash segment the
   * moment the night actually ends: `nights` is keyed `(user_id, date)` and
   * every write is a full-row upsert, so the second session's `end()` would
   * overwrite rather than merge with what was already persisted. Resuming
   * means `end()` (whenever it's eventually called) summarizes the *whole*
   * night's events in one pass — correct hourly buckets, snore-time%, etc.
   *
   * A buffer whose calendar night has already passed (crash happened last
   * night, the app is reopened well into today) is genuinely over — that one
   * is still finalized into a night here, same as before.
   */
  async recoverOrphans(): Promise<{
    recovered: NightSummary[];
    resumed: boolean;
    resumedStartedAtMs?: number;
    resumedStrapPosition?: number | null;
  }> {
    const buffers = await idbGetAll();
    const recovered: NightSummary[] = [];
    let resumed = false;
    let resumedStartedAtMs: number | undefined;
    let resumedStrapPosition: number | null | undefined;
    const tonight = nightDateFor(new Date());
    for (const buffer of buffers) {
      if (this.buffer && buffer.sessionId === this.buffer.sessionId) continue;
      const bufferDate = nightDateFor(new Date(buffer.startedAtMs));
      if (!this.buffer && !resumed && bufferDate === tonight) {
        this.buffer = buffer;
        this.flushTimer = window.setInterval(() => this.flush(), 30_000);
        resumed = true;
        resumedStartedAtMs = buffer.startedAtMs;
        resumedStrapPosition = buffer.strapPosition;
        continue;
      }
      const endedAtMs = buffer.updatedAtMs || buffer.startedAtMs;
      const summary = summarize(buffer, endedAtMs, true);
      await this.persistSummary(buffer, summary, endedAtMs, 'abandoned');
      await idbDelete(buffer.sessionId);
      recovered.push(summary);
    }
    return { recovered, resumed, resumedStartedAtMs, resumedStrapPosition };
  }

  private async persistSummary(
    buffer: SessionBuffer,
    summary: NightSummary,
    endedAtMs: number,
    status: 'ended' | 'abandoned',
  ): Promise<void> {
    try {
      if (buffer.remoteSessionId) {
        await this.persistence.closeSession?.(buffer.remoteSessionId, status, new Date(endedAtMs).toISOString(), {
          startedAt: new Date(buffer.startedAtMs).toISOString(),
          strapPosition: buffer.strapPosition,
        });
      }
      await this.persistence.upsertNight?.(toNightPatch(summary, buffer.remoteSessionId));
      if (buffer.events.length) {
        await this.persistence.insertEvents?.(buffer.remoteSessionId, buffer.events);
      }
    } catch {
      // Best-effort — sync.ts's write queue is the real retry mechanism for
      // network failures; there's nothing more useful to do here.
    }
  }
}

export function createSessionRecorder(persistence: SessionRecorderPersistence = {}): SessionRecorder {
  return new SessionRecorder(persistence);
}

/** Shared instance the Night screen records into. Kept here (rather than
 *  constructed per-screen) so a persistence wiring set once at app boot —
 *  see `configureSessionPersistence` — survives screen navigation. */
export const sessionRecorder = createSessionRecorder();

/** Called once at app boot by the integrate lane (which owns the real
 *  Supabase-backed sync queue) to wire the recorder's persistence hooks.
 *  This file never imports Supabase itself — this is the seam. Safe to call
 *  again later (e.g. after sign-in) — it just swaps where the *next*
 *  session's writes go; it doesn't touch a session already in progress. */
export function configureSessionPersistence(persistence: SessionRecorderPersistence): void {
  sessionRecorder.setPersistence(persistence);
}
