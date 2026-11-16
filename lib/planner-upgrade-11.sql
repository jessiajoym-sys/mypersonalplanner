-- ============================================================
-- myPlanner upgrade 11: task lists become real Projects (editable / deletable), legacy workspaces become projects
-- Run ONCE in Supabase > SQL Editor. Only ADDS things. Safe to re-run.
-- ============================================================
alter table public.projects add column if not exists legacy_route text;   -- e.g. /projects/travel for the old workspace pages

create table if not exists public.app_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text,
  created_at timestamptz default now()
);
create unique index if not exists app_flags_uq on public.app_flags(user_id, key);
alter table public.app_flags enable row level security;
drop policy if exists "own rows" on public.app_flags;
create policy "own rows" on public.app_flags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
