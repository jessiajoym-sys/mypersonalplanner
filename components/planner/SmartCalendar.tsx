'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { addDays, addMonths, addWeeks, addYears, eachDayOfInterval, endOfMonth, endOfWeek, endOfYear, format, isSameMonth, parseISO, startOfMonth, startOfWeek, startOfYear, isToday } from 'date-fns'
import { ymd, onChange, toggleTask } from '@/lib/planner'
import { CalItem, COUNTRY_STYLE, KIND_COLOR, KIND_ICON, KIND_LABEL, expandEvent, fetchHolidays, billItems, holidayItems, milestoneItems, sortItems, taskItems } from '@/lib/calendar'
import EventForm from './EventForm'
import TaskForm from './TaskForm'
import CycleModal from './CycleModal'
import { analyze, cycleDayMap } from '@/lib/cycle'

type View = 'month' | 'week' | 'day' | 'year'
const WEEK = { weekStartsOn: 1 as const }
const COUNTRIES = [{ c: 'ID', l: 'Indonesia' }, { c: 'CN', l: 'China' }]

function rangeFor(view: View, cursor: Date) {
  if (view === 'month') return { from: startOfWeek(startOfMonth(cursor), WEEK), to: endOfWeek(endOfMonth(cursor), WEEK) }
  if (view === 'week') return { from: startOfWeek(cursor, WEEK), to: endOfWeek(cursor, WEEK) }
  if (view === 'day') return { from: cursor, to: cursor }
  return { from: startOfYear(cursor), to: endOfYear(cursor) }
}

