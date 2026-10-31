'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus } from 'lucide-react'

const INFO: Record<string, any> = {
  s2: { title: "Master's Degree", emoji: '🎓', desc: 'Organize applications, scholarship research, and study preparation.', color: '#5B7FFF' },
  mandarin: { title: 'Mandarin Study', emoji: '📖', desc: 'Keep language goals, practice, and HSK preparation together.', color: '#F97316' },
}
export default function ProjectPage() {
  const path = usePathname()
  const slug = path.split('/').pop() || 's2'
  const info = INFO[slug] || INFO.s2
  const [tasks, setTasks] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [userId, setUserId] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { void load() }, [slug])
  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data, error: queryError } = await supabase.from('todos').select('*').eq('user_id', user.id).eq('category', info.title).order('created_at', { ascending: false })
    if (queryError) setError(queryError.message); else setTasks(data || [])
  }
  async function addTask() {
    if (!title.trim()) return
    const { error: saveError } = await supabase.from('todos').insert({ user_id: userId, title: title.trim(), category: info.title, status: 'pending', priority: 'medium' })
    if (saveError) setError(saveError.message); else { setTitle(''); await load() }
  }
  async function toggle(task: any) {
    const done = task.status !== 'done'
    const { error: saveError } = await supabase.from('todos').update({ status: done ? 'done' : 'pending', completed_at: done ? new Date().toISOString() : null }).eq('id', task.id).eq('user_id', userId)
    if (saveError) { setError(saveError.message); return }
    if (done) await supabase.from('daily_logs').insert({ user_id: userId, date: new Date().toISOString().slice(0, 10), type: 'accomplishment', category: info.title, content: task.title })
    await load()
  }
  return <div className="max-w-4xl mx-auto space-y-5"><header className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: info.color + '20' }}>{info.emoji}</div><div><h1 className="text-2xl font-bold">{info.title}</h1><p className="text-sm text-gray-500">{info.desc}</p></div></header>{error && <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</div>}<div className="card p-5"><h2 className="font-bold mb-3">Project tasks</h2><div className="flex gap-2"><input className="inp flex-1" placeholder="Add a next step" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && void addTask()} /><button onClick={() => void addTask()} className="btn-blue btn-sm"><Plus size={15} /></button></div>{tasks.length === 0 ? <p className="text-sm text-gray-500 mt-4">No tasks yet. Add one small next step to get started.</p> : <div className="mt-4 divide-y">{tasks.map(task => <label key={task.id} className="flex items-center gap-3 py-3"><input type="checkbox" checked={task.status === 'done'} onChange={() => void toggle(task)} /><span className={task.status === 'done' ? 'line-through text-gray-400' : ''}>{task.title}</span>{task.deadline && <span className="ml-auto text-xs text-gray-500">Due {task.deadline}</span>}</label>)}</div>}</div><div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Marking a task complete also adds it to your Daily Log accomplishments.</div></div>
}
