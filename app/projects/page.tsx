'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { onChange, todayStr } from '@/lib/planner'
import { HEALTH_DOT, HEALTH_STYLE, PROJECT_STATUS, loadProjectData, money, projectHealth, spentOf, tasksOfProject } from '@/lib/projects'
import { ProgressBar } from '@/components/planner/Charts'
import { CardHeader } from '@/components/planner/Modal'
import { ensureSeed } from '@/lib/taskProjects'
import ProjectForm from '@/components/planner/ProjectForm'


export default function ProjectsDashboard() {
  const [data, setData] = useState<any>(null)
  const [content, setContent] = useState<any[]>([])
  const [showNew, setShowNew] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const today = todayStr()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    await ensureSeed(user.id)
    setData(await loadProjectData(supabase, user.id))
    const c = await supabase.from('content_ideas').select('status').eq('user_id', user.id); setContent(c.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => onChange(load), [load])

  const rows = useMemo(() => {
    if (!data?.projects) return []
    return data.projects.map((p: any) => {
      const tasks = tasksOfProject(data.todos, p.name), ms = data.milestones.filter((m: any) => m.project_id === p.id)
      const spent = spentOf(p.id, data.expenses, data.txs)
      return { p, tasks, ms, spent, h: projectHealth(p, tasks, ms, spent, today) }
    })
  }, [data, today])
  const live = rows.filter((r: any) => showDone || r.p.status !== 'done')
  const active = rows.filter((r: any) => r.p.status === 'active' || r.p.status === 'planning')
  const totals = {
    budget: rows.reduce((s: number, r: any) => s + Number(r.p.budget || 0), 0), spent: rows.reduce((s: number, r: any) => s + r.spent, 0),
    overdue: rows.reduce((s: number, r: any) => s + r.tasks.filter((t: any) => t.status !== 'done' && t.deadline && t.deadline < today).length, 0),
    risk: rows.filter((r: any) => r.h.level === 'risk' || r.h.level === 'watch'),
    avg: active.length ? active.reduce((s: number, r: any) => s + r.h.progress, 0) / active.length : 0,
  }

  // timeline range
  const dated = live.filter((r: any) => r.p.start_date && r.p.target_date)
  const tMin = dated.length ? Math.min(...dated.map((r: any) => parseISO(r.p.start_date).getTime())) : 0
  const tMax = dated.length ? Math.max(...dated.map((r: any) => parseISO(r.p.target_date).getTime())) : 0
  const span = Math.max(1, tMax - tMin); const pos = (d: string | Date) => Math.max(0, Math.min(100, ((new Date(d).getTime() - tMin) / span) * 100))

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Projects Dashboard 📊</h1>
          <p className="text-xs text-gray-400 mt-0.5">All your projects in one place: progress, budget, deadlines and what needs attention. Each project links to Tasks & To-Do, Calendar, Daily Log and (soon) Finance.</p>
        </div>
        <button className="btn-blue" onClick={() => setShowNew(true)}>+ New project</button>
      </div>

      {data && data.projects === null && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">Project tables are not set up yet. Run <b>lib/planner-upgrade-4.sql</b> in Supabase, then refresh.</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="card px-4 py-3"><div className="text-[10px] font-bold uppercase text-gray-400">Active projects</div><div className="text-2xl font-bold">{active.length}</div><div className="text-[10px] text-gray-400">{rows.length} in total</div></div>
        <div className="card px-4 py-3"><div className="text-[10px] font-bold uppercase text-gray-400">Average progress</div><div className="text-2xl font-bold">{Math.round(totals.avg)}%</div><ProgressBar pct={totals.avg} color="#8B5CF6" height={5} /></div>
        <div className="card px-4 py-3"><div className="text-[10px] font-bold uppercase text-gray-400">Budget used</div><div className="text-2xl font-bold">{totals.budget ? Math.round((totals.spent / totals.budget) * 100) + '%' : '—'}</div><div className="text-[10px] text-gray-400 truncate">{money(totals.spent)} of {money(totals.budget)}</div></div>
        <div className="card px-4 py-3"><div className="text-[10px] font-bold uppercase text-gray-400">Needs attention</div><div className="text-2xl font-bold">{totals.risk.length}</div><div className="text-[10px] text-gray-400">{totals.overdue} overdue task{totals.overdue === 1 ? '' : 's'}</div></div>
      </div>

      {totals.risk.length > 0 && (
        <div className="card mb-4">
          <CardHeader icon="🧭" title="Evaluation" tone="amber" hint="Automatic check of your projects (based on deadlines, budget and progress)." />
          {totals.risk.map((r: any) => <Link key={r.p.id} href={`/projects/${r.p.id}`} className="flex gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50">
            <span className="text-lg">{r.p.emoji}</span><div className="flex-1 min-w-0"><div className="text-sm font-semibold">{r.p.name} <span className={`text-[10px] px-2 py-0.5 rounded-full ml-1 ${HEALTH_STYLE[r.h.level as keyof typeof HEALTH_STYLE]}`}>{r.h.label}</span></div><div className="text-[11px] text-gray-500">{r.h.reasons.join(' · ')}</div></div></Link>)}
        </div>)}

      {dated.length > 0 && (
        <div className="card mb-4">
          <CardHeader icon="🗓️" title="Timeline" tone="gray" hint={`${format(new Date(tMin), 'd MMM yyyy')} → ${format(new Date(tMax), 'd MMM yyyy')}. The line marks today.`} />
          <div className="p-4">
            {dated.map((r: any) => (
              <Link key={r.p.id} href={`/projects/${r.p.id}`} className="grid grid-cols-[28%_1fr] items-center gap-2 py-1.5 group">
                <div className="text-xs font-semibold truncate group-hover:text-blue-600">{r.p.emoji} {r.p.name}</div>
                <div className="relative h-5 bg-gray-50 rounded-full"><div className="absolute h-5 rounded-full overflow-hidden" style={{ left: `${pos(r.p.start_date)}%`, width: `${Math.max(2, pos(r.p.target_date) - pos(r.p.start_date))}%`, background: r.p.color + '35' }}><div className="h-full" style={{ width: `${r.h.progress}%`, background: r.p.color }} /></div>{tMin <= Date.now() && Date.now() <= tMax && <div className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-red-400" style={{ left: `${pos(new Date())}%` }} title="Today" />}</div>
              </Link>))}
          </div>
        </div>)}

      <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-bold text-gray-600">Your projects</h2><label className="text-xs text-gray-400 flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show completed</label></div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {live.map((r: any) => {
          const p = r.p, st = PROJECT_STATUS.find(s => s.v === p.status)
          const daysLeft = p.target_date ? differenceInCalendarDays(parseISO(p.target_date), new Date()) : null
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="card p-4 hover:shadow-md transition-shadow" style={{ borderTop: `3px solid ${p.color}` }}>
              <div className="flex items-start gap-3"><span className="text-3xl">{p.emoji}</span><div className="flex-1 min-w-0"><div className="font-bold truncate">{p.name}</div><div className="flex gap-1.5 mt-1 flex-wrap"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st?.cls}`}>{st?.l}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${HEALTH_STYLE[r.h.level as keyof typeof HEALTH_STYLE]}`}>● {r.h.label}</span></div></div></div>
              {p.goal && <div className="text-[11px] text-gray-500 mt-2 line-clamp-2">🎯 {p.goal}</div>}
              {p.legacy_route && <div className="text-[11px] mt-2"><span role="link" className="text-teal-600 font-semibold" onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = p.legacy_route }}>Open workspace →</span></div>}
              <div className="mt-3"><div className="flex justify-between text-[11px] mb-1"><span className="text-gray-400">Progress</span><b>{Math.round(r.h.progress)}%</b></div><ProgressBar pct={r.h.progress} color={p.color} /></div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="bg-gray-50 rounded-lg py-1.5"><div className="text-sm font-bold">{r.tasks.filter((t: any) => t.status === 'done').length}/{r.tasks.length}</div><div className="text-[9px] text-gray-400 uppercase">Tasks</div></div>
                <div className="bg-gray-50 rounded-lg py-1.5"><div className="text-sm font-bold">{r.ms.filter((m: any) => m.done).length}/{r.ms.length}</div><div className="text-[9px] text-gray-400 uppercase">Milestones</div></div>
                <div className="bg-gray-50 rounded-lg py-1.5"><div className="text-sm font-bold">{daysLeft === null ? '—' : daysLeft < 0 ? `${-daysLeft}d late` : `${daysLeft}d`}</div><div className="text-[9px] text-gray-400 uppercase">Left</div></div>
              </div>
              {Number(p.budget) > 0 && <div className="mt-3"><div className="flex justify-between text-[10px] text-gray-400 mb-1"><span>Budget</span><span>{money(r.spent, p.currency)} / {money(Number(p.budget), p.currency)}</span></div><ProgressBar pct={(r.spent / Number(p.budget)) * 100} color={r.spent > Number(p.budget) ? '#EF4444' : '#14B8A6'} height={5} /></div>}
              <div className="h-px" style={{ background: HEALTH_DOT[r.h.level as keyof typeof HEALTH_DOT] }} />
            </Link>)
        })}
        {live.length === 0 && data?.projects && <div className="md:col-span-2 xl:col-span-3 card p-8 text-center text-sm text-gray-400">No projects yet. Click <b>+ New project</b>, e.g. “Japan trip content series”.</div>}
      </div>

      {showNew && <ProjectForm onClose={() => setShowNew(false)} onSaved={load} />}
    </div>
  )
}
