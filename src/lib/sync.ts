// Sync engine — bridges the localStorage-backed `store` (the UI's synchronous
// source of truth) with Supabase (the durable backend). See PLAN.md "Client
// architecture" for the contract this file implements.
//
// - hydrate(userId, email): pulls profile/device/nights/chat/recommendations
//   for the account and replaces the relevant slices of AppState.
// - Writes: call one of the `write*` functions below. Each updates the store
//   optimistically, then enqueues a write-through op. The queue is persisted
//   to localStorage (key `dr-better-sleep:syncq`) so it survives reloads and
//   flushes with retry/backoff on `online` and `visibilitychange`.
//
// ---------------------------------------------------------------------------
// DB-ACCESS CONTRACT
// ---------------------------------------------------------------------------
// This file codes against `../lib/db`, owned by the auth lane, which must
// export an object matching the `Db` interface below. Row shapes come
// straight from the generated `database.types.ts` (owned by the migrate
// lane) so there's exactly one source of truth for column names.
//
// Every write function is expected to be a true upsert:
//   - upsertProfile:   conflict target `id` (profiles.id = auth uid)
//   - upsertDevice:    find-or-create by `user_id` (no unique constraint —
//                      one device row per user is a product assumption, not
//                      a DB guarantee, so `db.ts` owns the find-then-write)
//   - upsertNight:     conflict target `(user_id, date)` — the natural key
//   - upsertSleepSession: conflict target `id` (client-generated uuid)
//   - insertChatMessage / upsertRecommendation: conflict target `id`
//     (client-generated uuid) so retries after a dropped response don't
//     duplicate rows
//   - insertSnoreEvents: best-effort bulk insert. `snore_events.id` is a DB
//     identity column with no client-supplied natural key, so this is the
//     one op that is at-least-once rather than strictly idempotent — a
//     retry after a dropped *response* (but successful write) can duplicate
//     a batch. Documented deviation; acceptable because duplicate events
//     only nudge aggregate counts, they're never surfaced as raw truth.
// All Db methods should reject (throw/reject the Promise) on failure so the
// queue can distinguish success from retry-needed.

import type { Database, Json } from './database.types';
import { store } from '../store';
import type { AppState, ChatMessage, Night, OnboardingState, Partner, Recommendation, UserProfile } from '../seed';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type DeviceRow = Database['public']['Tables']['devices']['Row'];
type NightRow = Database['public']['Tables']['nights']['Row'];
// Nights fetched for hydrate() come embedded with their linked sleep_sessions
// row (see fetchAccountData's nights query in db.ts) so the real per-night
// strap position can be recovered — see mapNightRow below. Kept as a
// separate type from the bare NightRow so NightWrite (derived from NightRow)
// never picks up this join-only field.
type NightRowWithSession = NightRow & { sleep_sessions?: { strap_position: number | null } | null };
type ChatRow = Database['public']['Tables']['chat_messages']['Row'];
type RecommendationRow = Database['public']['Tables']['recommendations']['Row'];
type SleepSessionRow = Database['public']['Tables']['sleep_sessions']['Row'];
type SnoreEventRow = Database['public']['Tables']['snore_events']['Row'];

export type ProfileWrite = Partial<Omit<ProfileRow, 'id' | 'created_at'>> & { id: string };
export type DeviceWrite = Partial<Omit<DeviceRow, 'id' | 'created_at' | 'user_id'>> & { user_id: string };
export type NightWrite = Partial<Omit<NightRow, 'id' | 'created_at' | 'user_id' | 'date'>> & {
  user_id: string;
  date: string;
};
export type ChatWrite = Omit<ChatRow, 'created_at'> & { created_at?: string };
export type RecommendationWrite = Omit<RecommendationRow, 'created_at'> & { created_at?: string };
export type SleepSessionWrite = Omit<SleepSessionRow, 'created_at'> & { created_at?: string };
export type SnoreEventWrite = Omit<SnoreEventRow, 'id' | 'created_at'>;

