'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { addLog, emitChange, onChange, toggleTask, todayStr } from '@/lib/planner'
import { EXPENSE_CATEGORIES, HEALTH_STYLE, PROJECT_STATUS, loadProjectData, money, projectHealth, spentOf, incomeOf, tasksOfProject } from '@/lib/projects'
import { BarsLabeled, ProgressBar } from '@/components/planner/Charts'
import Modal, { CardHeader, Field } from '@/components/planner/Modal'
import ProjectForm from '@/components/planner/ProjectForm'
import TaskForm from '@/components/planner/TaskForm'

type Tab = 'overview' | 'tasks' | 'milestones' | 'budget' | 'review' | 'activity'
const TABS: [Tab, string][] = [['overview', '🏠 Overview'], ['tasks', '✅ Tasks'], ['milestones', '🏁 Milestones'], ['budget', '💰 Budget'], ['review', '🧭 Risks & Review'], ['activity', '📋 Activity']]

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [edit, setEdit] = useState(false)
  const [taskForm, setTaskForm] = useState<any>(null)
  const [msTitle, setMsTitle] = useState(''); const [msDue, setMsDue] = useState('')
  const [expForm, setExpForm] = useState<any>(null)
  const [risk, setRisk] = useState({ text: '', level: 'medium' })
  const [note, setNote] = useState('')
  const [ev, setEv] = useState<any>({ rating: 0, went_well: '', to_improve: '', learned: '' })
  const [evSaved, setEvSaved] = useState(false)
  const today = todayStr()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const d = await loadProjectData(supabase, user.id); setData(d)
    const p = (d.projects || []).find((x: any) => x.id === projectId)
    if (p) {
      setEv((cur: any) => (cur._loaded ? cur : { rating: 0, went_well: '', to_improve: '', learned: '', ...(p.evaluation || {}), _loaded: true }))
      const { data: l } = await supabase.from('daily_logs').select('*').eq('user_id', user.id).eq('category', p.name).order('created_at', { ascending: false }).limit(60)
      setLogs(l || [])
    }
  }, [projectId])
  useEffect(() => { load() }, [load])
  useEffect(() => onChange(load), [load])

  const p = data?.projects?.find((x: any) => x.id === projectId)
  const ctx = useMemo(() => {
    if (!p) return null
    const tasks = tasksOfProject(data.todos, p.name), ms = data.milestones.filter((m: any) => m.project_id === p.id), ex = data.expenses.filter((e: any) => e.project_id === p.id)
    const txs = data.txs.filter((t: any) => String(t.project_id) === p.id)
    const spent = spentOf(p.id, data.expenses, data.txs), income = incomeOf(p.id, data.expenses, data.txs)
    return { tasks, ms, ex, txs, spent, income, h: projectHealth(p, tasks, ms, spent, today) }
  }, [data, p, today])

  if (!data) return <div className="text-center py-16 text-gray-400">Loading…</div>
  if (!p || !ctx) return <div className="card p-8 text-center text-sm text-gray-500">Project not found. <Link href="/projects" className="text-blue-500 font-semibold">Back to Projects</Link></div>
  const { tasks, ms, ex, txs, spent, income, h } = ctx
  const cur = p.currency
  const status = PROJECT_STATUS.find(s => s.v === p.status)
  const daysLeft = p.target_date ? differenceInCalendarDays(parseISO(p.target_date), new Date()) : null

  const upd = async (patch: any) => { await supabase.from('projects').update(patch).eq('id', p.id); emitChange() }
  async function addMilestone() {
    if (!msTitle.trim()) return
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    await supabase.from('project_milestones').insert({ user_id: user.id, project_id: p.id, title: msTitle.trim(), due_date: msDue || null, sort_order: ms.length })
    setMsTitle(''); setMsDue(''); emitChange()
  }
  async function toggleMs(m: any) {
    await supabase.from('project_milestones').update({ done: !m.done, done_at: !m.done ? new Date().toISOString() : null }).eq('id', m.id)
    if (!m.done) await addLog({ type: 'accomplishment', category: p.name, label: 'Project', content: `Milestone reached: ${m.title} (${p.name})` })
    emitChange()
  }
  async function saveExpense() {
    const e = expForm; if (!e || !Number(e.amount)) return
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const { error } = await supabase.from('project_expenses').insert({ user_id: user.id, project_id: p.id, date: e.date, type: e.type, amount: Number(e.amount), category: e.category, vendor: e.vendor || null, note: e.note || null })
    if (!error) { await addLog({ type: 'work_log', category: p.name, label: 'Finance', content: `${p.name}: ${e.type === 'income' ? 'income' : 'expense'} ${money(Number(e.amount), cur)}${e.category ? ' · ' + e.category : ''}` }); setExpForm(null); emitChange() }
  }
  const addRisk = async () => { if (!risk.text.trim()) return; await upd({ risks: [...(p.risks || []), { text: risk.text.trim(), level: risk.level, resolved: false }] }); setRisk({ text: '', level: 'medium' }) }
  const saveEval = async () => { const { _loaded, ...clean } = ev; await upd({ evaluation: clean }); setEvSaved(true); setTimeout(() => setEvSaved(false), 2000) }
  const addNote = async () => { if (!note.trim()) return; await addLog({ type: 'work_log', category: p.name, label: 'Project', content: note.trim() }); setNote('') }
  const delProject = async () => { if (!confirm(`Delete “${p.name}” with its milestones and expenses? Tasks stay in Tasks & To-Do.`)) return; await supabase.from('projects').delete().eq('id', p.id); emitChange(); router.push('/projects') }

  const byCat: Record<string, number> = {}; ex.filter((e: any) => e.type !== 'income').forEach((e: any) => { byCat[e.category || 'Other'] = (byCat[e.category || 'Other'] || 0) + Number(e.amount) })
  const dataPoints = [
    `Tasks: ${tasks.filter((t: any) => t.status === 'done').length} of ${tasks.length} done`,
    `Milestones: ${ms.filter((m: any) => m.done).length} of ${ms.length} reached`,
    Number(p.budget) > 0 ? `Budget: ${money(spent, cur)} spent of ${money(Number(p.budget), cur)} (${Math.round(h.budgetPct || 0)}%)` : `Spent: ${money(spent, cur)}`,
    income ? `Income from this project: ${money(income, cur)}` : '',
    p.target_date ? `Target date ${format(parseISO(p.target_date), 'd MMM yyyy')}${daysLeft !== null && daysLeft < 0 ? ` (${-daysLeft} days ago)` : ''}` : '',
  ].filter(Boolean)

  return (
    <div className="max-w-5xl mx-auto">
      <Link href="/projects" className="text-xs text-gray-400 hover:text-blue-500">← Projects</Link>
      <div className="flex items-start gap-3 mt-1 mb-4 flex-wrap">
        <span className="text-4xl">{p.emoji}</span>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-bold">{p.name}</h1>
          <div className="flex gap-1.5 mt-1 items-center flex-wrap">
            <select value={p.status} onChange={e => upd({ status: e.target.value })} className={`text-[11px] font-bold px-2 py-1 rounded-full border-none outline-none cursor-pointer ${status?.cls}`}>{PROJECT_STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${HEALTH_STYLE[h.level]}`}>● {h.label}</span>
            {p.start_date && <span className="text-[11px] text-gray-400">{format(parseISO(p.start_date), 'd MMM')} → {p.target_date ? format(parseISO(p.target_date), 'd MMM yyyy') : '…'}</span>}
          </div>
        </div>
        <button className="btn-gray btn-sm" onClick={() => setEdit(true)}>✏️ Edit</button>
        <button className="btn btn-sm bg-red-50 text-red-500 border border-red-200" onClick={delProject}>Delete</button>
      </div>

      <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 mb-4 overflow-x-auto">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${tab === k ? 'text-white' : 'text-gray-400 hover:bg-gray-50'}`} style={tab === k ? { background: p.color } : {}}>{l}</button>)}
      </div>

      {tab === 'overview' && <>
        <div className={`rounded-2xl px-4 py-3 mb-4 ${HEALTH_STYLE[h.level]}`}><div className="text-sm font-bold">{h.label}</div><ul className="text-xs mt-1 list-disc pl-4">{h.reasons.map(r => <li key={r}>{r}</li>)}</ul></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[['Progress', `${Math.round(h.progress)}%`, 'tasks + milestones', h.progress, p.color], ['Time', h.timePct === null ? '—' : `${Math.round(Math.min(h.timePct, 100))}%`, daysLeft === null ? 'no target date' : daysLeft < 0 ? `${-daysLeft} days overdue` : `${daysLeft} days left`, h.timePct ?? 0, '#5B7FFF'], ['Budget', h.budgetPct === null ? '—' : `${Math.round(h.budgetPct)}%`, `${money(spent, cur)} spent`, h.budgetPct ?? 0, h.budgetPct && h.budgetPct > 100 ? '#EF4444' : '#14B8A6'], ['Tasks', `${tasks.filter((t: any) => t.status === 'done').length}/${tasks.length}`, `${tasks.filter((t: any) => t.status === 'blocked').length} blocked`, h.taskPct, '#8B5CF6']].map(([t, v, s, pc, c]) => (
            <div key={t as string} className="card px-4 py-3"><div className="text-[10px] font-bold uppercase text-gray-400">{t}</div><div className="text-2xl font-bold">{v}</div><div className="text-[10px] text-gray-400 mb-1.5">{s}</div><ProgressBar pct={pc as number} color={c as string} height={5} /></div>))}
        </div>
        <div className="card mb-4"><CardHeader icon="🎯" title="Goal & scope" tone="purple" hint="What success looks like for this project." />
          <div className="p-4 text-sm space-y-2">{p.goal ? <div><b>Goal:</b> {p.goal}</div> : <div className="text-gray-400 text-xs">No goal written yet. Click Edit and describe what “done” looks like.</div>}{p.description && <div className="text-gray-600 whitespace-pre-wrap">{p.description}</div>}</div></div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card"><CardHeader icon="⏭️" title="Next up" tone="blue" hint="Open tasks sorted by deadline." />
            {tasks.filter((t: any) => t.status !== 'done').sort((a: any, b: any) => (a.deadline || 'z').localeCompare(b.deadline || 'z')).slice(0, 5).map((t: any) => <div key={t.id} className="flex items-center gap-2 px-4 py-2 border-b border-gray-50 last:border-0 text-xs"><button aria-label="Done" onClick={() => toggleTask(t)} className="w-4 h-4 rounded border-2 border-gray-300 hover:border-green-400" /><span className="flex-1 truncate">{t.title}</span>{t.deadline && <span className={t.deadline < today ? 'text-red-500 font-semibold' : 'text-gray-400'}>{t.deadline}</span>}</div>)}
            {tasks.filter((t: any) => t.status !== 'done').length === 0 && <div className="p-4 text-xs text-gray-400 text-center">No open tasks.</div>}</div>
          <div className="card"><CardHeader icon="🏁" title="Upcoming milestones" tone="amber" hint="Key checkpoints on the way to the goal." />
            {ms.filter((m: any) => !m.done).slice(0, 5).map((m: any) => <div key={m.id} className="flex items-center gap-2 px-4 py-2 border-b border-gray-50 last:border-0 text-xs"><button aria-label="Reached" onClick={() => toggleMs(m)} className="w-4 h-4 rounded border-2 border-gray-300 hover:border-green-400" /><span className="flex-1 truncate">{m.title}</span>{m.due_date && <span className={m.due_date < today ? 'text-red-500 font-semibold' : 'text-gray-400'}>{m.due_date}</span>}</div>)}
            {ms.filter((m: any) => !m.done).length === 0 && <div className="p-4 text-xs text-gray-400 text-center">Nothing pending.</div>}</div>
        </div>
      </>}

      {tab === 'tasks' && (
        <div className="card"><CardHeader icon="✅" title="Project tasks" tone="blue" hint="The same tasks you see in Tasks & To-Do. Anything added here is filed under this project." right={<button className="btn-blue btn-sm" onClick={() => setTaskForm({ defaults: { category: p.name } })}>+ Task</button>} />
          {tasks.length === 0 ? <div className="p-6 text-center text-xs text-gray-400">No tasks yet. Add the first small step.</div> : tasks.sort((a: any, b: any) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || (a.deadline || 'z').localeCompare(b.deadline || 'z')).map((t: any) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
              <button aria-label="Toggle" onClick={() => toggleTask(t)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] ${t.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>{t.status === 'done' && '✓'}</button>
              <button onClick={() => setTaskForm({ initial: t })} className={`flex-1 text-left text-sm ${t.status === 'done' ? 'line-through text-gray-400' : ''}`}>{t.title}</button>
              {t.status === 'blocked' && <span className="text-[10px] font-bold bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Blocked</span>}
              {t.category !== p.name && <span className="text-[10px] text-purple-500">main: {t.category}</span>}
              {t.deadline && <span className={`text-[11px] ${t.status !== 'done' && t.deadline < today ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>⏰ {t.deadline}</span>}
            </div>))}
        </div>)}

      {tab === 'milestones' && (
        <div className="card"><CardHeader icon="🏁" title="Milestones" tone="amber" hint="Big checkpoints (not daily tasks). They show on your Calendar on their due date, and reaching one is logged in Daily Log." />
          {ms.map((m: any) => <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 group">
            <button aria-label="Toggle" onClick={() => toggleMs(m)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] ${m.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>{m.done && '✓'}</button>
            <span className={`flex-1 text-sm ${m.done ? 'line-through text-gray-400' : ''}`}>{m.title}</span>
            <input type="date" className="sel text-[11px] py-1" value={m.due_date || ''} onChange={async e => { await supabase.from('project_milestones').update({ due_date: e.target.value || null }).eq('id', m.id); emitChange() }} />
            <button aria-label="Delete" className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs" onClick={async () => { await supabase.from('project_milestones').delete().eq('id', m.id); emitChange() }}>✕</button></div>)}
          <div className="p-3 flex gap-2 bg-gray-50"><input className="inp flex-1 text-xs" placeholder="New milestone, e.g. First 5 videos posted" value={msTitle} onChange={e => setMsTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMilestone()} /><input type="date" className="sel text-xs" value={msDue} onChange={e => setMsDue(e.target.value)} /><button className="btn-blue btn-sm" onClick={addMilestone}>Add</button></div>
        </div>)}

      {tab === 'budget' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[['Budget', Number(p.budget) ? money(Number(p.budget), cur) : '—'], ['Spent', money(spent, cur)], ['Remaining', Number(p.budget) ? money(Number(p.budget) - spent, cur) : '—'], ['Income', money(income, cur)]].map(([t, v]) => <div key={t} className="card px-4 py-3"><div className="text-[10px] font-bold uppercase text-gray-400">{t}</div><div className={`text-lg font-bold ${t === 'Remaining' && Number(p.budget) - spent < 0 ? 'text-red-500' : ''}`}>{v}</div></div>)}
        </div>
        {Object.keys(byCat).length > 0 && <div className="card p-4 mb-4"><div className="text-xs font-bold text-gray-500 mb-2">Spending by category</div><BarsLabeled items={Object.entries(byCat).map(([label, value]) => ({ label: label.slice(0, 9), value }))} color="#14B8A6" unit="" /></div>}
        <div className="card"><CardHeader icon="💰" title="Expenses & income" tone="teal" hint="Everything this project costs or earns. Net result shows whether it paid off." right={<button className="btn-blue btn-sm" onClick={() => setExpForm({ date: today, type: 'expense', amount: '', category: 'Other', vendor: '', note: '' })}>+ Add</button>} />
          {ex.length === 0 && txs.length === 0 ? <div className="p-6 text-center text-xs text-gray-400">Nothing recorded yet.</div> : <>
            {ex.map((e: any) => <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 text-xs group"><span className="w-20 text-gray-400">{e.date}</span><span className="flex-1 truncate"><b>{e.category}</b>{e.vendor && ` · ${e.vendor}`}{e.note && <span className="text-gray-400"> — {e.note}</span>}</span><b className={e.type === 'income' ? 'text-green-600' : 'text-red-500'}>{e.type === 'income' ? '+' : '−'}{money(Number(e.amount), cur)}</b><button aria-label="Delete" className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500" onClick={async () => { await supabase.from('project_expenses').delete().eq('id', e.id); emitChange() }}>✕</button></div>)}
            {txs.map((t: any) => <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 text-xs"><span className="w-20 text-gray-400">{t.transaction_date}</span><span className="flex-1 truncate">{t.merchant || t.description || t.category} <span className="text-[10px] text-blue-500">from Financial Planner</span></span><b className={t.type === 'income' ? 'text-green-600' : 'text-red-500'}>{t.type === 'income' ? '+' : '−'}{money(Number(t.amount || 0), t.currency)}</b></div>)}
            <div className="px-4 py-2.5 bg-gray-50 flex justify-between text-xs"><span className="text-gray-500">Net</span><b className={income - spent < 0 ? 'text-red-500' : 'text-green-600'}>{money(income - spent, cur)}</b></div></>}
        </div></>}

      {tab === 'review' && <div className="grid md:grid-cols-2 gap-4">
        <div className="card"><CardHeader icon="⚠️" title="Risks & blockers" tone="red" hint="What could stop or delay this project? Writing it down early makes it easier to handle." />
          {(p.risks || []).map((r: any, i: number) => <div key={i} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 text-xs group"><button aria-label="Resolve" onClick={() => upd({ risks: p.risks.map((x: any, j: number) => j === i ? { ...x, resolved: !x.resolved } : x) })} className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[9px] ${r.resolved ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>{r.resolved && '✓'}</button><span className={`flex-1 ${r.resolved ? 'line-through text-gray-400' : ''}`}>{r.text}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.level === 'high' ? 'bg-red-50 text-red-500' : r.level === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>{r.level}</span><button aria-label="Delete" className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500" onClick={() => upd({ risks: p.risks.filter((_: any, j: number) => j !== i) })}>✕</button></div>)}
          <div className="p-3 flex gap-2 bg-gray-50"><input className="inp flex-1 text-xs" placeholder="e.g. Visa approval may be late" value={risk.text} onChange={e => setRisk({ ...risk, text: e.target.value })} onKeyDown={e => e.key === 'Enter' && addRisk()} /><select className="sel text-xs" value={risk.level} onChange={e => setRisk({ ...risk, level: e.target.value })}><option>low</option><option>medium</option><option>high</option></select><button className="btn-blue btn-sm" onClick={addRisk}>Add</button></div></div>
        <div className="card"><CardHeader icon="🧭" title="Review" tone="purple" hint="When the project ends (or at each checkpoint), note what worked and what to change." />
          <div className="p-4 space-y-3">
            <div className="bg-gray-50 rounded-xl p-3"><div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Numbers so far</div><ul className="text-xs text-gray-600 list-disc pl-4 space-y-0.5">{dataPoints.map(d => <li key={d}>{d}</li>)}</ul></div>
            <Field label="How did it go? (1–5)"><div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setEv({ ...ev, rating: n })} className={`w-9 h-9 rounded-lg text-lg ${ev.rating >= n ? 'bg-amber-100' : 'bg-gray-100 grayscale'}`}>⭐</button>)}</div></Field>
            <Field label="What went well"><textarea className="inp resize-none" rows={2} value={ev.went_well} onChange={e => setEv({ ...ev, went_well: e.target.value })} /></Field>
            <Field label="What to improve"><textarea className="inp resize-none" rows={2} value={ev.to_improve} onChange={e => setEv({ ...ev, to_improve: e.target.value })} /></Field>
            <Field label="What I learned"><textarea className="inp resize-none" rows={2} value={ev.learned} onChange={e => setEv({ ...ev, learned: e.target.value })} /></Field>
            <button className="btn-blue w-full" onClick={saveEval}>{evSaved ? 'Saved ✓' : 'Save review'}</button></div></div>
      </div>}

      {tab === 'activity' && (
        <div className="card"><CardHeader icon="📋" title="Activity" tone="gray" hint="Everything logged for this project in Daily Log: tasks received, tasks finished, milestones, spending and your notes." />
          <div className="p-3 flex gap-2 bg-gray-50 border-b border-gray-100"><input className="inp flex-1 text-xs" placeholder="Add a progress note…" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} /><button className="btn-blue btn-sm" onClick={addNote}>Add note</button></div>
          {logs.length === 0 ? <div className="p-6 text-center text-xs text-gray-400">No activity yet.</div> : logs.map(l => <div key={l.id} className="px-4 py-2.5 border-b border-gray-50 last:border-0"><div className="text-[13px]">{l.content}</div><div className="text-[10px] text-gray-400 mt-0.5">{format(parseISO(l.date), 'EEE d MMM yyyy')} {l.time_logged} · {l.type === 'task_received' ? '📥 received' : l.type === 'accomplishment' ? '🏆 accomplished' : '📋 note'}</div></div>)}
        </div>)}

      {edit && <ProjectForm initial={p} onClose={() => setEdit(false)} onSaved={load} />}
      {taskForm && <TaskForm initial={taskForm.initial} defaults={taskForm.defaults} onClose={() => setTaskForm(null)} onSaved={load} />}
      {expForm && (
        <Modal title="Add expense or income" onClose={() => setExpForm(null)}>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3 w-fit">{['expense', 'income'].map(t => <button key={t} onClick={() => setExpForm({ ...expForm, type: t })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${expForm.type === t ? 'bg-white shadow-sm' : 'text-gray-400'}`}>{t}</button>)}</div>
          <div className="grid grid-cols-2 gap-3 mb-3"><Field label={`Amount (${cur})`}><input type="number" min="0" className="inp" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} autoFocus /></Field><Field label="Date"><input type="date" className="sel w-full" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-3 mb-3"><Field label="Category"><select className="sel w-full" value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Vendor"><input className="inp" value={expForm.vendor} onChange={e => setExpForm({ ...expForm, vendor: e.target.value })} /></Field></div>
          <Field label="Note" className="mb-4"><input className="inp" value={expForm.note} onChange={e => setExpForm({ ...expForm, note: e.target.value })} /></Field>
          <div className="flex gap-2"><button className="btn-blue flex-1" onClick={saveExpense}>Save</button><button className="btn-gray" onClick={() => setExpForm(null)}>Cancel</button></div>
        </Modal>)}
    </div>
  )
}
