// Typed data-access helpers over the Supabase schema (supabase/migrations/0001_core.sql).
// Plain async functions — no caching, no retries. src/lib/sync.ts (owner: sync lane)
// wraps these with optimistic store updates + a write-through queue. Every function
// maps snake_case DB rows to/from the app's camelCase types in src/seed.ts.
//
// Deviation from a 1:1 mapping, flagged for the sync/integrate lanes:
//   - `nights` has no `strap_position` column (only `devices` and `sleep_sessions`
//     do). `fetchNights` recovers it by embedding the linked `sleep_sessions` row
//     via the `session_id` foreign key; nights with no session (or a session that
//     didn't record strap position) come back with `strapPosition: 0`.
//   - `Night`'s wearable-ingest fields (efficiency, hrv, restingHr, deepMin, remMin,
//     lightMin, awakeMin, positions, positionSnores) are nullable in the DB but are
//     currently non-optional on the seed.ts `Night` type. This file assumes the
//     additive change PLAN.md assigns to the `sync` lane (those fields becoming
//     `T | undefined`) has landed by integrate time; until then a strict `tsc`
//     build will flag `null -> undefined` mismatches here, which is expected.

import { requireSupabase } from './supabase';
import type { Json, Tables, TablesInsert, TablesUpdate } from './database.types';
import type {
  UserProfile,
  Partner,
  DeviceState,
  OnboardingState,
  Night,
  ChatMessage,
  ChatCard,
  Recommendation,
} from '../seed';

// ============================================================
// profiles (identity + partner + appearance + onboarding, one row per user)
// ============================================================

export interface ProfileRecord {
  user: UserProfile;
  partner: Partner;
  uiTheme: 'auto' | 'light' | 'dark';
  onboarding: OnboardingState;
  updatedAt: string | null;
}

const DEFAULT_ONBOARDING: OnboardingState = { complete: false, step: 0, answers: {} };

function fromProfileRow(row: Tables<'profiles'>): ProfileRecord {
  return {
    user: {
      name: row.name ?? '',
      ageRange: row.age_range ?? '',
      sex: (row.sex as UserProfile['sex']) ?? 'NB',
      bmiRange: row.bmi_range ?? '',
      shipTo: row.ship_to ?? '',
    },
    partner: {
      name: row.partner_name ?? '',
      relation: (row.partner_relation as Partner['relation']) ?? 'partner',
      notifyAtMorning: row.partner_notify_morning,
    },
    uiTheme: (row.ui_theme as ProfileRecord['uiTheme']) ?? 'auto',
    onboarding: (row.onboarding as unknown as OnboardingState) ?? DEFAULT_ONBOARDING,
    updatedAt: row.updated_at,
  };
}

/** Reads the caller's profile row. Null if the auth trigger hasn't created it yet. */
export async function fetchProfile(userId: string): Promise<ProfileRecord | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ? fromProfileRow(data) : null;
}

/**
 * Upserts any subset of the profile. Pass only the slices that changed
 * (e.g. `{ uiTheme: 'dark' }` or `{ partner }`) — omitted slices are left alone.
 */
export async function upsertProfile(userId: string, patch: Partial<ProfileRecord>): Promise<void> {
  const sb = requireSupabase();
  const update: TablesInsert<'profiles'> = { id: userId, updated_at: new Date().toISOString() };

  if (patch.user) {
    update.name = patch.user.name;
    update.age_range = patch.user.ageRange;
    update.sex = patch.user.sex;
    update.bmi_range = patch.user.bmiRange;
    update.ship_to = patch.user.shipTo;
  }
  if (patch.partner) {
    update.partner_name = patch.partner.name;
    update.partner_relation = patch.partner.relation;
    update.partner_notify_morning = patch.partner.notifyAtMorning;
  }
  if (patch.uiTheme) update.ui_theme = patch.uiTheme;
  if (patch.onboarding) update.onboarding = patch.onboarding as unknown as Json;

  const { error } = await sb.from('profiles').upsert(update, { onConflict: 'id' });
  if (error) throw error;
}

// ============================================================
// devices (one boil-and-bite device per user, no unique constraint in schema —
// we look the row up by user_id ourselves so upsertDevice is still idempotent)
// ============================================================

function fromDeviceRow(row: Tables<'devices'>): DeviceState {
  return {
    fittedAt: row.fitted_at ?? '',
    strapPosition: row.strap_position ?? 0,
    lifespanNights: row.lifespan_nights ?? 365,
    lastReplacement: row.last_replacement ?? undefined,
  };
}

/** Most recently created device row for this user, or null if none fitted yet. */
export async function fetchDevice(userId: string): Promise<DeviceState | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('devices')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? fromDeviceRow(data) : null;
}

