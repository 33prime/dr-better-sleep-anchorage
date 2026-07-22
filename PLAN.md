# Make It Real — Phase 1 Contract

The single source of truth for the Supabase integration build. Every implementation
agent reads this before touching code. Deviations require updating this file.

## Product frame

Dr. Never Snore: PWA that tracks snoring overnight from the phone mic, pairs with a
boil-and-bite mandibular device, and gives morning feedback via "Dr. Sommers" (Claude).
Wellness product, NOT a medical device — never diagnose, never mention apnea detection.
See ../RESEARCH.md for the evidence base. Three research findings shape this build:

1. Mic can honestly produce: snore events (timestamp, duration, loudness), band-energy
   snore-type mix (palatal 60–300 Hz / tongue 300–1000 Hz / nasal 1000–3000 Hz),
   snore-time percentage, quiet stretches. Mic can NEVER produce: HR, HRV, sleep
   stages, body position. Those fields are wearable-ingest placeholders (nullable).
2. Time-interval metrics beat raw counts for severity. We compute `snore_time_pct`
   (fraction of session inside snore runs, gap threshold 60 s) and `longest_quiet_min`.
3. Everything persisted must be measured or explicitly tagged demo/manual — no
   fabricated-but-displayed-as-real data anywhere.

## Environment

- Supabase project ref `fjesukwxlntmgriojnpn`, linked from this dir (`app/`).
  CLI works via IPv4 pooler; `SUPABASE_DB_PASSWORD` is in `.env` (gitignored).
- `.env` also holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server/scripts only), `DEMO_EMAIL`, `DEMO_PASSWORD`.
- `@supabase/supabase-js` is installed. React 19 + Vite 7 + wouter + CSS modules.
- Never run `npm run dev`. Run `npm run build` only if you own the Integrate phase.

## Database schema (migration `0001_core.sql`)

All tables in `public`, RLS ENABLED on every table, owner-only policies
(`auth.uid() = user_id`, for profiles `auth.uid() = id`). Use `gen_random_uuid()`.
`created_at timestamptz default now()` everywhere.

- `profiles`: `id uuid pk references auth.users on delete cascade`, `name text`,
  `age_range text`, `sex text`, `bmi_range text`, `ship_to text`,
  `partner_name text`, `partner_relation text`, `partner_notify_morning bool default false`,
  `ui_theme text default 'auto'`, `onboarding jsonb default '{}'`, `updated_at timestamptz`.
  Trigger `on auth.users insert` → create empty profile (security definer).
- `devices`: `id uuid pk`, `user_id uuid not null references auth.users on delete cascade`,
  `fitted_at date`, `strap_position int check 1..5`, `lifespan_nights int default 365`,
  `last_replacement date`.
- `sleep_sessions`: `id uuid pk`, `user_id`, `started_at timestamptz not null`,
  `ended_at timestamptz`, `status text check in ('active','ended','abandoned') default 'active'`,
  `strap_position int`, `source text check in ('recorded','demo') default 'recorded'`.
- `snore_events`: `id bigint identity pk`, `session_id uuid not null references
  sleep_sessions on delete cascade`, `user_id uuid not null`, `ts timestamptz not null`,
  `duration_ms int`, `peak_db real`, `band_palatal real`, `band_tongue real`,
  `band_nasal real`. Index on `(session_id, ts)` and `(user_id, ts)`.
- `nights`: `id uuid pk`, `user_id`, `date date not null`, `unique(user_id, date)`,
  `session_id uuid references sleep_sessions`, `source text check in
  ('recorded','demo','manual') default 'recorded'`,
  measured: `total_snores int`, `snores_by_hour jsonb` (int array), `peak_db real`,
  `started_at time`, `ended_at time`, `duration_min int`, `snore_time_pct real`,
  `longest_quiet_min real`, `type_palatal real`, `type_tongue real`, `type_nasal real`,
  logged: `alcohol bool default false`, `partner_slept_through bool`,
  wearable-ingest placeholders (nullable, null for recorded nights until ingest exists):
  `efficiency real`, `hrv real`, `resting_hr real`, `deep_min int`, `rem_min int`,
  `light_min int`, `awake_min int`, `positions jsonb`, `position_snores jsonb`.
