'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { REMINDER_OPTIONS, emitChange, loadBusinesses, todayStr } from '@/lib/planner'
import Modal, { Field } from './Modal'

const REPEATS = [
  { v: 'none', l: 'Does not repeat' }, { v: 'daily', l: 'Every day' }, { v: 'weekly', l: 'Every week' },
  { v: 'biweekly', l: 'Every 2 weeks' }, { v: 'monthly', l: 'Every month (bills, mortgage…)' }, { v: 'yearly', l: 'Every year (birthdays…)' },
]
const FALLBACK_CATS = [
  { name: 'Meeting', color: '#22C55E', icon: '👥' }, { name: 'Birthday', color: '#FF6B8A', icon: '🎂' },
  { name: 'Payment Due', color: '#F97316', icon: '💳' }, { name: 'Content', color: '#8B5CF6', icon: '🎬' },
  { name: 'Personal', color: '#5B7FFF', icon: '🌸' },
]

export default function EventForm({ onClose, onSaved, initial, defaultDate }: { onClose: () => void; onSaved?: () => void; initial?: any; defaultDate?: string }) {
  const editing = !!initial?.id
  const [cats, setCats] = useState<any[]>(FALLBACK_CATS)
  const [businesses, setBusinesses] = useState<any[]>([])
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState<any>(() => ({
    title: '', date: defaultDate || todayStr(), end_date: '', all_day: true, start_time: '', end_time: '',
    category: 'Meeting', category_color: '#22C55E', repeat_type: 'none', repeat_until: '', reminder_minutes: '',
    alert_color: '', location: '', notes: '', business_id: '',
    ...(initial ? { ...initial, end_date: initial.end_date || '', start_time: initial.start_time || '', end_time: initial.end_time || '', repeat_type: initial.repeat_type === 'never' || !initial.repeat_type ? 'none' : initial.repeat_type, repeat_until: initial.repeat_until || '', reminder_minutes: initial.reminder_minutes ?? '', alert_color: initial.alert_color || '', location: initial.location || '', notes: initial.notes || initial.description || '', business_id: initial.business_id || '' } : {}),
  }))
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  useEffect(() => {
    (async () => {
      setBusinesses(await loadBusinesses())
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('calendar_categories').select('*').eq('user_id', user.id).order('created_at')
      if (data && data.length) {
        setCats(data)
        if (!editing) { const c = data.find((x: any) => x.name === 'Meeting') || data[0]; setF((p: any) => ({ ...p, category: c.name, category_color: c.color })) }
      }
    })()
  }, [])

  async function save() {
    if (!f.title.trim()) { setErr('Please give the event a title.'); return }
    if (f.end_date && f.end_date < f.date) { setErr('End date is before the start date.'); return }
    if (!f.all_day && f.start_time && f.end_time && f.end_time < f.start_time && (!f.end_date || f.end_date === f.date)) { setErr('End time is before the start time.'); return }
    setSaving(true); setErr('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const row: any = {
      title: f.title.trim(), date: f.date, end_date: f.end_date || null, all_day: !!f.all_day,
      start_time: f.all_day ? null : f.start_time || null, end_time: f.all_day ? null : f.end_time || null,
      category: f.category, category_color: f.category_color, repeat_type: f.repeat_type, repeat_until: f.repeat_until || null,
      reminder_minutes: f.reminder_minutes === '' ? null : Number(f.reminder_minutes), alert_color: f.alert_color || null,
      location: f.location || null, notes: f.notes || null, business_id: f.business_id || null,
    }
    const q = editing ? supabase.from('events').update(row).eq('id', initial.id) : supabase.from('events').insert({ ...row, user_id: user.id, status: 'upcoming' })
    const { error } = await q
    setSaving(false)
    if (error) { setErr(error.message + ' — did you run lib/planner-upgrade-2.sql in Supabase?'); return }
    emitChange(); onSaved?.(); onClose()
  }

  async function remove() {
    const rec = f.repeat_type !== 'none'
    if (!confirm(rec ? 'Delete this event and ALL of its repeats?' : 'Delete this event?')) return
    await supabase.from('events').delete().eq('id', initial.id)
    emitChange(); onSaved?.(); onClose()
  }

  return (
    <Modal title={editing ? 'Edit event' : 'New event'} onClose={onClose} subtitle="Works like your phone calendar: start & end, repeat, and an alert with its own colour.">
      <input className="inp mb-3" placeholder="Event title" value={f.title} autoFocus onChange={e => set('title', e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Starts"><input type="date" className="sel w-full" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Ends" hint="Leave empty for one day"><input type="date" className="sel w-full" value={f.end_date} min={f.date} onChange={e => set('end_date', e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600 mb-2 cursor-pointer"><input type="checkbox" checked={f.all_day} onChange={e => set('all_day', e.target.checked)} /> All-day</label>
      {!f.all_day && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Start time"><input type="time" className="sel w-full" value={f.start_time} onChange={e => set('start_time', e.target.value)} /></Field>
          <Field label="End time"><input type="time" className="sel w-full" value={f.end_time} onChange={e => set('end_time', e.target.value)} /></Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Category (for filtering)">
          <select className="sel w-full" value={f.category} onChange={e => { const c = cats.find(x => x.name === e.target.value); setF((p: any) => ({ ...p, category: e.target.value, category_color: c?.color || p.category_color })) }}>
            {cats.map(c => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}
          </select>
        </Field>
        <Field label="Business" hint="Optional">
          <select className="sel w-full" value={f.business_id} onChange={e => set('business_id', e.target.value)}>
            <option value="">— none —</option>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Repeat">
          <select className="sel w-full" value={f.repeat_type} onChange={e => set('repeat_type', e.target.value)}>
            {REPEATS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
        </Field>
        {f.repeat_type !== 'none' && <Field label="Repeat until" hint="Empty = forever"><input type="date" className="sel w-full" value={f.repeat_until} onChange={e => set('repeat_until', e.target.value)} /></Field>}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 mb-3 items-end">
        <Field label="Alert" hint="Pop-up while the planner is open (allow browser notifications for banners).">
          <select className="sel w-full" value={String(f.reminder_minutes)} onChange={e => set('reminder_minutes', e.target.value)}>
            {REMINDER_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Alert colour">
          <div className="flex items-center gap-1.5">
            <input type="color" className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer" value={f.alert_color || f.category_color || '#5B7FFF'} onChange={e => set('alert_color', e.target.value)} />
            {f.alert_color && <button type="button" className="text-[10px] text-gray-400 underline" onClick={() => set('alert_color', '')}>reset</button>}
          </div>
        </Field>
      </div>

      <Field label="Location" className="mb-3"><input className="inp" value={f.location} onChange={e => set('location', e.target.value)} placeholder="Optional" /></Field>
      <Field label="Notes" className="mb-3"><textarea className="inp resize-none" rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>

      {err && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{err}</div>}
      <div className="flex gap-2">
        <button className="btn-blue flex-1" disabled={saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add event'}</button>
        {editing && <button className="btn bg-red-50 text-red-500 border border-red-200 hover:bg-red-100" onClick={remove}>Delete</button>}
        <button className="btn-gray" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}