export interface AccountBundle {
  profile: ProfileRow | null;
  device: DeviceRow | null;
  nights: NightRowWithSession[];
  chatMessages: ChatRow[];
  recommendations: RecommendationRow[];
}

export interface Db {
  fetchAccountData(userId: string): Promise<AccountBundle>;
  upsertProfile(row: ProfileWrite): Promise<void>;
  upsertDevice(row: DeviceWrite): Promise<void>;
  upsertNight(row: NightWrite): Promise<void>;
  insertChatMessage(row: ChatWrite): Promise<void>;
  upsertRecommendation(row: RecommendationWrite): Promise<void>;
  upsertSleepSession(row: SleepSessionWrite): Promise<void>;
  insertSnoreEvents(rows: SnoreEventWrite[]): Promise<void>;
}

// Imported lazily-ish via a normal import; the auth lane owns this module.
// If it doesn't exist yet (parallel build), this import fails to typecheck
// until db.ts lands — expected during parallel lanes, resolved at Integrate.
import { db } from './db';

// ---------------------------------------------------------------------------
// Write-through queue
// ---------------------------------------------------------------------------

const QUEUE_KEY = 'dr-better-sleep:syncq';

type OpKind =
  | 'upsertProfile'
  | 'upsertDevice'
  | 'upsertNight'
  | 'insertChatMessage'
  | 'upsertRecommendation'
  | 'upsertSleepSession'
  | 'insertSnoreEvents';

interface QueueOp {
  id: string;         // client-generated id for the op itself
  kind: OpKind;
  key: string;         // natural key — ops with the same key coalesce (last write wins)
  payload: unknown;
  attempts: number;
  nextAttemptAt: number; // epoch ms; op is skipped until now() >= this
  lastError?: string;
}

let queue: QueueOp[] = loadQueue();
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function loadQueue(): QueueOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistQueue(): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // quota exceeded or unavailable — the in-memory queue still flushes
    // this session, we just won't survive a reload.
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Add (or coalesce into) a write-through op and kick off a flush attempt.
 * Ops that share a `kind`+`key` collapse to the latest payload — this is
 * what makes rapid successive writes to the same natural key (e.g. editing
 * one night's alcohol flag twice before the network catches up) cheap and
 * still correct: only the final state ships.
 */
function enqueue(kind: OpKind, key: string, payload: unknown): void {
  const existingIdx = queue.findIndex(op => op.kind === kind && op.key === key);
  const op: QueueOp = {
    id: existingIdx >= 0 ? queue[existingIdx].id : makeId(),
    kind,
    key,
    payload,
    attempts: existingIdx >= 0 ? queue[existingIdx].attempts : 0,
    nextAttemptAt: 0,
  };
  if (existingIdx >= 0) queue[existingIdx] = op;
  else queue.push(op);
  persistQueue();
  scheduleFlush(0);
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

function backoffDelay(attempts: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);
  return exp + Math.round(Math.random() * 500);
}

function scheduleFlush(delayMs: number): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { void flushQueue(); }, delayMs);
}

async function runOp(op: QueueOp): Promise<void> {
  switch (op.kind) {
    case 'upsertProfile': return db.upsertProfile(op.payload as ProfileWrite);
    case 'upsertDevice': return db.upsertDevice(op.payload as DeviceWrite);
    case 'upsertNight': return db.upsertNight(op.payload as NightWrite);
    case 'insertChatMessage': return db.insertChatMessage(op.payload as ChatWrite);
    case 'upsertRecommendation': return db.upsertRecommendation(op.payload as RecommendationWrite);
    case 'upsertSleepSession': return db.upsertSleepSession(op.payload as SleepSessionWrite);
    case 'insertSnoreEvents': return db.insertSnoreEvents(op.payload as SnoreEventWrite[]);
  }
}