- `chat_messages`: `id uuid pk`, `user_id`, `who text check in ('user','coach')`,
  `text text`, `card jsonb`, `created_at`. Index `(user_id, created_at)`.
- `recommendations`: `id uuid pk`, `user_id`, `name text`, `emphasis text`,
  `quote text`, `recommended_on date`, `price text`, `price_subtext text`,
  `icon_kind text check in ('pill','pillow','tablet')`.

After push: `supabase gen types typescript --linked > src/lib/database.types.ts`.

## Client architecture

The existing localStorage store (`src/store.ts`) stays the UI's synchronous source of
truth. Supabase is the durable backend. Data flows:

- **Login** → `sync.hydrate()` pulls profile/device/nights/chat/recs → maps into
  `AppState` → `store.set` → localStorage cache as today.
- **Writes** go through `src/lib/sync.ts`: update store immediately (optimistic),
  enqueue a write-through op (queue persisted in localStorage key
  `dr-better-sleep:syncq`), flush with retry/backoff; flush on `online` and visibility
  change. Ops are idempotent upserts keyed by natural keys (`user_id,date` for nights).
- **Logged out** → app behaves exactly like today (local seed, demo feel). A
  `mode: 'local-demo' | 'account'` field on AppState controls it.
- **Auth**: `src/screens/Auth.tsx` — email → 6-digit OTP (`signInWithOtp` then
  `verifyOtp`, `shouldCreateUser: true`). Secondary button "Explore the demo" signs in
  with `VITE_DEMO_EMAIL`/`VITE_DEMO_PASSWORD` if defined (add to `.env` as VITE_ vars
  at integrate time). Route `/auth`. Entry: a "Sign in" affordance on Profile +
  first-run screen; do NOT hard-gate the app behind auth.

### Type conventions

`AppState`/`Night` types stay in `src/seed.ts` (every screen imports from there).
Additive changes only: `Night` gains `snoreTimePct?: number`, `longestQuietMin?: number`,
`source?: 'recorded'|'demo'|'manual'|'seed'`; wearable fields (`hrv`, `restingHr`,
`efficiency`, `deepMin`, `remMin`, `lightMin`, `awakeMin`, `positions`,
`positionSnores`) become optional. AppState gains `mode`, `auth?: { userId: string;
email: string } | null`. Screens must render gracefully when wearable fields are
undefined (show "connect a wearable" affordance, not fake numbers, for recorded nights).

## Night tracking v2 (the honest pipeline)

`src/hooks/useSnoreDetector.ts` (rewrite, keep public shape additive):
- Emit per-event records: `{ ts, durationMs, peakDb, bandPalatal, bandTongue, bandNasal }`
  via an `onEvent` callback in addition to current aggregate state.
- Keep adaptive noise floor + low-band gating + refractory as today.

`src/lib/sessionRecorder.ts` (new):
- Owns a recording session: buffers events in memory, persists incrementally to
  IndexedDB (db `dns-sessions`, store `events` keyed by `sessionId`) every 30 s and on
  each event batch of 20 — a crash mid-night loses ≤30 s.
- On start (online + logged in): insert `sleep_sessions` row (status `active`).
- On end: compute `NightSummary` — totalSnores, snoresByHour (real, from timestamps,
  bucketed by clock hour), peakDb, typeMix (event-energy weighted), snoreTimePct
  (runs = events with gaps <60 s; sum run spans / session span), longestQuietMin,
  durationMin, startedAt/endedAt (real clock times) — upsert night + bulk-insert
  events to Supabase via sync queue, mark session `ended`, clear IndexedDB buffer.
