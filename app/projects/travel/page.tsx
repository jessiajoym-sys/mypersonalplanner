'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CalendarDays, Check, Eye, Heart, MessageCircle, Plus, RefreshCw, Trash2 } from 'lucide-react'

type ContentItem = {
  id: string; title: string; platform: string; status: string; idea_date: string; scheduled_date?: string | null
  done_date?: string | null; notes?: string | null; script?: string | null; caption?: string | null
  published_url?: string | null; views?: number | null; likes?: number | null; comments?: number | null; saves?: number | null
}
const PLATFORMS = ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'Threads', 'Trip.com']
const STATUSES = ['idea', 'planning', 'in_progress', 'ready', 'posted']
const STATUS_LABELS: Record<string, string> = { idea: 'Idea', planning: 'Planning', in_progress: 'In progress', ready: 'Ready to post', posted: 'Posted' }
const blankForm = { title: '', platform: 'TikTok', status: 'idea', scheduled_date: '', notes: '', script: '', caption: '' }

export default function TravelContentPage() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [form, setForm] = useState(blankForm)
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<ContentItem | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void load() }, [])
  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data, error: loadError } = await supabase.from('content_ideas').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (loadError) setError(loadError.message)
    else setItems((data || []) as ContentItem[])
    setLoading(false)
  }

  async function saveIdea(event: React.FormEvent) {
    event.preventDefault()
    if (!form.title.trim() || !userId) return
    setBusy(true); setError(''); setNotice('')
    const { error: saveError } = await supabase.from('content_ideas').insert({
      user_id: userId, title: form.title.trim(), platform: form.platform, status: form.status,
      idea_date: new Date().toISOString().slice(0, 10), scheduled_date: form.scheduled_date || null,
      notes: form.notes || null, script: form.script || null, caption: form.caption || null,
    })
    setBusy(false)
    if (saveError) { setError(saveError.message.includes('column') ? 'The content fields are not in the database yet. Run the included planner-upgrade.sql in Supabase first.' : saveError.message); return }
    setForm(blankForm); setShowForm(false); setNotice('Content idea saved.'); await load()
  }

  async function updateItem(item: ContentItem, changes: Partial<ContentItem>) {
    setBusy(true); setError('')
    const next = { ...item, ...changes }
    const { error: updateError } = await supabase.from('content_ideas').update(changes).eq('id', item.id).eq('user_id', userId)
    setBusy(false)
    if (updateError) { setError(updateError.message); return }
    if (changes.status === 'posted' && item.status !== 'posted') {
      await supabase.from('daily_logs').insert({ user_id: userId, date: new Date().toISOString().slice(0, 10), type: 'accomplishment', category: 'Travel Content', content: `Posted: ${item.title}` })
    }
    setItems(current => current.map(row => row.id === item.id ? next : row))
    setSelected(next); setNotice(changes.status === 'posted' ? 'Marked as posted and added to today’s accomplishments.' : 'Content updated.')
  }

  async function deleteItem(item: ContentItem) {
    if (!window.confirm(`Delete “${item.title}”?`)) return
    const { error: deleteError } = await supabase.from('content_ideas').delete().eq('id', item.id).eq('user_id', userId)
    if (deleteError) { setError(deleteError.message); return }
    setItems(current => current.filter(row => row.id !== item.id)); setSelected(null)
  }

  const visible = useMemo(() => filter === 'all' ? items : items.filter(item => item.status === filter), [items, filter])
  const counts = useMemo(() => STATUSES.reduce((all, status) => ({ ...all, [status]: items.filter(item => item.status === status).length }), {} as Record<string, number>), [items])

  function localReview(item: ContentItem) {
    const text = `${item.title} ${item.script || ''} ${item.caption || ''}`.trim()
    const tips: string[] = []
    if (text.length < 100) tips.push('Add more context: who is this for, and what useful takeaway will they get?')
    if (!/\?|how|why|3 |top |guide|tips|review/i.test(text)) tips.push('Try a specific hook in the first line, such as a question, quick result, or clear promise.')
    if (!item.scheduled_date) tips.push('Choose a posting date so this idea has a next step.')
    if (!item.caption) tips.push('Draft a short caption and a clear call to action.')
    return tips.length ? tips : ['The draft has a clear starting point. Review the opening, audience fit, and factual details before posting.']
  }

  return <div className="max-w-6xl mx-auto space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Travel Content Studio</h1><p className="text-sm text-gray-500 mt-1">Plan ideas, scripts, publishing dates, and results in one place.</p></div><button onClick={() => { setShowForm(!showForm); setSelected(null) }} className="btn-blue btn-sm flex items-center gap-2"><Plus size={16} /> Add content</button></header>
    {error && <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</div>}{notice && <div className="rounded-xl bg-green-50 text-green-700 p-3 text-sm">{notice}</div>}
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{STATUSES.map(status => <button key={status} onClick={() => setFilter(filter === status ? 'all' : status)} className={`card p-4 text-left ${filter === status ? 'ring-2 ring-blue-400' : ''}`}><div className="text-xs text-gray-500">{STATUS_LABELS[status]}</div><div className="text-2xl font-bold mt-1">{counts[status] || 0}</div></button>)}</div>
    {showForm && <form onSubmit={saveIdea} className="card p-5 space-y-3"><h2 className="font-bold text-lg">New content idea</h2><div className="grid md:grid-cols-2 gap-3"><label className="text-xs font-semibold">Idea / working title<input required className="inp w-full mt-1" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. A quiet weekend in Hangzhou" /></label><label className="text-xs font-semibold">Platform<select className="sel w-full mt-1" value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}>{PLATFORMS.map(platform => <option key={platform}>{platform}</option>)}</select></label><label className="text-xs font-semibold">Status<select className="sel w-full mt-1" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label><label className="text-xs font-semibold">Planned post date<input type="date" className="inp w-full mt-1" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} /></label></div><label className="block text-xs font-semibold">Script / shot list<textarea className="inp w-full mt-1 min-h-24" value={form.script} onChange={e => setForm({ ...form, script: e.target.value })} placeholder="Opening hook, scenes, voiceover, ending…" /></label><label className="block text-xs font-semibold">Caption<textarea className="inp w-full mt-1 min-h-16" value={form.caption} onChange={e => setForm({ ...form, caption: e.target.value })} /></label><label className="block text-xs font-semibold">Notes<textarea className="inp w-full mt-1 min-h-16" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label><div className="flex gap-2"><button disabled={busy} className="btn-blue btn-sm">Save idea</button><button type="button" onClick={() => setShowForm(false)} className="btn-gray btn-sm">Cancel</button></div></form>}
    {selected && <section className="card p-5 space-y-4"><div className="flex justify-between gap-3"><div><div className="text-xs text-gray-500">{selected.platform} · {STATUS_LABELS[selected.status] || selected.status}</div><h2 className="text-lg font-bold mt-1">{selected.title}</h2></div><button aria-label="Close details" onClick={() => setSelected(null)} className="text-gray-400">×</button></div><div className="grid md:grid-cols-2 gap-3"><label className="text-xs font-semibold">Script<textarea className="inp w-full mt-1 min-h-28" value={selected.script || ''} onChange={e => setSelected({ ...selected, script: e.target.value })} /></label><label className="text-xs font-semibold">Caption<textarea className="inp w-full mt-1 min-h-28" value={selected.caption || ''} onChange={e => setSelected({ ...selected, caption: e.target.value })} /></label></div><div className="grid md:grid-cols-2 gap-3"><label className="text-xs font-semibold">Post URL<input className="inp w-full mt-1" value={selected.published_url || ''} onChange={e => setSelected({ ...selected, published_url: e.target.value })} /></label><label className="text-xs font-semibold">Planned date<input type="date" className="inp w-full mt-1" value={selected.scheduled_date || ''} onChange={e => setSelected({ ...selected, scheduled_date: e.target.value })} /></label></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{(['views','likes','comments','saves'] as const).map((field, i) => <label key={field} className="text-xs font-semibold">{[<Eye size={14} key="v" />, <Heart size={14} key="l" />, <MessageCircle size={14} key="c" />, <Check size={14} key="s" />][i]} {field}<input type="number" min="0" className="inp w-full mt-1" value={selected[field] ?? 0} onChange={e => setSelected({ ...selected, [field]: Number(e.target.value) })} /></label>)}</div><div className="rounded-xl bg-blue-50 p-4"><div className="font-semibold text-sm">Private draft review</div><p className="text-xs text-gray-600 mt-1">This checklist runs in your browser. It does not send your script to an AI service and cannot predict virality.</p><ul className="list-disc pl-5 mt-2 text-sm space-y-1">{localReview(selected).map(tip => <li key={tip}>{tip}</li>)}</ul></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void updateItem(selected, { script: selected.script, caption: selected.caption, published_url: selected.published_url, scheduled_date: selected.scheduled_date, views: selected.views, likes: selected.likes, comments: selected.comments, saves: selected.saves })} className="btn-blue btn-sm">Save changes</button><select aria-label="Content status" className="sel" value={selected.status} onChange={e => void updateItem(selected, { status: e.target.value, ...(e.target.value === 'posted' ? { done_date: new Date().toISOString().slice(0,10) } : {}) })}>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select><button onClick={() => void deleteItem(selected)} className="btn-gray btn-sm text-red-600 flex items-center gap-1"><Trash2 size={14} /> Delete</button></div></section>}
    <div className="flex items-center justify-between gap-2"><h2 className="font-bold text-lg">Content board</h2><div className="flex gap-2"><select aria-label="Filter content" className="sel text-sm" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select><button aria-label="Refresh content" onClick={() => void load()} className="btn-gray btn-sm"><RefreshCw size={15} /></button></div></div>
    {loading ? <div className="card p-10 text-center text-gray-400">Loading content…</div> : visible.length === 0 ? <div className="card p-10 text-center text-gray-500"><div className="text-4xl mb-2">🧳</div><div className="font-semibold">No content ideas here yet</div><p className="text-sm mt-1">Add an idea to start planning your next post.</p></div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{visible.map(item => <button key={item.id} onClick={() => { setSelected(item); setShowForm(false) }} className="card p-4 text-left hover:ring-2 hover:ring-blue-200"><div className="flex justify-between gap-2"><span className="text-xs font-semibold text-blue-600">{item.platform}</span><span className="text-[11px] text-gray-500">{STATUS_LABELS[item.status] || item.status}</span></div><div className="font-bold mt-3">{item.title}</div>{item.scheduled_date && <div className="text-xs text-gray-500 mt-2 flex items-center gap-1"><CalendarDays size={13} />{item.scheduled_date}</div>}<div className="text-xs text-gray-500 mt-3 line-clamp-2">{item.script || item.notes || item.caption || 'Open to add a script, caption, and performance results.'}</div>{item.status !== 'posted' && <span className="mt-3 inline-flex text-xs text-green-700 items-center gap-1"><Check size={13} /> Mark posted in details</span>}</button>)}</div>}
  </div>
}