export default function SmartCalendar({ defaultView = 'month', className = '', onSelectDate }: { defaultView?: View; className?: string; onSelectDate?: (d: string) => void }) {
  const [view, setView] = useState<View>(defaultView)
  const [cursor, setCursor] = useState(new Date())
  const [selected, setSelected] = useState<string>(ymd(new Date()))
  const [events, setEvents] = useState<any[]>([])
  const [todos, setTodos] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [businesses, setBusinesses] = useState<any[]>([])
  const [filters, setFilters] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>(['ID', 'CN'])
  const [eventForm, setEventForm] = useState<{ initial?: any; date?: string } | null>(null)
  const [taskForm, setTaskForm] = useState<{ initial?: any; date?: string } | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [projData, setProjData] = useState<{ ms: any[]; pr: any[] }>({ ms: [], pr: [] })
  const [bills, setBills] = useState<{ fx: any[]; ln: any[] }>({ fx: [], ln: [] })
  const [cycles, setCycles] = useState<any[]>([])
  const [showCycle, setShowCycle] = useState(false)
  const [hideCycle, setHideCycle] = useState(false)

  const { from, to } = useMemo(() => rangeFor(view, cursor), [view, cursor])
  const fromS = ymd(from), toS = ymd(to)

  useEffect(() => { try { const c = localStorage.getItem('cal-countries'); if (c) setCountries(JSON.parse(c)) } catch {} }, [])
  const toggleCountry = (c: string) => setCountries(prev => { const n = prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]; try { localStorage.setItem('cal-countries', JSON.stringify(n)) } catch {}; return n })

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [ev, td, biz] = await Promise.all([
      supabase.from('events').select('*').eq('user_id', user.id).lte('date', toS),
      supabase.from('todos').select('*').eq('user_id', user.id)
        .or(`and(scheduled_date.gte.${fromS},scheduled_date.lte.${toS}),and(deadline.gte.${fromS},deadline.lte.${toS})`),
      supabase.from('businesses').select('id,name,emoji').eq('user_id', user.id),
    ])
    setEvents(ev.data || []); setTodos(td.data || []); setBusinesses(biz.data || [])
    const [pm, pp] = await Promise.all([
      supabase.from('project_milestones').select('*').eq('user_id', user.id).gte('due_date', fromS).lte('due_date', toS),
      supabase.from('projects').select('id,name,emoji,color,status,target_date').eq('user_id', user.id),
    ])
    setProjData({ ms: pm.error ? [] : pm.data || [], pr: pp.error ? [] : pp.data || [] })
    const [fx, ln] = await Promise.all([
      supabase.from('financial_fixed_expenses').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('financial_loans').select('id,name,next_due_date').eq('user_id', user.id),
    ])
    setBills({ fx: fx.error ? [] : fx.data || [], ln: ln.error ? [] : ln.data || [] })
    const cy = await supabase.from('cycle_logs').select('*').eq('user_id', user.id)
    setCycles(cy.error ? [] : cy.data || [])
    try { setHideCycle(localStorage.getItem('cycle-hide') === '1') } catch {}
  }, [fromS, toS])

  useEffect(() => { load() }, [load])
  useEffect(() => onChange(load), [load])
  useEffect(() => {
    const years = Array.from(new Set([from.getFullYear(), to.getFullYear()]))
    Promise.all(years.map(y => fetchHolidays(y, countries))).then(r => setHolidays(r.flat()))
  }, [from.getFullYear(), to.getFullYear(), countries.join(',')])  // eslint-disable-line

  const allItems = useMemo(() => [
    ...events.flatMap(e => expandEvent(e, fromS, toS)),
    ...taskItems(todos, fromS, toS),
    ...holidayItems(holidays, fromS, toS),
    ...milestoneItems(projData.ms, projData.pr, fromS, toS),
    ...billItems(bills.fx, bills.ln, fromS, toS),
  ], [events, todos, holidays, projData, bills, fromS, toS])

  // filter chips are built from what actually exists in view
  const chips = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string }>()
    allItems.forEach(i => {
      map.set(`kind:${i.kind}`, { key: `kind:${i.kind}`, label: `${KIND_ICON[i.kind]} ${KIND_LABEL[i.kind]}`, color: KIND_COLOR[i.kind] })
      if (i.kind === 'event') map.set(`cat:${i.category}`, { key: `cat:${i.category}`, label: i.category, color: i.color })
      if (i.businessId) { const b = businesses.find(x => String(x.id) === String(i.businessId)); map.set(`biz:${i.businessId}`, { key: `biz:${i.businessId}`, label: `${b?.emoji || '💼'} ${b?.name || i.businessId}`, color: '#F97316' }) }
      if (i.kind !== 'event' && i.kind !== 'holiday') map.set(`proj:${i.category}`, { key: `proj:${i.category}`, label: `📁 ${i.category}`, color: '#8B5CF6' })
    })
    return Array.from(map.values())
  }, [allItems, businesses])

  const items = useMemo(() => {
    if (!filters.length) return allItems
    return allItems.filter(i => {
      const keys = [`kind:${i.kind}`, `cat:${i.category}`, `proj:${i.category}`, i.businessId ? `biz:${i.businessId}` : '']
      return keys.some(k => k && filters.includes(k))
    })
  }, [allItems, filters])

  const cycleMap = useMemo(() => hideCycle || !cycles.length ? {} : cycleDayMap(cycles, analyze(cycles)), [cycles, hideCycle])
  const Flower = ({ ds }: { ds: string }) => cycleMap[ds] ? <span aria-hidden className={`absolute top-0.5 right-1 text-[10px] leading-none ${cycleMap[ds] === 'predicted' ? 'opacity-40' : ''}`}>🌸</span> : null

  const byDate = useMemo(() => {
    const m: Record<string, CalItem[]> = {}
    items.forEach(i => { (m[i.date] ||= []).push(i) })
    Object.keys(m).forEach(k => m[k] = sortItems(m[k]))
    return m
  }, [items])

  const go = (dir: number) => setCursor(c => view === 'month' ? addMonths(c, dir) : view === 'week' ? addWeeks(c, dir) : view === 'day' ? addDays(c, dir) : addYears(c, dir))
  const title = view === 'month' ? format(cursor, 'MMMM yyyy') : view === 'year' ? format(cursor, 'yyyy') : view === 'week' ? `${format(from, 'MMM d')} – ${format(to, 'MMM d, yyyy')}` : format(cursor, 'EEEE, MMM d, yyyy')
  const pick = (d: string) => { setSelected(d); onSelectDate?.(d) }

  const clickItem = (i: CalItem) => {
    if (i.kind === 'event') setEventForm({ initial: i.raw })
    else if (i.kind === 'milestone') window.location.href = i.raw?.href || `/projects/${i.raw?.project_id || i.raw?.id}`
    else if (i.kind !== 'holiday') setTaskForm({ initial: i.raw })
  }

  const Chip = ({ i, compact }: { i: CalItem; compact?: boolean }) => (
    <div onClick={e => { e.stopPropagation(); clickItem(i) }} title={`${i.title}${i.startTime ? ' · ' + i.startTime : ''}`}
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md mb-0.5 truncate cursor-pointer text-white ${i.done ? 'opacity-50 line-through' : ''}`}
      style={{ background: i.color }}>
      {i.done ? '✓' : KIND_ICON[i.kind]} {!compact && i.startTime ? i.startTime + ' ' : ''}{i.title}
    </div>
  )

  const DayCell = ({ d }: { d: Date }) => {
    const ds = ymd(d); const list = byDate[ds] || []
    const hol = list.find(i => i.kind === 'holiday')
    const rest = list.filter(i => i.kind !== 'holiday')
    return (
      <div onClick={() => pick(ds)} onDoubleClick={() => { setCursor(d); setView('day') }}
        className={`relative min-h-[78px] p-1 rounded-xl cursor-pointer border transition-all hover:bg-gray-50 ${isToday(d) ? 'border-blue-400 bg-blue-50/60' : selected === ds ? 'border-blue-300 bg-blue-50/30' : 'border-transparent'}`}>
        <Flower ds={ds} />
        <div className={`text-[11px] font-bold mb-0.5 text-center ${hol ? 'text-red-500' : isToday(d) ? 'text-blue-500' : isSameMonth(d, cursor) ? 'text-gray-700' : 'text-gray-300'}`}>{format(d, 'd')}</div>
        {list.filter(i => i.kind === 'holiday').map(h => <div key={h.key} className="text-[9px] font-semibold truncate leading-tight mb-0.5 px-1 rounded" style={{ color: h.color, background: h.color + '15' }} title={h.title}>{h.title}</div>)}
        {rest.slice(0, 3).map(i => <Chip key={i.key} i={i} compact />)}
        {rest.length > 3 && <div className="text-[9px] text-gray-400 text-center">+{rest.length - 3} more</div>}
      </div>
    )
  }

  const selItems = byDate[selected] || []

  return (
    <div className={`card ${className}`}>
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button aria-label="Previous" onClick={() => go(-1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 text-sm">‹</button>
            <span className="font-bold text-sm min-w-[130px] text-center">{title}</span>
            <button aria-label="Next" onClick={() => go(1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 text-sm">›</button>
            <button onClick={() => { setCursor(new Date()); pick(ymd(new Date())) }} className="btn-gray btn-sm">Today</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {(['day', 'week', 'month', 'year'] as View[]).map(v => (
                <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize ${view === v ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>{v}</button>
              ))}
            </div>
            <button onClick={() => setEventForm({ date: selected })} className="btn-blue btn-sm">+ Event</button>
            <button onClick={() => setTaskForm({ date: selected })} className="btn-gray btn-sm">+ Task</button>
            <button onClick={() => setShowCycle(true)} aria-label="Private tracker" title="Private" className="btn-gray btn-sm">🌸</button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <button onClick={() => setShowFilters(s => !s)} className="text-[11px] font-semibold text-gray-500 hover:text-gray-800">🔎 Filter {filters.length ? `(${filters.length})` : ''} {showFilters ? '▴' : '▾'}</button>
          {filters.length > 0 && <button onClick={() => setFilters([])} className="text-[11px] text-blue-500 font-semibold">Show everything</button>}
          <span className="flex-1" />
          {COUNTRIES.map(c => <button key={c.c} onClick={() => toggleCountry(c.c)} title={`Public holidays: ${c.l}`}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${countries.includes(c.c) ? 'bg-white' : 'bg-white text-gray-300 border-gray-200 opacity-60'}`} style={countries.includes(c.c) ? { color: COUNTRY_STYLE[c.c].color, borderColor: COUNTRY_STYLE[c.c].color } : {}}>{COUNTRY_STYLE[c.c].flag} {c.l}</button>)}
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {chips.length === 0 && <span className="text-[11px] text-gray-400">Nothing in this range to filter yet.</span>}
            {chips.map(c => {
              const on = filters.includes(c.key)
              return <button key={c.key} onClick={() => setFilters(p => on ? p.filter(x => x !== c.key) : [...p, c.key])}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${on ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                style={on ? { background: c.color } : {}}>{c.label}</button>
            })}
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4">
        {view === 'month' && (
          <>
            <div className="grid grid-cols-7 mb-1">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="text-[10px] font-bold text-gray-400 text-center py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-0.5">{eachDayOfInterval({ start: from, end: to }).map(d => <DayCell key={ymd(d)} d={d} />)}</div>
          </>
        )}

        {view === 'week' && (
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {eachDayOfInterval({ start: from, end: to }).map(d => {
              const ds = ymd(d); const list = byDate[ds] || []
              return (
                <div key={ds} onClick={() => pick(ds)} className={`rounded-xl border p-2 min-h-[140px] cursor-pointer ${isToday(d) ? 'border-blue-400 bg-blue-50/50' : selected === ds ? 'border-blue-300' : 'border-gray-100'}`}>
                  <div className="text-[11px] font-bold text-gray-500 mb-1.5 flex justify-between">{format(d, 'EEE d')}{cycleMap[ds] && <span aria-hidden className={cycleMap[ds] === 'predicted' ? 'opacity-40' : ''}>🌸</span>}</div>
                  {list.length === 0 && <div className="text-[10px] text-gray-300">—</div>}
                  {list.map(i => <Chip key={i.key} i={i} />)}
                </div>
              )
            })}
          </div>
        )}

        {view === 'day' && (
          <div>
            {(byDate[ymd(cursor)] || []).length === 0 && <div className="text-center text-gray-400 text-xs py-10">Nothing planned for this day.</div>}
            {(byDate[ymd(cursor)] || []).map(i => <DayRow key={i.key} i={i} onOpen={() => clickItem(i)} />)}
          </div>
        )}

        {view === 'year' && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }, (_, m) => new Date(cursor.getFullYear(), m, 1)).map(ms => (
              <div key={ms.getMonth()} className="rounded-xl border border-gray-100 p-2.5">
                <button onClick={() => { setCursor(ms); setView('month') }} className="text-xs font-bold mb-1.5 hover:text-blue-500">{format(ms, 'MMMM')}</button>
                <div className="grid grid-cols-7 gap-[2px]">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <div key={i} className="text-[8px] text-gray-300 text-center">{x}</div>)}
                  {eachDayOfInterval({ start: startOfWeek(startOfMonth(ms), WEEK), end: endOfWeek(endOfMonth(ms), WEEK) }).map(d => {
                    const ds = ymd(d); const list = (byDate[ds] || []); const inM = isSameMonth(d, ms)
                    const hasHol = list.some(i => i.kind === 'holiday'); const n = list.filter(i => i.kind !== 'holiday').length
                    return <button key={ds} onClick={() => { setCursor(d); pick(ds); setView('day') }} title={list.map(i => i.title).join(', ')}
                      className={`aspect-square rounded text-[9px] ${!inM ? 'opacity-0 pointer-events-none' : ''} ${isToday(d) ? 'ring-1 ring-blue-400' : ''} ${n >= 3 ? 'bg-blue-500 text-white' : n === 2 ? 'bg-blue-300 text-white' : n === 1 ? 'bg-blue-100 text-blue-700' : hasHol ? 'bg-pink-100 text-pink-600' : 'text-gray-500 hover:bg-gray-100'}`}>{format(d, 'd')}</button>
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(view === 'month' || view === 'week') && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-gray-600">{format(parseISO(selected), 'EEEE, MMM d')}</div>
            <div className="flex gap-2">
              <button className="text-[11px] font-semibold text-blue-600" onClick={() => setEventForm({ date: selected })}>+ Event</button>
              <button className="text-[11px] font-semibold text-purple-600" onClick={() => setTaskForm({ date: selected })}>+ Task</button>
            </div>
          </div>
          {selItems.length === 0 ? <div className="text-[11px] text-gray-400">Nothing planned. Double-click a day for the day view.</div>
            : selItems.map(i => <DayRow key={i.key} i={i} onOpen={() => clickItem(i)} />)}
        </div>
      )}

      {showCycle && <CycleModal onClose={() => { setShowCycle(false); load() }} />}
      {eventForm && <EventForm initial={eventForm.initial} defaultDate={eventForm.date} onClose={() => setEventForm(null)} onSaved={load} />}
      {taskForm && <TaskForm initial={taskForm.initial} defaults={taskForm.date ? { scheduled_date: taskForm.date } : undefined} onClose={() => setTaskForm(null)} onSaved={load} />}
    </div>
  )
}

function DayRow({ i, onOpen }: { i: CalItem; onOpen: () => void }) {
  const canCheck = i.kind === 'task' || i.kind === 'errand' || i.kind === 'deadline'
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-gray-100 last:border-0">
      {canCheck
        ? <button onClick={() => toggleTask(i.raw)} aria-label="Toggle done" className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[9px] flex-shrink-0 ${i.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>{i.done && '✓'}</button>
        : <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: i.color }} />}
      <div className="w-[88px] text-[10px] text-gray-400 flex-shrink-0">{i.allDay ? 'All day' : `${i.startTime}${i.endTime ? '–' + i.endTime : ''}`}</div>
      <button onClick={onOpen} disabled={i.kind === 'holiday'} className={`flex-1 text-left text-[13px] truncate ${i.done ? 'line-through text-gray-400' : ''}`}>{i.title}</button>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: i.color }}>{KIND_LABEL[i.kind].replace(/s$/, '')}</span>
      {i.recurring && <span title="Repeats" className="text-[11px]">🔄</span>}
      {i.reminder != null && <span title="Has an alert" className="text-[11px]">🔔</span>}
    </div>
  )
}
