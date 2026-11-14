'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { createTask, emitChange, onChange, todayStr } from '@/lib/planner'
import { PACE_STYLE, RES_CATEGORIES, RES_COLORS, STARTER_RESOLUTIONS, adjustmentAdvice, nextQuarter, quarterEnd, removeImage, resolutionPace, resolutionProgress, signedUrls, uploadImage } from '@/lib/growth'
import { loadProjectData, projectHealth, tasksOfProject } from '@/lib/projects'
import { computePnL, loadBiz, periodRange } from '@/lib/business'
import Modal, { Field } from '@/components/planner/Modal'

const YEAR_NOW = new Date().getFullYear()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const blank = (year: number) => ({ title: '', emoji: '🎯', target: '', why: '', category: 'Personal', quarter: 'Q4', year, due_date: '', color: RES_COLORS[0], progress_mode: 'manual', progress: 0, start_value: 0, current_value: 0, target_value: '', unit: '', link_project_id: '', link_business_id: '', cover_path: '' })

export default function ResolutionPage() {
  const [userId, setUserId] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [vision, setVision] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [businesses, setBusinesses] = useState<any[]>([])
  const [ctx, setCtx] = useState<{ projectPct: Record<string, number>; bizRevenue: Record<string, { actual: number; target: number }> }>({ projectPct: {}, bizRevenue: {} })
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'goals' | 'quarters' | 'board'>('goals')
  const [year, setYear] = useState(YEAR_NOW)
  const [cat, setCat] = useState('all')
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState<any>(null)
  const [msg, setMsg] = useState(''), [loading, setLoading] = useState(true)
  const today = todayStr()

  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 5000) }
  const fail = (e: any) => toast('Could not save: ' + (e?.message || 'error') + (/column|relation|vision_items|schema/.test(e?.message || '') ? ' — run lib/planner-upgrade-7.sql in Supabase first.' : ''))

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const [r, v, pd, bz] = await Promise.all([
      supabase.from('resolutions').select('*').eq('user_id', user.id).order('sort_order').order('created_at'),
      supabase.from('vision_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      loadProjectData(supabase, user.id),
      supabase.from('businesses').select('id,name,emoji,monthly_target').eq('user_id', user.id).eq('status', 'active'),
    ])
    const list = r.data || []
    setRows(list); setVision(v.error ? [] : v.data || []); setBusinesses(bz.data || [])
    const prj = pd.projects || []
    setProjects(prj)
    const projectPct: Record<string, number> = {}
    prj.forEach((p: any) => { projectPct[p.id] = projectHealth(p, tasksOfProject(pd.todos, p.name), pd.milestones.filter((m: any) => m.project_id === p.id), 0, today).progress })
    const bizRevenue: Record<string, { actual: number; target: number }> = {}
    const linked = Array.from(new Set(list.filter((x: any) => x.progress_mode === 'business' && x.link_business_id).map((x: any) => x.link_business_id)))
    await Promise.all(linked.map(async (id: any) => { const d = await loadBiz(supabase, user.id, id); if (d.biz) { const pr = periodRange('month', new Date()); bizRevenue[id] = { actual: computePnL(d, pr.from, pr.to).revenue, target: Number(d.biz.monthly_target || 0) } } }))
    setCtx({ projectPct, bizRevenue })
    const paths = [...list.map((x: any) => x.cover_path), ...(v.data || []).map((x: any) => x.image_path)].filter(Boolean)
    setUrls(await signedUrls(paths))
    setLoading(false)
  }, [today])
  useEffect(() => { void load() }, [load])
  useEffect(() => onChange(() => { void load() }), [load])

  const view = useMemo(() => rows.filter(r => (r.year || YEAR_NOW) === year && (cat === 'all' || r.category === cat)).map(r => {
    const progress = resolutionProgress(r, ctx); return { ...r, _p: progress, _pace: resolutionPace(r, progress, today) }
  }), [rows, year, cat, ctx, today])
  const overall = view.length ? Math.round(view.reduce((s, r) => s + r._p, 0) / view.length) : 0
  const counts = view.reduce((m: Record<string, number>, r) => ({ ...m, [r._pace.state]: (m[r._pace.state] || 0) + 1 }), {})
  const cats = Array.from(new Set(rows.map(r => r.category).filter(Boolean)))

  async function save() {
    if (!form.title.trim()) return toast('Give the goal a title.')
    const row: any = { title: form.title.trim(), emoji: form.emoji || '🎯', target: form.target || null, why: form.why || null, category: form.category, quarter: form.quarter, year: Number(form.year) || YEAR_NOW, due_date: form.due_date || null, color: form.color, progress_mode: form.progress_mode, progress: Number(form.progress) || 0, start_value: Number(form.start_value) || 0, current_value: Number(form.current_value) || 0, target_value: form.target_value === '' || form.target_value == null ? null : Number(form.target_value), unit: form.unit || null, link_project_id: form.progress_mode === 'project' ? form.link_project_id || null : null, link_business_id: form.progress_mode === 'business' ? form.link_business_id || null : null, cover_path: form.cover_path || null }
    const q = form.id ? supabase.from('resolutions').update(row).eq('id', form.id).eq('user_id', userId) : supabase.from('resolutions').insert({ ...row, user_id: userId, sort_order: rows.length })
    const { error } = await q
    if (error) return fail(error)
    setForm(null); await load(); emitChange(); toast('Saved.')
  }
  async function patch(id: string, values: any, quiet = true) {
    const { error } = await supabase.from('resolutions').update(values).eq('id', id).eq('user_id', userId)
    if (error) return fail(error)
    await load(); emitChange(); if (!quiet) toast('Saved.')
  }
  async function remove(r: any) {
    if (!confirm(`Delete “${r.title}”?`)) return
    const { error } = await supabase.from('resolutions').delete().eq('id', r.id).eq('user_id', userId)
    if (error) return fail(error)
    if (r.cover_path) void removeImage(r.cover_path)
    setOpen(null); await load()
  }
  async function importStarter() {
    const { error } = await supabase.from('resolutions').insert(STARTER_RESOLUTIONS.map((s, i) => ({ ...s, user_id: userId, year, color: RES_COLORS[i % RES_COLORS.length], sort_order: i, due_date: quarterEnd(year, s.quarter), progress: 0 })))
    if (error) return fail(error)
    await load(); toast('Your 12 goals for ' + year + ' are in. Set progress and targets on each.')
  }
  async function checkIn(r: any, value: number, note: string) {
    const log = [...(Array.isArray(r.check_log) ? r.check_log : []), { date: today, value, note }].slice(-60)
    if (r.progress_mode === 'metric') await patch(r.id, { current_value: value, check_log: log }, false)
    else await patch(r.id, { progress: value, check_log: log }, false)
  }
  async function addWeeklyTask(r: any) {
    const { error } = await createTask({ title: `Weekly check-in: ${r.title}`, category: 'Personal', tags: [r.title], scheduled_date: today, repeat_type: 'weekly', priority: 'medium', notes: `Resolution check: update progress and plan this week's step. Target: ${r.target || ''}` } as any)
    if (error) return toast('Could not create the task: ' + error.message)
    emitChange(); toast('Weekly check-in added to your tasks and calendar.')
  }
  async function extend(r: any) {
    const n = nextQuarter(r.quarter || 'Q4', Number(r.year) || YEAR_NOW)
    await patch(r.id, { quarter: n.q, year: n.year, due_date: quarterEnd(n.year, n.q) }, false)
  }
  async function visionUpload(files: FileList | null) {
    if (!files?.length) return
    try {
      for (const f of Array.from(files)) { const path = await uploadImage(userId, f, 'vision'); const { error } = await supabase.from('vision_items').insert({ user_id: userId, image_path: path, title: '' }); if (error) throw error }
      await load(); toast('Added to your vision board.')
    } catch (e: any) { fail(e) }
  }
  async function coverUpload(files: FileList | null) {
    if (!files?.[0]) return
    try { const path = await uploadImage(userId, files[0], 'vision'); setForm((f: any) => ({ ...f, cover_path: path })); setUrls(u => ({ ...u })); const s = await signedUrls([path]); setUrls(u => ({ ...u, ...s })) } catch (e: any) { fail(e) }
  }
  const fileRef = useRef<HTMLInputElement>(null)

  if (loading) return <div className="card p-10 text-center text-gray-500">Loading…</div>
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold">Resolutions {year} 🗺️</h1><p className="text-sm text-gray-500 mt-0.5">Goals with a deadline, a pace check, and progress that can update itself from your projects and businesses.</p></div>
        <div className="ml-auto flex items-center gap-2">
          <select className="sel text-xs" value={year} onChange={e => setYear(Number(e.target.value))}>{[YEAR_NOW - 1, YEAR_NOW, YEAR_NOW + 1].map(y => <option key={y}>{y}</option>)}</select>
          <button className="btn-blue btn-sm flex items-center gap-1" onClick={() => setForm(blank(year))}><Plus size={15} /> Goal</button>
        </div>
      </header>
      {msg && <div className={`rounded-xl p-3 text-sm ${/could not/i.test(msg) ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

      <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div><div className="text-3xl font-bold text-blue-500">{overall}%</div><div className="text-[11px] text-gray-400">overall · {view.length} goals</div></div>
        <div className="flex-1 min-w-[200px]"><div className="h-3 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-500" style={{ width: `${overall}%` }} /></div></div>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">{Object.entries(counts).map(([k, n]) => <span key={k} className={`px-2 py-0.5 rounded-full ${PACE_STYLE[k].cls}`}>{String(n)} {PACE_STYLE[k].label}</span>)}</div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{([['goals', 'Goals'], ['quarters', 'By quarter'], ['board', 'Vision board']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md font-semibold ${tab === k ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{l}</button>)}</div>
        {tab !== 'board' && cats.length > 1 && <select className="sel text-xs" value={cat} onChange={e => setCat(e.target.value)}><option value="all">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}</select>}
      </div>

      {rows.length === 0 && tab !== 'board' && (
        <div className="card p-8 text-center space-y-3"><div className="text-4xl">🗺️</div><div className="font-bold">No resolutions yet</div><p className="text-sm text-gray-500 max-w-md mx-auto">Add a goal, or start with your 12 goals for {year} and edit them.</p>
          <div className="flex justify-center gap-2"><button className="btn-blue btn-sm" onClick={importStarter}>Start with my {year} list</button><button className="btn-gray btn-sm" onClick={() => setForm(blank(year))}>Add my own</button></div></div>)}

      {tab === 'goals' && <div className="space-y-2">{view.map(r => <GoalCard key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} url={urls[r.cover_path]} projects={projects} businesses={businesses}
        onEdit={() => setForm({ ...blank(year), ...r, due_date: r.due_date || '', target_value: r.target_value ?? '', link_project_id: r.link_project_id || '', link_business_id: r.link_business_id || '' })}
        onDelete={() => remove(r)} onCheckIn={(v, n) => checkIn(r, v, n)} onWeekly={() => addWeeklyTask(r)} onExtend={() => extend(r)} onPatch={(v) => patch(r.id, v, false)} onShrink={() => setForm({ ...blank(year), ...r, due_date: r.due_date || '', target_value: r.target_value ?? '', link_project_id: r.link_project_id || '', link_business_id: r.link_business_id || '' })} />)}</div>}

      {tab === 'quarters' && <div className="grid md:grid-cols-2 gap-3">{['Q1', 'Q2', 'Q3', 'Q4'].map(q => { const items = view.filter(r => r.quarter === q); return (
        <div key={q} className="card p-4"><div className="flex justify-between mb-2"><b>{q} {year}</b><span className="text-xs text-gray-400">{items.length ? Math.round(items.reduce((s, r) => s + r._p, 0) / items.length) : 0}%</span></div>
          {items.length === 0 ? <div className="text-xs text-gray-400">No goals due this quarter.</div> : items.map(r => <div key={r.id} className="py-1.5 border-t border-gray-50 first:border-0"><div className="flex justify-between text-sm"><span className="truncate">{r.emoji} {r.title}</span><span className={`text-[10px] font-semibold px-2 rounded-full ${PACE_STYLE[r._pace.state].cls}`}>{r._p}%</span></div><div className="h-1.5 rounded-full bg-gray-100 mt-1"><div className="h-1.5 rounded-full" style={{ width: `${r._p}%`, background: r.color }} /></div></div>)}</div>) })}</div>}

      {tab === 'board' && <div className="space-y-3">
        <div className="flex items-center gap-2"><p className="text-xs text-gray-500 flex-1">Pictures of the life you are building. Goal covers show up here automatically.</p><button className="btn-blue btn-sm flex items-center gap-1" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> Add pictures</button><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { void visionUpload(e.target.files); e.target.value = '' }} /></div>
        <div className="columns-2 md:columns-3 gap-3 [&>*]:mb-3">
          {view.filter(r => r.cover_path && urls[r.cover_path]).map(r => <div key={r.id} className="card overflow-hidden break-inside-avoid"><div className="relative"><img src={urls[r.cover_path]} alt={r.title} className="w-full" /><div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white"><div className="font-semibold text-sm">{r.emoji} {r.title}</div><div className="h-1 rounded-full bg-white/30 mt-1.5"><div className="h-1 rounded-full bg-white" style={{ width: `${r._p}%` }} /></div></div></div></div>)}
          {vision.map(v => <div key={v.id} className="card overflow-hidden break-inside-avoid">{urls[v.image_path] && <img src={urls[v.image_path]} alt={v.title || 'Vision'} className="w-full" />}
            <div className="p-2 flex items-center gap-2"><input className="flex-1 text-xs bg-transparent outline-none" placeholder="Caption…" defaultValue={v.caption || ''} onBlur={async e => { if (e.target.value !== (v.caption || '')) { await supabase.from('vision_items').update({ caption: e.target.value }).eq('id', v.id).eq('user_id', userId) } }} />
              <button aria-label="Delete" className="text-gray-300 hover:text-red-500" onClick={async () => { if (confirm('Remove this picture?')) { await supabase.from('vision_items').delete().eq('id', v.id).eq('user_id', userId); void removeImage(v.image_path); await load() } }}><Trash2 size={13} /></button></div></div>)}
        </div>
        {vision.length === 0 && !view.some(r => r.cover_path) && <div className="card p-8 text-center text-sm text-gray-500">Your board is empty. Add pictures of places, people, and things you are working toward.</div>}
      </div>}

      {form && (
        <Modal title={form.id ? 'Edit goal' : 'New goal'} onClose={() => setForm(null)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Goal" className="col-span-2"><input className="inp w-full" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Reach HSK 5" /></Field>
            <Field label="Emoji"><input className="inp w-full" value={form.emoji} onChange={e => set('emoji', e.target.value)} /></Field>
            <Field label="Category"><select className="sel w-full" value={form.category} onChange={e => set('category', e.target.value)}>{RES_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="What does success look like?" className="col-span-2"><input className="inp w-full" value={form.target || ''} onChange={e => set('target', e.target.value)} /></Field>
            <Field label="Why does it matter?" className="col-span-2"><textarea rows={2} className="inp w-full" value={form.why || ''} onChange={e => set('why', e.target.value)} /></Field>
            <Field label="Quarter"><select className="sel w-full" value={form.quarter} onChange={e => setForm((f: any) => ({ ...f, quarter: e.target.value, due_date: '' }))}>{['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q}>{q}</option>)}</select></Field>
            <Field label="Exact deadline (optional)"><input type="date" className="inp w-full" value={form.due_date} onChange={e => set('due_date', e.target.value)} /></Field>
            <Field label="Colour" className="col-span-2"><div className="flex gap-2">{RES_COLORS.map(c => <button key={c} onClick={() => set('color', c)} aria-label={c} className={`w-7 h-7 rounded-full ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ background: c }} />)}</div></Field>
            <Field label="How is progress measured?" className="col-span-2">
              <div className="flex flex-wrap gap-1.5 text-xs">{([['manual', 'I update it myself'], ['metric', 'A number (e.g. 3 of 5)'], ['project', 'From a project'], ['business', 'From business revenue']] as const).map(([k, l]) => <button key={k} onClick={() => set('progress_mode', k)} className={`px-3 py-1.5 rounded-full font-semibold ${form.progress_mode === k ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>{l}</button>)}</div></Field>
            {form.progress_mode === 'metric' && <><Field label="Start value"><input type="number" className="inp w-full" value={form.start_value} onChange={e => set('start_value', e.target.value)} /></Field><Field label="Target value"><input type="number" className="inp w-full" value={form.target_value} onChange={e => set('target_value', e.target.value)} /></Field><Field label="Now"><input type="number" className="inp w-full" value={form.current_value} onChange={e => set('current_value', e.target.value)} /></Field><Field label="Unit"><input className="inp w-full" placeholder="kg, books, HSK level…" value={form.unit} onChange={e => set('unit', e.target.value)} /></Field></>}
            {form.progress_mode === 'project' && <Field label="Project" className="col-span-2" hint="Progress = that project’s tasks and milestones, live."><select className="sel w-full" value={form.link_project_id} onChange={e => set('link_project_id', e.target.value)}><option value="">Choose…</option>{projects.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}</select></Field>}
            {form.progress_mode === 'business' && <Field label="Business" className="col-span-2" hint="Progress = this month’s revenue ÷ the business’s monthly sales target (set in Business → Settings)."><select className="sel w-full" value={form.link_business_id} onChange={e => set('link_business_id', e.target.value)}><option value="">Choose…</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}</select></Field>}
            {form.progress_mode === 'manual' && <Field label={`Progress now: ${form.progress}%`} className="col-span-2"><input type="range" min={0} max={100} className="w-full" value={form.progress} onChange={e => set('progress', e.target.value)} /></Field>}
            <Field label="Cover picture (for the vision board)" className="col-span-2">
              <div className="flex items-center gap-3">{form.cover_path && urls[form.cover_path] && <img src={urls[form.cover_path]} alt="" className="w-16 h-16 rounded-lg object-cover" />}<label className="btn-gray btn-sm cursor-pointer inline-flex items-center gap-1"><ImagePlus size={14} /> {form.cover_path ? 'Change' : 'Upload'}<input type="file" accept="image/*" className="hidden" onChange={e => coverUpload(e.target.files)} /></label>{form.cover_path && <button className="text-xs text-gray-400" onClick={() => set('cover_path', '')}>Remove</button>}</div></Field>
          </div>
          <div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={save}>Save</button><button className="btn-gray flex-1" onClick={() => setForm(null)}>Cancel</button></div>
        </Modal>)}
    </div>
  )
}

function GoalCard({ r, open, onToggle, url, projects, businesses, onEdit, onDelete, onCheckIn, onWeekly, onExtend, onShrink, onPatch }: any) {
  const [val, setVal] = useState<string>(r.progress_mode === 'metric' ? String(r.current_value ?? 0) : String(r._p))
  const [note, setNote] = useState('')
  const p = r._pace, advice = adjustmentAdvice(r, r._p, p)
  const mode = r.progress_mode
  const curMonth = new Date().toISOString().slice(0, 7)
  const targets = (r.monthly_targets && typeof r.monthly_targets === 'object') ? r.monthly_targets : {}
  const linkName = mode === 'project' ? projects.find((x: any) => x.id === r.link_project_id)?.name : mode === 'business' ? businesses.find((x: any) => x.id === r.link_business_id)?.name : ''
  const log = Array.isArray(r.check_log) ? [...r.check_log].reverse().slice(0, 5) : []
  const months = Array.from({ length: 3 }, (_, i) => { const d = new Date(new Date().getFullYear(), new Date().getMonth() + i, 1); return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()] } })
  return (
    <div className={`card overflow-hidden ${open ? 'ring-2 ring-blue-300' : ''}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={onToggle}>
        {url ? <img src={url} alt="" className="w-11 h-11 rounded-xl object-cover" /> : <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl" style={{ background: `${r.color}22` }}>{r.emoji}</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><b className="text-sm">{r.title}</b><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{r.quarter}</span><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PACE_STYLE[p.state].cls}`}>{PACE_STYLE[p.state].label}</span></div>
          <div className="relative h-2 rounded-full bg-gray-100 mt-1.5"><div className="h-2 rounded-full transition-all" style={{ width: `${r._p}%`, background: r.color }} />{p.state !== 'done' && <div className="absolute top-[-2px] w-0.5 h-3 bg-gray-400/70" style={{ left: `${p.expected}%` }} title={`Where you’d be on a steady pace: ${p.expected}%`} />}</div>
        </div>
        <div className="text-right"><div className="font-bold" style={{ color: r.color }}>{r._p}%</div><div className="text-[10px] text-gray-400">{p.daysLeft >= 0 ? `${p.daysLeft}d left` : 'past due'}</div></div>
      </button>
      {open && (
        <div className="border-t border-gray-100 bg-gray-50/60 p-4 space-y-4 text-sm">
          {r.target && <div className="text-xs text-gray-600">🎯 <b>Success:</b> {r.target}</div>}
          {r.why && <div className="text-xs text-gray-600">💛 <b>Why:</b> {r.why}</div>}
          {linkName && <div className="text-xs text-gray-500">Progress is read live from {mode === 'project' ? 'project' : 'business'} <b>{linkName}</b>.</div>}

          {(mode === 'manual' || mode === 'metric') && (
            <div className="rounded-xl bg-white p-3 space-y-2"><div className="text-xs font-bold text-gray-500">Check in</div>
              <div className="flex flex-wrap items-center gap-2">
                {mode === 'manual' ? <><input type="range" min={0} max={100} value={val} onChange={e => setVal(e.target.value)} className="flex-1 min-w-[140px]" /><b className="w-10 text-right">{val}%</b></>
                  : <><input type="number" className="inp w-28" value={val} onChange={e => setVal(e.target.value)} /><span className="text-xs text-gray-400">{r.unit} of {r.target_value} {r.unit}</span></>}
                <input className="inp flex-1 min-w-[140px] text-xs" placeholder="What did you do? (optional)" value={note} onChange={e => setNote(e.target.value)} />
                <button className="btn-blue btn-sm" onClick={() => { onCheckIn(Number(val), note); setNote('') }}>Save</button></div>
              {log.length > 0 && <div className="text-[11px] text-gray-400 space-y-0.5">{log.map((l: any, i: number) => <div key={i}>{l.date} · {mode === 'manual' ? l.value + '%' : l.value + ' ' + (r.unit || '')}{l.note ? ` — ${l.note}` : ''}</div>)}</div>}</div>)}

          <div className="rounded-xl bg-white p-3 space-y-2"><div className="text-xs font-bold text-gray-500">Monthly plan</div>
            {months.map(m => <div key={m.key} className="flex items-center gap-2"><span className="w-10 text-xs font-semibold text-gray-400">{m.label}</span><input className="inp flex-1 text-xs" placeholder={m.key === curMonth ? 'This month’s step…' : 'Plan…'} defaultValue={targets[m.key] || ''} onBlur={e => { if ((targets[m.key] || '') !== e.target.value) onPatch({ monthly_targets: { ...targets, [m.key]: e.target.value } }) }} /></div>)}</div>

          <div className="rounded-xl bg-white p-3 space-y-2"><div className="text-xs font-bold text-gray-500">Plan check <span className="font-normal text-gray-400">(simple rules, not AI)</span></div>
            <div className="text-xs text-gray-600">By now you would be at about <b>{p.expected}%</b> on a steady pace; you are at <b>{r._p}%</b>.</div>
            {advice.map(a => <div key={a.key} className="text-xs">💡 {a.text}</div>)}
            {p.state !== 'done' && <div className="flex flex-wrap gap-2 pt-1"><button className="btn-gray btn-sm text-xs" onClick={onWeekly}>+ Weekly check-in task</button>{(p.state === 'behind' || p.state === 'at-risk' || p.state === 'overdue') && <><button className="btn-gray btn-sm text-xs" onClick={onExtend}>Move deadline +1 quarter</button><button className="btn-gray btn-sm text-xs" onClick={onShrink}>Adjust target…</button></>}</div>}</div>

          <div className="flex gap-2"><button className="btn-gray btn-sm text-xs flex items-center gap-1" onClick={onEdit}><Pencil size={13} /> Edit</button><button className="btn-gray btn-sm text-xs text-red-600 flex items-center gap-1" onClick={onDelete}><Trash2 size={13} /> Delete</button></div>
        </div>)}
    </div>
  )
}
