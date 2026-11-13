-- ============================================================
-- myPlanner upgrade 4: Daily Habits (stats, medicine/vitamins, progress goals) + Project Management
-- Run ONCE in Supabase > SQL Editor. Only adds things; never deletes data. Safe to re-run.
-- ============================================================

-- 1) HABITS: type (habit / vitamin / medicine), schedule, dose
alter table public.habits
  add column if not exists kind text not null default 'habit',          -- habit | vitamin | medicine
  add column if not exists days jsonb not null default '[1,2,3,4,5,6,7]', -- ISO weekdays: 1=Mon … 7=Sun
  add column if not exists slots jsonb not null default '[]',           -- e.g. [{"label":"Morning","time":"08:00"}]
  add column if not exists dose text,
  add column if not exists notes text,
  add column if not exists color text default '#22C55E';

-- each individual intake of a vitamin/medicine (one row per scheduled time of day)
create table if not exists public.intake_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  date date not null,
  slot text not null default '',
  taken_at timestamptz not null default now(),
  unique (habit_id, date, slot)
);

-- 2) PROGRESS GOALS (e.g. read 200 Bible pericopes in 3 months, tick +5 at a time)
create table if not exists public.progress_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  icon text default '📖',
  unit text not null default 'pericope',
  target_total numeric not null,
  current_count numeric not null default 0,
  step numeric not null default 5,
  start_date date not null default current_date,
  end_date date not null,
  color text default '#8B5CF6',
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.progress_goal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.progress_goals(id) on delete cascade,
  date date not null default current_date,
  amount numeric not null,
  created_at timestamptz not null default now()
);

-- 3) PROJECT MANAGEMENT
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text default '📁',
  color text default '#8B5CF6',
  kind text not null default 'other',            -- content | business | study | travel | personal | other
  status text not null default 'active',         -- idea | planning | active | on_hold | done
  goal text,                                     -- what does "done / success" look like?
  description text,
  business_id text,
  start_date date,
  target_date date,
  budget numeric not null default 0,
  currency text not null default 'IDR',
  risks jsonb not null default '[]',             -- [{text, level, resolved}]
  evaluation jsonb not null default '{}',        -- {rating, went_well, to_improve, learned}
  created_at timestamptz not null default now()
);
create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  date date not null default current_date,
  type text not null default 'expense',          -- expense | income
  amount numeric not null,
  category text default 'Other',
  vendor text,
  note text,
  created_at timestamptz not null default now()
);
-- so Finance transactions can later be tagged to a project
alter table public.transactions add column if not exists project_id text;

-- 4) Row-level security: only you can see/edit your own rows
do $$
declare t text;
begin
  foreach t in array array['intake_logs','progress_goals','progress_goal_logs','projects','project_milestones','project_expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_owner_access') then
      execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t||'_owner_access', t);
    end if;
  end loop;
end $$;
create index if not exists intake_logs_user_date_idx on public.intake_logs(user_id, date);
create index if not exists project_milestones_project_idx on public.project_milestones(project_id);
create index if not exists project_expenses_project_idx on public.project_expenses(project_id);

notify pgrst, 'reload schema';
