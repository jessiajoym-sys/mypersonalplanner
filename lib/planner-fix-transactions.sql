-- ============================================================
-- FIX for: violates check constraint "transactions_income_check"
--      and: invalid input value for enum transaction_type: "adjustment"
-- Your database stores the transaction type as an ENUM (a fixed list) that only knows the first few types,
-- and it has old CHECK rules written for that list. This script:
--   1) adds the new transaction types to the list (existing data is untouched)
--   2) removes the old CHECK rules on the transactions table (they block the new types)
-- Run the whole script in Supabase > SQL Editor. Safe to re-run.
-- ============================================================

alter type public.transaction_type add value if not exists 'income';
alter type public.transaction_type add value if not exists 'expense';
alter type public.transaction_type add value if not exists 'transfer';
alter type public.transaction_type add value if not exists 'refund';
alter type public.transaction_type add value if not exists 'credit_card_purchase';
alter type public.transaction_type add value if not exists 'credit_card_payment';
alter type public.transaction_type add value if not exists 'fee';
alter type public.transaction_type add value if not exists 'interest';
alter type public.transaction_type add value if not exists 'adjustment';
alter type public.transaction_type add value if not exists 'loan_disbursement';
alter type public.transaction_type add value if not exists 'loan_repayment';

do $$
declare c record;
begin
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
           where conrelid = 'public.transactions'::regclass and contype = 'c'
  loop
    raise notice 'dropping old rule % : %', c.conname, c.def;
    execute format('alter table public.transactions drop constraint %I', c.conname);
  end loop;
  alter table public.transactions add constraint transactions_amount_check check (amount >= 0);
end $$;

notify pgrst, 'reload schema';