- On app relaunch with an orphaned IndexedDB buffer: recover it into a night
  (status `abandoned` → still summarize; honest data beats lost data).
- `src/lib/wakeLock.ts`: `navigator.wakeLock` acquire/reacquire on visibilitychange;
  expose status so Night screen can warn when unavailable (iOS Safari pre-16.4).

`src/screens/Night.tsx`: use recorder; DELETE the fabricate-from-prior-night code in
`endNight` (no scaled positions/stages — recorded nights carry measured fields only);
dim-mode after 30 s idle (tap to wake); keep papercraft look.

## Insights & report (`src/utils/insights.ts`, new)

Pure functions over `Night[]` (no React): `snoreTimeTrend`, `wineEffect` (exists in
store.ts — move & generalize), `typeMixShift` (14-night), `quietProgress`,
`deviceEffect` (pre/post fitted baseline delta), `bestNight`, `weekSummary`. Each
returns `{ value, confidence: 'solid'|'emerging'|'insufficient', sentence: string }`
so screens and the chat context can render honest, graded claims. MorningReveal and
chatApi consume these; chatApi's `buildDataContext` must use profile names (not
hardcoded Matt/Sarah) and real nights, and note which fields are wearable-pending.

## Demo seeding (`scripts/seed-demo.mjs`)

Node script, run `node scripts/seed-demo.mjs` (loads `.env` manually — no dotenv dep,
parse the file). Uses service role + admin API:
- Ensure user `DEMO_EMAIL` exists (admin createUser, `email_confirm: true`,
  password `DEMO_PASSWORD`), profile filled (name "Alex", partner "Sam").
- 75 nights ending yesterday, story arc: 14 pre-device baseline (~120–180 snores,
  snore_time_pct ~0.22), device fitted day 15, exponential-ish decline to ~25–45,
  wine nights 2×/wk with 1.8–2.3× spike, one bad week (strap slipped) around day 45,
  partner_slept_through improving 2/7 → 6/7. All `source='demo'`, wearable fields
  FILLED for demo nights (plausible values, they represent "wearable connected").
- Synthetic `snore_events` for the most recent 14 nights (typed band energies
  consistent with each night's type mix), each with a `sleep_sessions` row (`demo`).
- ~20 chat messages telling the arc story + 3 recommendations.
- Idempotent: wipe-and-reseed rows for the demo user on each run.

## File ownership (parallel agents — do not cross)

| Owner | Files |
|---|---|
| migrate | `supabase/migrations/*`, `src/lib/database.types.ts` |
| auth | `src/lib/supabase.ts`, `src/lib/db.ts`, `src/screens/Auth.tsx`, `Auth.module.css` |
| sync | `src/lib/sync.ts`, `src/store.ts`, `src/seed.ts` |
| recorder | `src/hooks/useSnoreDetector.ts`, `src/lib/sessionRecorder.ts`, `src/lib/wakeLock.ts`, `src/screens/Night.tsx`, `Night.module.css` |
| insights | `src/utils/insights.ts`, `src/screens/MorningReveal.tsx`, `MorningReveal.module.css` |
| seed | `scripts/seed-demo.mjs` |
| integrate | `src/App.tsx`, `src/main.tsx`, `src/utils/chatApi.ts`, `src/screens/Profile.tsx`, `.env`, `package.json`, plus conflict resolution anywhere |

Shared imports flow one way: screens → lib/hooks/utils → seed.ts types. If you need
something from a file you don't own, code against the interface in this contract.

## Non-negotiables

- RLS on every table, owner-only. Service role key never appears in `src/`.
- No fabricated data written as `source='recorded'`.
- No new heavy deps without cause (`@supabase/supabase-js` is the only planned addition).
- Papercraft visual language everywhere (see BRAND.md); dark-first.
- `npm run build` (tsc + vite) must pass at the end of Integrate.