/** Insert-or-update the user's device row (fetch-then-write; no natural key to upsert on). */
export async function upsertDevice(userId: string, device: DeviceState): Promise<void> {
  const sb = requireSupabase();
  const row = {
    user_id: userId,
    fitted_at: device.fittedAt || null,
    strap_position: device.strapPosition,
    lifespan_nights: device.lifespanNights,
    last_replacement: device.lastReplacement ?? null,
  };

  const { data: existing, error: findErr } = await sb
    .from('devices')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const { error } = await sb.from('devices').update(row).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from('devices').insert(row);
    if (error) throw error;
  }
}

// ============================================================
// nights (one row per calendar night, unique(user_id, date))
// ============================================================

type NightRow = Tables<'nights'> & {
  sleep_sessions?: { strap_position: number | null } | null;
};

function fromNightRow(row: NightRow): Night {
  return {
    date: row.date,
    totalSnores: row.total_snores ?? 0,
    sleepDurationMin: row.duration_min ?? 0,
    // wearable-ingest placeholders: null in the DB means "no wearable connected
    // for this night" — surfaced as undefined per PLAN.md so screens render the
    // "connect a wearable" affordance instead of a fabricated number.
    efficiency: row.efficiency ?? undefined,
    hrv: row.hrv ?? undefined,
    restingHr: row.resting_hr ?? undefined,
    deepMin: row.deep_min ?? undefined,
    remMin: row.rem_min ?? undefined,
    lightMin: row.light_min ?? undefined,
    awakeMin: row.awake_min ?? undefined,
    positions: (row.positions as unknown as Night['positions']) ?? undefined,
    positionSnores: (row.position_snores as unknown as Night['positionSnores']) ?? undefined,
    snoresByHour: (row.snores_by_hour as unknown as number[]) ?? [],
    peakDb: row.peak_db ?? 0,
    // not a nights column — recovered from the linked sleep_sessions row, if any.
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
  } as Night;
}

function toNightInsert(
  userId: string,
  night: Night,
  opts?: { sessionId?: string | null }
): TablesInsert<'nights'> {
  return {
    user_id: userId,
    date: night.date,
    session_id: opts?.sessionId ?? null,
    source: night.source ?? 'recorded',
    total_snores: night.totalSnores,
    snores_by_hour: (night.snoresByHour ?? []) as unknown as Json,
    peak_db: night.peakDb,
    started_at: night.startedAt || null,
    ended_at: night.endedAt || null,
    duration_min: night.sleepDurationMin,
    snore_time_pct: night.snoreTimePct ?? null,
    longest_quiet_min: night.longestQuietMin ?? null,
    type_palatal: night.snoreTypes?.palatal ?? null,
    type_tongue: night.snoreTypes?.tongue ?? null,
    type_nasal: night.snoreTypes?.nasal ?? null,
    alcohol: night.alcohol,
    partner_slept_through: night.partnerSleptThrough ?? null,
    efficiency: night.efficiency ?? null,
    hrv: night.hrv ?? null,
    resting_hr: night.restingHr ?? null,
    deep_min: night.deepMin ?? null,
    rem_min: night.remMin ?? null,
    light_min: night.lightMin ?? null,
    awake_min: night.awakeMin ?? null,
    positions: (night.positions as unknown as Json) ?? null,
    position_snores: (night.positionSnores as unknown as Json) ?? null,
  };
}

/** Nights for the user, ascending by date. Pass `from`/`to` (ISO dates, inclusive) to page. */
export async function fetchNights(
  userId: string,
  opts?: { from?: string; to?: string; limit?: number }
): Promise<Night[]> {
  const sb = requireSupabase();
  let query = sb
    .from('nights')
    .select('*, sleep_sessions(strap_position)')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (opts?.from) query = query.gte('date', opts.from);
  if (opts?.to) query = query.lte('date', opts.to);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as NightRow[]).map(fromNightRow);
}

/**
 * Idempotent upsert keyed by the natural key (user_id, date) — safe to call
 * repeatedly for the same night (e.g. a queued write retried after a flush
 * failure). Pass `sessionId` to link the night to its recording session.
 */
export async function upsertNight(
  userId: string,
  night: Night,
  opts?: { sessionId?: string | null }
): Promise<void> {
  const sb = requireSupabase();
  const row = toNightInsert(userId, night, opts);
  const { error } = await sb.from('nights').upsert(row, { onConflict: 'user_id,date' });
  if (error) throw error;
}

// ============================================================
// snore_events (per-event acoustic records, bulk-inserted at night's end)
// ============================================================

