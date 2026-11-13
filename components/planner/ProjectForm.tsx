'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { addLog, emitChange, loadBusinesses } from '@/lib/planner'
import { PROJECT_KINDS, PROJECT_STATUS, TEMPLATES } from '@/lib/projects'
import Modal, { Field } from './Modal'

const EMOJIS = ['📁', '🎬', '✈️', '🎓', '📖', '🛍️', '🏠', '🌶️', '🛏️', '💼', '🚀', '🎯', '📸', '💡']
const COLORS = ['#8B5CF6', '#5B7FFF', '#14B8A6', '#22C55E', '#F97316', '#FF6B8A', '#EAB308', '#EF4444']

export default function ProjectForm({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved?: (id: string) => void }) {
  const editing = !!initial?.id
  const [f, setF] = useState<any>({ name: '', emoji: '📁', color: '#8B5CF6', kind: 'other', status: 'planning', goal: '', description: '', business_id: '', start_date: '', target_date: '', budget: '', currency: 'IDR', starter: true, ...(initial ? { ...initial, goal: initial.goal || '', description: initial.description || '', business_id: initial.business_id || '', start_date: initial.start_date || '', target_date: initial.target_date || '', budget: initial.budget || '' } : {}) })
  const [businesses, setBusinesses] = useState<any[]>([])
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  useEffect(() => { loadBusinesses().then(setBusinesses) }, [])

  async function save() {
    if (!f.name.trim()) { setErr('Give the project a name.'); return }
    if (f.start_date && f.target_date && f.target_date < f.start_date) { setErr('Target date is before the start date.'); return }
    setSaving(true); setErr('')
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const row = { name: f.name.trim(), emoji: f.emoji, color: f.color, kind: f.kind, status: f.status, goal: f.goal || null, description: f.description || null, business_id: f.business_id || null, start_date: f.start_date || null, target_date: f.target_date || null, budget: Number(f.budget) || 0, currency: f.currency }
    if (editing) {
      const { error } = await supabase.from('projects').update(row).eq('id', initial.id)
      if (error) { setErr(error.message); setSaving(false); return }
      if (initial.name !== row.name) await supabase.from('todos').update({ category: row.name }).eq('user_id', user.id).eq('category', initial.name) // keep tasks attached on rename
      emitChange(); onSaved?.(initial.id); onClose(); return
    }
    const { data, error } = await supabase.from('projects').insert({ ...row, user_id: user.id }).select().single()
    if (error || !data) { setErr((error?.message || 'Could not save') + ' — did you run lib/planner-upgrade-4.sql?'); setSaving(false); return }
    if (f.starter && TEMPLATES[f.kind]?.milestones.length)
      await supabase.from('project_milestones').insert(TEMPLATES[f.kind].milestones.map((t, i) => ({ user_id: user.id, project_id: data.id, title: t, sort_order: i })))
    await addLog({ type: 'work_log', category: row.name, label: 'Project', content: `Started project “${row.name}”` })
    emitChange(); onSaved?.(data.id); onClose()
  }

  return (
    <Modal title={editing ? 'Edit project' : 'New project'} onClose={onClose} wide subtitle="A project has a goal, tasks, milestones, a budget and a review. Tasks you add to it appear in Tasks & To-Do under the project's name.">
      <div className="flex gap-1 flex-wrap mb-2">{EMOJIS.map(e => <button key={e} onClick={() => set('emoji', e)} className={`w-8 h-8 rounded-lg text-base ${f.emoji === e ? 'bg-blue-500' : 'bg-gray-100 hover:bg-gray-200'}`}>{e}</button>)}</div>
      <div className="flex gap-1.5 mb-3">{COLORS.map(c => <button key={c} aria-label={c} onClick={() => set('color', c)} className={`w-6 h-6 rounded-full ${f.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ background: c }} />)}</div>
      <input className="inp mb-3" placeholder="Project name, e.g. Japan trip content series" value={f.name} onChange={e => set('name', e.target.value)} autoFocus />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Type"><select className="sel w-full" value={f.kind} onChange={e => set('kind', e.target.value)}>{PROJECT_KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}</select></Field>
        <Field label="Status"><select className="sel w-full" value={f.status} onChange={e => set('status', e.target.value)}>{PROJECT_STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></Field>
      </div>
      <Field label="Goal — what does success look like?" className="mb-3"><input className="inp" placeholder={TEMPLATES[f.kind]?.goal || 'e.g. 10 videos posted and 5,000 new followers'} value={f.goal} onChange={e => set('goal', e.target.value)} /></Field>
      <Field label="Description / scope" className="mb-3"><textarea className="inp resize-none" rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Start"><input type="date" className="sel w-full" value={f.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label="Target finish"><input type="date" className="sel w-full" value={f.target_date} min={f.start_date} onChange={e => set('target_date', e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-[1fr_90px_1fr] gap-3 mb-3">
        <Field label="Budget"><input type="number" min="0" className="inp" value={f.budget} onChange={e => set('budget', e.target.value)} placeholder="0" /></Field>
        <Field label="Currency"><select className="sel w-full" value={f.currency} onChange={e => set('currency', e.target.value)}><option>IDR</option><option>CNY</option><option>USD</option></select></Field>
        <Field label="Linked business"><select className="sel w-full" value={f.business_id} onChange={e => set('business_id', e.target.value)}><option value="">— none —</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}</select></Field>
      </div>
      {!editing && TEMPLATES[f.kind]?.milestones.length > 0 && <label className="flex items-start gap-2 text-xs text-gray-500 mb-3 cursor-pointer"><input type="checkbox" className="mt-0.5" checked={f.starter} onChange={e => set('starter', e.target.checked)} /> <span>Add starter milestones for a {f.kind} project: <i>{TEMPLATES[f.kind].milestones.join(' → ')}</i></span></label>}
      {err && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{err}</div>}
      <div className="flex gap-2"><button className="btn-blue flex-1" disabled={saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create project'}</button><button className="btn-gray" onClick={onClose}>Cancel</button></div>
    </Modal>
  )
}
