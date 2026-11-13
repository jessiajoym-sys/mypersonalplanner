'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDistanceStrict } from 'date-fns'
import { addDays, addMonths, addWeeks, addYears, eachDayOfInterval, endOfMonth, endOfWeek, endOfYear, format, parseISO, startOfMonth, startOfWeek, startOfYear } from 'date-fns'
import { LOG_LABELS, addLog, onChange, toggleTask, todayStr, ymd } from '@/lib/planner'
import Modal, { CardHeader, Field } from '@/components/planner/Modal'

type Period = 'day' | 'week' | 'month' | 'year'
const LABEL_COLORS: Record<string, string> = { General: '#9090A8', Personal: '#FF6B8A', Business: '#F97316', Finance: '#14B8A6', Project: '#8B5CF6', Study: '#5B7FFF', Content: '#22C55E', Health: '#EF4444', Travel: '#0EA5E9', Other: '#A3A3A3', School: '#5B7FFF' }
const colorOf = (l?: string) => LABEL_COLORS[l || 'General'] || '#8B5CF6'
const KIND: Record<string, { label: string; icon: string; cls: string }> = {
  task_received: { label: 'Received', icon: '📥', cls: 'bg-blue-50 text-blue-600' },
  accomplishment: { label: 'Accomplished', icon: '🏆', cls: 'bg-green-50 text-green-600' },
  work_log: { label: 'Note', icon: '📋', cls: 'bg-orange-50 text-orange-600' },
}
const WEEK = { weekStartsOn: 1 as const }

