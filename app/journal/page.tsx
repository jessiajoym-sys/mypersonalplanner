'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'

export default function JournalPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [entries, setEntries] = useState<any[]>([])
  const [content, setContent] = useState('')
  const [userId, setUserId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { void load() }, [date])
  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data, error: queryError } = await supabase.from('daily_logs').select('*').eq('user_id', user.id).eq('date', date).eq('type', 'journal').order('created_at', { ascending: false })
    if (queryError) setError(queryError.message); else setEntries(data || [])
    setLoading(false)
  }
  async function addEntry() {
    if (!content.trim()) return
    const { error: saveError } = await supabase.from('daily_logs').insert({ user_id: userId, date, type: 'journal', category: 'Personal Reflection', content: content.trim() })
    if (saveError) setError(saveError.message); else { setContent(''); await load() }
  }
  async function remove(id: string) {
    const { error: deleteError } = await supabase.from('daily_logs').delete().eq('id', id).eq('user_id', userId)
    if (deleteError) setError(deleteError.message); else setEntries(rows => rows.filter(row => row.id !== id))
  }
  return <div className="max-w-3xl mx-auto space-y-5"><header><h1 className="text-2xl font-bold">Journal</h1><p className="text-sm text-gray-500 mt-1">Private reflections saved with your daily log.</p></header>{error && <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</div>}<section className="card p-5 space-y-3"><label className="text-xs font-semibold">Entry date<input className="inp block mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} /></label><textarea className="inp w-full min-h-40" placeholder="What is on your mind today?" value={content} onChange={e => setContent(e.target.value)} /><button onClick={() => void addEntry()} className="btn-blue btn-sm flex items-center gap-1"><Plus size={15} /> Save reflection</button></section>{loading ? <div className="card p-6 text-gray-500">Loading entries…</div> : entries.length === 0 ? <div className="card p-8 text-center text-sm text-gray-500">No journal entries for this date.</div> : <div className="space-y-3">{entries.map(entry => <article key={entry.id} className="card p-5"><div className="flex justify-between gap-3"><time className="text-xs text-gray-500">{entry.date}</time><button aria-label="Delete journal entry" onClick={() => void remove(entry.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={15} /></button></div><p className="whitespace-pre-wrap text-sm mt-3">{entry.content}</p></article>)}</div>}</div>
}
