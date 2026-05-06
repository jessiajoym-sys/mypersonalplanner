-- ============================================
-- myPlanner Complete Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- PROFILES
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null default 'User',
  avatar_url text,
  timezone text default 'Asia/Jakarta',
  currency text default 'IDR',
  monthly_budget numeric(15,2) default 5000000,
  rmb_monthly_budget numeric(10,2) default 3000,
  onboarding_done boolean default false,
  created_at timestamptz default now()
);

-- TODOS
create table if not exists todos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  category text default 'Personal',
  business_id text,
  start_date date,
  deadline date,
  priority text default 'medium',
  status text default 'pending',
  notes text,
  is_urgent boolean default false,
  repeat_type text default 'none',
  micro_list jsonb default '[]',
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- HABITS
create table if not exists habits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  icon text default '✅',
  color text default '#22C55E',
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- HABIT LOGS
create table if not exists habit_logs (
  id uuid default gen_random_uuid() primary key,
  habit_id uuid references habits(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  completed boolean default false,
  unique(habit_id, date)
);

-- EVENTS / CALENDAR
create table if not exists events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  date date not null,
  end_date date,
  start_time text,
  end_time text,
  all_day boolean default true,
  category text default 'event',
  category_color text default '#5B7FFF',
  repeat_type text default 'none',
  is_holiday boolean default false,
  holiday_country text,
  created_at timestamptz default now()
);

-- CALENDAR CATEGORIES (user-defined)
create table if not exists calendar_categories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text default '#5B7FFF',
  icon text default '📅',
  is_important boolean default false,
  created_at timestamptz default now()
);

-- DAILY LOGS
create table if not exists daily_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  type text not null,
  category text default 'General',
  content text not null,
  time_logged text,
  created_at timestamptz default now()
);

-- TRANSACTIONS
create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  type text not null,
  description text,
  name text,
  account_id text,
  account_name text,
  business_id text,
  status text default 'Personal',
  category text default 'Lainnya',
  currency text default 'IDR',
  amount_original numeric(15,2),
  exchange_rate numeric(10,4),
  debit numeric(15,2),
  kredit numeric(15,2),
  created_at timestamptz default now()
);

-- ACCOUNTS (debit/CC/ewallet)
create table if not exists accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  bank text,
  account_number text,
  type text default 'debit',
  currency text default 'IDR',
  balance numeric(15,2) default 0,
  credit_limit numeric(15,2),
  due_date int,
  interest_rate numeric(5,2) default 1.75,
  annual_fee numeric(10,2) default 0,
  color text default '#5B7FFF',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- RMB PURCHASES (FIFO)
create table if not exists rmb_purchases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  purchase_date date not null,
  amount_rmb numeric(10,2) not null,
  exchange_rate numeric(10,4) not null,
  amount_idr numeric(15,2) not null,
  remaining_rmb numeric(10,2) not null,
  source text default 'Alipay',
  created_at timestamptz default now()
);

-- FIXED EXPENSES
create table if not exists fixed_expenses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(15,2) not null,
  currency text default 'IDR',
  category text default 'Personal',
  account_id text,
  due_day int not null,
  is_active boolean default true,
  icon text default '💳',
  created_at timestamptz default now()
);

-- DREAM GOALS / SAVINGS
create table if not exists dream_goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text,
  emoji text default '🌟',
  target_amount numeric(15,2) not null,
  saved_amount numeric(15,2) default 0,
  target_years int default 5,
  color text default '#5B7FFF',
  created_at timestamptz default now()
);

-- RESOLUTIONS
create table if not exists resolutions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  target text,
  category text default 'Study & Academics',
  quarter text default 'Q2',
  progress int default 0,
  status text default 'on_track',
  monthly_targets jsonb default '{}',
  monthly_progress jsonb default '{}',
  color text default 'blue',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ODYSSEY PLANS
create table if not exists odyssey_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  plan_type text not null,
  title text not null,
  description text,
  emoji text default '🎯',
  color text default '#5B7FFF',
  timeline jsonb default '[]',
  pros jsonb default '[]',
  cons jsonb default '[]',
  confidence int default 7,
  excitement int default 8,
  resources int default 6,
  notes text,
  created_at timestamptz default now()
);

-- YEARS IN PIXELS
create table if not exists pixel_days (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  mood int default 3,
  color text default '#22C55E',
  note text,
  unique(user_id, date)
);

-- BUSINESSES
create table if not exists businesses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  emoji text default '💼',
  color text default '#F97316',
  type text default 'product',
  status text default 'active',
  monthly_target numeric(15,2) default 0,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- CONTENT IDEAS
create table if not exists content_ideas (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  business_id text,
  title text not null,
  platform text default 'TikTok',
  status text default 'idea',
  idea_date date not null,
  scheduled_date date,
  done_date date,
  notes text,
  created_at timestamptz default now()
);

-- NOTIFICATIONS
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  link text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ============================================
-- RLS POLICIES
-- ============================================
alter table profiles enable row level security;
alter table todos enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;
alter table events enable row level security;
alter table calendar_categories enable row level security;
alter table daily_logs enable row level security;
alter table transactions enable row level security;
alter table accounts enable row level security;
alter table rmb_purchases enable row level security;
alter table fixed_expenses enable row level security;
alter table dream_goals enable row level security;
alter table resolutions enable row level security;
alter table odyssey_plans enable row level security;
alter table pixel_days enable row level security;
alter table businesses enable row level security;
alter table content_ideas enable row level security;
alter table notifications enable row level security;

-- Policies
create policy "profiles_policy" on profiles for all using (auth.uid() = id);
create policy "todos_policy" on todos for all using (auth.uid() = user_id);
create policy "habits_policy" on habits for all using (auth.uid() = user_id);
create policy "habit_logs_policy" on habit_logs for all using (auth.uid() = user_id);
create policy "events_policy" on events for all using (auth.uid() = user_id);
create policy "calendar_categories_policy" on calendar_categories for all using (auth.uid() = user_id);
create policy "daily_logs_policy" on daily_logs for all using (auth.uid() = user_id);
create policy "transactions_policy" on transactions for all using (auth.uid() = user_id);
create policy "accounts_policy" on accounts for all using (auth.uid() = user_id);
create policy "rmb_purchases_policy" on rmb_purchases for all using (auth.uid() = user_id);
create policy "fixed_expenses_policy" on fixed_expenses for all using (auth.uid() = user_id);
create policy "dream_goals_policy" on dream_goals for all using (auth.uid() = user_id);
create policy "resolutions_policy" on resolutions for all using (auth.uid() = user_id);
create policy "odyssey_plans_policy" on odyssey_plans for all using (auth.uid() = user_id);
create policy "pixel_days_policy" on pixel_days for all using (auth.uid() = user_id);
create policy "businesses_policy" on businesses for all using (auth.uid() = user_id);
create policy "content_ideas_policy" on content_ideas for all using (auth.uid() = user_id);
create policy "notifications_policy" on notifications for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