/**
 * Drain the queue, oldest first. Ops not yet due (backoff pending) are
 * skipped this pass but left in place. Safe to call repeatedly/concurrently
 * — re-entrant calls no-op while a flush is already in flight.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (!isOnline()) return;
  if (queue.length === 0) return;
  flushing = true;
  try {
    const now = Date.now();
    let mutated = false;
    let sawFailure = false;
    for (const op of [...queue]) {
      if (op.nextAttemptAt > now) continue;
      try {
        await runOp(op);
        queue = queue.filter(q => q.id !== op.id);
        mutated = true;
      } catch (err) {
        sawFailure = true;
        const idx = queue.findIndex(q => q.id === op.id);
        if (idx >= 0) {
          queue[idx] = {
            ...queue[idx],
            attempts: queue[idx].attempts + 1,
            nextAttemptAt: Date.now() + backoffDelay(queue[idx].attempts + 1),
            lastError: err instanceof Error ? err.message : String(err),
          };
          mutated = true;
        }
      }
    }
    if (mutated) persistQueue();
    if (sawFailure && queue.length > 0) {
      const soonest = Math.min(...queue.map(q => q.nextAttemptAt));
      scheduleFlush(Math.max(0, soonest - Date.now()));
    }
  } finally {
    flushing = false;
  }
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function queueStatus(): { pending: number; hasErrors: boolean } {
  return { pending: queue.length, hasErrors: queue.some(op => op.attempts > 0) };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushQueue(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushQueue();
  });
  // Pick up anything left over from a previous session.
  if (queue.length > 0) scheduleFlush(0);
}

// ---------------------------------------------------------------------------
// hydrate — pull all account data into AppState
// ---------------------------------------------------------------------------

function mapProfileRow(row: ProfileRow | null, fallback: UserProfile): UserProfile {
  if (!row) return fallback;
  return {
    name: row.name ?? fallback.name,
    ageRange: row.age_range ?? fallback.ageRange,
    sex: (row.sex as UserProfile['sex']) ?? fallback.sex,
    bmiRange: row.bmi_range ?? fallback.bmiRange,
    shipTo: row.ship_to ?? fallback.shipTo,
  };
}

function mapOnboardingRow(row: ProfileRow | null): OnboardingState {
  // A fresh account's profile row carries the column default '{}' — that means
  // "never onboarded", and must route the user through first-run onboarding
  // rather than inheriting the local-demo seed's completed state.
  const o = row?.onboarding;
  if (o && typeof o === 'object' && !Array.isArray(o) && 'complete' in o) {
    return o as unknown as OnboardingState;
  }
  return { complete: false, step: 0, answers: {} };
}

function mapPartnerRow(row: ProfileRow | null, fallback: Partner): Partner {
  if (!row) return fallback;
  return {
    name: row.partner_name ?? fallback.name,
    relation: (row.partner_relation as Partner['relation']) ?? fallback.relation,
    notifyAtMorning: row.partner_notify_morning ?? fallback.notifyAtMorning,
  };
}

function mapDeviceRow(row: DeviceRow | null, fallback: AppState['device']): AppState['device'] {
  if (!row) return fallback;
  return {
    fittedAt: row.fitted_at ?? fallback.fittedAt,
    strapPosition: row.strap_position ?? fallback.strapPosition,
    lifespanNights: row.lifespan_nights ?? fallback.lifespanNights,
    lastReplacement: row.last_replacement ?? undefined,
  };
}

function jsonPositions(v: unknown): Night['positions'] {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (
    typeof o.side_left !== 'number' || typeof o.side_right !== 'number' ||
    typeof o.back !== 'number' || typeof o.stomach !== 'number'
  ) return undefined;
  return { side_left: o.side_left, side_right: o.side_right, back: o.back, stomach: o.stomach };
}

function mapNightRow(row: NightRowWithSession): Night {
  return {
    date: row.date,
    totalSnores: row.total_snores ?? 0,
    sleepDurationMin: row.duration_min ?? 0,
    efficiency: row.efficiency ?? undefined,
    hrv: row.hrv ?? undefined,
    restingHr: row.resting_hr ?? undefined,
    deepMin: row.deep_min ?? undefined,
    remMin: row.rem_min ?? undefined,
    lightMin: row.light_min ?? undefined,
    awakeMin: row.awake_min ?? undefined,
    positions: jsonPositions(row.positions),
    positionSnores: jsonPositions(row.position_snores),
    snoresByHour: Array.isArray(row.snores_by_hour) ? (row.snores_by_hour as number[]) : [],
    peakDb: row.peak_db ?? 0,
    // `nights` has no strap_position column (that lives on sleep_sessions) —
    // recovered per-night from the embedded sleep_sessions row fetched
    // alongside it (see fetchAccountData's nights query in db.ts, matching
    // the same join db.ts's own fetchNights()/fromNightRow() already uses).
    // A night with no linked session (or a session that didn't record strap
    // position) honestly comes back 0 rather than being stamped with the
    // device's current position — the device may have moved many times
    // since that night.
    strapPosition: row.sleep_sessions?.strap_position ?? 0,
    startedAt: row.started_at ?? '',
    endedAt: row.ended_at ?? '',
    alcohol: row.alcohol,
    partnerSleptThrough: row.partner_slept_through ?? false,
    snoreTypes: {
      palatal: row.type_palatal ?? 0,
      tongue: row.type_tongue ?? 0,
      nasal: row.type_nasal ?? 0,
    },
    snoreTimePct: row.snore_time_pct ?? undefined,
    longestQuietMin: row.longest_quiet_min ?? undefined,
    source: (row.source as Night['source']) ?? 'recorded',
  };
}

function mapChatRow(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    who: row.who === 'user' ? 'me' : 'them',
    text: row.text ?? undefined,
    card: (row.card as unknown as ChatMessage['card']) ?? undefined,
    ts: new Date(row.created_at).getTime(),
  };
}

function mapRecommendationRow(row: RecommendationRow): Recommendation {
  return {
    id: row.id,
    name: row.name ?? '',
    emphasis: row.emphasis ?? '',
    quote: row.quote ?? '',
    recommendedOn: row.recommended_on ?? '',
    price: row.price ?? '',
    priceSubtext: row.price_subtext ?? undefined,
    iconKind: (row.icon_kind as Recommendation['iconKind']) ?? 'pill',
  };
}

/**
 * Pull profile/device/nights/chat/recommendations for `userId` and replace
 * the corresponding slices of AppState. Nights/chat/recommendations are
 * replaced wholesale (even with empty arrays) — a real account's data must
 * never be padded out with local demo-seed rows tagged as if they were
 * real. Call on login.
 */
