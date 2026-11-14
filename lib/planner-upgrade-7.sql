-- ============================================================
-- myPlanner upgrade 7: Growth & Reflection
-- (Resolutions, Odyssey Plan, Mood in Pixels, Journal, Diary)
-- Run ONCE in Supabase > SQL Editor, BEFORE deploying the new code.
-- Only ADDS columns/tables. Never deletes your data. Safe to re-run.
-- If Supabase shows an RLS warning, choose "Run and enable RLS".
-- ============================================================

-- 1) Resolutions: measurable targets, deadline, auto-progress links, cover image
alter table public.resolutions
  add column if not exists year int default 2026,
  add column if not exists emoji text default '🎯',
  add column if not exists why text,
  add column if not exists due_date date,
  add column if not exists progress_mode text default 'manual',   -- manual | metric | project | business
  add column if not exists start_value numeric default 0,
  add column if not exists current_value numeric default 0,
  add column if not exists target_value numeric,
  add column if not exists unit text,
  add column if not exists link_project_id text,
  add column if not exists link_business_id text,
  add column if not exists cover_path text,
  add column if not exists review jsonb not null default '{}',
  add column if not exists check_log jsonb not null default '[]',  -- [{date, value, note}]
  add column if not exists created_at timestamptz default now();

-- 2) Vision board: free pictures + captions (images live in the private "receipts" storage bucket)
create table if not exists public.vision_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  caption text,
  image_path text,
  resolution_id uuid,
  created_at timestamptz default now()
);

-- 3) Odyssey: pictures, a "one perfect day" vision, favourite plan
alter table public.odyssey_plans
  add column if not exists image_paths jsonb not null default '[]',
  add column if not exists perfect_day text,
  add column if not exists is_main boolean default false,
  add column if not exists updated_at timestamptz default now();
do $$ begin
  create unique index if not exists odyssey_user_type_uq on public.odyssey_plans(user_id, plan_type);
exception when others then raise notice 'odyssey unique index skipped (duplicates exist) - app still works'; end $$;

-- 4) Mood in Pixels: tags (what shaped the day) + energy
alter table public.pixel_days
  add column if not exists tags jsonb not null default '[]',
  add column if not exists energy int;

-- 5) Journal & Diary
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
-- the table may already exist from an older version, so add every column we need one by one
alter table public.journal_entries
  add column if not exists kind text not null default 'journal',        -- journal | diary
  add column if not exists entry_date date not null default current_date,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists mood int,
  add column if not exists prompts jsonb not null default '{}',        -- journal: gratitude / wins / lessons / tomorrow
  add column if not exists tags jsonb not null default '[]',
  add column if not exists updated_at timestamptz default now();
create index if not exists journal_user_date_idx on public.journal_entries(user_id, kind, entry_date);

-- move old journal lines (daily_logs type 'journal') into the new table, once.
-- wrapped so that an unusual old table can never stop the rest of this script
do $$
begin
  insert into public.journal_entries (user_id, kind, entry_date, body, created_at)
  select l.user_id, 'journal', l.date, l.content, l.created_at
  from public.daily_logs l
  where l.type = 'journal'
    and not exists (select 1 from public.journal_entries j where j.user_id = l.user_id and j.kind = 'journal' and j.entry_date = l.date and j.body = l.content);
exception when others then
  raise notice 'Old journal lines were not moved (%). Nothing is lost - they stay in your Daily Log.', sqlerrm;
end $$;

-- 6) Row Level Security
do $$
declare t text;
begin
  foreach t in array array['vision_items','journal_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