export interface SnoreEventInput {
  ts: string | number | Date;
  durationMs?: number | null;
  peakDb?: number | null;
  bandPalatal?: number | null;
  bandTongue?: number | null;
  bandNasal?: number | null;
}

function toTimestamptz(ts: string | number | Date): string {
  return ts instanceof Date ? ts.toISOString() : new Date(ts).toISOString();
}

const EVENT_CHUNK_SIZE = 500;

/** Bulk-inserts snore events for a session. Chunked to stay well under payload limits. */
export async function insertSnoreEvents(
  sessionId: string,
  userId: string,
  events: SnoreEventInput[]
): Promise<void> {
  if (events.length === 0) return;
  const sb = requireSupabase();
  const rows: TablesInsert<'snore_events'>[] = events.map(e => ({
    session_id: sessionId,
    user_id: userId,
    ts: toTimestamptz(e.ts),
    duration_ms: e.durationMs ?? null,
    peak_db: e.peakDb ?? null,
    band_palatal: e.bandPalatal ?? null,
    band_tongue: e.bandTongue ?? null,
    band_nasal: e.bandNasal ?? null,
  }));

  for (let i = 0; i < rows.length; i += EVENT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + EVENT_CHUNK_SIZE);
    const { error } = await sb.from('snore_events').insert(chunk);
    if (error) throw error;
  }
}

// ============================================================
// sleep_sessions (recording lifecycle: active -> ended | abandoned)
// ============================================================

export interface SessionInput {
  startedAt: string | Date;
  source?: 'recorded' | 'demo';
  strapPosition?: number | null;
}

export interface SessionRecord {
  id: string;
  startedAt: string;
  status: string;
}

/** Opens a new recording session (status 'active'). Returns its id for insertSnoreEvents/updateSession. */
export async function insertSession(userId: string, input: SessionInput): Promise<SessionRecord> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('sleep_sessions')
    .insert({
      user_id: userId,
      started_at: toTimestamptz(input.startedAt),
      source: input.source ?? 'recorded',
      strap_position: input.strapPosition ?? null,
    })
    .select('id, started_at, status')
    .single();
  if (error) throw error;
  return { id: data.id, startedAt: data.started_at, status: data.status };
}

export interface SessionPatch {
  endedAt?: string | Date | null;
  status?: 'active' | 'ended' | 'abandoned';
}

/** Closes out (or marks abandoned) a recording session. */
export async function updateSession(sessionId: string, patch: SessionPatch): Promise<void> {
  const sb = requireSupabase();
  const update: TablesUpdate<'sleep_sessions'> = {};
  if (patch.endedAt !== undefined) {
    update.ended_at = patch.endedAt === null ? null : toTimestamptz(patch.endedAt);
  }
  if (patch.status) update.status = patch.status;
  const { error } = await sb.from('sleep_sessions').update(update).eq('id', sessionId);
  if (error) throw error;
}

// ============================================================
// chat_messages (append-only, Dr. Sommers <-> user)
// ============================================================

function fromChatRow(row: Tables<'chat_messages'>): ChatMessage {
  return {
    id: row.id,
    who: row.who === 'user' ? 'me' : 'them',
    text: row.text ?? undefined,
    card: (row.card as unknown as ChatCard) ?? undefined,
    ts: new Date(row.created_at).getTime(),
  };
}

/** Most recent `limit` messages, returned oldest-first (ready to render top-to-bottom). */
export async function fetchChat(userId: string, limit = 100): Promise<ChatMessage[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Tables<'chat_messages'>[]).map(fromChatRow).reverse();
}