export async function hydrate(userId: string, email: string): Promise<void> {
  const bundle = await db.fetchAccountData(userId);
  store.set(s => {
    const next: AppState = { ...s };
    next.mode = 'account';
    next.auth = { userId, email };
    next.authLostMidSession = false;
    next.user = mapProfileRow(bundle.profile, s.user);
    next.partner = mapPartnerRow(bundle.profile, s.partner);
    next.onboarding = mapOnboardingRow(bundle.profile);
    next.uiTheme = (bundle.profile?.ui_theme as AppState['uiTheme']) ?? s.uiTheme;
    next.device = mapDeviceRow(bundle.device, s.device);
    next.nights = bundle.nights
      .map(row => mapNightRow(row))
      .sort((a, b) => a.date.localeCompare(b.date));
    next.chat = bundle.chatMessages.map(mapChatRow).sort((a, b) => a.ts - b.ts);
    next.recommendations = bundle.recommendations.map(mapRecommendationRow);
    return next;
  });
  // Anything queued while logged out (shouldn't normally happen, but a
  // stale queue from a prior session on this device could exist) gets a
  // chance to drain now that we're authenticated.
  void flushQueue();
}

/**
 * Drop back to local-demo mode (e.g. on sign-out, or the auth session being
 * invalidated — expired/revoked refresh token, or a sign-out from another
 * tab). Leaves the queue as-is — anything still pending will flush again on
 * the next login.
 *
 * If a night is actively recording when this happens, every write the
 * recorder makes from this point on (main.tsx's `createSession`/
 * `closeSession`/`upsertNight`/`insertEvents`) silently no-ops rather than
 * being queued — unlike a network failure, there's no `userId` to key a
 * retry on, so there's nothing to replay once the user signs back in. Flag
 * it so the Night screen can surface a visible "not syncing" warning instead
 * of the night quietly failing to save.
 */
