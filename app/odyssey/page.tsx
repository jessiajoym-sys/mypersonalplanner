'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Star, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { createTask, emitChange } from '@/lib/planner'
import { removeImage, signedUrls, uploadImage } from '@/lib/growth'

const PLAN_TYPES = [
  { type: 'A', label: 'Plan A', sub: 'The path I am on', emoji: '🎯', color: '#5B7FFF' },
  { type: 'B', label: 'Plan B', sub: 'If A is gone, what else?', emoji: '🌿', color: '#22C55E' },
  { type: 'C', label: 'Plan C', sub: 'The bold, wild one', emoji: '🔥', color: '#F97316' },
]
const START = new Date().getFullYear()
const emptyPlan = () => ({ title: '', description: '', perfect_day: '', confidence: 6, excitement: 7, resources: 5, notes: '', pros: [] as string[], cons: [] as string[], timeline: Array.from({ length: 6 }, (_, i) => ({ year: START + i, milestone: '' })), image_paths: [] as string[] })
const score = (p: any) => Math.round(((p.confidence + p.excitement + p.resources) / 30) * 100)

export default function OdysseyPage() {
  const [userId, setUserId] = useState('')
  const [plans, setPlans] = useState<Record<string, any>>({})
  const [active, setActive] = useState('A')
  const [view, setView] = useState<'plan' | 'compare'>('plan')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>(emptyPlan())
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [newPro, setNewPro] = useState(''), [newCon, setNewCon] = useState('')
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 5000) }
  const fail = (e: any) => toast('Could not save: ' + (e?.message || 'error') + (/column|schema/.test(e?.message || '') ? ' — run lib/planner-upgrade-7.sql in Supabase first.' : ''))

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase.from('odyssey_plans').select('*').eq('user_id', user.id).order('created_at')
    const map: Record<string, any> = {}
    ;(data || []).forEach(p => { map[p.plan_type] = { ...p, image_paths: Array.isArray(p.image_paths) ? p.image_paths : [] } })   // keep the oldest row if duplicates exist
    setPlans(map)
    setUrls(await signedUrls(Object.values(map).flatMap((p: any) => p.image_paths)))
  }, [])
  useEffect(() => { void load() }, [load])

  const pt = PLAN_TYPES.find(p => p.type === active)!
  const plan = plans[active]

  async function save(values: any) {
    const row = { ...values, plan_type: active, user_id: userId, updated_at: new Date().toISOString() }
    delete row.id; delete row.created_at
    const { error } = plan?.id ? await supabase.from('odyssey_plans').update(row).eq('id', plan.id).eq('user_id', userId) : await supabase.from('odyssey_plans').insert(row)
    if (error) { fail(error); return false }
    await load(); return true
  }
  async function saveForm() {
    if (!form.title.trim()) return toast('Give this path a title.')
    if (await save({ ...form, image_paths: plan?.image_paths || [] })) { setEditing(false); toast('Saved.') }
  }
  async function makeMain() {
    await Promise.all(Object.values(plans).filter((p: any) => p.id && p.is_main && p.plan_type !== active).map((p: any) => supabase.from('odyssey_plans').update({ is_main: false }).eq('id', p.id)))
    if (await save({ ...plan, is_main: true })) toast(`${pt.label} is now your main path.`)
  }
  async function addImages(files: FileList | null) {
    if (!files?.length) return
    if (!plan?.id) return toast('Save the plan first, then add pictures.')
    try {
      const added: string[] = []
      for (const f of Array.from(files).slice(0, 8 - plan.image_paths.length)) added.push(await uploadImage(userId, f, 'odyssey'))
      if (await save({ ...plan, image_paths: [...plan.image_paths, ...added] })) toast('Pictures added.')
    } catch (e: any) { fail(e) }
  }
  async function dropImage(path: string) {
    if (!confirm('Remove this picture?')) return
    void removeImage(path); await save({ ...plan, image_paths: plan.image_paths.filter((p: string) => p !== path) })
  }
  async function toTask(t: any) {
    const { error } = await createTask({ title: `${pt.label} ${t.year}: ${t.milestone}`, category: 'Personal', tags: [`Odyssey ${active}`], deadline: `${t.year}-12-31`, scheduled_date: `${t.year}-12-31`, priority: 'medium', notes: `From my Odyssey ${pt.label}: ${plan.title}` } as any)
    if (error) return toast('Could not create task: ' + error.message)
    emitChange(); toast('Added as a task with a deadline of 31 Dec ' + t.year + '.')
  }
  const startEdit = () => { setForm(plan ? { ...emptyPlan(), ...plan, timeline: plan.timeline?.length ? plan.timeline : emptyPlan().timeline } : emptyPlan()); setEditing(true) }
  const Slider = ({ k, label }: { k: string; label: string }) => <label className="block text-xs font-semibold text-gray-500">{label}: <b>{form[k]}/10</b><input type="range" min={1} max={10} className="w-full" value={form[k]} onChange={e => setForm({ ...form, [k]: Number(e.target.value) })} /></label>

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header className="flex flex-wrap items-center gap-3"><div><h1 className="text-2xl font-bold">Odyssey Plan ✨</h1><p className="text-sm text-gray-500 mt-0.5">Three possible lives for the next 5 years. Imagine each one fully, then compare.</p></div>
        <div className="ml-auto flex rounded-lg bg-gray-100 p-0.5 text-xs">{(['plan', 'compare'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md font-semibold capitalize ${view === v ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{v === 'plan' ? 'My plans' : 'Compare'}</button>)}</div></header>
      {msg && <div className={`rounded-xl p-3 text-sm ${/could not/i.test(msg) ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

      <div className="grid grid-cols-3 gap-3">{PLAN_TYPES.map(p => { const x = plans[p.type]; return (
        <button key={p.type} onClick={() => { setActive(p.type); setEditing(false); setView('plan') }} className={`card p-3 text-left transition-all ${active === p.type && view === 'plan' ? 'ring-2' : ''}`} style={active === p.type && view === 'plan' ? { borderColor: p.color, boxShadow: `0 0 0 2px ${p.color}` } : {}}>
          <div className="flex items-center gap-1.5"><span className="text-xl">{p.emoji}</span><b className="text-sm">{p.label}</b>{x?.is_main && <Star size={13} className="text-amber-400 fill-amber-400" />}</div>
          <div className="text-[11px] text-gray-400">{p.sub}</div><div className="text-xs font-semibold mt-1 truncate">{x?.title || 'Not written yet'}</div>
          {x && <div className="h-1.5 rounded-full bg-gray-100 mt-2"><div className="h-1.5 rounded-full" style={{ width: `${score(x)}%`, background: p.color }} /></div>}</button>) })}</div>

      {view === 'compare' ? (
        <div className="card overflow-x-auto"><table className="w-full text-sm min-w-[560px]"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="p-3 text-left w-32" />{PLAN_TYPES.map(p => <th key={p.type} className="p-3 text-left">{p.emoji} {p.label}</th>)}</tr></thead><tbody>
          <tr className="border-t border-gray-50"><td className="p-3 text-xs font-semibold text-gray-400">Title</td>{PLAN_TYPES.map(p => <td key={p.type} className="p-3 font-semibold">{plans[p.type]?.title || '—'}</td>)}</tr>
          {([['confidence', 'Confidence'], ['excitement', 'Excitement'], ['resources', 'Resources']] as const).map(([k, l]) => <tr key={k} className="border-t border-gray-50"><td className="p-3 text-xs font-semibold text-gray-400">{l}</td>{PLAN_TYPES.map(p => <td key={p.type} className="p-3">{plans[p.type] ? <div className="flex items-center gap-2"><div className="flex-1 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full" style={{ width: `${plans[p.type][k] * 10}%`, background: p.color }} /></div><b className="text-xs w-6">{plans[p.type][k]}</b></div> : '—'}</td>)}</tr>)}
          <tr className="border-t border-gray-100 bg-gray-50"><td className="p-3 text-xs font-bold">Overall fit</td>{PLAN_TYPES.map(p => <td key={p.type} className="p-3 font-bold" style={{ color: p.color }}>{plans[p.type] ? score(plans[p.type]) + '%' : '—'}</td>)}</tr>
          <tr className="border-t border-gray-50"><td className="p-3 text-xs font-semibold text-gray-400">Pros / cons</td>{PLAN_TYPES.map(p => <td key={p.type} className="p-3 text-xs text-gray-500">{plans[p.type] ? `${(plans[p.type].pros || []).length} pros · ${(plans[p.type].cons || []).length} cons` : '—'}</td>)}</tr></tbody></table>
          <p className="text-[11px] text-gray-400 p-3">“Overall fit” is just the average of your three sliders — a conversation starter, not a verdict. Notice which one gets you most excited.</p></div>
      ) : editing ? (
        <div className="card p-5 space-y-4"><div className="font-bold">{pt.emoji} {pt.label} — describe this life</div>
          <label className="block text-xs font-semibold text-gray-500">Title<input className="inp w-full mt-1" placeholder="e.g. Master’s in China + travel creator" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
          <label className="block text-xs font-semibold text-gray-500">The idea in a few lines<textarea rows={2} className="inp w-full mt-1" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
          <label className="block text-xs font-semibold text-gray-500">One perfect day in 5 years — where are you, who is there, what do you do?<textarea rows={4} className="inp w-full mt-1" value={form.perfect_day || ''} onChange={e => setForm({ ...form, perfect_day: e.target.value })} /></label>
          <div><div className="text-xs font-semibold text-gray-500 mb-2">5-year timeline</div>{form.timeline.map((t: any, i: number) => <div key={i} className="flex items-center gap-2 mb-1.5"><span className="w-12 text-xs font-bold text-gray-400">{t.year}</span><input className="inp flex-1 text-xs" placeholder="Milestone…" value={t.milestone} onChange={e => { const tl = [...form.timeline]; tl[i] = { ...t, milestone: e.target.value }; setForm({ ...form, timeline: tl }) }} /></div>)}</div>
          <div className="grid sm:grid-cols-2 gap-4">{([['pros', 'Pros', newPro, setNewPro], ['cons', 'Cons', newCon, setNewCon]] as const).map(([k, l, v, setV]) => <div key={k}><div className="text-xs font-semibold text-gray-500 mb-1">{l}</div><div className="flex gap-1"><input className="inp text-xs flex-1" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { setForm({ ...form, [k]: [...form[k], v.trim()] }); setV('') } }} placeholder="Type and press Enter" /></div>
            {form[k].map((x: string, i: number) => <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-50"><span>{x}</span><button className="text-gray-300 hover:text-red-500" onClick={() => setForm({ ...form, [k]: form[k].filter((_: any, j: number) => j !== i) })}>✕</button></div>)}</div>)}</div>
          <div className="grid sm:grid-cols-3 gap-4"><Slider k="confidence" label="Confidence" /><Slider k="excitement" label="Excitement" /><Slider k="resources" label="Resources" /></div>
          <label className="block text-xs font-semibold text-gray-500">Notes<textarea rows={2} className="inp w-full mt-1" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="flex gap-2"><button className="btn-blue flex-1" onClick={saveForm}>Save</button><button className="btn-gray flex-1" onClick={() => setEditing(false)}>Cancel</button></div></div>
      ) : !plan ? (
        <div className="card p-8 text-center space-y-3"><div className="text-4xl">{pt.emoji}</div><div className="font-bold">{pt.label} is empty</div><p className="text-sm text-gray-500 max-w-md mx-auto">{pt.sub}. Write the title, one perfect day, a 5-year timeline, and score it.</p><button className="btn-blue btn-sm" onClick={startEdit}>Start {pt.label}</button></div>
      ) : (
        <div className="space-y-4">
          <div className="card p-5" style={{ borderTop: `4px solid ${pt.color}` }}>
            <div className="flex flex-wrap items-start gap-3"><div className="flex-1 min-w-[200px]"><div className="text-xs text-gray-400">{pt.emoji} {pt.label}{plan.is_main ? ' · ⭐ my main path' : ''}</div><h2 className="text-xl font-bold">{plan.title}</h2>{plan.description && <p className="text-sm text-gray-600 mt-1">{plan.description}</p>}</div>
              <div className="flex gap-2">{!plan.is_main && <button className="btn-gray btn-sm text-xs" onClick={makeMain}>⭐ Make main</button>}<button className="btn-gray btn-sm text-xs" onClick={startEdit}>Edit</button></div></div>
            <div className="grid grid-cols-3 gap-3 mt-4">{([['Confidence', plan.confidence], ['Excitement', plan.excitement], ['Resources', plan.resources]] as const).map(([l, v]) => <div key={l}><div className="flex justify-between text-xs"><span className="text-gray-500">{l}</span><b>{v}/10</b></div><div className="h-2 rounded-full bg-gray-100 mt-1"><div className="h-2 rounded-full" style={{ width: `${v * 10}%`, background: pt.color }} /></div></div>)}</div>
          </div>

          <div className="card p-4"><div className="flex items-center mb-2"><div className="font-bold text-sm">🖼️ Vision pictures</div><button className="ml-auto btn-gray btn-sm text-xs flex items-center gap-1" onClick={() => fileRef.current?.click()}><ImagePlus size={13} /> Add</button><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { void addImages(e.target.files); e.target.value = '' }} /></div>
            {plan.image_paths.length === 0 ? <div className="text-xs text-gray-400">Add pictures that show how this life looks and feels (up to 8).</div> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{plan.image_paths.map((p: string) => <div key={p} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100">{urls[p] && <img src={urls[p]} alt="" className="w-full h-full object-cover" />}<button aria-label="Remove" onClick={() => dropImage(p)} className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"><Trash2 size={12} /></button></div>)}</div>}</div>

          {plan.perfect_day && <div className="card p-4"><div className="font-bold text-sm mb-1">☀️ One perfect day</div><p className="text-sm text-gray-600 whitespace-pre-wrap">{plan.perfect_day}</p></div>}

          <div className="card p-4"><div className="font-bold text-sm mb-3">🛤️ Timeline</div>{(plan.timeline || []).map((t: any, i: number) => <div key={i} className="flex items-start gap-3 py-2 border-t border-gray-50 first:border-0"><div className="w-12 text-sm font-bold" style={{ color: pt.color }}>{t.year}</div><div className="flex-1 text-sm">{t.milestone || <span className="text-gray-300">—</span>}</div>{t.milestone && <button className="text-[11px] text-teal-600 font-semibold whitespace-nowrap" onClick={() => toTask(t)}>→ Make a task</button>}</div>)}</div>

          <div className="grid sm:grid-cols-2 gap-4">{([['pros', '👍 Pros'], ['cons', '⚠️ Cons']] as const).map(([k, l]) => <div key={k} className="card p-4"><div className="font-bold text-sm mb-2">{l}</div>{(plan[k] || []).length === 0 ? <div className="text-xs text-gray-400">None yet.</div> : (plan[k] as string[]).map((x, i) => <div key={i} className="text-sm py-1 border-t border-gray-50 first:border-0">{x}</div>)}</div>)}</div>
          {plan.notes && <div className="card p-4 text-sm text-gray-600 whitespace-pre-wrap">📝 {plan.notes}</div>}
        </div>)}
    </div>
  )
}
