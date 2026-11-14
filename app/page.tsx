'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { addDays, format, parseISO, startOfMonth, subDays } from 'date-fns'
import { Plus } from 'lucide-react'
import { onChange, todayStr, toggleTask, ymd, projectColor } from '@/lib/planner'
import { expandEvent } from '@/lib/calendar'
import SmartCalendar from '@/components/planner/SmartCalendar'
import TaskForm from '@/components/planner/TaskForm'
import { CardHeader } from '@/components/planner/Modal'
import { computeStats, kindOf, pace, scheduledOn } from '@/lib/habits'
import { PACE_STYLE, resolutionPace, resolutionProgress } from '@/lib/growth'
import { BudgetSummary } from '@/components/finance/BudgetCard'
import { monthStart } from '@/lib/finance'
import { TX_COLS, fmt, fmtTotals, netTotals, totalsByCurrency } from '@/lib/finance'
import { HEALTH_STYLE, loadProjectData, projectHealth, spentOf, tasksOfProject } from '@/lib/projects'
import { RatesCard, WeatherCard, WorldClocks } from '@/components/planner/GlanceWidgets'

const money = (n: number) => 'Rp ' + Math.round(n).toLocaleString('en-US')

const r_needs = (x: any) => x.r.progress_mode !== 'business' && ['behind', 'at-risk', 'overdue'].includes(x.pace.state)

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [todos, setTodos] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [cats, setCats] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [recentLogs, setRecentLogs] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [pdata, setPdata] = useState<any>(null)
  const [tx, setTx] = useState<any[]>([])
  const [monthTx, setMonthTx] = useState<any[]>([])
  const [budgets, setBudgets] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [resolutions, setResolutions] = useState<any[]>([])
  const [moodToday, setMoodToday] = useState<number>(0)
  const [uid, setUid] = useState('')
  const [taskForm, setTaskForm] = useState<{ initial?: any; defaults?: any } | null>(null)
  const today = todayStr()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const d14 = ymd(subDays(new Date(), 13))
    const [p, t, e, c, h, hl, tr, mt, gl] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('todos').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('events').select('*').eq('user_id', user.id),
      supabase.from('calendar_categories').select('*').eq('user_id', user.id),
      supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at'),
      supabase.from('habit_logs').select('*').eq('user_id', user.id).gte('date', d14),
      supabase.from('transactions').select(TX_COLS).eq('user_id', user.id).is('deleted_at', null).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(4),
      supabase.from('transactions').select(TX_COLS).eq('user_id', user.id).is('deleted_at', null).gte('transaction_date', ymd(startOfMonth(new Date()))),
      supabase.from('progress_goals').select('*').eq('user_id', user.id).eq('archived', false),
    ])
    setGoals(gl.error ? [] : gl.data || [])
    setUid(user.id)
    const [rs, pxl] = await Promise.all([
      supabase.from('resolutions').select('*').eq('user_id', user.id).eq('year', new Date().getFullYear()),
      supabase.from('pixel_days').select('mood').eq('user_id', user.id).eq('date', today).maybeSingle(),
    ])
    setResolutions(rs.error ? [] : rs.data || []); setMoodToday(pxl.data?.mood || 0)
    const ms = monthStart(new Date())
    const [bg, bp] = await Promise.all([
      supabase.from('budgets').select('*').eq('user_id', user.id).eq('budget_month', ms).is('deleted_at', null),
      supabase.from('budget_plans').select('*').eq('user_id', user.id).eq('budget_month', ms),
    ])
    setBudgets(bg.error ? [] : bg.data || []); setPlans(bp.error ? [] : bp.data || [])
    setPdata(await loadProjectData(supabase, user.id))
    if (p.data) setProfile(p.data)
    setTodos(t.data || []); setEvents(e.data || []); setCats(c.data || [])
    setHabits(h.data || []); setHabitLogs(hl.data || []); setTx(tr.data || []); setMonthTx(mt.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => onChange(load), [load])

  // ---- Today's Tasks / Errands: stay visible when done (ticked + struck through); gone tomorrow, kept in Daily Log
  const isTodayItem = (t: any) =>
    t.status !== 'cancelled' && (
      t.scheduled_date === today || t.deadline === today ||
      (t.status === 'done' && t.completed_at && ymd(new Date(t.completed_at)) === today && !t.scheduled_date && !t.deadline) ||
      (t.status !== 'done' && ((t.scheduled_date && t.scheduled_date < today) || (!t.scheduled_date && t.deadline && t.deadline < today)))  // carried over
    )
  const todayList = todos.filter(isTodayItem)
  const sortT = (a: any, b: any) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99')
  const tasks = todayList.filter(t => t.task_type !== 'errand').sort(sortT)
  const errands = todayList.filter(t => t.task_type === 'errand').sort(sortT)

  // ---- Important: flagged categories (next 30 days), urgent / high priority tasks, overdue
  const important = useMemo(() => {
    const impCats = new Set(cats.filter(c => c.is_important).map(c => c.name))
    const to = ymd(addDays(new Date(), 30))
    const evs = events.filter(e => impCats.has(e.category)).flatMap(e => expandEvent(e, today, to)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)
    const urgent = todos.filter(t => t.status !== 'done' && t.status !== 'cancelled' && (t.is_urgent || t.priority === 'high')).slice(0, 5)
    const overdue = todos.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.deadline && t.deadline < today)
    return { evs, urgent, overdue }
  }, [events, cats, todos, today])

  async function toggleHabit(habitId: string) {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const logged = habitLogs.some(l => l.habit_id === habitId && l.date === today)
    if (logged) await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('date', today)
    else await supabase.from('habit_logs').insert({ user_id: user.id, habit_id: habitId, date: today, completed: true })
    load()
  }

  // ---- Stats (last 14 days)
  const stats = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => ymd(subDays(new Date(), 13 - i)))
    const doneBy = days.map(d => todos.filter(t => t.status === 'done' && t.completed_at && ymd(new Date(t.completed_at)) === d).length)
    const habitBy = computeStats(habits, habitLogs, days).daily.map(d => Math.round(d.pct))
    const { income, spent } = totalsByCurrency(monthTx)
    return { days, doneBy, habitBy, income, spent }
  }, [todos, habits, habitLogs, monthTx])

  const name = profile?.name || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const countStatus = (s: string) => todos.filter(t => t.status === s || (s === 'todo' && t.status === 'pending')).length
  const todayHabits = habits.filter(h => kindOf(h) === 'habit' && scheduledOn(h, today))
  const supp = habits.filter(h => kindOf(h) !== 'habit' && scheduledOn(h, today))
  const isHDone = (h: any) => habitLogs.some(l => l.habit_id === h.id && l.date === today && l.completed)
  const habitsDone = todayHabits.filter(isHDone).length
  const suppDone = supp.filter(isHDone).length

  const TaskRow = ({ t }: { t: any }) => {
    const done = t.status === 'done'
    const late = !done && t.scheduled_date && t.scheduled_date < today
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 group">
        <button aria-label={done ? 'Mark as not done' : 'Mark as done'} onClick={() => toggleTask(t)}
          className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center text-[11px] transition-all ${done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>{done && '✓'}</button>
        <button onClick={() => setTaskForm({ initial: t })} className="flex-1 min-w-0 text-left">
          <div className={`text-[13px] truncate ${done ? 'line-through text-gray-400' : 'font-medium'}`}>{t.title}</div>
          <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5 flex-wrap items-center">
            <span className="font-bold" style={{ color: projectColor(t.category) }}>{t.category}</span>
            {t.scheduled_time && <span>🕐 {t.scheduled_time}{t.end_time ? '–' + t.end_time : ''}</span>}
            {t.location && <span>📍 {t.location}</span>}
            {t.deadline && <span className={!done && t.deadline <= today ? 'text-red-500 font-semibold' : ''}>⏰ {t.deadline}</span>}
            {late && <span className="text-orange-500 font-semibold">carried over from {t.scheduled_date}</span>}
            {t.repeat_type && t.repeat_type !== 'never' && <span>🔄</span>}
          </div>
        </button>
        {(t.priority === 'high' || t.is_urgent) && !done && <span className="text-red-500 text-xs" title="High priority">●</span>}
      </div>
    )
  }

  const Bars = ({ values, color, max }: { values: number[]; color: string; max?: number }) => {
    const m = max || Math.max(1, ...values)
    return <div className="flex items-end gap-[3px] h-12">{values.map((v, i) => <div key={i} title={`${stats.days[i]}: ${v}`} className="flex-1 rounded-sm" style={{ height: `${Math.max(4, (v / m) * 100)}%`, background: v ? color : '#EEF0F5' }} />)}</div>
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">{greeting}, {name} ☀️</h1>
        <p className="text-xs text-gray-400 mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* GLANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <WorldClocks /><WeatherCard /><RatesCard />
      </div>

      {/* CALENDAR + IMPORTANT */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 mb-4">
        <div>
          <SmartCalendar />
          <div className="text-[11px] text-gray-400 mt-1.5 px-1">Shows events (with repeats), tasks, errands, deadlines and public holidays. <Link href="/calendar/categories" className="text-blue-500 font-semibold">🎨 Manage event categories</Link></div>
        </div>
        <div className="card self-start">
          <CardHeader icon="⚡" title="Important" tone="red" hint="Things you must not miss: events in categories you flagged important, urgent / high-priority tasks, and overdue deadlines." />
          {important.overdue.length + important.urgent.length + important.evs.length === 0
            ? <div className="p-5 text-center text-gray-400 text-xs">All clear. Flag a category as important in <Link href="/calendar/categories" className="text-blue-500">categories</Link>, or mark a task urgent.</div>
            : <div className="divide-y divide-gray-50">
              {important.overdue.map(t => <button key={t.id} onClick={() => setTaskForm({ initial: t })} className="w-full text-left px-4 py-2.5 hover:bg-gray-50"><div className="text-[10px] font-bold text-red-500">OVERDUE · {t.deadline}</div><div className="text-xs font-semibold truncate">{t.title}</div></button>)}
              {important.urgent.filter(t => !important.overdue.some(o => o.id === t.id)).map(t => <button key={t.id} onClick={() => setTaskForm({ initial: t })} className="w-full text-left px-4 py-2.5 hover:bg-gray-50"><div className="text-[10px] font-bold text-orange-500">{t.is_urgent ? 'URGENT' : 'HIGH PRIORITY'}{t.deadline ? ` · due ${t.deadline}` : ''}</div><div className="text-xs font-semibold truncate">{t.title}</div></button>)}
              {important.evs.map(i => (
                <div key={i.key} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="w-8 h-8 rounded-xl flex flex-col items-center justify-center text-white flex-shrink-0" style={{ background: i.color }}>
                    <span className="text-xs font-bold leading-none">{format(parseISO(i.date), 'd')}</span><span className="text-[8px] uppercase">{format(parseISO(i.date), 'MMM')}</span>
                  </div>
                  <div className="min-w-0"><div className="text-xs font-semibold truncate">{i.title}</div><div className="text-[10px] text-gray-400">{i.category}{i.startTime ? ' · ' + i.startTime : ''}</div></div>
                </div>))}
            </div>}
        </div>
      </div>

      {/* TASKS + ERRANDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <CardHeader icon="✅" title="Today's Tasks" tone="blue" hint="Work you plan to finish today. Tick it off and it stays here until tomorrow, and is logged in Daily Log. Same list as Tasks & To-Do."
            right={<span className="tag bg-blue-100 text-blue-600">{tasks.filter(t => t.status === 'done').length}/{tasks.length}</span>} />
          {tasks.length === 0 ? <div className="p-4 text-center text-gray-400 text-xs">Nothing scheduled for today.</div> : <div className="divide-y divide-gray-50">{tasks.map(t => <TaskRow key={t.id} t={t} />)}</div>}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50"><button onClick={() => setTaskForm({ defaults: { task_type: 'task', scheduled_date: today } })} className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:underline w-full justify-center"><Plus size={13} /> Add task</button></div>
        </div>
        <div className="card">
          <CardHeader icon="🛒" title="Errands" tone="amber" hint="Small things to do or buy outside your main work: groceries, post office, bank, pick-ups."
            right={<span className="tag bg-amber-100 text-amber-600">{errands.filter(t => t.status === 'done').length}/{errands.length}</span>} />
          {errands.length === 0 ? <div className="p-4 text-center text-gray-400 text-xs">No errands today.</div> : <div className="divide-y divide-gray-50">{errands.map(t => <TaskRow key={t.id} t={t} />)}</div>}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50"><button onClick={() => setTaskForm({ defaults: { task_type: 'errand', scheduled_date: today } })} className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold hover:underline w-full justify-center"><Plus size={13} /> Add errand</button></div>
        </div>
      </div>

      {/* HABITS + ALL TASKS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <CardHeader icon="💧" title="Daily Habits" tone="green" hint="Small things you want to repeat every day. Tap to tick for today." right={<Link href="/habit" className="text-xs text-green-600 font-semibold">Manage →</Link>} />
          {todayHabits.length === 0 ? <div className="p-4 text-center text-gray-400 text-xs">No habits scheduled today. <Link href="/habit" className="text-blue-500 font-semibold">Add habits →</Link></div> : <>
            {todayHabits.map(h => { const done = habitLogs.some(l => l.habit_id === h.id && l.date === today && l.completed); return (
              <div key={h.id} onClick={() => toggleHabit(h.id)} className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${done ? 'bg-green-50/30' : ''}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[10px] ${done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200'}`}>{done && '✓'}</div>
                <span className="text-base">{h.icon}</span><span className={`flex-1 text-xs ${done ? 'line-through text-gray-400' : ''}`}>{h.name}</span>
              </div>) })}
            <div className="px-4 py-2.5 bg-gray-50 flex justify-between text-xs text-gray-400"><span>Habits today</span><span className="font-bold text-green-600">{habitsDone}/{todayHabits.length}</span></div>
            {supp.length > 0 && <Link href="/habit" className="px-4 py-2.5 border-t border-gray-100 flex justify-between text-xs hover:bg-gray-50"><span>💊 Medicine & vitamins today</span><span className="font-bold text-amber-600">{suppDone}/{supp.length}</span></Link>}
            {goals.slice(0, 2).map(g => { const p = pace(g); return <Link href="/habit" key={g.id} className="block px-4 py-2.5 border-t border-gray-100 hover:bg-gray-50"><div className="flex justify-between text-xs"><span>{g.icon} {g.title}</span><span className="font-bold">{Number(g.current_count)}/{Number(g.target_total)}</span></div><div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, p.pct)}%`, background: p.diff < -0.5 ? '#F97316' : '#8B5CF6' }} /></div></Link> })}
          </>}
        </div>
        <div className="card">
          <CardHeader icon="📋" title="All Tasks" tone="purple" hint="Overview of every task in every project." right={<Link href="/todo" className="text-xs text-purple-600 font-semibold">Open →</Link>} />
          <div className="p-4 grid grid-cols-2 gap-2">
            {[['To Do', countStatus('todo'), 'bg-gray-100 text-gray-600'], ['In Progress', countStatus('inprogress'), 'bg-blue-50 text-blue-600'], ['Done', countStatus('done'), 'bg-green-50 text-green-600'], ['Blocked', countStatus('blocked'), 'bg-red-50 text-red-500']].map(([l, n, c]) => (
              <Link href="/todo" key={l as string} className={`rounded-xl px-3 py-3 ${c}`}><div className="text-2xl font-bold">{n}</div><div className="text-[11px] font-semibold">{l}</div></Link>))}
          </div>
        </div>
      </div>

      {/* PROJECTS */}
      {pdata?.projects && pdata.projects.filter((p: any) => p.status !== 'done').length > 0 && (
        <div className="card mb-4">
          <CardHeader icon="🚀" title="Projects" tone="purple" hint="Your active projects and whether they are on track." right={<Link href="/projects" className="text-xs text-purple-600 font-semibold">Open →</Link>} />
          <div className="divide-y divide-gray-50">
            {pdata.projects.filter((p: any) => p.status !== 'done').slice(0, 5).map((p: any) => {
              const h = projectHealth(p, tasksOfProject(pdata.todos, p.name), pdata.milestones.filter((m: any) => m.project_id === p.id), spentOf(p.id, pdata.expenses, pdata.txs), today)
              return <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"><span className="text-lg">{p.emoji}</span><div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{p.name}</div><div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${h.progress}%`, background: p.color }} /></div></div><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${HEALTH_STYLE[h.level]}`}>{h.label}</span><b className="text-xs w-9 text-right">{Math.round(h.progress)}%</b></Link>
            })}
          </div>
        </div>)}

      {/* STATS */}
      <div className="card mb-4">
        <CardHeader icon="📊" title="Statistics" tone="gray" hint="Last 14 days: when you were productive and when you were not. Left = oldest day, right = today." />
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div><div className="text-[11px] font-bold text-gray-500 mb-1.5">Tasks completed / day <span className="text-gray-300 font-normal">· total {stats.doneBy.reduce((a, b) => a + b, 0)}</span></div><Bars values={stats.doneBy} color="#5B7FFF" /></div>
          <div><div className="text-[11px] font-bold text-gray-500 mb-1.5">Habits done / day (%) <span className="text-gray-300 font-normal">· avg {Math.round(stats.habitBy.reduce((a, b) => a + b, 0) / 14)}%</span></div><Bars values={stats.habitBy} color="#22C55E" max={100} /></div>
          <div>
            <div className="text-[11px] font-bold text-gray-500 mb-1.5">Money this month</div>
            <div className="flex justify-between text-xs"><span className="text-gray-400">In</span><span className="font-bold text-green-600">{fmtTotals(stats.income)}</span></div>
            <div className="flex justify-between text-xs mt-1"><span className="text-gray-400">Out</span><span className="font-bold text-red-500">{fmtTotals(stats.spent)}</span></div>
            <div className="flex justify-between text-xs mt-1 pt-1 border-t border-gray-100"><span className="text-gray-400">Net</span><span className="font-bold">{fmtTotals(netTotals(stats.income, stats.spent))}</span></div>
          </div>
        </div>
      </div>

      {(() => {
        const projectPct: Record<string, number> = {}
        ;(pdata?.projects || []).forEach((p: any) => { projectPct[p.id] = projectHealth(p, tasksOfProject(pdata.todos, p.name), pdata.milestones.filter((m: any) => m.project_id === p.id), 0, today).progress })
        const list = resolutions.map(r => { const pr = resolutionProgress(r, { projectPct, bizRevenue: {} }); return { r, pr, pace: resolutionPace(r, pr, today) } })
        const attention = list.filter(x => r_needs(x)).sort((a, b) => a.pace.gap - b.pace.gap).slice(0, 3)
        const overall = list.length ? Math.round(list.reduce((n, x) => n + x.pr, 0) / list.length) : 0
        const MOODS = [['🌟', 5], ['😊', 4], ['😐', 3], ['😔', 2], ['😢', 1]] as const
        return (
          <div className="card mb-4">
            <CardHeader icon="🌱" title="Growth" tone="purple" hint="How you feel today and which goals need a nudge." right={<Link href="/resolution" className="text-xs text-purple-600 font-semibold">Resolutions →</Link>} />
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-semibold">Mood today</span>
                <div className="flex gap-1.5">{MOODS.map(([e, v]) => <button key={v} className={`text-2xl transition-transform hover:scale-125 ${moodToday === v ? '' : moodToday ? 'opacity-30' : ''}`} aria-label={`Mood ${v}`} onClick={async () => { const colors: any = { 5: '#22C55E', 4: '#86EFAC', 3: '#FDE68A', 2: '#FDBA74', 1: '#EF4444' }; await supabase.from('pixel_days').upsert({ user_id: uid, date: today, mood: v, color: colors[v] }, { onConflict: 'user_id,date' }); setMoodToday(v) }}>{e}</button>)}</div>
                <Link href="/journal" className="ml-auto text-xs text-teal-600 font-semibold">📔 Write today’s journal →</Link></div>
              {list.length > 0 && <div className="flex items-center gap-3"><div className="text-xl font-bold text-blue-500">{overall}%</div><div className="flex-1 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-500" style={{ width: `${overall}%` }} /></div><span className="text-[11px] text-gray-400">{list.length} goals</span></div>}
              {attention.map(x => <Link key={x.r.id} href="/resolution" className="flex items-center gap-2 text-sm hover:bg-gray-50 rounded-lg px-2 py-1"><span>{x.r.emoji || '🎯'}</span><span className="flex-1 truncate">{x.r.title}</span><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PACE_STYLE[x.pace.state].cls}`}>{PACE_STYLE[x.pace.state].label} · {x.pr}%</span></Link>)}
              {list.length === 0 && <div className="text-xs text-gray-400">Set your yearly goals in Resolutions to see them here.</div>}
            </div>
          </div>
        )
      })()}

      {(budgets.length > 0 || plans.length > 0) && (
        <div className="card mb-4">
          <CardHeader icon="🎯" title="Budget — This Month" tone="teal" hint="What is left to spend, and today’s daily caps." right={<Link href="/financial" className="text-xs text-teal-600 font-semibold">Manage →</Link>} />
          <div className="p-4"><BudgetSummary txs={monthTx} budgets={budgets} plans={plans} /></div>
        </div>
      )}

      {tx.length > 0 && (
        <div className="card">
          <CardHeader icon="💰" title="Financial — Recent" tone="teal" hint="Your latest transactions." right={<Link href="/financial" className="text-xs text-teal-600 font-semibold">View all →</Link>} />
          <div className="divide-y divide-gray-50">{tx.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3"><div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{t.merchant || t.description || t.category}</div><div className="text-xs text-gray-400">{t.transaction_date} · {t.category}</div></div>
              <span className={`text-sm font-bold ${t.type === 'income' ? 'text-green-500' : t.type === 'transfer' ? 'text-gray-500' : 'text-red-500'}`}>{t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '-'}{fmt(Number(t.amount), t.currency)}</span></div>))}</div>
        </div>
      )}

      {taskForm && <TaskForm initial={taskForm.initial} defaults={taskForm.defaults} onClose={() => setTaskForm(null)} onSaved={load} />}
    </div>
  )
}
