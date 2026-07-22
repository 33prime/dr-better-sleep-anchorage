-- 0002_waitlist.sql
-- Preorder-interest list for the marketing site. Anonymous visitors may
-- INSERT (that's the entire point of the form); nobody but service role can
-- read it — there is deliberately no select/update/delete policy.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  source text not null default 'site',
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

create policy waitlist_insert_anyone on public.waitlist
  for insert
  to anon, authenticated
  with check (true);
