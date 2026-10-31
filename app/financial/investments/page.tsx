'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Pencil, Plus, Trash2, X } from 'lucide-react'

type Investment = { id: string; provider: string; asset_name: string; asset_type: string; invested_amount: number; current_value: number; quantity: number | null; valuation_date: string; notes: string | null }
const empty = { provider: '', asset_name: '', asset_type: 'mutual_fund', invested_amount: '', current_value: '', quantity: '', valuation_date: new Date().toISOString().slice(0,10), notes: '' }
const cash = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0)

export default function InvestmentsPage() {
  const [rows, setRows] = useState<Investment[]>([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [userId, setUserId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { void load() }, [])
  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data, error: queryError } = await supabase.from('financial_investments').select('*').eq('user_id', user.id).order('valuation_date', { ascending: false })
    if (queryError) setError(queryError.message.includes('financial_investments') ? 'Set up investment tracking first by running lib/planner-upgrade.sql in Supabase SQL Editor.' : queryError.message)
    else setRows((data || []) as Investment[])
    setLoading(false)
  }
  function edit(row: Investment) {
    setEditing(row.id); setShowForm(true)
    setForm({ provider: row.provider, asset_name: row.asset_name, asset_type: row.asset_type, invested_amount: String(row.invested_amount), current_value: String(row.current_value), quantity: row.quantity == null ? '' : String(row.quantity), valuation_date: row.valuation_date, notes: row.notes || '' })
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    const payload = { provider: form.provider.trim(), asset_name: form.asset_name.trim(), asset_type: form.asset_type, invested_amount: Number(form.invested_amount || 0), current_value: Number(form.current_value || 0), quantity: form.quantity === '' ? null : Number(form.quantity), valuation_date: form.valuation_date, notes: form.notes.trim() || null }
    const result = editing ? await supabase.from('financial_investments').update(payload).eq('id', editing).eq('user_id', userId) : await supabase.from('financial_investments').insert({ ...payload, user_id: userId })
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    setForm(empty); setEditing(null); setShowForm(false); await load()
  }
  async function remove(row: Investment) {
    if (!window.confirm(`Delete ${row.asset_name}?`)) return
    const { error: deleteError } = await supabase.from('financial_investments').delete().eq('id', row.id).eq('user_id', userId)
    if (deleteError) setError(deleteError.message); else setRows(current => current.filter(item => item.id !== row.id))
  }
  const totals = useMemo(() => rows.reduce((acc, row) => ({ invested: acc.invested + Number(row.invested_amount || 0), value: acc.value + Number(row.current_value || 0) }), { invested: 0, value: 0 }), [rows])
  return <div className="max-w-5xl mx-auto space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Investments</h1><p className="text-sm text-gray-500 mt-1">Track positions from Bibit, IPOT, and other providers.</p></div><button onClick={() => { setEditing(null); setForm(empty); setShowForm(!showForm) }} className="btn-blue btn-sm flex items-center gap-1"><Plus size={15} /> Add investment</button></header>{error && <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</div>}<div className="grid md:grid-cols-2 gap-3"><div className="card p-5"><div className="text-xs text-gray-500">Total invested</div><b className="text-2xl">{cash(totals.invested)}</b></div><div className="card p-5"><div className="text-xs text-gray-500">Latest reported value</div><b className="text-2xl">{cash(totals.value)}</b><div className={`text-xs mt-1 ${totals.value >= totals.invested ? 'text-green-600' : 'text-red-600'}`}>Change: {cash(totals.value - totals.invested)}</div></div></div>{showForm && <form onSubmit={save} className="card p-5 space-y-3"><div className="flex items-center justify-between"><h2 className="font-bold">{editing ? 'Edit investment' : 'Add investment'}</h2><button type="button" onClick={() => setShowForm(false)} aria-label="Close" className="text-gray-400"><X size={17} /></button></div><div className="grid md:grid-cols-2 gap-3"><label className="text-xs font-semibold">Provider<input required className="inp w-full mt-1" placeholder="Bibit, IPOT…" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} /></label><label className="text-xs font-semibold">Investment name<input required className="inp w-full mt-1" value={form.asset_name} onChange={e => setForm({ ...form, asset_name: e.target.value })} /></label><label className="text-xs font-semibold">Type<select className="sel w-full mt-1" value={form.asset_type} onChange={e => setForm({ ...form, asset_type: e.target.value })}><option value="mutual_fund">Mutual fund</option><option value="stock">Stock</option><option value="bond">Bond</option><option value="deposit">Time deposit</option><option value="crypto">Crypto</option><option value="other">Other</option></select></label><label className="text-xs font-semibold">Valuation date<input required type="date" className="inp w-full mt-1" value={form.valuation_date} onChange={e => setForm({ ...form, valuation_date: e.target.value })} /></label><label className="text-xs font-semibold">Total invested (IDR)<input type="number" min="0" className="inp w-full mt-1" value={form.invested_amount} onChange={e => setForm({ ...form, invested_amount: e.target.value })} /></label><label className="text-xs font-semibold">Current value (IDR)<input type="number" min="0" className="inp w-full mt-1" value={form.current_value} onChange={e => setForm({ ...form, current_value: e.target.value })} /></label><label className="text-xs font-semibold">Units / quantity (optional)<input type="number" min="0" step="any" className="inp w-full mt-1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label></div><label className="block text-xs font-semibold">Notes / description<textarea className="inp w-full mt-1" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label><p className="text-xs text-gray-500">This is manual tracking. It does not connect to Bibit or IPOT or fetch live prices. You can edit names and notes at any time.</p><div className="flex gap-2"><button disabled={saving} className="btn-blue btn-sm">{saving ? 'Saving…' : 'Save investment'}</button><button type="button" onClick={() => setShowForm(false)} className="btn-gray btn-sm">Cancel</button></div></form>}{loading ? <div className="card p-8 text-center text-gray-500">Loading investments…</div> : rows.length === 0 ? <div className="card p-10 text-center text-gray-500">No investment records yet. Add a position or valuation from your statement.</div> : <div className="grid md:grid-cols-2 gap-3">{rows.map(row => <article key={row.id} className="card p-5"><div className="flex items-start justify-between"><div><div className="text-xs text-gray-500">{row.provider} · {row.asset_type.replace('_', ' ')}</div><h2 className="font-bold mt-1">{row.asset_name}</h2><div className="text-xs text-gray-500 mt-1">Updated {row.valuation_date}</div></div><div className="flex gap-2"><button aria-label="Edit investment" onClick={() => edit(row)} className="text-gray-400 hover:text-blue-600"><Pencil size={16} /></button><button aria-label="Delete investment" onClick={() => void remove(row)} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button></div></div><div className="grid grid-cols-2 gap-3 mt-4"><div><div className="text-xs text-gray-500">Invested</div><b>{cash(Number(row.invested_amount))}</b></div><div><div className="text-xs text-gray-500">Current value</div><b>{cash(Number(row.current_value))}</b></div></div>{row.notes && <p className="text-sm text-gray-500 mt-3">{row.notes}</p>}</article>)}</div>}</div>
}
