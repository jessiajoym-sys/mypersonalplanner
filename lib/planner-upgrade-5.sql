-- ============================================================
-- myPlanner upgrade 5: Finance (sheet, budget plan, bills, statements)
-- Run ONCE in Supabase > SQL Editor, BEFORE deploying the new code.
-- Only ADDS columns/tables. Never deletes your data. Safe to re-run.
-- If Supabase shows an RLS warning, choose "Run and enable RLS".
-- ============================================================

-- 1) Transactions: a "purpose" tag (personal / business / china_daily / ...)
alter table public.transactions
  add column if not exists purpose text,
  add column if not exists project_id text;
create index if not exists transactions_user_date_idx on public.transactions(user_id, transaction_date);

-- 2) Budgets: optional per-day cap for a category
alter table public.budgets add column if not exists daily_limit numeric;

-- 3) Total monthly budget per currency (e.g. 3000 CNY), split into categories in "budgets"
create table if not exists public.budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_month date not null,
  currency text not null default 'CNY',
  total_amount numeric not null default 0,
  created_at timestamptz default now(),
  unique (user_id, budget_month, currency)
);

-- 4) Fixed bills: keyword to match imported e-statement lines, + proof file
alter table public.financial_fixed_expenses
  add column if not exists match_keyword text,
  add column if not exists kind text default 'bill',
  add column if not exists notes text;

-- 5) Statements attached to investments and loans
alter table public.financial_investments add column if not exists statement_paths jsonb not null default '[]';
alter table public.financial_loans add column if not exists statement_paths jsonb not null default '[]';

-- 6) Row Level Security for the new table
do $$
declare t text;
begin
  foreach t in array array['budget_plans'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
