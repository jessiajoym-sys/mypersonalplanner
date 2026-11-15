-- ============================================================
-- myPlanner upgrade 8: Finance foundation
-- (original vs personal description, debit/credit, new transaction types,
--  shared categories, import batches, duplicate protection, audit history)
-- Run ONCE in Supabase > SQL Editor, BEFORE deploying the new code.
-- Only ADDS columns/tables. Never deletes or changes your existing data.
-- Safe to re-run. If asked about RLS, choose "Run and enable RLS".
-- ============================================================

-- 1) Transactions: keep what the statement said, separately from what you wrote
alter table public.transactions
  add column if not exists original_description text,   -- exact text from the statement, never edited
  add column if not exists my_description text,          -- your own wording
  add column if not exists original_amount numeric,      -- amount exactly as the statement showed it
  add column if not exists original_direction text,      -- 'debit' | 'credit' as the statement showed it
  add column if not exists subcategory text,
  add column if not exists notes text,
  add column if not exists purpose text,
  add column if not exists project_id text,
  add column if not exists source_file text,
  add column if not exists source_ref text,
  add column if not exists import_batch uuid,
  add column if not exists import_hash text,             -- fingerprint used to block duplicate imports
  add column if not exists split_group uuid,             -- rows created by splitting one transaction
  add column if not exists reconciled boolean default false,
  add column if not exists updated_at timestamptz default now();


-- 1b) Allow the new transaction types. If an older CHECK rule limited "type" to
--     income/expense/transfer/credit_card_purchase/fee, it is replaced by a wider one.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.transactions'::regclass and contype = 'c'
      and (conname ilike '%type%' or pg_get_constraintdef(oid) ~* '^check \(+\(?type')
  loop
    execute format('alter table public.transactions drop constraint %I', c.conname);
  end loop;
  alter table public.transactions add constraint transactions_type_check check (type in (
    'income','expense','refund','transfer','credit_card_purchase','credit_card_payment',
    'fee','interest','adjustment','loan_disbursement','loan_repayment'));
exception when others then raise notice 'type constraint step skipped: %', sqlerrm;
end $$;

-- fingerprint is unique per user. NULLs (all your old rows) never clash.
do $$ begin
  create unique index if not exists transactions_user_import_hash_uq on public.transactions(user_id, import_hash);
exception when others then raise notice 'import_hash unique index skipped: %', sqlerrm; end $$;
create index if not exists transactions_import_batch_idx on public.transactions(import_batch);
create index if not exists transactions_split_idx on public.transactions(split_group);

-- 2) Shared categories / subcategories / purposes (used by Transactions AND Budget)
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'category',      -- category | subcategory | purpose
  scope text not null default 'personal',     -- personal | business | both
  name text not null,
  parent_id uuid,                              -- for subcategories
  is_archived boolean not null default false,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists finance_categories_user_idx on public.finance_categories(user_id, kind);

-- 3) Budget rows can point at a shared category (the category name stays too, so history survives archiving)
alter table public.budgets
  add column if not exists category_id uuid,
  add column if not exists daily_limit numeric;

-- 4) Import batches: one row per "Save selected transactions"
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  kind text,                                   -- debit | credit_card | alipay | wechat | icbc ...
  file_names jsonb not null default '[]',
  rows_selected int default 0,
  rows_saved int default 0,
  rows_skipped_duplicates int default 0,
  status text default 'saved',                 -- saved | failed | partial
  error text,
  created_at timestamptz default now()
);

-- 5) Audit history: who changed what on a transaction, and when
create table if not exists public.transaction_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null,
  action text not null,                        -- create | edit | archive | restore | split | import
  changes jsonb not null default '{}',         -- { field: { from, to } }
  created_at timestamptz default now()
);
create index if not exists transaction_audit_tx_idx on public.transaction_audit(transaction_id, created_at);

-- 6) Row Level Security for the new tables
do $$
declare t text;
begin
  foreach t in array array['finance_categories','import_batches','transaction_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