export function unhydrate(): void {
  store.set(s => ({
    ...s,
    mode: 'local-demo',
    auth: null,
    authLostMidSession: s.mode === 'account' && !!s.liveNight?.tracking,
  }));
}

// ---------------------------------------------------------------------------
// Write-through API — optimistic store update + enqueue
// ---------------------------------------------------------------------------

function currentUserId(): string | null {
  return store.get().auth?.userId ?? null;
}

function nightToRow(userId: string, n: Partial<Night> & { date: string }): NightWrite {
  return {
    user_id: userId,
    date: n.date,
    total_snores: n.totalSnores,
    snores_by_hour: n.snoresByHour as unknown as Json | undefined,
    peak_db: n.peakDb,
    started_at: n.startedAt,
    ended_at: n.endedAt,
    duration_min: n.sleepDurationMin,
    snore_time_pct: n.snoreTimePct,
    longest_quiet_min: n.longestQuietMin,
    type_palatal: n.snoreTypes?.palatal,
    type_tongue: n.snoreTypes?.tongue,
    type_nasal: n.snoreTypes?.nasal,
    alcohol: n.alcohol,
    partner_slept_through: n.partnerSleptThrough,
    efficiency: n.efficiency,
    hrv: n.hrv,
    resting_hr: n.restingHr,
    deep_min: n.deepMin,
    rem_min: n.remMin,
    light_min: n.lightMin,
    awake_min: n.awakeMin,
    positions: n.positions as unknown as Json | undefined,
    position_snores: n.positionSnores as unknown as Json | undefined,
    source: n.source ?? 'recorded',
  };
}

/**
 * Upsert a night by date: merges `patch` over any existing local night for
 * that date (or inserts a new one), updates the store immediately, and
 * enqueues the write-through. `patch.date` is required; everything else is
 * optional so callers (e.g. sessionRecorder finishing a night, or a screen
 * toggling `alcohol`) can send a partial update.
 */
export function writeNight(patch: Partial<Night> & { date: string }): void {
  store.set(s => {
    const idx = s.nights.findIndex(n => n.date === patch.date);
    const merged: Night = idx >= 0 ? { ...s.nights[idx], ...patch } : (patch as Night);
    const nights = idx >= 0
      ? [...s.nights.slice(0, idx), merged, ...s.nights.slice(idx + 1)]
      : [...s.nights, merged].sort((a, b) => a.date.localeCompare(b.date));
    return { ...s, nights };
  });
  const userId = currentUserId();
  if (!userId) return; // local-demo mode: store update only, nothing to sync
  const full = store.get().nights.find(n => n.date === patch.date);
  if (!full) return;
  enqueue('upsertNight', `night:${userId}:${patch.date}`, nightToRow(userId, full));
}

/**
 * Build the FULL profiles row from current state. Every profile-table writer
 * sends this complete row under the same queue key (`profile:{userId}`) —
 * the queue coalesces same-key ops by replacement, so partial payloads would
 * silently drop each other's fields when e.g. a profile edit and a partner
 * edit are both pending. Full rows make replacement-coalescing lossless.
 */
function fullProfileRow(userId: string): ProfileWrite {
  const s = store.get();
  return {
    id: userId,
    name: s.user.name,
    age_range: s.user.ageRange,
    sex: s.user.sex,
    bmi_range: s.user.bmiRange,
    ship_to: s.user.shipTo,
    partner_name: s.partner.name,
    partner_relation: s.partner.relation,
    partner_notify_morning: s.partner.notifyAtMorning,
    ui_theme: s.uiTheme,
    onboarding: s.onboarding as unknown as Json,
    updated_at: new Date().toISOString(),
  };
}

function enqueueProfile(): void {
  const userId = currentUserId();
  if (!userId) return;
  enqueue('upsertProfile', `profile:${userId}`, fullProfileRow(userId));
}

