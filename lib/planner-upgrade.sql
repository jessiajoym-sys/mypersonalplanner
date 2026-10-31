-- Safe, additive upgrade for the planner features in this project.
-- Run in Supabase SQL Editor. It does not delete or rewrite existing records.

alter table public.content_ideas
  add column if not exists script text,
  add column if not exists caption text,
  add column if not exists published_url text,
  add column if not exists views bigint not null default 0,
  add column if not exists likes bigint not null default 0,
  add column if not exists comments bigint not null default 0,
  add column if not exists saves bigint not null default 0;

alter table public.transactions
  add column if not exists business_id text;

create table if not exists public.financial_loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  lender text,
  loan_type text not null default 'other',
  original_amount numeric(15,2) not null default 0,
  current_balance numeric(15,2) not null default 0,
  monthly_payment numeric(15,2) not null default 0,
  annual_interest_rate numeric(6,3) not null default 0,
  total_months integer not null default 0,
  paid_months integer not null default 0,
  next_due_date date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.financial_loans enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'financial_loans'
      and policyname = 'financial_loans_owner_access'
  ) then
    execute 'create policy financial_loans_owner_access on public.financial_loans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
end
$$;

create index if not exists financial_loans_user_id_idx on public.financial_loans(user_id);
create index if not exists content_ideas_user_status_idx on public.content_ideas(user_id, status);

create table if not exists public.financial_investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  asset_name text not null,
  asset_type text not null default 'other',
  invested_amount numeric(15,2) not null default 0,
  current_value numeric(15,2) not null default 0,
  quantity numeric(20,8),
  valuation_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.financial_investments enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'financial_investments'
      and policyname = 'financial_investments_owner_access'
  ) then
    execute 'create policy financial_investments_owner_access on public.financial_investments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
end
$$;
create index if not exists financial_investments_user_id_idx on public.financial_investments(user_id);
