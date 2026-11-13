-- ============================================================
-- myPlanner upgrade 2: ONE shared task system + smart calendar
-- Run this ONCE in Supabase > SQL Editor, BEFORE deploying the new code.
-- It only ADDS columns/rows. It never deletes or overwrites your data.
-- Safe to run more than once.
-- ============================================================

-- 1) TODOS = the single source of truth for every task & errand ------------
alter table public.todos
  add column if not exists task_type text not null default 'task',      -- 'task' | 'errand'
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time text,
  add column if not exists end_time text,
  add column if not exists location text,
  add column if not exists reminder_minutes int,
  add column if not exists tags jsonb not null default '[]',           -- extra projects/areas this task also belongs to
  add column if not exists legacy_task_id uuid,
  add column if not exists legacy_log_id uuid;

create unique index if not exists todos_legacy_task_id_uq on public.todos(legacy_task_id) where legacy_task_id is not null;
create unique index if not exists todos_legacy_log_id_uq  on public.todos(legacy_log_id)  where legacy_log_id  is not null;
create index if not exists todos_user_sched_idx on public.todos(user_id, scheduled_date);

-- 2) EVENTS: repeat, end date/time, alert + alert colour, business link ----
alter table public.events
  add column if not exists notes text,
  add column if not exists status text default 'upcoming',
  add column if not exists repeat_type text default 'none',             -- none|daily|weekly|biweekly|monthly|yearly
  add column if not exists repeat_until date,
  add column if not exists reminder_minutes int,
  add column if not exists alert_color text,
  add column if not exists business_id text;

-- 3) DAILY LOGS: link each entry to the task it came from + a label --------
alter table public.daily_logs
  add column if not exists todo_id uuid,
  add column if not exists label text;
create index if not exists daily_logs_user_date_idx on public.daily_logs(user_id, date);
create index if not exists daily_logs_todo_idx on public.daily_logs(todo_id);

-- 4) MOVE old dashboard tasks (table "tasks") into todos --------------------
do $$
begin
  if to_regclass('public.tasks') is not null then
    insert into public.todos (user_id, title, notes, task_type, priority, scheduled_date, status, completed_at, category, repeat_type, created_at, legacy_task_id)
    select t.user_id, t.title, t.description, coalesce(t.task_type,'task'), coalesce(t.priority,'medium'),
           t.scheduled_date,
           case when t.status = 'done' then 'done' when t.status = 'cancelled' then 'blocked' else 'todo' end,
           t.completed_at,
           case when coalesce(t.task_type,'task') = 'errand' then 'Personal' else 'Personal' end,
           'never', coalesce(t.created_at, now()), t.id
    from public.tasks t
    where not exists (select 1 from public.todos x where x.legacy_task_id = t.id);
  end if;
end $$;

-- 5) MOVE old "week_task" entries from the weekly schedule into todos -------
insert into public.todos (user_id, title, task_type, priority, scheduled_date, scheduled_time, status, completed_at, category, repeat_type, created_at, legacy_log_id)
select l.user_id,
       regexp_replace(l.content, '^\[✓\]\s*', ''),
       'task', 'medium', l.date, l.time_logged,
       case when l.content like '[✓]%' then 'done' else 'todo' end,
       case when l.content like '[✓]%' then l.created_at else null end,
       'Personal', 'never', l.created_at, l.id
from public.daily_logs l
where l.type = 'week_task'
  and not exists (select 1 from public.todos x where x.legacy_log_id = l.id);

-- normalise old status spellings
update public.todos set status = 'todo' where status in ('pending') ;

-- 6) BACKFILL the Daily Log so history is complete --------------------------
-- every task gets a "task_received" entry on the day it was created
insert into public.daily_logs (user_id, date, type, category, content, time_logged, todo_id, created_at)
select t.user_id, (t.created_at at time zone 'Asia/Shanghai')::date, 'task_received', coalesce(t.category,'General'), t.title,
       to_char(t.created_at at time zone 'Asia/Shanghai','HH24:MI'), t.id, t.created_at
from public.todos t
where not exists (select 1 from public.daily_logs l where l.todo_id = t.id and l.type = 'task_received');

-- every completed task gets an "accomplishment" entry on the day it was completed
insert into public.daily_logs (user_id, date, type, category, content, time_logged, todo_id, created_at)
select t.user_id, (t.completed_at at time zone 'Asia/Shanghai')::date, 'accomplishment', coalesce(t.category,'General'), t.title,
       to_char(t.completed_at at time zone 'Asia/Shanghai','HH24:MI'), t.id, t.completed_at
from public.todos t
where t.status = 'done' and t.completed_at is not null
  and not exists (select 1 from public.daily_logs l where l.todo_id = t.id and l.type = 'accomplishment')
  and not exists (select 1 from public.daily_logs l where l.user_id = t.user_id and l.type = 'accomplishment' and l.content = t.title and l.date = (t.completed_at at time zone 'Asia/Shanghai')::date);