export default function DailyLogPage() {
  const [period, setPeriod] = useState<Period>('day')
  const [cursor, setCursor] = useState(new Date())
  const [logs, setLogs] = useState<any[]>([])
  const [todos, setTodos] = useState<Record<string, any>>({})
  const [habitInfo, setHabitInfo] = useState<{ done: any[]; total: number }>({ done: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [bizNames, setBizNames] = useState<Record<string, string>>({})
  const [labelFilter, setLabelFilter] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [adding, setAdding] = useState<null | 'work_log' | 'accomplishment'>(null)
  const [form, setForm] = useState({ content: '', label: 'General', date: todayStr() })

  const range = useMemo(() => {
    if (period === 'day') return { from: cursor, to: cursor }
    if (period === 'week') return { from: startOfWeek(cursor, WEEK), to: endOfWeek(cursor, WEEK) }
    if (period === 'month') return { from: startOfMonth(cursor), to: endOfMonth(cursor) }
    return { from: startOfYear(cursor), to: endOfYear(cursor) }
  }, [period, cursor])
  const fromS = ymd(range.from), toS = ymd(range.to)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('daily_logs').select('*').eq('user_id', user.id)
      .gte('date', fromS).lte('date', toS).in('type', ['task_received', 'accomplishment', 'work_log']).order('created_at', { ascending: false }).limit(5000)
    const rows = data || []
    setLogs(rows)
    const ids = Array.from(new Set(rows.map((r: any) => r.todo_id).filter(Boolean)))
    if (ids.length) { const { data: t } = await supabase.from('todos').select('*').in('id', ids.slice(0, 300)); setTodos(Object.fromEntries((t || []).map((x: any) => [x.id, x]))) } else setTodos({})
    const { data: biz } = await supabase.from('businesses').select('id,name,emoji').eq('user_id', user.id)
    setBizNames(Object.fromEntries((biz || []).map((b: any) => [String(b.id), `${b.emoji || ''} ${b.name}`.trim()])))
    if (period === 'day') {
      const [h, hl] = await Promise.all([
        supabase.from('habits').select('id,name,icon').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('habit_id').eq('user_id', user.id).eq('date', fromS).eq('completed', true),
      ])
      const doneIds = new Set((hl.data || []).map((x: any) => x.habit_id))
      setHabitInfo({ done: (h.data || []).filter((x: any) => doneIds.has(x.id)), total: (h.data || []).length })
    }
    setLoading(false)
  }, [fromS, toS, period])
  useEffect(() => { setLoading(true); load() }, [load])
  useEffect(() => onChange(load), [load])

  // global search across all dates
  useEffect(() => {
    if (!query.trim()) { setResults(null); return }
    const t = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) return
      const { data } = await supabase.from('daily_logs').select('*').eq('user_id', user.id).ilike('content', `%${query.trim()}%`).order('date', { ascending: false }).limit(200)
      setResults(data || [])
      const ids = Array.from(new Set((data || []).map((r: any) => r.todo_id).filter(Boolean))) as string[]
      if (ids.length) { const { data: t } = await supabase.from('todos').select('*').in('id', ids.slice(0, 200)); setTodos(prev => ({ ...prev, ...Object.fromEntries((t || []).map((x: any) => [x.id, x])) })) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const step = (dir: number) => setCursor(c => period === 'day' ? addDays(c, dir) : period === 'week' ? addWeeks(c, dir) : period === 'month' ? addMonths(c, dir) : addYears(c, dir))
  const title = period === 'day' ? format(cursor, 'EEEE, MMM d, yyyy') : period === 'week' ? `${format(range.from, 'MMM d')} – ${format(range.to, 'MMM d, yyyy')}` : period === 'month' ? format(cursor, 'MMMM yyyy') : format(cursor, 'yyyy')

  const visible = logs.filter(l => !labelFilter || (l.label || l.category) === labelFilter)
  const received = visible.filter(l => l.type === 'task_received')
  const accomplished = visible.filter(l => l.type === 'accomplishment')
  const byDate = (rows: any[]) => { const m: Record<string, any[]> = {}; rows.forEach(r => (m[r.date] ||= []).push(r)); return m }
  const usedLabels = Array.from(new Set(logs.map(l => l.label || l.category).filter(Boolean)))

  async function saveEntry() {
    if (!form.content.trim() || !adding) return
    await addLog({ type: adding, date: form.date, category: form.label, label: form.label, content: form.content.trim() })
    setForm({ content: '', label: 'General', date: todayStr() }); setAdding(null)
  }
  async function del(id: string) { if (!confirm('Delete this log entry?')) return; await supabase.from('daily_logs').delete().eq('id', id); load() }

  const stamp = (iso: string) => format(new Date(iso), 'MMM d, HH:mm')
  const detail = (l: any) => {
    const t = l.todo_id ? todos[l.todo_id] : null
    if (l.type === 'work_log' && !l.todo_id) return { source: 'Written by you', chips: [] as string[], line: '' }
    if (!t) return { source: l.todo_id ? 'From a task that no longer exists' : 'Added by you', chips: [], line: '' }
    const chips = [t.task_type === 'errand' ? '🛒 Errand' : '✅ Task', `📁 ${t.category}`, ...(t.tags || []).map((x: string) => `＋${x}`), ...(t.business_id && bizNames[String(t.business_id)] ? [bizNames[String(t.business_id)]] : []), ...(t.priority === 'high' ? ['🔴 High priority'] : []), ...(t.repeat_type && t.repeat_type !== 'never' ? ['🔄 ' + t.repeat_type] : [])]
    const rec = t.created_at ? `Received ${stamp(t.created_at)}` : ''
    const done = t.status === 'done' && t.completed_at ? `Completed ${stamp(t.completed_at)} (took ${formatDistanceStrict(new Date(t.created_at), new Date(t.completed_at))})` : `Not done yet${t.deadline ? ' · due ' + t.deadline : ''}`
    return { source: `From ${t.task_type === 'errand' ? 'errand' : 'task'}: “${t.title}”`, chips, line: [rec, done].filter(Boolean).join('  →  ') }
  }
  const isDoneTodo = (l: any) => l.todo_id && todos[l.todo_id]?.status === 'done'

  const Entry = ({ l, showKind, showDate }: { l: any; showKind?: boolean; showDate?: boolean }) => (
    <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-gray-50 last:border-0 group hover:bg-gray-50">
      {l.type === 'task_received' && l.todo_id && todos[l.todo_id]
        ? <button aria-label="Toggle done" onClick={() => toggleTask(todos[l.todo_id])} className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-[9px] ${isDoneTodo(l) ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>{isDoneTodo(l) && '✓'}</button>
        : <span className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorOf(l.label || l.category) }} />}
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] ${l.type === 'task_received' && isDoneTodo(l) ? 'line-through text-gray-400' : ''}`}>{l.content}</div>
        {(() => { const d = detail(l); return (
          <div className="mt-1 text-[10px] text-gray-500 space-y-0.5">
            <div className="text-gray-400">{d.source}</div>
            {d.chips.length > 0 && <div className="flex flex-wrap gap-1">{d.chips.map((c, i) => <span key={i} className="bg-gray-100 text-gray-600 font-semibold px-1.5 py-0.5 rounded-full">{c}</span>)}</div>}
            {d.line && <div className="font-semibold text-gray-600">{d.line}</div>}
          </div>) })()}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px] text-gray-400">
          {showDate && <span className="font-semibold text-gray-500">{format(parseISO(l.date), 'EEE, MMM d yyyy')}</span>}
          {l.time_logged && <span>{l.time_logged}</span>}
          <span className="font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: colorOf(l.label || l.category) }}>{l.label || l.category || 'General'}</span>
          {showKind && KIND[l.type] && <span className={`font-bold px-1.5 py-0.5 rounded-full ${KIND[l.type].cls}`}>{KIND[l.type].icon} {KIND[l.type].label}</span>}
        </div>
      </div>
      <button onClick={() => del(l.id)} aria-label="Delete entry" className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs">✕</button>
    </div>
  )

  const Section = ({ icon, title, hint, tone, rows, empty, action, showKind }: any) => (
    <div className="card mb-4">
      <CardHeader icon={icon} title={title} hint={hint} tone={tone} right={<span className="tag bg-white/70">{rows.length}</span>} />
      {rows.length === 0 ? <div className="p-5 text-center text-gray-400 text-xs">{empty}</div> : rows.map((l: any) => <Entry key={l.id} l={l} showKind={showKind} />)}
      {action && <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-center">{action}</div>}
    </div>
  )

  const periodWord = period === 'day' ? 'Today' : period === 'week' ? 'This Week' : period === 'month' ? 'This Month' : 'This Year'

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Daily Log 📝</h1>
        <p className="text-xs text-gray-400 mt-0.5">Your automatic diary of work. New tasks land in “Received”, finished tasks land in “Accomplishments”, and everything also appears in the Work Log so you can search it years from now.</p>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex gap-0.5 bg-white border border-gray-100 rounded-xl p-1">
          {(['day', 'week', 'month', 'year'] as Period[]).map(p => <button key={p} onClick={() => setPeriod(p)} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize ${period === p ? 'bg-teal-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>{p}</button>)}
        </div>
        <button className="btn-gray btn-sm" onClick={() => step(-1)}>‹</button>
        <span className="text-sm font-bold min-w-[150px] text-center">{title}</span>
        <button className="btn-gray btn-sm" onClick={() => step(1)}>›</button>
        <button className="btn-blue btn-sm" onClick={() => setCursor(new Date())}>Today</button>
        <span className="flex-1" />
        <input className="inp w-52 text-xs" placeholder="🔍 Search all history…" value={query} onChange={e => setQuery(e.target.value)} />
        <select className="sel text-xs" value={labelFilter} onChange={e => setLabelFilter(e.target.value)}>
          <option value="">All labels</option>{Array.from(new Set([...LOG_LABELS, ...usedLabels])).map(l => <option key={l}>{l}</option>)}
        </select>
      </div>

      {results ? (
        <div className="card">
          <CardHeader icon="🔍" title={`Search results for “${query}”`} hint="Across every day you have logged." tone="gray" right={<span className="tag bg-white/70">{results.length}</span>} />
          {results.length === 0 ? <div className="p-6 text-center text-xs text-gray-400">No matches.</div> : results.map(l => <Entry key={l.id} l={l} showKind showDate />)}
        </div>
      ) : loading ? <div className="text-center py-10 text-gray-400">Loading…</div> : (
        <>
          {period === 'day' && <>
            <Section icon="📥" title="Tasks Received Today" tone="blue" hint="Every task or errand you created today, from any page." rows={received} empty="No new tasks today." />
            <Section icon="🏆" title="Accomplishments Today" tone="green" hint="Tasks you finished, plus wins you add yourself." rows={accomplished} empty="Tick a task as done and it appears here."
              action={<button onClick={() => { setAdding('accomplishment'); setForm(f => ({ ...f, date: ymd(cursor) })) }} className="text-xs text-green-600 font-semibold">+ Add accomplishment</button>} />
            <Section icon="📋" title="Daily Work Log" tone="amber" hint="Everything from today in one timeline, plus your own notes. Use labels so you can find it later." rows={visible} showKind empty="Nothing logged yet."
              action={<button onClick={() => { setAdding('work_log'); setForm(f => ({ ...f, date: ymd(cursor) })) }} className="text-xs text-orange-600 font-semibold">+ Add work log entry</button>} />
            <div className="card"><CardHeader icon="💧" title="Habits done today" tone="green" hint="From Daily Habits." right={<span className="tag bg-white/70">{habitInfo.done.length}/{habitInfo.total}</span>} />
              <div className="p-3 flex flex-wrap gap-2">{habitInfo.done.length === 0 ? <span className="text-xs text-gray-400">No habits ticked yet.</span> : habitInfo.done.map(h => <span key={h.id} className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full">{h.icon} {h.name}</span>)}</div></div>
          </>}

          {period === 'week' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-2 mb-4">
                {eachDayOfInterval({ start: range.from, end: range.to }).map(d => {
                  const ds = ymd(d); const r = byDate(received)[ds] || []; const a = byDate(accomplished)[ds] || []
                  return (
                    <div key={ds} className={`bg-white rounded-xl border p-2.5 min-h-[130px] ${ds === todayStr() ? 'border-blue-400' : 'border-gray-100'}`}>
                      <button onClick={() => { setCursor(d); setPeriod('day') }} className="text-[11px] font-bold text-gray-600 hover:text-blue-500 mb-1.5">{format(d, 'EEE, MMM d')}</button>
                      {r.map(l => <div key={l.id} className="text-[10px] mb-1 px-1.5 py-0.5 rounded border-l-2 bg-blue-50/50 truncate" style={{ borderColor: colorOf(l.label || l.category) }} title={l.content}>📥 {l.content}</div>)}
                      {a.map(l => <div key={l.id} className="text-[10px] mb-1 px-1.5 py-0.5 rounded border-l-2 bg-green-50/60 truncate" style={{ borderColor: colorOf(l.label || l.category) }} title={l.content}>🏆 {l.content}</div>)}
                      {r.length + a.length === 0 && <div className="text-[10px] text-gray-300">—</div>}
                    </div>)
                })}
              </div>
              <Section icon="📥" title="Tasks Received This Week" tone="blue" hint="By day, so you can see what landed on which date." rows={received} empty="None this week." />
              <Section icon="🏆" title="Accomplishments This Week" tone="green" hint="Everything you finished." rows={accomplished} empty="None yet." />
              <Section icon="📋" title="Daily Work Log" tone="amber" hint="Full timeline for the week." rows={visible} showKind empty="Nothing logged." action={<button onClick={() => { setAdding('work_log'); setForm(f => ({ ...f, date: todayStr() })) }} className="text-xs text-orange-600 font-semibold">+ Add work log entry</button>} />
            </>
          )}

          {period === 'month' && (
            <>
              <div className="card mb-4 p-3">
                <div className="grid grid-cols-7 mb-1">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="text-[10px] font-bold text-gray-400 text-center py-1">{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-0.5">
                  {eachDayOfInterval({ start: startOfWeek(range.from, WEEK), end: endOfWeek(range.to, WEEK) }).map(d => {
                    const ds = ymd(d); const inM = d >= range.from && d <= range.to
                    const r = byDate(received)[ds] || []; const a = byDate(accomplished)[ds] || []
                    return (
                      <button key={ds} onClick={() => { setCursor(d); setPeriod('day') }} className={`min-h-[84px] text-left p-1 rounded-xl border hover:bg-gray-50 ${!inM ? 'opacity-30' : ''} ${ds === todayStr() ? 'border-blue-400 bg-blue-50/50' : 'border-transparent'}`}>
                        <div className="text-[11px] font-bold text-gray-600 text-center mb-0.5">{format(d, 'd')}</div>
                        {[...r.slice(0, 1).map(l => ({ l, i: '📥' })), ...a.slice(0, 1).map(l => ({ l, i: '🏆' }))].map(({ l, i }) => <div key={l.id} className="text-[9px] truncate px-1 rounded mb-0.5 text-white" style={{ background: colorOf(l.label || l.category) }}>{i} {l.content}</div>)}
                        {r.length + a.length > 2 && <div className="text-[9px] text-gray-400 text-center">+{r.length + a.length - 2}</div>}
                      </button>)
                  })}
                </div>
              </div>
              <Section icon="📥" title="Tasks Received This Month" tone="blue" hint="Tasks that came in this month." rows={received} empty="None." />
              <Section icon="🏆" title="Accomplishments This Month" tone="green" hint="What you got done." rows={accomplished} empty="None yet." />
              <Section icon="📋" title="Daily Work Log" tone="amber" hint="Full timeline for the month." rows={visible} showKind empty="Nothing logged." />
            </>
          )}

          {period === 'year' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 12 }, (_, m) => new Date(cursor.getFullYear(), m, 1)).map(ms => {
                const key = format(ms, 'yyyy-MM'); const inM = (rows: any[]) => rows.filter(r => r.date.startsWith(key))
                const r = inM(received), a = inM(accomplished); const labels: Record<string, number> = {}
                ;[...r, ...a].forEach(x => { const k = x.label || x.category || 'General'; labels[k] = (labels[k] || 0) + 1 })
                return (
                  <button key={key} onClick={() => { setCursor(ms); setPeriod('month') }} className="card text-left p-4 hover:shadow-md transition-all">
                    <div className="text-sm font-bold mb-2">{format(ms, 'MMMM')}</div>
                    <div className="flex gap-3 text-xs mb-2"><span className="text-blue-600 font-semibold">📥 {r.length} received</span><span className="text-green-600 font-semibold">🏆 {a.length} done</span></div>
                    <div className="flex flex-wrap gap-1">{Object.entries(labels).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, n]) => <span key={k} className="text-[10px] text-white font-bold px-1.5 py-0.5 rounded-full" style={{ background: colorOf(k) }}>{k} {n}</span>)}</div>
                    {a.slice(0, 2).map(x => <div key={x.id} className="text-[11px] text-gray-500 truncate mt-1">🏆 {x.content}</div>)}
                  </button>)
              })}
            </div>
          )}
        </>
      )}

      {adding && (
        <Modal title={adding === 'work_log' ? 'Add work log entry' : 'Add accomplishment'} onClose={() => setAdding(null)} subtitle="Pick a label so it is easy to find later.">
          <textarea className="inp resize-none mb-3" rows={3} autoFocus placeholder={adding === 'work_log' ? 'What did you work on?' : 'What did you accomplish?'} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Date"><input type="date" className="sel w-full" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Label / area"><select className="sel w-full" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}>{LOG_LABELS.map(l => <option key={l}>{l}</option>)}</select></Field>
          </div>
          <div className="flex gap-2"><button className="btn-blue flex-1" onClick={saveEntry}>Save</button><button className="btn-gray" onClick={() => setAdding(null)}>Cancel</button></div>
        </Modal>
      )}
    </div>
  )
}