/** Appends one chat message (user turn or Dr. Sommers turn) and returns the stored row. */
export async function insertChatMessage(
  userId: string,
  msg: { who: 'them' | 'me'; text?: string; card?: ChatCard }
): Promise<ChatMessage> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('chat_messages')
    .insert({
      user_id: userId,
      who: msg.who === 'me' ? 'user' : 'coach',
      text: msg.text ?? null,
      card: (msg.card as unknown as Json) ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return fromChatRow(data);
}

// ============================================================
// recommendations
// ============================================================

function fromRecommendationRow(row: Tables<'recommendations'>): Recommendation {
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

/** All recommendations for the user, most recent first. */
export async function fetchRecommendations(userId: string): Promise<Recommendation[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('recommendations')
    .select('*')
    .eq('user_id', userId)
    .order('recommended_on', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Tables<'recommendations'>[]).map(fromRecommendationRow);
}

// ============================================================
// `db` — the write-through-queue adapter (src/lib/sync.ts's `Db` interface)
// ============================================================
//
// INTEGRATE-LANE RECONCILIATION NOTE: sync.ts (owned by the sync lane) codes
// against a `Db` interface it expects this module to export as `db`, built
// from raw-row types (`ProfileWrite`, `NightWrite`, etc. — see sync.ts's
// "DB-ACCESS CONTRACT" comment). Everything above this point was written
// against a *different* shape — camelCase app types in, camelCase app types
// out (`fetchProfile` -> `ProfileRecord`, `upsertNight(userId, night: Night)`,
// etc.) — which is what the rest of the app would eventually want, but it
// doesn't satisfy sync.ts's queue, which needs to serialize/deserialize raw
// rows without re-deriving app-shape mapping logic sync.ts already owns
// (`mapProfileRow`, `mapNightRow`, ...). Rather than rewrite either lane's
// work, this section adapts: thin, mostly-direct Supabase calls operating on
// row shapes, kept separate from the camelCase helpers above so neither set
// of assumptions has to change. This is the one seam PLAN.md flagged
// ("reconcile any interface drift between sync.ts <-> db.ts") for Integrate.

import type {
  Db,
  ProfileWrite,
  DeviceWrite,
  NightWrite,
  ChatWrite,
  RecommendationWrite,
  SleepSessionWrite,
  SnoreEventWrite,
  AccountBundle,
} from './sync';

/** Raw-row bundle for sync.hydrate() — deliberately bypasses the camelCase
 *  `fetch*` helpers above; sync.ts does its own row->AppState mapping.
 *  Nights are embedded with their linked sleep_sessions row (same join
 *  fetchNights()/fromNightRow() above already use) so sync.ts's
 *  mapNightRow() can recover each night's real, per-night strap position
 *  instead of fabricating one from the device's current position. */
async function fetchAccountData(userId: string): Promise<AccountBundle> {
  const sb = requireSupabase();
  const [profileRes, deviceRes, nightsRes, chatRes, recRes] = await Promise.all([
    sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
    sb.from('devices').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('nights').select('*, sleep_sessions(strap_position)').eq('user_id', userId).order('date', { ascending: true }),
    sb.from('chat_messages').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    sb.from('recommendations').select('*').eq('user_id', userId).order('recommended_on', { ascending: false }),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (deviceRes.error) throw deviceRes.error;
  if (nightsRes.error) throw nightsRes.error;
  if (chatRes.error) throw chatRes.error;
  if (recRes.error) throw recRes.error;
  return {
    profile: profileRes.data,
    device: deviceRes.data,
    // Cast, same as fetchNights() above — the generated client types don't
    // model the embedded `sleep_sessions(strap_position)` join.
    nights: (nightsRes.data ?? []) as AccountBundle['nights'],
    chatMessages: chatRes.data ?? [],
    recommendations: recRes.data ?? [],
  };
}

async function dbUpsertProfile(row: ProfileWrite): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('profiles').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

/** No unique constraint on `devices.user_id` — find-then-write, same
 *  approach as the `upsertDevice` helper above, just row-shaped. */
async function dbUpsertDevice(row: DeviceWrite): Promise<void> {
  const sb = requireSupabase();
  const { data: existing, error: findErr } = await sb
    .from('devices')
    .select('id')
    .eq('user_id', row.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const { error } = await sb.from('devices').update(row).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from('devices').insert(row);
    if (error) throw error;
  }
}

async function dbUpsertNight(row: NightWrite): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('nights').upsert(row, { onConflict: 'user_id,date' });
  if (error) throw error;
}

/** Conflict target `id` (client-generated uuid) — safe to retry after a
 *  dropped response without duplicating the row. */
async function dbInsertChatMessage(row: ChatWrite): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('chat_messages').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

async function dbUpsertRecommendation(row: RecommendationWrite): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('recommendations').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

async function dbUpsertSleepSession(row: SleepSessionWrite): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('sleep_sessions').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

/** Best-effort, at-least-once (see sync.ts's DB-ACCESS CONTRACT note —
 *  `snore_events.id` is a DB identity column, no natural key to upsert on). */
async function dbInsertSnoreEvents(rows: SnoreEventWrite[]): Promise<void> {
  if (rows.length === 0) return;
  const sb = requireSupabase();
  const { error } = await sb.from('snore_events').insert(rows);
  if (error) throw error;
}

export const db: Db = {
  fetchAccountData,
  upsertProfile: dbUpsertProfile,
  upsertDevice: dbUpsertDevice,
  upsertNight: dbUpsertNight,
  insertChatMessage: dbInsertChatMessage,
  upsertRecommendation: dbUpsertRecommendation,
  upsertSleepSession: dbUpsertSleepSession,
  insertSnoreEvents: dbInsertSnoreEvents,
};
