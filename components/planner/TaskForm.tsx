'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROJECTS, REMINDER_OPTIONS, REPEAT_OPTIONS, STATUS_OPTIONS, createTask, loadBusinesses, todayStr, updateTask, setTaskStatus, deleteTask } from '@/lib/planner'
import Modal, { Field } from './Modal'

type Props = {
  onClose: () => void
  onSaved?: () => void
  initial?: any                        // existing todo => edit mode
  defaults?: Record<string, any>       // e.g. { task_type: 'errand', scheduled_date: '2026-11-12' }
}

export default function TaskForm({ onClose, onSaved, initial, defaults }: Props) {
  const editing = !!initial?.id
  const [f, setF] = useState<any>(() => ({
    title: '', task_type: 'task', category: 'Personal', tags: [] as string[], business_id: '', priority: 'medium', status: 'todo',
    scheduled_date: todayStr(), scheduled_time: '', end_time: '', deadline: '', repeat_type: 'never', location: '', reminder_minutes: '', notes: '', is_urgent: false,
    ...defaults, ...(initial ? { ...initial, tags: initial.tags || [], business_id: initial.business_id || '', scheduled_time: initial.scheduled_time || '', end_time: initial.end_time || '', deadline: initial.deadline || '', location: initial.location || '', notes: initial.notes || '', reminder_minutes: initial.reminder_minutes ?? '', scheduled_date: initial.scheduled_date || '', repeat_type: initial.repeat_type || 'never', status: initial.status === 'pending' ? 'todo' : initial.status } : {}),
  }))
  const [projects, setProjects] = useState<string[]>(DEFAULT_PROJECTS.map(p => p.name))
  const [businesses, setBusinesses] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  useEffect(() => {
    (async () => {
      setBusinesses(await loadBusinesses())
      const { data } = await supabase.from('todos').select('category')
      const pr = await supabase.from('projects').select('name').neq('status', 'done')
      const extra = Array.from(new Set([...(data || []).map((r: any) => r.category), ...(pr.error ? [] : (pr.data || []).map((r: any) => r.name))].filter(Boolean))) as string[]
      setProjects(prev => Array.from(new Set([...prev, ...extra])))
    })()
  }, [])

  const isErrand = f.task_type === 'errand'

  async function save() {
    if (!f.title.trim()) { setErr('Please give it a title.'); return }
    setSaving(true); setErr('')
    const payload = {
      title: f.title, task_type: f.task_type, category: f.category, tags: f.tags.filter((t: string) => t !== f.category),
      business_id: f.business_id || null, priority: f.priority, scheduled_date: f.scheduled_date || null,
      scheduled_time: f.scheduled_time || null, end_time: f.end_time || null, deadline: f.deadline || null,
      repeat_type: f.repeat_type, location: f.location || null, notes: f.notes || null, is_urgent: !!f.is_urgent,
      reminder_minutes: f.reminder_minutes === '' ? null : Number(f.reminder_minutes),
    }
    let error: any
    if (editing) {
      const { status: _s, ...rest } = payload as any
      ;({ error } = await updateTask(initial.id, rest))
      if (!error && f.status !== (initial.status === 'pending' ? 'todo' : initial.status)) await setTaskStatus(initial, f.status)
    } else {
      ;({ error } = await createTask({ ...payload, status: f.status }))
    }
    setSaving(false)
    if (error) { setErr(error.message || 'Could not save. Did you run the SQL upgrade in Supabase?'); return }
    onSaved?.(); onClose()
  }

  async function remove() {
    if (!confirm('Delete this task? Your Daily Log history is kept.')) return
    await deleteTask(initial.id); onSaved?.(); onClose()
  }

  return (
    <Modal title={editing ? 'Edit' : isErrand ? 'New Errand' : 'New Task'} onClose={onClose}
      subtitle="Saved once, shown everywhere: Today's Tasks, Tasks & To-Do, Calendar, Schedule and Daily Log.">
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3 w-fit">
        {[{ v: 'task', l: '✅ Task' }, { v: 'errand', l: '🛒 Errand' }].map(o => (
          <button key={o.v} type="button" onClick={() => set('task_type', o.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${f.task_type === o.v ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}`}>{o.l}</button>
        ))}
      </div>

      <input className="inp mb-3" placeholder={isErrand ? 'e.g. Buy packaging tape' : 'e.g. Film Shanghai vlog'} value={f.title} autoFocus
        onChange={e => set('title', e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Project / list">
          <select className="sel w-full" value={f.category} onChange={e => set('category', e.target.value)}>
            {projects.map(p => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Business" hint="Link to one of your businesses">
          <select className="sel w-full" value={f.business_id} onChange={e => set('business_id', e.target.value)}>
            <option value="">— none —</option>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Also belongs to" hint="A task can live in one main project and still show up in others (e.g. a Polar Bed task that is also Content)." className="mb-3">
        <div className="flex flex-wrap gap-1.5">
          {projects.filter(p => p !== f.category).map(p => {
            const on = f.tags.includes(p)
            return <button key={p} type="button" onClick={() => set('tags', on ? f.tags.filter((t: string) => t !== p) : [...f.tags, p])}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${on ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-500 border-gray-200 hover:border-purple-300'}`}>{p}</button>
          })}
        </div>
      </Field>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <Field label="Date"><input type="date" className="sel w-full" value={f.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} /></Field>
        <Field label="Start"><input type="time" className="sel w-full" value={f.scheduled_time} onChange={e => set('scheduled_time', e.target.value)} /></Field>
        <Field label="End"><input type="time" className="sel w-full" value={f.end_time} onChange={e => set('end_time', e.target.value)} /></Field>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <Field label="Deadline"><input type="date" className="sel w-full" value={f.deadline} onChange={e => set('deadline', e.target.value)} /></Field>
        <Field label="Priority">
          <select className="sel w-full" value={f.priority} onChange={e => set('priority', e.target.value)}>
            <option value="high">🔴 High</option><option value="medium">🟠 Medium</option><option value="low">🟢 Low</option>
          </select>
        </Field>
        <Field label="Status">
          <select className="sel w-full" value={f.status} onChange={e => set('status', e.target.value)}>
            {STATUS_OPTIONS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Repeat">
          <select className="sel w-full capitalize" value={f.repeat_type} onChange={e => set('repeat_type', e.target.value)}>
            {REPEAT_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Alert">
          <select className="sel w-full" value={String(f.reminder_minutes)} onChange={e => set('reminder_minutes', e.target.value)}>
            {REMINDER_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </Field>
      </div>

      {isErrand && <Field label="Location" className="mb-3"><input className="inp" placeholder="Where do you need to go?" value={f.location} onChange={e => set('location', e.target.value)} /></Field>}
      <Field label="Notes" className="mb-3"><textarea className="inp resize-none" rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional details" /></Field>
      <label className="flex items-center gap-2 text-xs text-gray-500 mb-3 cursor-pointer"><input type="checkbox" checked={f.is_urgent} onChange={e => set('is_urgent', e.target.checked)} /> ⚡ Mark as urgent (shows under Important)</label>

      {err && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{err}</div>}
      <div className="flex gap-2">
        <button className="btn-blue flex-1" disabled={saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add'}</button>
        {editing && <button className="btn bg-red-50 text-red-500 border border-red-200 hover:bg-red-100" onClick={remove}>Delete</button>}
        <button className="btn-gray" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}
