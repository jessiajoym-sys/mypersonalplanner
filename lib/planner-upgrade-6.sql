-- ============================================================
-- myPlanner upgrade 6: Business (bookkeeping, reports, platforms, plans)
-- Run ONCE in Supabase > SQL Editor, BEFORE deploying the new code.
-- Only ADDS columns/tables. Never deletes your data. Safe to re-run.
-- If Supabase shows an RLS warning, choose "Run and enable RLS".
-- ============================================================

-- 1) Businesses: currency + opening cash + AI-free "health" settings
alter table public.businesses
  add column if not exists currency text default 'IDR',
  add column if not exists opening_cash numeric default 0,
  add column if not exists opening_date date,
  add column if not exists content_stages jsonb;

-- 2) Transactions: accounting class + sales platform
alter table public.transactions
  add column if not exists bk_class text,     -- revenue|cogs|opex|inventory_purchase|asset_purchase|owner_contribution|owner_draw|loan_in|loan_payment|ar_collection|ap_payment|other
  add column if not exists platform text;
create index if not exists transactions_biz_idx on public.transactions(user_id, business_id, transaction_date);

-- 3) Sales platforms with their own fees
create table if not exists public.biz_platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id text not null,
  name text not null,
  emoji text default '🛒',
  fee_pct numeric default 0,          -- commission + payment fee, % of sale
  fixed_fee numeric default 0,        -- per order
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 4) Ad performance per platform
create table if not exists public.biz_ads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id text not null,
  platform text not null,
  campaign text,
  period_start date not null,
  period_end date not null,
  spend numeric not null default 0,
  impressions int default 0,
  clicks int default 0,
  orders int default 0,
  ad_sales numeric default 0,
  notes text,
  created_at timestamptz default now()
);

-- 5) Receivables / payables (invoices & bills)
create table if not exists public.biz_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id text not null,
  kind text not null check (kind in ('receivable','payable')),
  party text not null,                 -- customer or supplier
  description text,
  bk_class text default 'revenue',     -- receivable: revenue | payable: cogs / opex
  amount numeric not null,
  paid_amount numeric not null default 0,
  issue_date date not null,
  due_date date,
  paid_date date,
  account_id uuid,
  created_at timestamptz default now()
);

-- 6) Inventory + stock movements
create table if not exists public.biz_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id text not null,
  name text not null,
  sku text,
  unit text default 'pcs',
  qty numeric not null default 0,
  unit_cost numeric not null default 0,
  sell_price numeric default 0,
  reorder_level numeric default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);
create table if not exists public.biz_stock_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id text not null,
  item_id uuid not null references public.biz_inventory(id) on delete cascade,
  kind text not null,                  -- purchase | sale | adjust
  qty numeric not null,                -- positive = in, negative = out
  unit_cost numeric not null default 0,
  move_date date not null,
  note text,
  created_at timestamptz default now()
);

-- 7) Other assets / liabilities (equipment, loans...) for the balance sheet
create table if not exists public.biz_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id text not null,
  kind text not null check (kind in ('asset','liability')),
  name text not null,
  value numeric not null default 0,
  as_of date default current_date,
  notes text,
  created_at timestamptz default now()
);

-- 8) Business budgets (Budget vs Actual) and yearly/quarterly/monthly plans
create table if not exists public.biz_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id text not null,
  budget_month date not null,
  kind text not null default 'expense',   -- revenue | expense
  category text not null,
  amount numeric not null default 0,
  created_at timestamptz default now()
);
create table if not exists public.biz_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id text not null,
  period_type text not null,              -- year | quarter | month
  period_key text not null,               -- 2026 | 2026-Q4 | 2026-11
  revenue_target numeric default 0,
  profit_target numeric default 0,
  goals text,
  actions text,
  review jsonb not null default '{}',
  created_at timestamptz default now(),
  unique (user_id, business_id, period_type, period_key)
);

-- 9) Content / marketing performance (existing content_ideas table)
alter table public.content_ideas
  add column if not exists views int default 0,
  add column if not exists likes int default 0,
  add column if not exists comments int default 0,
  add column if not exists orders int default 0,
  add column if not exists link text,
  add column if not exists post_type text;

-- 10) Row Level Security
do $$
declare t text;
begin
  foreach t in array array['biz_platforms','biz_ads','biz_invoices','biz_inventory','biz_stock_moves','biz_items','biz_budgets','biz_plans'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
