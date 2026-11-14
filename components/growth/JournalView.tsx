'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Lock, Search, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { createTask, emitChange } from '@/lib/planner'

type Kind = 'journal' | 'diary'
const MOODS = [{ v: 5, e: '🌟' }, { v: 4, e: '😊' }, { v: 3, e: '😐' }, { v: 2, e: '😔' }, { v: 1, e: '😢' }]
const MOOD_COLOR: Record<number, string> = { 5: '#22C55E', 4: '#86EFAC', 3: '#FDE68A', 2: '#FDBA74', 1: '#EF4444' }
const PROMPTS = [['gratitude', '🙏 Three things I’m grateful for'], ['wins', '🏆 Wins today, big or small'], ['lessons', '💡 What I learned'], ['tomorrow', '🎯 Tomorrow’s focus (one per line)']] as const
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)
const blank = () => ({ id: '', title: '', body: '', mood: 0, tags: '', prompts: {} as Record<string, string>, alsoMood: true })
const PIN_KEY = 'diary-pin-hash'

async function sha(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('myplanner:' + s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('') }

export default function JournalView({ kind }: { kind: Kind }) {
  const sp = useSearchParams()
  const isDiary = kind === 'diary'
  const [date, setDate] = useState(sp.get('date') || ymd(new Date()))
  const [userId, setUserId] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [form, setForm] = useState<any>(blank())
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [locked, setLocked] = useState<boolean | null>(null)   // diary only
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4500) }

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data, error } = await supabase.from('journal_entries').select('*').eq('user_id', user.id).eq('kind', kind).order('entry_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) return toast('Could not load: ' + error.message + ' — run lib/planner-upgrade-7.sql in Supabase first.')
    setRows(data || [])
  }, [kind])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!isDiary) return; try { setLocked(!!localStorage.getItem(PIN_KEY)) } catch { setLocked(false) } }, [isDiary])

  const dayRows = rows.filter(r => r.entry_date === date)
  const month = date.slice(0, 7)
  const byDate = useMemo(() => { const m: Record<string, any> = {}; rows.forEach(r => { m[r.entry_date] = r }); return m }, [rows])
  const results = q.trim() ? rows.filter(r => `${r.title || ''} ${r.body || ''} ${Object.values(r.prompts || {}).join(' ')} ${(r.tags || []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())) : null
  const memories = rows.filter(r => r.entry_date.slice(5) === date.slice(5) && r.entry_date.slice(0, 4) !== date.slice(0, 4))
  const stats = useMemo(() => {
    const dates = new Set(rows.map(r => r.entry_date)); let streak = 0; const d = new Date(); if (!dates.has(ymd(d))) d.setDate(d.getDate() - 1)
    while (dates.has(ymd(d))) { streak++; d.setDate(d.getDate() - 1) }
    const thisMonth = rows.filter(r => r.entry_date.startsWith(ymd(new Date()).slice(0, 7)))
    return { total: rows.length, streak, monthWords: thisMonth.reduce((n, r) => n + words(r.body || '') + Object.values(r.prompts || {}).reduce<number>((a, b: any) => a + words(String(b)), 0), 0) }
  }, [rows])

  const shift = (n: number) => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n); setDate(ymd(d)); setEditing(false) }
  const startNew = () => { setForm(blank()); setEditing(true) }
  const startEdit = (r: any) => { setForm({ id: r.id, title: r.title || '', body: r.body || '', mood: r.mood || 0, tags: (r.tags || []).join(', '), prompts: r.prompts || {}, alsoMood: false }); setEditing(true) }

  async function save() {
    const hasText = form.body.trim() || Object.values(form.prompts).some((v: any) => String(v).trim())
    if (!hasText) return toast('Write something first.')
    const row = { user_id: userId, kind, entry_date: date, title: form.title.trim() || null, body: form.body.trim() || null, mood: form.mood || null, tags: form.tags.split(',').map((t: string) => t.trim()).filter(Boolean), prompts: isDiary ? {} : form.prompts, updated_at: new Date().toISOString() }
    const { error } = form.id ? await supabase.from('journal_entries').update(row).eq('id', form.id).eq('user_id', userId) : await supabase.from('journal_entries').insert(row)
    if (error) return toast('Could not save: ' + error.message)
    if (form.mood && form.alsoMood) await supabase.from('pixel_days').upsert({ user_id: userId, date, mood: form.mood, color: MOOD_COLOR[form.mood] }, { onConflict: 'user_id,date' })
    setEditing(false); await load(); emitChange(); toast(form.mood && form.alsoMood ? 'Saved, and your mood is in Mood in Pixels.' : 'Saved.')
  }
  async function remove(id: string) {
    if (!confirm('Delete this entry?')) return
    await supabase.from('journal_entries').delete().eq('id', id).eq('user_id', userId); await load()
  }
  async function tomorrowTasks(text: string) {
    const lines = text.split('\n').map(l => l.replace(/^[-•*\d.\s]+/, '').trim()).filter(Boolean)
    if (!lines.length) return
    const t = new Date(date + 'T00:00:00'); t.setDate(t.getDate() + 1)
    for (const l of lines) await createTask({ title: l, category: 'Personal', scheduled_date: ymd(t), priority: 'medium' } as any)
    emitChange(); toast(`${lines.length} task${lines.length > 1 ? 's' : ''} added for ${ymd(t)}.`)
  }

  // ---------- diary lock ----------
  const [pin, setPin] = useState(''), [pinErr, setPinErr] = useState('')
  async function unlock() { try { if (await sha(pin) === localStorage.getItem(PIN_KEY)) { setLocked(false); setPin(''); setPinErr('') } else setPinErr('Wrong PIN.') } catch { setPinErr('Could not check the PIN.') } }
  async function setNewPin() {
    const p = prompt('Choose a PIN (4+ digits). Leave empty to remove the lock.')
    if (p === null) return
    try { if (!p) { localStorage.removeItem(PIN_KEY); toast('Lock removed.') } else if (p.length < 4) toast('PIN must be at least 4 characters.'); else { localStorage.setItem(PIN_KEY, await sha(p)); toast('PIN set. The diary locks whenever you open the page.') } } catch { toast('Could not store the PIN on this device.') }
  }

  if (isDiary && locked === null) return null
  if (isDiary && locked) return (
    <div className="max-w-sm mx-auto mt-16 card p-6 text-center space-y-3"><div className="text-4xl">🔒</div><h1 className="font-bold text-lg">Your diary is locked</h1>
      <input type="password" inputMode="numeric" className="inp w-full text-center tracking-widest" placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && unlock()} autoFocus />
      {pinErr && <p className="text-xs text-red-600">{pinErr}</p>}<button className="btn-blue w-full" onClick={unlock}>Unlock</button>
      <p className="text-[11px] text-gray-400">This PIN hides the page on this device. If you forget it, clear this site’s data in your browser — your entries stay safe in your account.</p></div>)

  // ---------- calendar strip ----------
  const first = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1, 1), dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
  const Entry = ({ r }: { r: any }) => (
    <div className="card p-4 space-y-2">
      <div className="flex items-start gap-2"><div className="flex-1"><div className="font-semibold">{r.title || (isDiary ? 'Dear diary' : 'Journal entry')} {r.mood ? <span>{MOODS.find(m => m.v === r.mood)?.e}</span> : null}</div><div className="text-[11px] text-gray-400">{r.entry_date} · {words(r.body || '') + Object.values(r.prompts || {}).reduce<number>((a, b: any) => a + words(String(b)), 0)} words{(r.tags || []).length ? ' · ' + r.tags.map((t: string) => '#' + t).join(' ') : ''}</div></div>
        <button className="text-xs text-teal-600 font-semibold" onClick={() => { setDate(r.entry_date); startEdit(r) }}>Edit</button><button aria-label="Delete" className="text-gray-300 hover:text-red-500" onClick={() => remove(r.id)}><Trash2 size={14} /></button></div>
      {PROMPTS.map(([k, l]) => r.prompts?.[k] ? <div key={k}><div className="text-[11px] font-bold text-gray-400">{l}</div><div className="text-sm whitespace-pre-wrap">{r.prompts[k]}</div>{k === 'tomorrow' && <button className="text-[11px] text-teal-600 font-semibold mt-0.5" onClick={() => tomorrowTasks(r.prompts[k])}>→ Turn into tasks for the next day</button>}</div> : null)}
      {r.body && <div className="text-sm whitespace-pre-wrap">{r.body}</div>}
    </div>)

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header className="flex flex-wrap items-center gap-3"><div><h1 className="text-2xl font-bold">{isDiary ? 'Diary 🔒' : 'Journal 📔'}</h1><p className="text-sm text-gray-500 mt-0.5">{isDiary ? 'Free, private writing. Never shown in your Daily Log or reports.' : 'A short daily reflection: gratitude, wins, lessons, and tomorrow’s focus.'}</p></div>
        {isDiary && <button className="ml-auto btn-gray btn-sm text-xs flex items-center gap-1" onClick={setNewPin}><Lock size={13} /> PIN lock</button>}</header>
      {msg && <div className={`rounded-xl p-3 text-sm ${/could not|wrong/i.test(msg) ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

      <div className="grid grid-cols-3 gap-3">{[['Entries', String(stats.total)], ['Writing streak', stats.streak + ' days'], ['Words this month', stats.monthWords.toLocaleString()]].map(([l, v]) => <div key={l} className="card p-3"><div className="text-[10px] font-semibold uppercase text-gray-400">{l}</div><div className="text-lg font-bold">{v}</div></div>)}</div>

      <div className="grid md:grid-cols-[260px_1fr] gap-4">
        <div className="space-y-3">
          <div className="card p-3"><div className="flex items-center justify-between mb-2"><button className="btn-gray btn-sm" onClick={() => { const d = new Date(first); d.setMonth(d.getMonth() - 1); setDate(ymd(d)) }}>‹</button><b className="text-sm">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b><button className="btn-gray btn-sm" onClick={() => { const d = new Date(first); d.setMonth(d.getMonth() + 1); setDate(ymd(d)) }}>›</button></div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-300 mb-1">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">{cells.map((d, i) => { if (!d) return <div key={i} />; const k = `${month}-${pad(d)}`, has = byDate[k], sel = k === date
              return <button key={i} onClick={() => { setDate(k); setEditing(false); setQ('') }} className={`aspect-square rounded-lg text-xs relative ${sel ? 'bg-blue-500 text-white font-bold' : 'hover:bg-gray-100'}`}>{d}{has && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: sel ? '#fff' : has.mood ? MOOD_COLOR[has.mood] : '#5B7FFF' }} />}</button> })}</div></div>
          <div className="relative"><Search size={14} className="absolute left-3 top-3 text-gray-400" /><input className="inp w-full pl-9 text-sm" placeholder={`Search ${isDiary ? 'diary' : 'journal'}…`} value={q} onChange={e => setQ(e.target.value)} /></div>
          {memories.length > 0 && !q && <div className="card p-3 text-xs space-y-1"><div className="font-bold text-gray-500">🕰️ On this day</div>{memories.map(m => <button key={m.id} className="block text-left text-teal-600 font-semibold" onClick={() => setDate(m.entry_date)}>{m.entry_date.slice(0, 4)} · {(m.title || m.body || Object.values(m.prompts || {})[0] || '').toString().slice(0, 40)}…</button>)}</div>}
        </div>

        <div className="space-y-3">
          {results ? (<><div className="text-xs text-gray-400">{results.length} result{results.length === 1 ? '' : 's'}</div>{results.slice(0, 30).map(r => <Entry key={r.id} r={r} />)}</>) : editing ? (
            <div className="card p-5 space-y-3"><div className="font-bold text-sm">{form.id ? 'Edit entry' : 'New entry'} · {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <input className="inp w-full" placeholder="Title (optional)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              {!isDiary && PROMPTS.map(([k, l]) => <label key={k} className="block text-xs font-semibold text-gray-500">{l}<textarea rows={k === 'tomorrow' ? 2 : 2} className="inp w-full mt-1 text-sm" value={form.prompts[k] || ''} onChange={e => setForm({ ...form, prompts: { ...form.prompts, [k]: e.target.value } })} /></label>)}
              <label className="block text-xs font-semibold text-gray-500">{isDiary ? 'Write freely' : 'Anything else on your mind?'}<textarea rows={isDiary ? 12 : 4} className="inp w-full mt-1 text-sm leading-relaxed" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></label>
              <div className="flex flex-wrap items-center gap-3"><div className="flex gap-1">{MOODS.map(m => <button key={m.v} onClick={() => setForm({ ...form, mood: form.mood === m.v ? 0 : m.v })} className={`text-2xl ${form.mood === m.v ? '' : 'opacity-30'}`} aria-label={`Mood ${m.v}`}>{m.e}</button>)}</div>
                {form.mood > 0 && <label className="text-xs text-gray-500 flex items-center gap-1"><input type="checkbox" checked={form.alsoMood} onChange={e => setForm({ ...form, alsoMood: e.target.checked })} /> also colour this day in Mood in Pixels</label>}
                <input className="inp text-xs flex-1 min-w-[140px]" placeholder="Tags, comma separated" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} /></div>
              <div className="flex gap-2"><button className="btn-blue flex-1" onClick={save}>Save</button><button className="btn-gray flex-1" onClick={() => setEditing(false)}>Cancel</button></div></div>
          ) : (<>
            <div className="flex items-center gap-2"><button className="btn-gray btn-sm" onClick={() => shift(-1)}>‹</button><b className="flex-1 text-center">{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</b><button className="btn-gray btn-sm" onClick={() => shift(1)}>›</button><button className="btn-blue btn-sm" onClick={startNew}>+ Write</button></div>
            {dayRows.length === 0 ? <div className="card p-10 text-center space-y-2"><div className="text-3xl">{isDiary ? '🖋️' : '📝'}</div><p className="text-sm text-gray-500">Nothing written on this day yet.</p><button className="btn-blue btn-sm" onClick={startNew}>Start writing</button></div> : dayRows.map(r => <Entry key={r.id} r={r} />)}
          </>)}
        </div>
      </div>
    </div>
  )
}
