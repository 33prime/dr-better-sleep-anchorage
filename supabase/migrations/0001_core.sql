-- 0001_core.sql
-- Dr. Never Snore — core schema per PLAN.md "Database schema".
-- All tables in public, RLS enabled on every table, owner-only policies.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  age_range text,
  sex text,
  bmi_range text,
  ship_to text,
  partner_name text,
  partner_relation text,
  partner_notify_morning boolean not null default false,
  ui_theme text not null default 'auto',
  onboarding jsonb not null default '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select
  using (auth.uid() = id);

create policy profiles_insert_own on public.profiles
  for insert
  with check (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy profiles_delete_own on public.profiles
  for delete
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- devices
-- ---------------------------------------------------------------------------

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fitted_at date,
  strap_position int check (strap_position between 1 and 5),
  lifespan_nights int default 365,
  last_replacement date,
  created_at timestamptz not null default now()
);

alter table public.devices enable row level security;

create policy devices_select_own on public.devices
  for select
  using (auth.uid() = user_id);

create policy devices_insert_own on public.devices
  for insert
  with check (auth.uid() = user_id);

create policy devices_update_own on public.devices
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy devices_delete_own on public.devices
  for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- sleep_sessions
-- ---------------------------------------------------------------------------

create table public.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'ended', 'abandoned')),
  strap_position int,
  source text not null default 'recorded' check (source in ('recorded', 'demo')),
  created_at timestamptz not null default now()
);

alter table public.sleep_sessions enable row level security;

create policy sleep_sessions_select_own on public.sleep_sessions
  for select
  using (auth.uid() = user_id);

create policy sleep_sessions_insert_own on public.sleep_sessions
  for insert
  with check (auth.uid() = user_id);

create policy sleep_sessions_update_own on public.sleep_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy sleep_sessions_delete_own on public.sleep_sessions
  for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- snore_events
-- ---------------------------------------------------------------------------

create table public.snore_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sleep_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ts timestamptz not null,
  duration_ms int,
  peak_db real,
  band_palatal real,
  band_tongue real,
  band_nasal real,
  created_at timestamptz not null default now()
);

create index snore_events_session_id_ts_idx on public.snore_events (session_id, ts);
create index snore_events_user_id_ts_idx on public.snore_events (user_id, ts);

alter table public.snore_events enable row level security;

create policy snore_events_select_own on public.snore_events
  for select
  using (auth.uid() = user_id);

create policy snore_events_insert_own on public.snore_events
  for insert
  with check (auth.uid() = user_id);

create policy snore_events_update_own on public.snore_events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy snore_events_delete_own on public.snore_events
  for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- nights
-- ---------------------------------------------------------------------------

create table public.nights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  session_id uuid references public.sleep_sessions (id),
  source text not null default 'recorded' check (source in ('recorded', 'demo', 'manual')),
  -- measured
  total_snores int,
  snores_by_hour jsonb,
  peak_db real,
  started_at time,
  ended_at time,
  duration_min int,
  snore_time_pct real,
  longest_quiet_min real,
  type_palatal real,
  type_tongue real,
  type_nasal real,
  -- logged
  alcohol boolean not null default false,
  partner_slept_through boolean,
  -- wearable-ingest placeholders (nullable, null for recorded nights until ingest exists)
  efficiency real,
  hrv real,
  resting_hr real,
  deep_min int,
  rem_min int,
  light_min int,
  awake_min int,
  positions jsonb,
  position_snores jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.nights enable row level security;

create policy nights_select_own on public.nights
  for select
  using (auth.uid() = user_id);

create policy nights_insert_own on public.nights
  for insert
  with check (auth.uid() = user_id);

create policy nights_update_own on public.nights
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy nights_delete_own on public.nights
  for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  who text check (who in ('user', 'coach')),
  text text,
  card jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_user_id_created_at_idx on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

create policy chat_messages_select_own on public.chat_messages
  for select
  using (auth.uid() = user_id);

create policy chat_messages_insert_own on public.chat_messages
  for insert
  with check (auth.uid() = user_id);

create policy chat_messages_update_own on public.chat_messages
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy chat_messages_delete_own on public.chat_messages
  for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- recommendations
-- ---------------------------------------------------------------------------

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  emphasis text,
  quote text,
  recommended_on date,
  price text,
  price_subtext text,
  icon_kind text check (icon_kind in ('pill', 'pillow', 'tablet')),
  created_at timestamptz not null default now()
);

alter table public.recommendations enable row level security;

create policy recommendations_select_own on public.recommendations
  for select
  using (auth.uid() = user_id);

create policy recommendations_insert_own on public.recommendations
  for insert
  with check (auth.uid() = user_id);

create policy recommendations_update_own on public.recommendations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy recommendations_delete_own on public.recommendations
  for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- profile-creation trigger: on auth.users insert, create an empty profile
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
