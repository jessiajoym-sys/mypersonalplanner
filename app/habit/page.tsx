'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { addLog, emitChange, onChange, todayStr, ymd } from '@/lib/planner'
import { KIND_META, Kind, RANGE_LABEL, RangeKey, SLOT_PRESETS, WEEKDAYS, bucketize, computeStats, kindOf, pace, rangeDays, scheduledOn, slotsOf } from '@/lib/habits'
import { BarsLabeled, Donut, LineChart, ProgressBar } from '@/components/planner/Charts'
import Modal, { CardHeader, Field } from '@/components/planner/Modal'

const ICONS = ['✅', '💧', '📖', '🏃', '📱', '📿', '🥗', '📔', '💊', '🧘', '💪', '😴', '🎯', '✏️', '🚴', '🌿', '🍊', '🧴']
const blankHabit = { name: '', icon: '✅', kind: 'habit' as Kind, days: [1, 2, 3, 4, 5, 6, 7], slots: [] as { label: string; time: string }[], dose: '', notes: '' }

export default function HabitPage() {
  const [habits, setHabits] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [intake, setIntake] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<RangeKey>('30d')
  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all')
  const [habitForm, setHabitForm] = useState<null | { id?: string; v: typeof blankHabit }>(null)
  const [goalForm, setGoalForm] = useState<null | { id?: string; v: any }>(null)
  const [err, setErr] = useState('')
  const today = todayStr()
  const days = useMemo(() => rangeDays(range), [range])
  const last7 = useMemo(() => rangeDays('7d'), [])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const from = ymd(subDays(new Date(), 400))
    const [h, l, it, g] = await Promise.all([
      supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at'),
      supabase.from('habit_logs').select('*').eq('user_id', user.id).gte('date', from).limit(10000),
      supabase.from('intake_logs').select('*').eq('user_id', user.id).eq('date', today),
      supabase.from('progress_goals').select('*').eq('user_id', user.id).eq('archived', false).order('created_at'),
    ])
    if (h.error) setErr(h.error.message)
    setHabits(h.data || []); setLogs(l.data || []); setIntake(it.error ? [] : it.data || []); setGoals(g.error ? [] : g.data || [])
    if (it.error || g.error) setErr('Run lib/planner-upgrade-4.sql in Supabase to enable medicine/vitamins and progress goals.')
    setLoading(false)
  }, [today])
  useEffect(() => { load() }, [load])
  useEffect(() => onChange(load), [load])

  const isDone = (id: string, date: string) => logs.some(l => l.habit_id === id && l.date === date && l.completed)
  const filtered = habits.filter(h => kindFilter === 'all' || kindOf(h) === kindFilter)
  const stats = useMemo(() => computeStats(filtered, logs, days), [filtered, logs, days])

  async function setHabitDay(h: any, date: string, done: boolean) {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    await supabase.from('habit_logs').delete().eq('habit_id', h.id).eq('date', date).eq('user_id', user.id)
    if (done) await supabase.from('habit_logs').insert({ habit_id: h.id, date, completed: true, user_id: user.id })
    emitChange()
  }
  async function toggleSimple(h: any, date: string) { await setHabitDay(h, date, !isDone(h.id, date)) }

  async function toggleSlot(h: any, slot: string) {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const taken = intake.some(i => i.habit_id === h.id && i.slot === slot)
    if (taken) await supabase.from('intake_logs').delete().eq('habit_id', h.id).eq('date', today).eq('slot', slot)
    else await supabase.from('intake_logs').insert({ user_id: user.id, habit_id: h.id, date: today, slot })
    const { data } = await supabase.from('intake_logs').select('slot').eq('habit_id', h.id).eq('date', today)
    const all = (data || []).length >= slotsOf(h).length
    await setHabitDay(h, today, all)
  }

  async function saveHabit() {
    if (!habitForm || !habitForm.v.name.trim()) return
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const v = habitForm.v
    const row: any = { name: v.name.trim(), icon: v.icon, kind: v.kind, days: v.days, slots: v.kind === 'habit' ? [] : v.slots, dose: v.dose || null, notes: v.notes || null, color: KIND_META[v.kind].color }
    const { error } = habitForm.id ? await supabase.from('habits').update(row).eq('id', habitForm.id) : await supabase.from('habits').insert({ ...row, user_id: user.id, is_active: true })
    if (error) { setErr(error.message + ' — did you run lib/planner-upgrade-4.sql?'); return }
    setHabitForm(null); load(); emitChange()
  }
  async function delHabit(id: string) { if (!confirm('Remove this? Your past history stays in the statistics.')) return; await supabase.from('habits').update({ is_active: false }).eq('id', id); load(); emitChange() }

  async function saveGoal() {
    if (!goalForm) return
    const v = goalForm.v
    if (!v.title.trim() || !Number(v.target_total) || !v.end_date) { setErr('Goal needs a title, a target number and an end date.'); return }
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const row = { title: v.title.trim(), icon: v.icon, unit: v.unit || 'item', target_total: Number(v.target_total), step: Number(v.step) || 1, start_date: v.start_date, end_date: v.end_date }
    const { error } = goalForm.id ? await supabase.from('progress_goals').update(row).eq('id', goalForm.id) : await supabase.from('progress_goals').insert({ ...row, user_id: user.id, current_count: Number(v.current_count) || 0 })
    if (error) { setErr(error.message); return }
    setErr(''); setGoalForm(null); load(); emitChange()
  }
  async function addProgress(g: any, amount: number) {
    const { data: { user } } = await supabase.auth.getUser(); if (!user || !amount) return
    const next = Math.max(0, Number(g.current_count) + amount)
    await supabase.from('progress_goals').update({ current_count: next }).eq('id', g.id)
    if (amount > 0) {
      await supabase.from('progress_goal_logs').insert({ user_id: user.id, goal_id: g.id, date: today, amount })
      await addLog({ type: 'work_log', category: 'Personal', label: 'Personal', content: `${g.title}: +${amount} ${g.unit} (${next}/${g.target_total})` })
      if (next >= Number(g.target_total) && Number(g.current_count) < Number(g.target_total)) await addLog({ type: 'accomplishment', category: 'Personal', label: 'Personal', content: `Goal reached: ${g.title} (${g.target_total} ${g.unit})` })
    }
    load(); emitChange()
  }
  async function delGoal(id: string) { if (!confirm('Delete this goal?')) return; await supabase.from('progress_goals').delete().eq('id', id); load() }

  // ---- Today lists
  const todays = habits.filter(h => scheduledOn(h, today))
  const todayDone = todays.filter(h => isDone(h.id, today)).length
  const group = (k: Kind) => todays.filter(h => kindOf(h) === k)
  const chart = useMemo(() => bucketize(stats.daily), [stats])

  const HabitRow = ({ h }: { h: any }) => {
    const k = kindOf(h); const slots = slotsOf(h); const done = isDone(h.id, today)
    const takenSlots = intake.filter(i => i.habit_id === h.id).map(i => i.slot)
    return (
      <div className={`px-4 py-3 border-b border-gray-100 last:border-0 group ${done ? 'bg-green-50/40' : ''}`}>
        <div className="flex items-center gap-3">
          {(k === 'habit' || slots.length === 0)
            ? <button aria-label="Toggle" onClick={() => toggleSimple(h, today)} className={`w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold ${done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200 hover:border-green-300'}`}>{done && '✓'}</button>
            : <span className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>{done ? '✓' : `${takenSlots.length}/${slots.length}`}</span>}
          <span className="text-lg">{h.icon}</span>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium ${done ? 'line-through text-gray-400' : ''}`}>{h.name}{h.dose && <span className="text-xs text-gray-400 font-normal"> · {h.dose}</span>}</div>
            {h.notes && <div className="text-[11px] text-gray-400">{h.notes}</div>}
          </div>
          <button onClick={() => setHabitForm({ id: h.id, v: { name: h.name, icon: h.icon, kind: k, days: h.days || [1, 2, 3, 4, 5, 6, 7], slots: slots as any, dose: h.dose || '', notes: h.notes || '' } })} className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-blue-500">Edit</button>
          <button onClick={() => delHabit(h.id)} aria-label="Remove" className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs">✕</button>
        </div>
        {k !== 'habit' && slots.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 ml-9">
            {slots.map(s => { const on = takenSlots.includes(s.label); return (
              <button key={s.label} onClick={() => toggleSlot(h, s.label)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${on ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}>{on ? '✓ ' : ''}{s.label}{s.time ? ` · ${s.time}` : ''}</button>) })}
          </div>)}
      </div>
    )
  }

  const Group = ({ kind, hint }: { kind: Kind; hint: string }) => {
    const rows = group(kind)
    return (
      <div className="card mb-4">
        <CardHeader icon={KIND_META[kind].icon} title={KIND_META[kind].label} hint={hint} tone={kind === 'habit' ? 'green' : kind === 'medicine' ? 'red' : 'amber'}
          right={<button onClick={() => setHabitForm({ v: { ...blankHabit, kind, icon: kind === 'habit' ? '✅' : kind === 'medicine' ? '💊' : '🌿', slots: kind === 'habit' ? [] : [{ label: 'Morning', time: '08:00' }] } })} className="text-xs font-semibold text-blue-600">+ Add</button>} />
        {loading ? <div className="p-5 text-center text-gray-400 text-xs">Loading…</div> : rows.length === 0 ? <div className="p-5 text-center text-gray-400 text-xs">Nothing scheduled today.</div> : rows.map(h => <HabitRow key={h.id} h={h} />)}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Daily Habits 💧</h1>
          <p className="text-xs text-gray-400 mt-0.5">Tick what you did today. Habits, medicine and vitamins are kept separate, and every tick feeds the statistics below.</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-center"><div className="text-lg font-bold text-green-600">{todayDone}/{todays.length}</div><div className="text-[10px] text-green-500">Done today</div></div>
      </div>
      {err && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{err}</div>}

      <Group kind="habit" hint="Things you want to repeat: reading, exercise, journaling." />
      <Group kind="medicine" hint="Prescription or doctor-advised medicine. Set the exact times of day so you do not miss a dose." />
      <Group kind="vitamin" hint="Vitamins and supplements. Give each one its own times, e.g. Morning and Evening." />

      {/* PROGRESS GOALS */}
      <div className="card mb-6">
        <CardHeader icon="🎯" title="Progress Goals" tone="purple" hint="For goals measured in chunks, not days: e.g. read 200 Bible pericopes in 3 months. Tap +5 each time you finish five, and see if you are ahead or behind."
          right={<button onClick={() => setGoalForm({ v: { title: '', icon: '📖', unit: 'pericope', target_total: '', step: 5, current_count: 0, start_date: today, end_date: ymd(addDays(new Date(), 90)) } })} className="text-xs font-semibold text-blue-600">+ New goal</button>} />
        {goals.length === 0 ? <div className="p-5 text-center text-xs text-gray-400">No goals yet. Try “Bible reading — pericopes”.</div> : goals.map(g => {
          const p = pace(g); const behind = p.diff < -0.5
          return (
            <div key={g.id} className="px-4 py-3.5 border-b border-gray-100 last:border-0 group">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{g.icon}</span>
                <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{g.title}</div><div className="text-[11px] text-gray-400">{format(parseISO(g.start_date), 'd MMM')} → {format(parseISO(g.end_date), 'd MMM yyyy')} · {p.left} days left</div></div>
                <div className="text-right"><div className="text-lg font-bold leading-none">{Number(g.current_count)}<span className="text-xs text-gray-400 font-normal">/{Number(g.target_total)}</span></div><div className="text-[10px] text-gray-400">{g.unit}s</div></div>
              </div>
              <ProgressBar pct={p.pct} color={p.done ? '#22C55E' : behind ? '#F97316' : '#8B5CF6'} />
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {p.done ? <span className="text-xs font-bold text-green-600">🎉 Goal reached!</span> : <>
                  <button onClick={() => addProgress(g, Number(g.step))} className="btn-blue btn-sm">+{Number(g.step)} {g.unit}s</button>
                  <button onClick={() => addProgress(g, 1)} className="btn-gray btn-sm">+1</button>
                  <button onClick={() => addProgress(g, -1)} className="btn-gray btn-sm" aria-label="Undo one">−1</button>
                  <span className={`text-[11px] font-semibold ml-1 ${behind ? 'text-orange-500' : 'text-green-600'}`}>{behind ? `${Math.ceil(-p.diff)} behind schedule` : p.diff > 0.5 ? `${Math.floor(p.diff)} ahead of schedule` : 'right on schedule'}</span>
                  <span className="text-[11px] text-gray-400">· need ≈ {p.perWeek < 1 ? p.perWeek.toFixed(1) : Math.ceil(p.perWeek)} {g.unit}s / week</span>
                </>}
                <span className="flex-1" />
                <button onClick={() => setGoalForm({ id: g.id, v: { ...g } })} className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-blue-500">Edit</button>
                <button onClick={() => delGoal(g.id)} className="opacity-0 group-hover:opacity-100 text-xs text-gray-300 hover:text-red-500">Delete</button>
              </div>
            </div>)
        })}
      </div>

      {/* STATISTICS */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="text-base font-bold mr-2">📊 Statistics</h2>
        <div className="flex gap-0.5 bg-white border border-gray-100 rounded-xl p-1">
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map(r => <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${range === r ? 'bg-green-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>{RANGE_LABEL[r]}</button>)}
        </div>
        <select className="sel text-xs" value={kindFilter} onChange={e => setKindFilter(e.target.value as any)}>
          <option value="all">All</option><option value="habit">Habits</option><option value="medicine">Medicine</option><option value="vitamin">Vitamins</option>
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[['Completion', `${Math.round(stats.rate)}%`, `${stats.done} of ${stats.expected} ticks`], ['Perfect days', String(stats.perfectDays), `of ${stats.activeDays} days`], ['Current streak', `${stats.streak} 🔥`, 'days with everything done'], ['Best streak', String(stats.bestStreak), 'days in this period']].map(([t, v, s]) => (
          <div key={t} className="card px-4 py-3"><div className="text-[10px] font-bold uppercase text-gray-400">{t}</div><div className="text-2xl font-bold">{v}</div><div className="text-[10px] text-gray-400">{s}</div></div>))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-4">
        <div className="card p-4"><div className="text-xs font-bold text-gray-500 mb-2">Completion over time <span className="font-normal text-gray-300">· {chart.length > 31 || stats.daily.length > 31 ? 'grouped by week/month' : 'per day'}</span></div><LineChart points={chart} /></div>
        <div className="card p-4"><div className="text-xs font-bold text-gray-500 mb-3">Done vs missed</div><Donut center={`${Math.round(stats.rate)}%`} slices={[{ value: stats.done, color: '#22C55E', label: 'Done' }, { value: Math.max(0, stats.expected - stats.done), color: '#FCA5A5', label: 'Missed' }]} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-4"><div className="text-xs font-bold text-gray-500 mb-2">Which weekdays are you strongest?</div><BarsLabeled items={stats.weekday} max={100} color="#5B7FFF" /></div>
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-xs font-bold text-gray-500">Per habit</div>
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 && <div className="p-4 text-xs text-gray-400 text-center">Nothing to show.</div>}
            {filtered.map(h => { const s = stats.perHabit.find(x => x.id === h.id)!; return (
              <div key={h.id} className="px-4 py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2 text-xs"><span>{h.icon}</span><span className="flex-1 truncate font-medium">{h.name}</span><span className="text-gray-400">🔥 {s.streak} · best {s.best}</span><b className={s.rate >= 80 ? 'text-green-600' : s.rate >= 50 ? 'text-orange-500' : 'text-red-500'}>{Math.round(s.rate)}%</b></div>
                <ProgressBar pct={s.rate} color={s.rate >= 80 ? '#22C55E' : s.rate >= 50 ? '#F97316' : '#EF4444'} height={5} />
              </div>) })}
          </div>
        </div>
      </div>

      {/* LAST 7 DAYS GRID (editable) */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100 text-xs font-bold text-blue-500 uppercase tracking-wide">🗓️ Last 7 days — tap to fix a day you forgot to tick</div>
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="border-b border-gray-100"><th className="text-left px-4 py-2 text-gray-400 font-semibold">Habit</th>{last7.map(d => <th key={d} className={`px-2 py-2 text-center font-semibold w-9 ${d === today ? 'text-blue-500' : ''}`}><div>{format(parseISO(d), 'EEE')}</div><div className="text-[10px]">{format(parseISO(d), 'd')}</div></th>)}<th className="px-3 py-2 text-gray-400 font-semibold">Score</th></tr></thead>
          <tbody>{habits.map(h => { const sched = last7.filter(d => scheduledOn(h, d)); const score = sched.filter(d => isDone(h.id, d)).length; return (
            <tr key={h.id} className="border-b border-gray-100">
              <td className="px-4 py-2 font-medium whitespace-nowrap"><span className="mr-1.5">{h.icon}</span>{h.name}</td>
              {last7.map(d => !scheduledOn(h, d) ? <td key={d} className="px-2 py-2 text-center text-gray-200">·</td> : (
                <td key={d} className="px-2 py-2 text-center"><button aria-label={`${h.name} ${d}`} onClick={() => toggleSimple(h, d)} className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] ${isDone(h.id, d) ? 'bg-green-500 text-white' : d === today ? 'border-2 border-dashed border-gray-200' : 'bg-gray-100'}`}>{isDone(h.id, d) && '✓'}</button></td>))}
              <td className="px-3 py-2"><span className={`font-bold ${score === sched.length ? 'text-green-500' : score >= sched.length / 2 ? 'text-orange-500' : 'text-red-500'}`}>{score}/{sched.length}</span></td>
            </tr>) })}</tbody>
        </table></div>
      </div>

      {habitForm && (
        <Modal title={habitForm.id ? 'Edit' : `New ${KIND_META[habitForm.v.kind].label.toLowerCase().replace(' & supplements', '')}`} onClose={() => setHabitForm(null)} subtitle="Choose which days it applies to. It only counts on those days.">
          {(() => { const v = habitForm.v; const set = (k: string, val: any) => setHabitForm({ ...habitForm, v: { ...v, [k]: val } }); return (<>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3 w-fit">{(['habit', 'medicine', 'vitamin'] as Kind[]).map(k => <button key={k} onClick={() => setHabitForm({ ...habitForm, v: { ...v, kind: k, slots: k === 'habit' ? [] : v.slots.length ? v.slots : [{ label: 'Morning', time: '08:00' }] } })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${v.kind === k ? 'bg-white shadow-sm' : 'text-gray-400'}`}>{KIND_META[k].icon} {k === 'vitamin' ? 'Vitamin' : k === 'medicine' ? 'Medicine' : 'Habit'}</button>)}</div>
            <div className="flex gap-1 flex-wrap mb-3">{ICONS.map(ic => <button key={ic} onClick={() => set('icon', ic)} className={`w-8 h-8 rounded-lg text-base ${v.icon === ic ? 'bg-blue-500' : 'bg-gray-100 hover:bg-gray-200'}`}>{ic}</button>)}</div>
            <input className="inp mb-3" placeholder={v.kind === 'habit' ? 'e.g. Read 10 pages' : v.kind === 'medicine' ? 'Medicine name' : 'e.g. Vitamin D3'} value={v.name} onChange={e => set('name', e.target.value)} autoFocus />
            {v.kind !== 'habit' && <div className="grid grid-cols-2 gap-3 mb-3"><Field label="Dose"><input className="inp" placeholder="e.g. 1 tablet, 500 mg" value={v.dose} onChange={e => set('dose', e.target.value)} /></Field><Field label="Note"><input className="inp" placeholder="e.g. after meals" value={v.notes} onChange={e => set('notes', e.target.value)} /></Field></div>}
            <Field label="Days" className="mb-3"><div className="flex gap-1.5 flex-wrap">{WEEKDAYS.map((d, i) => { const on = v.days.includes(i + 1); return <button key={d} onClick={() => set('days', on ? v.days.filter((x: number) => x !== i + 1) : [...v.days, i + 1].sort())} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${on ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-400 border-gray-200'}`}>{d}</button> })}</div></Field>
            {v.kind !== 'habit' && <Field label="Times of day" hint="Each time becomes its own tick. Edit the clock time if you like." className="mb-3">
              <div className="space-y-1.5">{v.slots.map((s: any, i: number) => <div key={i} className="flex gap-2"><input className="inp flex-1" value={s.label} onChange={e => set('slots', v.slots.map((x: any, j: number) => j === i ? { ...x, label: e.target.value } : x))} /><input type="time" className="sel" value={s.time} onChange={e => set('slots', v.slots.map((x: any, j: number) => j === i ? { ...x, time: e.target.value } : x))} /><button onClick={() => set('slots', v.slots.filter((_: any, j: number) => j !== i))} className="text-gray-300 hover:text-red-500">✕</button></div>)}</div>
              <div className="flex gap-1.5 flex-wrap mt-2">{SLOT_PRESETS.filter(p => !v.slots.some((s: any) => s.label === p.label)).map(p => <button key={p.label} onClick={() => set('slots', [...v.slots, p])} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-blue-300">+ {p.label}</button>)}</div>
            </Field>}
            <div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={saveHabit}>Save</button><button className="btn-gray" onClick={() => setHabitForm(null)}>Cancel</button></div>
          </>) })()}
        </Modal>)}

      {goalForm && (
        <Modal title={goalForm.id ? 'Edit goal' : 'New progress goal'} onClose={() => setGoalForm(null)} subtitle="Example: 200 pericopes in 3 months, tapping +5 each time.">
          {(() => { const v = goalForm.v; const set = (k: string, val: any) => setGoalForm({ ...goalForm, v: { ...v, [k]: val } }); return (<>
            <div className="flex gap-1 flex-wrap mb-3">{['📖', '📿', '✝️', '🎓', '🏃', '✏️', '🎯', '🈶'].map(ic => <button key={ic} onClick={() => set('icon', ic)} className={`w-8 h-8 rounded-lg text-base ${v.icon === ic ? 'bg-blue-500' : 'bg-gray-100'}`}>{ic}</button>)}</div>
            <input className="inp mb-3" placeholder="e.g. Bible reading" value={v.title} onChange={e => set('title', e.target.value)} autoFocus />
            <div className="grid grid-cols-3 gap-3 mb-3"><Field label="Unit"><input className="inp" value={v.unit} onChange={e => set('unit', e.target.value)} /></Field><Field label="Total target"><input type="number" min="1" className="inp" value={v.target_total} onChange={e => set('target_total', e.target.value)} /></Field><Field label="Tap adds"><input type="number" min="1" className="inp" value={v.step} onChange={e => set('step', e.target.value)} /></Field></div>
            <div className="grid grid-cols-2 gap-3 mb-3"><Field label="Start"><input type="date" className="sel w-full" value={v.start_date} onChange={e => set('start_date', e.target.value)} /></Field><Field label="Finish by"><input type="date" className="sel w-full" value={v.end_date} onChange={e => set('end_date', e.target.value)} /></Field></div>
            {!goalForm.id && <Field label="Already done so far" className="mb-3"><input type="number" min="0" className="inp" value={v.current_count} onChange={e => set('current_count', e.target.value)} /></Field>}
            <div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={saveGoal}>Save</button><button className="btn-gray" onClick={() => setGoalForm(null)}>Cancel</button></div>
          </>) })()}
        </Modal>)}
    </div>
  )
}