/** Patch the user profile fields (name/age/sex/bmi/shipping — `profiles` table). */
export function writeProfile(patch: Partial<UserProfile>): void {
  store.set(s => ({ ...s, user: { ...s.user, ...patch } }));
  enqueueProfile();
}

/** Patch partner fields (stored on the same `profiles` row). */
export function writePartner(patch: Partial<Partner>): void {
  store.set(s => ({ ...s, partner: { ...s.partner, ...patch } }));
  enqueueProfile();
}

/** Patch onboarding state (stored on the `profiles` row as jsonb). */
export function writeOnboarding(patch: Partial<OnboardingState>): void {
  store.set(s => ({ ...s, onboarding: { ...s.onboarding, ...patch } }));
  enqueueProfile();
}

/** Set the appearance theme (stored on the `profiles` row). */
export function writeUiTheme(theme: AppState['uiTheme']): void {
  store.set(s => ({ ...s, uiTheme: theme }));
  enqueueProfile();
}

export function writeDevice(patch: Partial<AppState['device']>): void {
  store.set(s => ({ ...s, device: { ...s.device, ...patch } }));
  const userId = currentUserId();
  if (!userId) return;
  const d = store.get().device;
  const row: DeviceWrite = {
    user_id: userId,
    fitted_at: d.fittedAt,
    strap_position: d.strapPosition,
    lifespan_nights: d.lifespanNights,
    last_replacement: d.lastReplacement ?? null,
  };
  enqueue('upsertDevice', `device:${userId}`, row);
}

/** Append a chat message (optimistic) and enqueue the insert. */
export function writeChatMessage(msg: Omit<ChatMessage, 'id' | 'ts'> & { id?: string; ts?: number }): ChatMessage {
  const full: ChatMessage = { id: msg.id ?? makeId(), ts: msg.ts ?? Date.now(), ...msg };
  store.set(s => ({ ...s, chat: [...s.chat, full] }));
  const userId = currentUserId();
  if (!userId) return full;
  const row: ChatWrite = {
    id: full.id,
    user_id: userId,
    who: full.who === 'me' ? 'user' : 'coach',
    text: full.text ?? null,
    card: (full.card as unknown as Json) ?? null,
    created_at: new Date(full.ts).toISOString(),
  };
  enqueue('insertChatMessage', `chat:${full.id}`, row);
  return full;
}

export function writeRecommendation(rec: Omit<Recommendation, 'id'> & { id?: string }): Recommendation {
  const full: Recommendation = { id: rec.id ?? makeId(), ...rec };
  store.set(s => ({ ...s, recommendations: [...s.recommendations, full] }));
  const userId = currentUserId();
  if (!userId) return full;
  const row: RecommendationWrite = {
    id: full.id,
    user_id: userId,
    name: full.name,
    emphasis: full.emphasis,
    quote: full.quote,
    recommended_on: full.recommendedOn,
    price: full.price,
    price_subtext: full.priceSubtext ?? null,
    icon_kind: full.iconKind,
  };
  enqueue('upsertRecommendation', `rec:${full.id}`, row);
  return full;
}

/**
 * Upsert a `sleep_sessions` row. Used by the recorder lane's
 * sessionRecorder.ts to open a session on night-start and mark it
 * ended/abandoned on finish — this does not touch AppState, it's a
 * pass-through write-through helper for a table the store doesn't model.
 */
export function writeSleepSession(row: SleepSessionWrite): void {
  const userId = currentUserId();
  if (!userId) return;
  enqueue('upsertSleepSession', `session:${row.id}`, row);
}

/**
 * Bulk-insert snore events for a session. Not idempotent on retry (see the
 * DB-ACCESS CONTRACT note above) — call once per finished batch.
 */
export function writeSnoreEvents(sessionId: string, rows: SnoreEventWrite[]): void {
  const userId = currentUserId();
  if (!userId || rows.length === 0) return;
  enqueue('insertSnoreEvents', `events:${sessionId}:${makeId()}`, rows);
}
