-- ============================================================
-- myPlanner upgrade 3 — run ONCE in Supabase > SQL Editor.
-- Fixes "Could not find the 'end_date' column of 'events'" and adds the cycle tracker.
-- Only adds things; never deletes data. Safe to run again.
-- ============================================================

-- 1) EVENTS: make sure every column the calendar uses exists
alter table public.events
  add column if not exists description text,
  add column if not exists location text,
  add column if not exists end_date date,
  add column if not exists start_time text,
  add column if not exists end_time text,
  add column if not exists all_day boolean default true,
  add column if not exists category text default 'event',
  add column if not exists category_color text default '#5B7FFF',
  add column if not exists notes text,
  add column if not exists status text default 'upcoming',
  add column if not exists repeat_type text default 'none',
  add column if not exists repeat_until date,
  add column if not exists reminder_minutes int,
  add column if not exists alert_color text,
  add column if not exists business_id text;

-- 2) CYCLE TRACKER (private; only you can read it)
create table if not exists public.cycle_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.cycle_logs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cycle_logs' and policyname='cycle_logs_owner_access') then
    execute 'create policy cycle_logs_owner_access on public.cycle_logs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
end $$;
create index if not exists cycle_logs_user_idx on public.cycle_logs(user_id, start_date);

-- ask Supabase to refresh its column cache right away
notify pgrst, 'reload schema';
