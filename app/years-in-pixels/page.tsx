'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { emitChange, onChange } from '@/lib/planner'
import { Donut, LineChart } from '@/components/planner/Charts'

const MOODS = [
  { val: 5, label: 'Amazing', color: '#22C55E', emoji: '🌟' },
  { val: 4, label: 'Good', color: '#86EFAC', emoji: '😊' },
  { val: 3, label: 'Okay', color: '#FDE68A', emoji: '😐' },
  { val: 2, label: 'Low', color: '#FDBA74', emoji: '😔' },
  { val: 1, label: 'Terrible', color: '#EF4444', emoji: '😢' },
]
const moodOf = (v: number) => MOODS.find(m => m.val === v) || MOODS[2]
const DEFAULT_TAGS = ['Work', 'Study', 'Exercise', 'Family', 'Friends', 'Church', 'Slept well', 'Poor sleep', 'Productive', 'Travel', 'Content', 'Stressed', 'Alone time', 'Money worry']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n: number) => String(n).padStart(2, '0')
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export default function MoodInPixelsPage() {
  const now = new Date()
  const todayK = key(now.getFullYear(), now.getMonth(), now.getDate())
  const [year, setYear] = useState(now.getFullYear())
  const [userId, setUserId] = useState('')
  const [pixels, setPixels] = useState<Record<string, any>>({})
  const [done, setDone] = useState<Record<string, number>>({})
  const [entries, setEntries] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<any>(null)
  const [view, setView] = useState<'year' | 'stats'>('year')
  const [newTag, setNewTag] = useState('')
  const [msg, setMsg] = useState('')
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const from = `${year}-01-01`, to = `${year}-12-31`
    const [p, a, j] = await Promise.all([
      supabase.from('pixel_days').select('*').eq('user_id', user.id).gte('date', from).lte('date', to),
      supabase.from('daily_logs').select('date').eq('user_id', user.id).eq('type', 'accomplishment').gte('date', from).lte('date', to),
      supabase.from('journal_entries').select('id,kind,entry_date,title,mood').eq('user_id', user.id).gte('entry_date', from).lte('entry_date', to),
    ])
    const map: Record<string, any> = {}; (p.data || []).forEach(x => { map[x.date] = x }); setPixels(map)
    const dm: Record<string, number> = {}; (a.data || []).forEach((x: any) => { dm[x.date] = (dm[x.date] || 0) + 1 }); setDone(dm)
    setEntries(j.error ? [] : j.data || [])
  }, [year])
  useEffect(() => { void load() }, [load])
  useEffect(() => onChange(() => { void load() }), [load])

  function pick(k: string) {
    const p = pixels[k]
    setSelected(k); setDraft({ mood: p?.mood ?? 0, energy: p?.energy ?? 0, tags: Array.isArray(p?.tags) ? p.tags : [], note: p?.note || '' })
  }
  async function save() {
    if (!selected || !draft.mood) return toast('Pick how the day felt.')
    const { error } = await supabase.from('pixel_days').upsert({ user_id: userId, date: selected, mood: draft.mood, color: moodOf(draft.mood).color, note: draft.note || null, tags: draft.tags, energy: draft.energy || null }, { onConflict: 'user_id,date' })
    if (error) return toast('Could not save: ' + error.message + (/tags|energy/.test(error.message) ? ' — run lib/planner-upgrade-7.sql in Supabase first.' : ''))
    await load(); emitChange(); toast('Saved.'); setSelected(null)
  }
  async function clearDay() {
    if (!selected || !pixels[selected]) return setSelected(null)
    await supabase.from('pixel_days').delete().eq('user_id', userId).eq('date', selected)
    await load(); setSelected(null)
  }

  const logged = Object.values(pixels)
  const allTags = useMemo(() => Array.from(new Set([...DEFAULT_TAGS, ...logged.flatMap((p: any) => (Array.isArray(p.tags) ? p.tags : []))])), [pixels])  // eslint-disable-line
  const stats = useMemo(() => {
    const vals = logged.map((p: any) => p.mood as number)
    const dist = MOODS.map(m => ({ ...m, n: vals.filter(v => v === m.val).length }))
    const byMonth = MONTHS.map((l, i) => { const xs = logged.filter((p: any) => new Date(p.date).getMonth() === i).map((p: any) => p.mood); return { label: l, value: xs.length ? Math.round(avg(xs) * 10) / 10 : 0 } })
    const byDow = WEEKDAYS.map((l, i) => { const xs = logged.filter((p: any) => new Date(p.date + 'T00:00:00').getDay() === i).map((p: any) => p.mood); return { label: l, avg: avg(xs), n: xs.length } })
    // streaks
    const keys = Object.keys(pixels).sort()
    let longest = 0, run = 0, prev = ''
    keys.forEach(k => { run = prev && (new Date(k).getTime() - new Date(prev).getTime()) / 86400000 === 1 ? run + 1 : 1; longest = Math.max(longest, run); prev = k })
    let current = 0; const d = new Date(); if (!pixels[todayK]) d.setDate(d.getDate() - 1)
    while (pixels[key(d.getFullYear(), d.getMonth(), d.getDate())]) { current++; d.setDate(d.getDate() - 1) }
    // what goes with good days
    const tagStats = allTags.map(t => { const w = logged.filter((p: any) => (p.tags || []).includes(t)).map((p: any) => p.mood), wo = logged.filter((p: any) => !(p.tags || []).includes(t)).map((p: any) => p.mood); return { tag: t, n: w.length, diff: w.length >= 3 && wo.length >= 3 ? avg(w) - avg(wo) : null, withAvg: avg(w) } }).filter(x => x.diff !== null) as { tag: string; n: number; diff: number; withAvg: number }[]
    const busy = logged.filter((p: any) => (done[p.date] || 0) >= 3).map((p: any) => p.mood), quiet = logged.filter((p: any) => !(done[p.date] || 0)).map((p: any) => p.mood)
    return { n: vals.length, mean: avg(vals), dist, byMonth, byDow: byDow.filter(x => x.n), longest, current, tagStats: tagStats.sort((a, b) => b.diff - a.diff), busyMood: busy.length >= 3 ? avg(busy) : null, quietMood: quiet.length >= 3 ? avg(quiet) : null }
  }, [pixels, done, allTags, todayK])  // eslint-disable-line

  const dayEntries = selected ? entries.filter(e => e.entry_date === selected) : []
  const todayPixel = pixels[todayK]

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header className="flex flex-wrap items-center gap-3"><div><h1 className="text-2xl font-bold">Mood in Pixels 🌈</h1><p className="text-sm text-gray-500 mt-0.5">One colour a day. Over time it shows what lifts you and what drains you.</p></div>
        <div className="ml-auto flex items-center gap-2"><div className="flex items-center gap-1 text-sm"><button className="btn-gray btn-sm" onClick={() => setYear(y => y - 1)}>‹</button><b className="w-12 text-center">{year}</b><button className="btn-gray btn-sm" onClick={() => setYear(y => y + 1)}>›</button></div>
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{(['year', 'stats'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md font-semibold capitalize ${view === v ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{v === 'year' ? 'Pixels' : 'Insights'}</button>)}</div></div></header>
      {msg && <div className={`rounded-xl p-3 text-sm ${/could not/i.test(msg) ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

      {year === now.getFullYear() && !todayPixel && <div className="card p-4 flex flex-wrap items-center gap-3"><b className="text-sm">How is today?</b><div className="flex gap-1.5">{MOODS.map(m => <button key={m.val} title={m.label} className="text-2xl hover:scale-125 transition-transform" onClick={async () => { const { error } = await supabase.from('pixel_days').upsert({ user_id: userId, date: todayK, mood: m.val, color: m.color }, { onConflict: 'user_id,date' }); if (!error) { await load(); emitChange() } }}>{m.emoji}</button>)}</div><button className="text-xs text-teal-600 font-semibold ml-auto" onClick={() => pick(todayK)}>Add details →</button></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Days logged', String(stats.n), `of ${year % 4 === 0 ? 366 : 365}`], ['Average mood', stats.n ? moodOf(Math.round(stats.mean)).emoji + ' ' + stats.mean.toFixed(1) : '—', stats.n ? moodOf(Math.round(stats.mean)).label : ''], ['Current streak', stats.current + ' days', ''], ['Longest streak', stats.longest + ' days', '']].map(([l, v, s]) => <div key={l} className="card p-4"><div className="text-[11px] font-semibold text-gray-400 uppercase">{l}</div><div className="text-xl font-bold mt-1">{v}</div><div className="text-[11px] text-gray-400">{s}</div></div>)}
      </div>

      {view === 'year' ? (
        <div className="card p-4 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="flex items-center gap-1 mb-1 pl-9">{Array.from({ length: 31 }, (_, i) => <div key={i} className="flex-1 text-center text-[9px] text-gray-300">{i + 1}</div>)}</div>
            {MONTHS.map((mn, m) => { const dim = new Date(year, m + 1, 0).getDate(); return (
              <div key={mn} className="flex items-center gap-1 mb-1"><div className="w-8 text-[11px] font-semibold text-gray-400">{mn}</div>
                {Array.from({ length: 31 }, (_, i) => { if (i >= dim) return <div key={i} className="flex-1 aspect-square" />; const k = key(year, m, i + 1), p = pixels[k], future = k > todayK
                  return <button key={i} onClick={() => !future && pick(k)} disabled={future} title={`${k}${p ? ' · ' + moodOf(p.mood).label : ''}`} className={`flex-1 aspect-square rounded-[4px] transition-transform hover:scale-125 ${k === todayK ? 'ring-2 ring-blue-400 ring-offset-1' : ''} ${selected === k ? 'ring-2 ring-gray-800' : ''}`} style={{ background: p ? moodOf(p.mood).color : future ? '#F9FAFB' : '#EEF0F4' }} /> })}</div>) })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-gray-500">{MOODS.map(m => <span key={m.val} className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: m.color }} />{m.emoji} {m.label}</span>)}</div>
        </div>
      ) : stats.n < 7 ? <div className="card p-8 text-center text-sm text-gray-500">Log at least 7 days to see insights. You have {stats.n}.</div> : (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4"><div className="font-bold text-sm mb-3">How your days felt</div><div className="flex items-center gap-4"><Donut size={120} center={stats.mean.toFixed(1)} slices={stats.dist.filter(d => d.n).map(d => ({ value: d.n, color: d.color, label: d.label }))} /><div className="text-xs space-y-1">{stats.dist.map(d => <div key={d.val} className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: d.color }} />{d.emoji} {d.label} · <b>{d.n}</b> ({stats.n ? Math.round(d.n / stats.n * 100) : 0}%)</div>)}</div></div></div>
            <div className="card p-4"><div className="font-bold text-sm mb-2">Average mood by month</div><LineChart points={stats.byMonth.filter(m => m.value > 0)} max={5} color="#8B5CF6" height={130} unit="" /></div>
          </div>
          <div className="card p-4"><div className="font-bold text-sm mb-3">Best and hardest weekday</div><div className="flex items-end gap-2 h-24">{stats.byDow.map(d => <div key={d.label} className="flex-1 flex flex-col items-center gap-1"><div className="w-full rounded-t-md" style={{ height: `${d.avg / 5 * 100}%`, background: moodOf(Math.round(d.avg)).color }} /><div className="text-[10px] text-gray-400">{d.label}</div><div className="text-[10px] font-semibold">{d.avg.toFixed(1)}</div></div>)}</div></div>
          <div className="card p-4 space-y-2"><div className="font-bold text-sm">What goes with your good and bad days</div>
            {stats.tagStats.length === 0 && <div className="text-xs text-gray-400">Add tags (like Exercise or Poor sleep) to your days — insights appear once a tag has at least 3 days.</div>}
            {stats.tagStats.slice(0, 3).filter(t => t.diff > 0.2).map(t => <div key={t.tag} className="text-sm">⬆️ Days tagged <b>{t.tag}</b> are <b>{t.diff.toFixed(1)}</b> points happier than other days ({t.n} days).</div>)}
            {stats.tagStats.slice(-3).reverse().filter(t => t.diff < -0.2).map(t => <div key={t.tag} className="text-sm">⬇️ Days tagged <b>{t.tag}</b> are <b>{Math.abs(t.diff).toFixed(1)}</b> points lower than other days ({t.n} days).</div>)}
            {stats.busyMood !== null && stats.quietMood !== null && <div className="text-sm">✅ On days you finish 3+ tasks your mood averages <b>{stats.busyMood.toFixed(1)}</b>, versus <b>{stats.quietMood.toFixed(1)}</b> on days with none.</div>}
            <p className="text-[11px] text-gray-400">These are patterns in your own entries, not causes — a tag may be a result of a good day, not the reason for it.</p></div>
        </div>)}

      {selected && draft && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg shadow-xl my-auto space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start"><div><h2 className="font-bold">{new Date(selected + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2><p className="text-[11px] text-gray-400">{done[selected] ? `${done[selected]} task${done[selected] > 1 ? 's' : ''} completed this day` : 'No tasks completed this day'}</p></div><button onClick={() => setSelected(null)} className="text-gray-400" aria-label="Close">✕</button></div>
            <div className="flex justify-between">{MOODS.map(m => <button key={m.val} onClick={() => setDraft({ ...draft, mood: m.val })} className={`flex-1 py-2 rounded-xl text-center transition-all ${draft.mood === m.val ? 'ring-2 ring-gray-700 scale-105' : 'opacity-70'}`} style={{ background: m.color + '55' }}><div className="text-2xl">{m.emoji}</div><div className="text-[10px] font-semibold">{m.label}</div></button>)}</div>
            <div><div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Energy</div><div className="flex gap-1.5">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setDraft({ ...draft, energy: draft.energy === n ? 0 : n })} className={`text-xl ${n <= draft.energy ? '' : 'opacity-20'}`} aria-label={`Energy ${n}`}>⚡</button>)}</div></div>
            <div><div className="text-[10px] font-bold uppercase text-gray-400 mb-1">What shaped the day?</div><div className="flex flex-wrap gap-1.5">{allTags.map(t => <button key={t} onClick={() => setDraft({ ...draft, tags: draft.tags.includes(t) ? draft.tags.filter((x: string) => x !== t) : [...draft.tags, t] })} className={`text-xs px-2.5 py-1 rounded-full font-semibold ${draft.tags.includes(t) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>{t}</button>)}
              <input className="text-xs px-2.5 py-1 rounded-full bg-gray-50 border border-dashed border-gray-200 w-24 outline-none" placeholder="+ new tag" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { setDraft({ ...draft, tags: [...draft.tags, newTag.trim()] }); setNewTag('') } }} /></div></div>
            <textarea rows={3} className="inp w-full text-sm" placeholder="A line about the day…" value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} />
            {dayEntries.length > 0 && <div className="rounded-xl bg-gray-50 p-3 text-xs space-y-1"><div className="font-bold text-gray-500">Written this day</div>{dayEntries.map(e => <Link key={e.id} href={e.kind === 'diary' ? `/diary?date=${selected}` : `/journal?date=${selected}`} className="block text-teal-600 font-semibold">{e.kind === 'diary' ? '🔒 Diary' : '📔 Journal'}{e.kind === 'journal' && e.title ? ` · ${e.title}` : ''} →</Link>)}</div>}
            <div className="flex gap-2"><button className="btn-blue flex-1" onClick={save}>Save</button>{pixels[selected] && <button className="btn-gray text-red-600" onClick={clearDay}>Clear</button>}<Link href={`/journal?date=${selected}`} className="btn-gray text-center">Write</Link></div>
          </div>
        </div>)}
    </div>
  )
}
