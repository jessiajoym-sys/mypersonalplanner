'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import TaskForm from '@/components/planner/TaskForm'
import ProjectForm from '@/components/planner/ProjectForm'
import { setTaskStatus } from '@/lib/planner'
import { BP, Empty, db } from './ui'

export default function Work({ d, userId, reload }: BP) {
  const [todos, setTodos] = useState<any[]>([]), [projects, setProjects] = useState<any[]>([])
  const [tf, setTf] = useState<any>(null), [pf, setPf] = useState(false)
  async function load() {
    const [t, p] = await Promise.all([
      db.from('todos').select('*').eq('user_id', userId).eq('business_id', d.biz.id).order('created_at', { ascending: false }),
      db.from('projects').select('*').eq('user_id', userId).eq('business_id', d.biz.id),
    ])
    setTodos(t.data || []); setProjects(p.error ? [] : p.data || [])
  }
  useEffect(() => { void load() }, [d.biz.id])  // eslint-disable-line
  const open = todos.filter(t => t.status !== 'done' && t.status !== 'cancelled'), done = todos.filter(t => t.status === 'done').slice(0, 8)
  return (
    <div className="space-y-5">
      <div className="card"><div className="flex items-center px-4 py-3 border-b border-gray-100"><div><div className="font-bold text-sm">✅ Business tasks</div><div className="text-[11px] text-gray-400">The same tasks as Tasks & To-Do and your Calendar — filed under this business.</div></div><button className="btn-blue btn-sm ml-auto" onClick={() => setTf({ defaults: { business_id: d.biz.id, category: 'Business' } })}>+ Task</button></div>
        {open.length === 0 && <div className="p-6 text-center text-xs text-gray-400">No open tasks.</div>}
        {open.map(t => <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 text-sm"><input type="checkbox" onChange={async () => { await setTaskStatus(t, 'done'); await load(); await reload() }} /><button className="flex-1 text-left" onClick={() => setTf({ initial: t })}>{t.title}</button><span className="text-[11px] text-gray-400">{t.scheduled_date || t.deadline || ''}</span></div>)}
        {done.length > 0 && <details className="px-4 py-2 text-xs text-gray-400"><summary className="cursor-pointer">Recently done ({done.length})</summary>{done.map(t => <div key={t.id} className="py-1 line-through">{t.title}</div>)}</details>}</div>
      <div className="card"><div className="flex items-center px-4 py-3 border-b border-gray-100"><div><div className="font-bold text-sm">📁 Business projects</div><div className="text-[11px] text-gray-400">Launches, campaigns, new products.</div></div><button className="btn-gray btn-sm ml-auto" onClick={() => setPf(true)}>+ Project</button></div>
        {projects.length === 0 ? <Empty icon="🚀" title="No projects yet" text="Create one to track milestones, tasks and costs for this business." /> : projects.map(p => <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 text-sm hover:bg-gray-50"><span className="text-xl">{p.emoji}</span><b className="flex-1">{p.name}</b><span className="text-xs text-gray-400 capitalize">{p.status}</span></Link>)}</div>
      {tf && <TaskForm initial={tf.initial} defaults={tf.defaults} onClose={() => setTf(null)} onSaved={() => { void load(); void reload() }} />}
      {pf && <ProjectForm initial={{ business_id: d.biz.id, kind: 'business' }} onClose={() => setPf(false)} onSaved={() => { void load() }} />}
    </div>
  )
}
