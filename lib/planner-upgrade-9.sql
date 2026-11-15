-- ============================================================
-- myPlanner upgrade 9: Fixed bills matching, Loans (amortization, rates, prepayment), Credit-card statements
-- Run ONCE in Supabase > SQL Editor AFTER planner-upgrade-8.sql. Only ADDS things. Safe to re-run.
-- ============================================================

-- 1) Fixed bills: frequency, payment account, status
alter table public.financial_fixed_expenses
  add column if not exists frequency text default 'monthly',      -- monthly | quarterly | semiannual | yearly
  add column if not exists due_month int,                          -- anchor month (1-12) for quarterly / semiannual / yearly
  add column if not exists payment_account_id uuid,
  add column if not exists status text default 'active',           -- active | paused | ended
  add column if not exists subcategory text,
  add column if not exists match_keyword text,
  add column if not exists kind text default 'bill',
  add column if not exists notes text;

-- 2) Which real transaction paid which bill in which period (also manual corrections)
create table if not exists public.fixed_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fixed_id uuid not null,
  period text not null,                 -- '2026-11' (the due month)
  transaction_id uuid,                  -- null when marked paid/skipped manually
  status text not null default 'paid',  -- paid | manual | skipped
  matched_by text not null default 'auto',
  note text,
  created_at timestamptz default now()
);
create unique index if not exists fixed_payments_period_uq on public.fixed_payments(user_id, fixed_id, period);
create unique index if not exists fixed_payments_tx_uq on public.fixed_payments(user_id, transaction_id) where transaction_id is not null;

-- 3) Loans: full details
alter table public.financial_loans
  add column if not exists currency text default 'IDR',
  add column if not exists interest_type text default 'fixed',          -- fixed | floating | fixed_then_floating
  add column if not exists fixed_period_months int,
  add column if not exists loan_start_date date,
  add column if not exists first_installment_date date,
  add column if not exists due_day int,
  add column if not exists payment_account_id uuid,
  add column if not exists status text default 'active',                -- active | paid_off | closed
  add column if not exists next_rate_review_date date,
  add column if not exists match_keyword text,
  add column if not exists monthly_admin_fee numeric default 0,
  add column if not exists initial_rate numeric;                         -- the rate at the start; later changes live in loan_rate_changes

create table if not exists public.loan_rate_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_id uuid not null,
  effective_date date not null,
  annual_rate numeric not null,
  verified boolean default true,       -- true = rate you got from the bank, not a guess
  note text,
  created_at timestamptz default now()
);
create index if not exists loan_rate_changes_idx on public.loan_rate_changes(loan_id, effective_date);

create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_id uuid not null,
  kind text not null default 'installment',     -- installment | prepayment_partial | prepayment_full | penalty
  installment_no int,
  due_date date,
  paid_date date not null,
  principal numeric not null default 0,
  interest numeric not null default 0,
  fees numeric not null default 0,
  effect text,                                   -- for partial prepayment: shorter_tenor | lower_installment
  transaction_ids jsonb not null default '[]',   -- the ledger rows created / linked
  note text,
  created_at timestamptz default now()
);
create index if not exists loan_payments_idx on public.loan_payments(loan_id, paid_date);
create unique index if not exists loan_payments_inst_uq on public.loan_payments(user_id, loan_id, installment_no) where kind = 'installment';

-- 4) Credit-card statement history (one row per card per month)
create table if not exists public.card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  statement_month date not null,                 -- first day of the statement month
  statement_date date,
  due_date date,
  statement_balance numeric,
  minimum_payment numeric,
  credit_limit numeric,
  note text,
  created_at timestamptz default now()
);
create unique index if not exists card_statements_uq on public.card_statements(user_id, account_id, statement_month);

do $$
declare t text;
begin
  foreach t in array array['fixed_payments','loan_rate_changes','loan_payments','card_statements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
