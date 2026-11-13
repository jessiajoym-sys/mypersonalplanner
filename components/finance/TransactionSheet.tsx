'use client'
import { useMemo, useState } from 'react'
import { Download, Search, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { emitChange } from '@/lib/planner'
import { fmt, isIncome, isSpend } from '@/lib/finance'

export const PURPOSES = ['Personal', 'Business', 'China daily', 'Travel', 'Family', 'Content / project', 'Investment', 'Bills']
const TYPE_LABEL: Record<string, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer', credit_card_purchase: 'Card purchase', fee: 'Fee' }
const PAGE = 150

type Props = {
  transactions: any[]; accounts: any[]; businesses: any[]; projects: any[]; categories: string[]
  userId: string; month: string // YYYY-MM
  onChanged: () => Promise<any> | void; onToast: (m: string) => void; openReceipt: (p: string) => void
}

/** Excel-like transaction sheet: edit any cell, filter, bulk-tag, export. */
export default function TransactionSheet({ transactions, accounts, businesses, projects, categories, userId, month, onChanged, onToast, openReceipt }: Props) {
  const [q, setQ] = useState('')
  const [range, setRange] = useState<'month' | 'all'>('month')
  const [type, setType] = useState('all'), [cat, setCat] = useState('all'), [biz, setBiz] = useState('all'), [purpose, setPurpose] = useState('all'), [cur, setCur] = useState('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [bulk, setBulk] = useState({ category: '', purpose: '', business_id: '__keep', project_id: '__keep' })
  const accName = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a.name])), [accounts])
  const bizName = useMemo(() => Object.fromEntries(businesses.map(b => [b.id, b.name])), [businesses])
  const allCats = useMemo(() => Array.from(new Set([...categories, ...transactions.map(t => t.category).filter(Boolean)])).sort(), [categories, transactions])
  const currencies = useMemo(() => Array.from(new Set(transactions.map(t => t.currency))), [transactions])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return transactions.filter(t => {
      if (range === 'month' && !String(t.transaction_date).startsWith(month)) return false
      if (type !== 'all' && t.type !== type) return false
      if (cat !== 'all' && (t.category || 'Other') !== cat) return false
      if (cur !== 'all' && t.currency !== cur) return false
      if (biz === 'none' ? !!t.business_id : biz !== 'all' && t.business_id !== biz) return false
      if (purpose === 'none' ? !!t.purpose : purpose !== 'all' && t.purpose !== purpose) return false
      if (s && !`${t.merchant || ''} ${t.description || ''} ${t.category || ''} ${t.purpose || ''}`.toLowerCase().includes(s)) return false
      return true
    })
  }, [transactions, q, range, month, type, cat, biz, purpose, cur])

  const totals = useMemo(() => {
    const m: Record<string, { inc: number; out: number }> = {}
    rows.forEach(t => { const c = (m[t.currency] ||= { inc: 0, out: 0 }); if (isIncome(t)) c.inc += Number(t.amount); else if (isSpend(t)) c.out += Number(t.amount) })
    return m
  }, [rows])

  async function patch(ids: string[], values: Record<string, any>, quiet = false) {
    const { error } = await supabase.from('transactions').update(values).in('id', ids).eq('user_id', userId)
    if (error) { onToast('Could not save: ' + error.message + (/purpose|project_id/.test(error.message) ? ' — run lib/planner-upgrade-5.sql in Supabase first.' : '')); return false }
    await onChanged(); emitChange()
    if (!quiet) onToast(ids.length > 1 ? `${ids.length} transactions updated.` : 'Saved.')
    return true
  }
  const cell = (t: any, field: string, raw: string, parse?: (v: string) => any) => {
    if (raw === String(t[field] ?? '')) return
    const v = parse ? parse(raw) : raw.trim() || null
    if (v === undefined) return
    void patch([t.id], { [field]: v }, true)
  }
  async function remove(ids: string[]) {
    if (!confirm(`Delete ${ids.length} transaction${ids.length > 1 ? 's' : ''}? (They are archived, not erased.)`)) return
    if (await patch(ids, { deleted_at: new Date().toISOString() }, true)) { setSel(new Set()); onToast('Deleted.') }
  }
  async function applyBulk() {
    const v: Record<string, any> = {}
    if (bulk.category.trim()) v.category = bulk.category.trim()
    if (bulk.purpose) v.purpose = bulk.purpose === '__clear' ? null : bulk.purpose
    if (bulk.business_id !== '__keep') v.business_id = bulk.business_id || null
    if (bulk.project_id !== '__keep') v.project_id = bulk.project_id || null
    if (!Object.keys(v).length) { onToast('Choose at least one tag to apply.'); return }
    if (await patch(Array.from(sel), v)) { setSel(new Set()); setBulk({ category: '', purpose: '', business_id: '__keep', project_id: '__keep' }) }
  }
  function exportCsv() {
    const esc = (x: any) => `"${String(x ?? '').replace(/"/g, '""')}"`
    const head = ['Date', 'Type', 'Name', 'Category', 'Purpose', 'Business', 'Project', 'Account', 'Currency', 'Amount', 'Note']
    const lines = rows.map(t => [t.transaction_date, t.type, t.merchant, t.category, t.purpose, bizName[t.business_id] || '', projects.find(p => String(p.id) === String(t.project_id))?.name || '', accName[t.from_account_id] || '', t.currency, t.amount, t.description].map(esc).join(','))
    const url = URL.createObjectURL(new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `transactions-${range === 'month' ? month : 'all'}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const shown = rows.slice(0, limit)
  const allOn = shown.length > 0 && shown.every(t => sel.has(t.id))
  const toggleAll = () => setSel(allOn ? new Set() : new Set(shown.map(t => t.id)))
  const inp = 'w-full bg-transparent px-1.5 py-1 text-xs rounded border border-transparent hover:border-gray-200 focus:border-teal-400 focus:bg-white outline-none'

  return (
    <div className="card overflow-hidden">
      <datalist id="sheet-purposes">{PURPOSES.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="sheet-cats">{allCats.map(c => <option key={c} value={c} />)}</datalist>
      <div className="p-3 border-b border-gray-100 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" /><input className="inp w-full text-xs pl-8" placeholder="Search name, note, category…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{(['month', 'all'] as const).map(r => <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-md font-semibold ${range === r ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{r === 'month' ? 'This month' : 'All time'}</button>)}</div>
          <button onClick={exportCsv} className="btn-gray btn-sm flex items-center gap-1 text-xs"><Download size={14} /> CSV</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="sel text-xs" value={type} onChange={e => setType(e.target.value)}><option value="all">All types</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="sel text-xs" value={cat} onChange={e => setCat(e.target.value)}><option value="all">All categories</option>{allCats.map(c => <option key={c}>{c}</option>)}</select>
          <select className="sel text-xs" value={purpose} onChange={e => setPurpose(e.target.value)}><option value="all">All purposes</option><option value="none">Untagged</option>{PURPOSES.map(p => <option key={p}>{p}</option>)}</select>
          <select className="sel text-xs" value={biz} onChange={e => setBiz(e.target.value)}><option value="all">All businesses</option><option value="none">Not business</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          {currencies.length > 1 && <select className="sel text-xs" value={cur} onChange={e => setCur(e.target.value)}><option value="all">All currencies</option>{currencies.map(c => <option key={c}>{c}</option>)}</select>}
        </div>
      </div>

      {sel.size > 0 && (
        <div className="p-3 bg-teal-50 border-b border-teal-100 flex flex-wrap gap-2 items-center text-xs">
          <b>{sel.size} selected</b>
          <input className="inp text-xs w-32" list="sheet-cats" placeholder="Category…" value={bulk.category} onChange={e => setBulk({ ...bulk, category: e.target.value })} />
          <select className="sel text-xs" value={bulk.purpose} onChange={e => setBulk({ ...bulk, purpose: e.target.value })}><option value="">Purpose…</option>{PURPOSES.map(p => <option key={p}>{p}</option>)}<option value="__clear">(clear)</option></select>
          <select className="sel text-xs" value={bulk.business_id} onChange={e => setBulk({ ...bulk, business_id: e.target.value })}><option value="__keep">Business…</option><option value="">Not business</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select className="sel text-xs" value={bulk.project_id} onChange={e => setBulk({ ...bulk, project_id: e.target.value })}><option value="__keep">Project…</option><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button onClick={applyBulk} className="btn-blue btn-sm text-xs">Apply tags</button>
          <button onClick={() => remove(Array.from(sel))} className="btn-gray btn-sm text-xs text-red-600">Delete</button>
          <button onClick={() => setSel(new Set())} className="ml-auto text-gray-400" aria-label="Clear selection"><X size={14} /></button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1000px]">
          <thead className="bg-gray-50 text-gray-500 sticky top-0"><tr className="text-left">
            <th className="p-2 w-8"><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all" /></th>
            <th className="p-2 w-28">Date</th><th className="p-2 w-20">Type</th><th className="p-2">Name</th><th className="p-2 w-32">Category</th><th className="p-2 w-28">Purpose</th>
            <th className="p-2 w-28">Business</th><th className="p-2 w-28">Project</th><th className="p-2 w-24">Account</th><th className="p-2 w-28 text-right">Amount</th><th className="p-2">Note</th><th className="p-2 w-14" />
          </tr></thead>
          <tbody>
            {shown.map(t => (
              <tr key={t.id + (t.updated_at || '')} className={`border-t border-gray-50 ${sel.has(t.id) ? 'bg-teal-50/50' : 'hover:bg-gray-50/60'}`}>
                <td className="p-2"><input type="checkbox" checked={sel.has(t.id)} onChange={() => setSel(s => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n })} /></td>
                <td className="p-1"><input type="date" className={inp} defaultValue={t.transaction_date} onBlur={e => e.target.value && cell(t, 'transaction_date', e.target.value, v => v)} /></td>
                <td className="p-2 text-gray-500 whitespace-nowrap">{TYPE_LABEL[t.type] || t.type}</td>
                <td className="p-1"><input className={inp} defaultValue={t.merchant || ''} placeholder="—" onBlur={e => cell(t, 'merchant', e.target.value)} /></td>
                <td className="p-1"><input className={inp} list="sheet-cats" defaultValue={t.category || ''} placeholder="—" onBlur={e => cell(t, 'category', e.target.value)} /></td>
                <td className="p-1"><input className={inp} list="sheet-purposes" defaultValue={t.purpose || ''} placeholder="—" onBlur={e => cell(t, 'purpose', e.target.value)} /></td>
                <td className="p-1"><select className={inp} value={t.business_id || ''} onChange={e => patch([t.id], { business_id: e.target.value || null }, true)}><option value="">—</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
                <td className="p-1"><select className={inp} value={t.project_id || ''} onChange={e => patch([t.id], { project_id: e.target.value || null }, true)}><option value="">—</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                <td className="p-2 text-gray-500 truncate max-w-[110px]" title={accName[t.from_account_id]}>{accName[t.from_account_id] || '—'}</td>
                <td className="p-1"><div className="flex items-center justify-end gap-1"><span className={`text-[10px] ${isIncome(t) ? 'text-green-600' : 'text-gray-400'}`}>{isIncome(t) ? '+' : t.type === 'transfer' ? '↔' : '−'}{t.currency}</span>
                  <input type="number" step="any" className={inp + ' text-right w-20 font-semibold'} defaultValue={t.amount} onBlur={e => cell(t, 'amount', e.target.value, v => { const n = Number(v); if (!Number.isFinite(n) || n <= 0) { onToast('Amount must be above zero.'); return undefined } return n })} /></div></td>
                <td className="p-1"><input className={inp} defaultValue={t.description || ''} placeholder="—" onBlur={e => cell(t, 'description', e.target.value)} /></td>
                <td className="p-1 whitespace-nowrap">{t.receipt_path && <button className="text-blue-500 mr-1" onClick={() => openReceipt(t.receipt_path)} title="View receipt">🧾</button>}<button onClick={() => remove([t.id])} className="text-gray-300 hover:text-red-500" aria-label="Delete"><Trash2 size={13} /></button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={12} className="p-8 text-center text-gray-400">No transactions match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-gray-100 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs bg-gray-50">
        <span className="text-gray-500">{rows.length} rows</span>
        {Object.entries(totals).map(([c, v]) => <span key={c}><b>{c}</b> in <span className="text-green-600 font-semibold">{fmt(v.inc, c)}</span> · out <span className="text-red-500 font-semibold">{fmt(v.out, c)}</span></span>)}
        {rows.length > limit && <button className="ml-auto text-teal-600 font-semibold" onClick={() => setLimit(l => l + PAGE)}>Show more ({rows.length - limit} left)</button>}
      </div>
    </div>
  )
}
