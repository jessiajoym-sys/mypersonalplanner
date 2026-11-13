'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { addDays, addMonths, addWeeks, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { onChange, toggleTask, todayStr, ymd } from '@/lib/planner'
import { CalItem, KIND_ICON, expandEvent, fetchHolidays, holidayItems, sortItems, taskItems } from '@/lib/calendar'
import SmartCalendar from '@/components/planner/SmartCalendar'
import TaskForm from '@/components/planner/TaskForm'
import EventForm from '@/components/planner/EventForm'
import { CardHeader } from '@/components/planner/Modal'

type Mode = 'week' | 'blocks' | 'month'
const WEEK = { weekStartsOn: 1 as const }
const money = (n: number) => 'Rp ' + Math.round(n).toLocaleString('en-US')

/** Blocks of 7 days starting on the 1st: 1–7, 8–14, 15–21, 22–28, 29–end. */
function blockFor(d: Date) {
  const idx = Math.min(4, Math.floor((d.getDate() - 1) / 7))
  const start = new Date(d.getFullYear(), d.getMonth(), idx * 7 + 1)
  const end = idx === 4 ? endOfMonth(d) : addDays(start, 6)
  return { start, end, idx }
}

export default function SchedulePage() {
  const [mode, setMode] = useState<Mode>('week')
  const [cursor, setCursor] = useState(new Date())
  const [items, setItems] = useState<CalItem[]>([])
  const [stats, setStats] = useState({ done: 0, total: 0, habitPct: 0, spent: 0, income: 0, received: 0, accomplished: 0 })
  const [taskForm, setTaskForm] = useState<{ date?: string; initial?: any } | null>(null)
  const [eventForm, setEventForm] = useState<{ date?: string; initial?: any } | null>(null)

  const range = useMemo(() => {
    if (mode === 'week') return { from: startOfWeek(cursor, WEEK), to: endOfWeek(cursor, WEEK) }
    if (mode === 'blocks') { const b = blockFor(cursor); return { from: b.start, to: b.end } }
    return { from: startOfMonth(cursor), to: endOfMonth(cursor) }
  }, [mode, cursor])
  const fromS = ymd(range.from), toS = ymd(range.to)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const [ev, td, hb, hl, tx, lg] = await Promise.all([
      supabase.from('events').select('*').eq('user_id', user.id).lte('date', toS),
      supabase.from('todos').select('*').eq('user_id', user.id).or(`and(scheduled_date.gte.${fromS},scheduled_date.lte.${toS}),and(deadline.gte.${fromS},deadline.lte.${toS})`),
      supabase.from('habits').select('id').eq('user_id', user.id).eq('is_active', true),
      supabase.from('habit_logs').select('id').eq('user_id', user.id).eq('completed', true).gte('date', fromS).lte('date', toS),
      supabase.from('transactions').select('debit,kredit').eq('user_id', user.id).gte('date', fromS).lte('date', toS),
      supabase.from('daily_logs').select('type').eq('user_id', user.id).gte('date', fromS).lte('date', toS).in('type', ['task_received', 'accomplishment']),
    ])
    const hol = await fetchHolidays(range.from.getFullYear(), ['ID', 'CN'])
    const all = [...(ev.data || []).flatMap(e => expandEvent(e, fromS, toS)), ...taskItems(td.data || [], fromS, toS), ...holidayItems(hol, fromS, toS)]
    setItems(all)
    const real = all.filter(i => i.kind === 'task' || i.kind === 'errand')
    const days = differenceInCalendarDays(range.to, range.from) + 1
    const habits = (hb.data || []).length
    setStats({
      done: real.filter(i => i.done).length, total: real.length,
      habitPct: habits ? Math.round(((hl.data || []).length / (habits * days)) * 100) : 0,
      spent: (tx.data || []).reduce((s, r: any) => s + Number(r.debit || 0), 0), income: (tx.data || []).reduce((s, r: any) => s + Number(r.kredit || 0), 0),
      received: (lg.data || []).filter((l: any) => l.type === 'task_received').length, accomplished: (lg.data || []).filter((l: any) => l.type === 'accomplishment').length,
    })
  }, [fromS, toS])  // eslint-disable-line
  useEffect(() => { load() }, [load])
  useEffect(() => onChange(load), [load])

  const byDate = useMemo(() => { const m: Record<string, CalItem[]> = {}; items.forEach(i => (m[i.date] ||= []).push(i)); Object.keys(m).forEach(k => m[k] = sortItems(m[k])); return m }, [items])
  const step = (dir: number) => setCursor(c => mode === 'week' ? addWeeks(c, dir) : mode === 'blocks' ? (dir > 0 ? addDays(blockFor(c).end, 1) : addDays(blockFor(c).start, -1)) : addMonths(c, dir))
  const label = mode === 'month' ? format(cursor, 'MMMM yyyy') : `${format(range.from, 'MMM d')} – ${format(range.to, 'MMM d, yyyy')}`

  const open = (i: CalItem) => { if (i.kind === 'event') setEventForm({ initial: i.raw }); else if (i.kind !== 'holiday') setTaskForm({ initial: i.raw }) }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Schedule & Calendar 📆</h1>
        <p className="text-xs text-gray-400 mt-0.5">One place to plan the week or month. Everything you add here is shared with the Main Dashboard, Tasks & To-Do and Daily Log.</p>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex gap-0.5 bg-white border border-gray-100 rounded-xl p-1">
          {([['week', 'Weekly'], ['blocks', '7-day blocks'], ['month', 'Monthly']] as [Mode, string][]).map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${mode === m ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>{l}</button>))}
        </div>
        {mode !== 'month' && <>
          <button className="btn-gray btn-sm" onClick={() => step(-1)}>‹</button>
          <span className="text-sm font-bold">{label}{mode === 'blocks' && <span className="text-xs text-gray-400 font-normal"> · block {blockFor(cursor).idx + 1}</span>}</span>
          <button className="btn-gray btn-sm" onClick={() => step(1)}>›</button>
          <button className="btn-blue btn-sm" onClick={() => setCursor(new Date())}>Today</button>
          <span className="flex-1" />
          <button className="btn-blue btn-sm" onClick={() => setEventForm({ date: todayStr() })}>+ Event</button>
          <button className="btn-gray btn-sm" onClick={() => setTaskForm({ date: todayStr() })}>+ Task</button>
        </>}
      </div>

      {mode !== 'month' && (
        <>
          <div className="card mb-4">
            <CardHeader icon="🧭" title="Summary" tone="gray" hint="Everything in this period at a glance." />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4">
              {[
                ['✅ Tasks', `${stats.done}/${stats.total}`, 'done'], ['📥 Received', String(stats.received), 'in Daily Log'], ['🏆 Accomplished', String(stats.accomplished), 'in Daily Log'],
                ['💧 Habits', `${stats.habitPct}%`, 'completion'], ['💰 Money', money(stats.income - stats.spent), `in ${money(stats.income)} · out ${money(stats.spent)}`],
              ].map(([t, v, s]) => <div key={t} className="bg-gray-50 rounded-xl px-3 py-2.5"><div className="text-[10px] font-bold text-gray-400 uppercase">{t}</div><div className="text-lg font-bold">{v}</div><div className="text-[10px] text-gray-400 truncate">{s}</div></div>)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {eachDayOfInterval({ start: range.from, end: range.to }).map(d => {
              const ds = ymd(d); const list = byDate[ds] || []; const hol = list.find(i => i.kind === 'holiday')
              return (
                <div key={ds} className={`bg-white rounded-2xl border p-3 min-h-[150px] ${ds === todayStr() ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`text-xs font-bold ${hol ? 'text-pink-500' : 'text-gray-600'}`}>{format(d, 'EEE, MMM d')}</div>
                    <button onClick={() => setTaskForm({ date: ds })} aria-label="Add task" className="text-blue-500 text-sm font-bold">＋</button>
                  </div>
                  {hol && <div className="text-[10px] text-pink-500 mb-1">🎌 {hol.title}</div>}
                  {list.filter(i => i.kind !== 'holiday').map(i => {
                    const canCheck = i.kind === 'task' || i.kind === 'errand' || i.kind === 'deadline'
                    return (
                      <div key={i.key} className="flex items-center gap-1.5 py-1 border-b border-gray-50 last:border-0">
                        {canCheck ? <button onClick={() => toggleTask(i.raw)} aria-label="Toggle done" className={`w-3.5 h-3.5 rounded border-2 flex-shrink-0 text-[8px] flex items-center justify-center ${i.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>{i.done && '✓'}</button> : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: i.color }} />}
                        <button onClick={() => open(i)} className={`flex-1 text-left text-[11px] truncate ${i.done ? 'line-through text-gray-400' : ''}`}>{i.startTime && <span className="text-gray-400">{i.startTime} </span>}{KIND_ICON[i.kind]} {i.title}</button>
                      </div>)
                  })}
                  {list.filter(i => i.kind !== 'holiday').length === 0 && !hol && <div className="text-[10px] text-gray-300">Free day</div>}
                </div>)
            })}
          </div>
        </>
      )}

      {mode === 'month' && <SmartCalendar defaultView="month" />}

      {taskForm && <TaskForm initial={taskForm.initial} defaults={taskForm.date ? { scheduled_date: taskForm.date } : undefined} onClose={() => setTaskForm(null)} onSaved={load} />}
      {eventForm && <EventForm initial={eventForm.initial} defaultDate={eventForm.date} onClose={() => setEventForm(null)} onSaved={load} />}
    </div>
  )
}
