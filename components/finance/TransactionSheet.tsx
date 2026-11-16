'use client'
import { useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Download, History, Scissors, Search, Settings2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { emitChange } from '@/lib/planner'
import { fmt } from '@/lib/finance'
import { TX_TYPES, debitCredit, flowOf, needsDestination, typeLabel } from '@/lib/ledger'
import type { FinanceLists } from '@/lib/financeLists'

const PAGE = 150
const COPY_FIELDS = ['user_id', 'type', 'currency', 'from_account_id', 'to_account_id', 'category', 'subcategory', 'merchant', 'description', 'notes', 'business_id', 'project_id', 'purpose', 'transaction_date', 'source', 'bk_class', 'platform', 'original_description', 'original_direction', 'source_file', 'source_ref', 'import_batch']
const CHECK = /check constraint/i
const NEEDS8 = /original_description|my_description|subcategory|notes|import_hash|split_group|updated_at|transaction_audit|schema cache/i
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

type Props = {
  transactions: any[]; accounts: any[]; businesses: any[]; projects: any[]; lists: FinanceLists
  userId: string; month: string
  onChanged: () => Promise<any> | void; onToast: (m: string) => void; openReceipt: (p: string) => void; onManageCategories: () => void
}

/** Spreadsheet-style ledger. Every edit saves when you leave the cell and is written to the audit history. */
export default function TransactionSheet({ transactions, accounts, businesses, projects, lists, userId, month, onChanged, onToast, openReceipt, onManageCategories }: Props) {
  const [q, setQ] = useState('')
  const [range, setRange] = useState<'month' | 'all' | 'custom'>('month')
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [f, setF] = useState({ type: 'all', cat: 'all', biz: 'all', purpose: 'all', cur: 'all', acc: 'all', proj: 'all' })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [archivedMode, setArchivedMode] = useState(false)
  const [archived, setArchived] = useState<any[]>([])
  const [bulk, setBulk] = useState({ type: '', category: '', subcategory: '', purpose: '', business_id: '__keep', project_id: '__keep' })
  const [splitting, setSplitting] = useState<any | null>(null)
  const [history, setHistory] = useState<{ tx: any; rows: any[] } | null>(null)

  const accName = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a.name])), [accounts])
  const bizName = useMemo(() => Object.fromEntries(businesses.map(b => [b.id, b.name])), [businesses])
  const projName = useMemo(() => Object.fromEntries(projects.map(p => [String(p.id), p.name])), [projects])
  // names already used on old transactions stay selectable even if archived/renamed
  const catOptions = useMemo(() => Array.from(new Set([...lists.categories, ...transactions.map(t => t.category).filter(Boolean)])).sort((a, b) => a.localeCompare(b)), [lists.categories, transactions])
  const currencies = useMemo(() => Array.from(new Set(transactions.map(t => t.currency))), [transactions])

  useEffect(() => {
    if (!archivedMode || !userId) return
    supabase.from('transactions').select('*').eq('user_id', userId).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(500)
      .then(({ data }) => setArchived(data || []))
  }, [archivedMode, userId, transactions])

  const source = archivedMode ? archived : transactions
  const original = (t: any) => t.original_description ?? t.merchant ?? ''
  const mine = (t: any) => t.my_description ?? (t.original_description ? '' : '')
  const note = (t: any) => t.notes ?? t.description ?? ''

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return source.filter(t => {
      const d = String(t.transaction_date)
      if (range === 'month' && !archivedMode && !d.startsWith(month)) return false
      if (range === 'custom') { if (from && d < from) return false; if (to && d > to) return false }
      if (f.type !== 'all' && t.type !== f.type) return false
      if (f.cat !== 'all' && (t.category || 'Other') !== f.cat) return false
      if (f.cur !== 'all' && t.currency !== f.cur) return false
      if (f.acc !== 'all' && t.from_account_id !== f.acc && t.to_account_id !== f.acc) return false
      if (f.biz === 'none' ? !!t.business_id : f.biz !== 'all' && t.business_id !== f.biz) return false
      if (f.proj === 'none' ? !!t.project_id : f.proj !== 'all' && String(t.project_id) !== f.proj) return false
      if (f.purpose === 'none' ? !!t.purpose : f.purpose !== 'all' && t.purpose !== f.purpose) return false
      if (s && !`${original(t)} ${t.my_description || ''} ${t.merchant || ''} ${note(t)} ${t.category || ''} ${t.subcategory || ''} ${t.purpose || ''}`.toLowerCase().includes(s)) return false
      return true
    })
  }, [source, q, range, from, to, month, f, archivedMode])

  const totals = useMemo(() => {
    const m: Record<string, { inc: number; out: number }> = {}
    rows.forEach(t => {
      const c = (m[t.currency] ||= { inc: 0, out: 0 }), fl = flowOf(t), a = Number(t.amount)
      if (fl === 'income') c.inc += a; else if (fl === 'spending') c.out += a; else if (fl === 'refund') c.out -= a
    })
    return m
  }, [rows])

  const fail = (msg: string) => onToast('Could not save: ' + msg + (CHECK.test(msg) ? ' — run lib/planner-fix-transactions.sql in Supabase.' : NEEDS8.test(msg) ? ' — run lib/planner-upgrade-8.sql in Supabase first.' : ''))

  async function audit(entries: { transaction_id: string; action: string; changes: any }[]) {
    if (!entries.length) return
    await supabase.from('transaction_audit').insert(entries.map(e => ({ ...e, user_id: userId })))   // best-effort
  }

  /** Update one or many rows; returns true only when the database confirmed it. */
  async function patch(list: any[], values: Record<string, any>, action = 'edit', quiet = false) {
    const ids = list.map(t => t.id)
    const payload = { ...values, updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('transactions').update(payload).in('id', ids).eq('user_id', userId).select('id')
    if (error) { fail(error.message); return false }
    if ((data || []).length !== ids.length) { fail(`only ${(data || []).length} of ${ids.length} rows were updated`); return false }
    await audit(list.map(t => ({ transaction_id: t.id, action, changes: Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'updated_at').map(([k, v]) => [k, { from: t[k] ?? null, to: v }])) })))
    await onChanged(); emitChange()
    if (!quiet) onToast(ids.length > 1 ? `${ids.length} transactions updated.` : 'Saved.')
    return true
  }

  const edit = (t: any, field: string, raw: string, parse?: (v: string) => any, extra?: Record<string, any>) => {
    const current = String(t[field] ?? '')
    if (raw === current) return
    const v = parse ? parse(raw) : raw.trim() || null
    if (v === undefined) return
    void patch([t], { ...(extra || {}), [field]: v }, 'edit', true)
  }
  // Editing My Description keeps the statement text safe in original_description.
  const editMine = (t: any, raw: string) => {
    if (raw.trim() === (t.my_description || '')) return
    const v = raw.trim() || null
    void patch([t], { my_description: v, merchant: v || original(t) || t.merchant, ...(t.original_description ? {} : { original_description: t.merchant || null }) }, 'edit', true)
  }
  const editAmount = (t: any, raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) { onToast('Amount must be above zero.'); return }
    if (n === Number(t.amount)) return
    void patch([t], { amount: n, ...(t.original_amount == null ? { original_amount: t.amount } : {}) }, 'edit', true)
  }
  const editType = (t: any, v: string) => {
    if (needsDestination(v) && !t.to_account_id) { onToast(`"${typeLabel(v)}" needs a destination account. Add it as a new transaction (or via statement import).`); return }
    void patch([t], { type: v }, 'edit', true)
  }

  async function archive(list: any[]) {
    if (!confirm(`Archive ${list.length} transaction${list.length > 1 ? 's' : ''}? They leave balances and reports but can be restored.`)) return
    if (await patch(list, { deleted_at: new Date().toISOString() }, 'archive', true)) { setSel(new Set()); onToast('Archived. Use "Archived" to restore.') }
  }
  async function restore(list: any[]) {
    if (await patch(list, { deleted_at: null }, 'restore', true)) { setSel(new Set()); onToast('Restored.') }
  }
  async function applyBulk() {
    const v: Record<string, any> = {}
    if (bulk.type) { if (needsDestination(bulk.type)) { onToast('Transfers and card payments need a destination account — set them one by one.'); return } v.type = bulk.type }
    if (bulk.category) v.category = bulk.category
    if (bulk.subcategory.trim()) v.subcategory = bulk.subcategory.trim()
    if (bulk.purpose) v.purpose = bulk.purpose === '__clear' ? null : bulk.purpose
    if (bulk.business_id !== '__keep') v.business_id = bulk.business_id || null
    if (bulk.project_id !== '__keep') v.project_id = bulk.project_id || null
    if (!Object.keys(v).length) { onToast('Choose at least one change to apply.'); return }
    if (await patch(rows.filter(t => sel.has(t.id)), v, 'edit')) { setSel(new Set()); setBulk({ type: '', category: '', subcategory: '', purpose: '', business_id: '__keep', project_id: '__keep' }) }
  }

  async function showHistory(t: any) {
    const { data, error } = await supabase.from('transaction_audit').select('*').eq('transaction_id', t.id).eq('user_id', userId).order('created_at', { ascending: false })
    if (error) { fail(error.message); return }
    setHistory({ tx: t, rows: data || [] })
  }

  function exportCsv() {
    const esc = (x: any) => `"${String(x ?? '').replace(/"/g, '""')}"`
    const head = ['Date', 'Original Description', 'My Description', 'Account', 'Debit', 'Credit', 'Currency', 'Type', 'Purpose', 'Business', 'Project', 'Category', 'Subcategory', 'Notes', 'Source file', 'Archived']
    const lines = rows.map(t => { const dc = debitCredit(t); return [t.transaction_date, original(t), t.my_description || '', accName[t.from_account_id] || '', dc.debit || '', dc.credit || '', t.currency, typeLabel(t.type), t.purpose, bizName[t.business_id] || '', projName[String(t.project_id)] || '', t.category, t.subcategory, note(t), t.source_file, t.deleted_at ? 'yes' : ''].map(esc).join(',') })
    const url = URL.createObjectURL(new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `transactions-${range === 'month' ? month : range === 'custom' ? `${from || 'start'}_${to || 'end'}` : 'all'}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const shown = rows.slice(0, limit)
  const allOn = shown.length > 0 && shown.every(t => sel.has(t.id))
  const toggleAll = () => setSel(allOn ? new Set() : new Set(shown.map(t => t.id)))
  const selected = rows.filter(t => sel.has(t.id))
  const inp = 'w-full bg-transparent px-1.5 py-1 text-xs rounded border border-transparent hover:border-gray-200 focus:border-teal-400 focus:bg-white outline-none'
  const setFilter = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="card overflow-hidden">
      <datalist id="sheet-subs">{Array.from(new Set(transactions.map(t => t.subcategory).filter(Boolean))).map((c: any) => <option key={c} value={c} />)}</datalist>
      <div className="p-3 border-b border-gray-100 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" /><input className="inp w-full text-xs pl-8" placeholder="Search description, note, category…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{(['month', 'all', 'custom'] as const).map(r => <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-md font-semibold ${range === r ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{r === 'month' ? 'This month' : r === 'all' ? 'All time' : 'Dates'}</button>)}</div>
          {range === 'custom' && <><input type="date" className="inp text-xs" value={from} onChange={e => setFrom(e.target.value)} aria-label="From" /><span className="text-xs text-gray-400">to</span><input type="date" className="inp text-xs" value={to} onChange={e => setTo(e.target.value)} aria-label="To" /></>}
          <button onClick={() => { setArchivedMode(!archivedMode); setSel(new Set()) }} className={`btn-sm flex items-center gap-1 text-xs ${archivedMode ? 'btn-blue' : 'btn-gray'}`}><Archive size={14} /> Archived</button>
          <button onClick={onManageCategories} className="btn-gray btn-sm flex items-center gap-1 text-xs"><Settings2 size={14} /> Categories</button>
          <button onClick={exportCsv} className="btn-gray btn-sm flex items-center gap-1 text-xs"><Download size={14} /> CSV</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="sel text-xs" value={f.acc} onChange={setFilter('acc')}><option value="all">All accounts</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select className="sel text-xs" value={f.type} onChange={setFilter('type')}><option value="all">All types</option>{TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          <select className="sel text-xs" value={f.cat} onChange={setFilter('cat')}><option value="all">All categories</option>{catOptions.map(c => <option key={c}>{c}</option>)}</select>
          <select className="sel text-xs" value={f.purpose} onChange={setFilter('purpose')}><option value="all">All purposes</option><option value="none">Untagged</option>{lists.purposes.map(p => <option key={p}>{p}</option>)}</select>
          <select className="sel text-xs" value={f.biz} onChange={setFilter('biz')}><option value="all">All businesses</option><option value="none">Not business</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select className="sel text-xs" value={f.proj} onChange={setFilter('proj')}><option value="all">All projects</option><option value="none">No project</option>{projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select>
          {currencies.length > 1 && <select className="sel text-xs" value={f.cur} onChange={setFilter('cur')}><option value="all">All currencies</option>{currencies.map(c => <option key={c}>{c}</option>)}</select>}
        </div>
        {archivedMode && <div className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">Showing archived transactions. They are excluded from balances and reports until restored.</div>}
      </div>

      {sel.size > 0 && (
        <div className="p-3 bg-teal-50 border-b border-teal-100 flex flex-wrap gap-2 items-center text-xs">
          <b>{sel.size} selected</b>
          {archivedMode ? <button onClick={() => restore(selected)} className="btn-blue btn-sm text-xs flex items-center gap-1"><ArchiveRestore size={13} /> Restore</button> : <>
            <select className="sel text-xs" value={bulk.type} onChange={e => setBulk({ ...bulk, type: e.target.value })}><option value="">Type…</option>{TX_TYPES.filter(t => !needsDestination(t.value)).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            <select className="sel text-xs" value={bulk.category} onChange={e => setBulk({ ...bulk, category: e.target.value })}><option value="">Category…</option>{catOptions.map(c => <option key={c}>{c}</option>)}</select>
            <input className="inp text-xs w-28" list="sheet-subs" placeholder="Subcategory…" value={bulk.subcategory} onChange={e => setBulk({ ...bulk, subcategory: e.target.value })} />
            <select className="sel text-xs" value={bulk.purpose} onChange={e => setBulk({ ...bulk, purpose: e.target.value })}><option value="">Purpose…</option>{lists.purposes.map(p => <option key={p}>{p}</option>)}<option value="__clear">(clear)</option></select>
            <select className="sel text-xs" value={bulk.business_id} onChange={e => setBulk({ ...bulk, business_id: e.target.value })}><option value="__keep">Business…</option><option value="">Not business</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <select className="sel text-xs" value={bulk.project_id} onChange={e => setBulk({ ...bulk, project_id: e.target.value })}><option value="__keep">Project…</option><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button onClick={applyBulk} className="btn-blue btn-sm text-xs">Apply</button>
            <button onClick={() => archive(selected)} className="btn-gray btn-sm text-xs text-red-600">Archive</button>
          </>}
          <button onClick={() => setSel(new Set())} className="ml-auto text-gray-400" aria-label="Clear selection"><X size={14} /></button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1500px]">
          <thead className="bg-gray-50 text-gray-500 sticky top-0"><tr className="text-left">
            <th className="p-2 w-8"><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Include all" title="Include" /></th>
            <th className="p-2 w-28">Date</th><th className="p-2 w-52">Original Description</th><th className="p-2 w-44">My Description</th><th className="p-2 w-28">Account</th>
            <th className="p-2 w-28 text-right" title="Debit: money leaving this account">Money out<div className="text-[9px] font-normal normal-case">Debit</div></th><th className="p-2 w-28 text-right" title="Credit: money coming into this account">Money in<div className="text-[9px] font-normal normal-case">Credit</div></th><th className="p-2 w-32">Type</th><th className="p-2 w-28">Purpose</th>
            <th className="p-2 w-28">Business</th><th className="p-2 w-28">Project</th><th className="p-2 w-32">Category</th><th className="p-2 w-28">Subcategory</th><th className="p-2 w-36">Notes</th><th className="p-2 w-24">Receipt</th>
          </tr></thead>
          <tbody>
            {shown.map(t => {
              const dc = debitCredit(t), subs = lists.subcategoriesOf(t.category || '')
              return (
                <tr key={t.id + (t.updated_at || '')} className={`border-t border-gray-50 ${sel.has(t.id) ? 'bg-teal-50/50' : 'hover:bg-gray-50/60'} ${archivedMode ? 'opacity-70' : ''}`}>
                  <td className="p-2"><input type="checkbox" checked={sel.has(t.id)} onChange={() => setSel(s => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n })} /></td>
                  <td className="p-1"><input type="date" disabled={archivedMode} className={inp} defaultValue={t.transaction_date} onBlur={e => e.target.value && edit(t, 'transaction_date', e.target.value, v => v)} /></td>
                  <td className="p-2 text-gray-500 select-text" title={original(t)}><div className="line-clamp-2 break-words" aria-readonly>{original(t) || '—'}</div></td>
                  <td className="p-1"><input disabled={archivedMode} className={inp} defaultValue={t.my_description || ''} placeholder="Your own wording…" onBlur={e => editMine(t, e.target.value)} /></td>
                  <td className="p-2 text-gray-500 truncate max-w-[110px]" title={`${accName[t.from_account_id] || ''}${t.to_account_id ? ' → ' + (accName[t.to_account_id] || '') : ''}`}>{accName[t.from_account_id] || '—'}{t.to_account_id ? <span className="text-gray-400"> → {accName[t.to_account_id]}</span> : ''}</td>
                  <td className="p-1 text-right">{dc.debit ? <div className="flex items-center justify-end gap-1"><span className="text-[10px] text-gray-400">{t.currency}</span><input disabled={archivedMode} type="number" step="any" className={inp + ' text-right w-20 font-semibold text-red-500'} defaultValue={dc.debit} onBlur={e => editAmount(t, e.target.value)} /></div> : <span className="text-gray-300 pr-2">—</span>}</td>
                  <td className="p-1 text-right">{dc.credit ? <div className="flex items-center justify-end gap-1"><span className="text-[10px] text-gray-400">{t.currency}</span><input disabled={archivedMode} type="number" step="any" className={inp + ' text-right w-20 font-semibold text-green-600'} defaultValue={dc.credit} onBlur={e => editAmount(t, e.target.value)} /></div> : <span className="text-gray-300 pr-2">—</span>}</td>
                  <td className="p-1"><select disabled={archivedMode} className={inp} value={t.type} onChange={e => editType(t, e.target.value)}>{TX_TYPES.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}{!TX_TYPES.some(x => x.value === t.type) && <option value={t.type}>{t.type}</option>}</select></td>
                  <td className="p-1"><select disabled={archivedMode} className={inp} value={t.purpose || ''} onChange={e => edit(t, 'purpose', e.target.value)}><option value="">—</option>{Array.from(new Set([...lists.purposes, ...(t.purpose ? [t.purpose] : [])])).map(p => <option key={p}>{p}</option>)}</select></td>
                  <td className="p-1"><select disabled={archivedMode} className={inp} value={t.business_id || ''} onChange={e => void patch([t], { business_id: e.target.value || null }, 'edit', true)}><option value="">—</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
                  <td className="p-1"><select disabled={archivedMode} className={inp} value={t.project_id || ''} onChange={e => void patch([t], { project_id: e.target.value || null }, 'edit', true)}><option value="">—</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                  <td className="p-1"><select disabled={archivedMode} className={inp} value={t.category || ''} onChange={e => edit(t, 'category', e.target.value, undefined, { subcategory: null })}><option value="">—</option>{Array.from(new Set([...catOptions, ...(t.category ? [t.category] : [])])).map(c => <option key={c}>{c}</option>)}</select></td>
                  <td className="p-1"><input disabled={archivedMode} className={inp} list={`subs-${t.id}`} defaultValue={t.subcategory || ''} placeholder="—" onBlur={e => edit(t, 'subcategory', e.target.value)} /><datalist id={`subs-${t.id}`}>{subs.map(s => <option key={s} value={s} />)}</datalist></td>
                  <td className="p-1"><input disabled={archivedMode} className={inp} defaultValue={note(t)} placeholder="—" onBlur={e => edit(t, 'notes', e.target.value, undefined, t.notes == null && t.description ? {} : undefined)} /></td>
                  <td className="p-1 whitespace-nowrap">
                    {t.receipt_path && <button className="text-blue-500 mr-1" onClick={() => openReceipt(t.receipt_path)} title="View receipt">🧾</button>}
                    {!archivedMode && <button onClick={() => setSplitting(t)} className="text-gray-300 hover:text-teal-600 mr-1" title="Split" aria-label="Split"><Scissors size={13} /></button>}
                    <button onClick={() => showHistory(t)} className="text-gray-300 hover:text-teal-600 mr-1" title="Edit history" aria-label="History"><History size={13} /></button>
                    {archivedMode ? <button onClick={() => restore([t])} className="text-gray-300 hover:text-teal-600" title="Restore" aria-label="Restore"><ArchiveRestore size={13} /></button> : <button onClick={() => archive([t])} className="text-gray-300 hover:text-red-500" title="Archive" aria-label="Archive"><Archive size={13} /></button>}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={15} className="p-8 text-center text-gray-400">{archivedMode ? 'No archived transactions.' : 'No transactions match these filters.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-gray-100 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs bg-gray-50">
        <span className="text-gray-500">{rows.length} rows</span>
        {Object.entries(totals).map(([c, v]) => <span key={c}><b>{c}</b> in <span className="text-green-600 font-semibold">{fmt(v.inc, c)}</span> · out <span className="text-red-500 font-semibold">{fmt(v.out, c)}</span></span>)}
        <span className="text-gray-400">Transfers, card payments and loan principal are not counted as income or spending.</span>
        {rows.length > limit && <button className="ml-auto text-teal-600 font-semibold" onClick={() => setLimit(l => l + PAGE)}>Show more ({rows.length - limit} left)</button>}
      </div>

      {splitting && <SplitModal tx={splitting} lists={lists} catOptions={catOptions} onClose={() => setSplitting(null)} onSplit={async parts => {
        const base = splitting, group = base.split_group || uuid()
        const first = await patch([base], { amount: parts[0].amount, category: parts[0].category || base.category, split_group: group, original_amount: base.original_amount ?? base.amount }, 'split', true)
        if (!first) return
        const extra = parts.slice(1).map(p => { const r: any = {}; COPY_FIELDS.forEach(k => { if (base[k] !== undefined) r[k] = base[k] }); return { ...r, amount: p.amount, category: p.category || base.category, my_description: p.label || base.my_description || null, split_group: group, import_hash: null } })
        const { data, error } = await supabase.from('transactions').insert(extra).select('id')
        if (error || (data || []).length !== extra.length) { fail((error?.message || 'rows were not created') + ' — the first part was already reduced; fix the amount of this row to restore it.'); await onChanged(); return }
        await audit((data || []).map((d: any) => ({ transaction_id: d.id, action: 'split', changes: { from_transaction: base.id } })))
        await onChanged(); emitChange(); setSplitting(null); onToast(`Split into ${parts.length} transactions.`)
      }} />}

      {history && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3" onClick={() => setHistory(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-3"><div><h3 className="font-bold">Edit history</h3><p className="text-xs text-gray-500 break-words">{original(history.tx)}</p></div><button onClick={() => setHistory(null)} className="text-gray-400"><X size={18} /></button></div>
            {history.rows.length === 0 ? <p className="text-sm text-gray-400">No edits recorded yet.</p> : history.rows.map(r => (
              <div key={r.id} className="border-t border-gray-100 py-2 text-xs">
                <div className="text-gray-400">{new Date(r.created_at).toLocaleString()} · <b className="text-gray-600">{r.action}</b></div>
                {Object.entries(r.changes || {}).map(([k, v]: any) => <div key={k}><span className="text-gray-500">{k}:</span> <span className="line-through text-gray-400">{String(v?.from ?? '—')}</span> → <b>{String(v?.to ?? '—')}</b></div>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SplitModal({ tx, catOptions, onClose, onSplit }: { tx: any; lists: FinanceLists; catOptions: string[]; onClose: () => void; onSplit: (p: { amount: number; category: string; label: string }[]) => Promise<void> }) {
  const total = Number(tx.amount)
  const [parts, setParts] = useState([{ amount: String(Math.round(total / 2 * 100) / 100), category: tx.category || '', label: '' }, { amount: String(Math.round((total - Math.round(total / 2 * 100) / 100) * 100) / 100), category: '', label: '' }])
  const [busy, setBusy] = useState(false)
  const sum = parts.reduce((s, p) => s + Number(p.amount || 0), 0)
  const ok = Math.abs(sum - total) < 0.005 && parts.every(p => Number(p.amount) > 0)
  const set = (i: number, k: string, v: string) => setParts(parts.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-2"><div><h3 className="font-bold">Split transaction</h3><p className="text-xs text-gray-500">{fmt(total, tx.currency)} — parts must add up exactly.</p></div><button onClick={onClose} className="text-gray-400"><X size={18} /></button></div>
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[90px_1fr_1fr_auto] gap-2 items-center">
              <input type="number" step="any" className="inp text-xs" value={p.amount} onChange={e => set(i, 'amount', e.target.value)} />
              <select className="sel text-xs" value={p.category} onChange={e => set(i, 'category', e.target.value)}><option value="">Same category</option>{catOptions.map(c => <option key={c}>{c}</option>)}</select>
              <input className="inp text-xs" placeholder="Label (optional)" value={p.label} onChange={e => set(i, 'label', e.target.value)} />
              {parts.length > 2 ? <button className="text-gray-300 hover:text-red-500" onClick={() => setParts(parts.filter((_, j) => j !== i))}><X size={14} /></button> : <span />}
            </div>
          ))}
        </div>
        <button className="text-xs text-teal-600 font-semibold mt-2" onClick={() => setParts([...parts, { amount: '', category: '', label: '' }])}>+ Add part</button>
        <div className={`text-xs mt-2 ${ok ? 'text-gray-500' : 'text-red-500'}`}>Parts total {fmt(sum, tx.currency)} of {fmt(total, tx.currency)}{ok ? '' : ` — ${fmt(total - sum, tx.currency)} to go`}</div>
        <div className="flex gap-2 mt-3"><button disabled={!ok || busy} onClick={async () => { setBusy(true); await onSplit(parts.map(p => ({ amount: Number(p.amount), category: p.category, label: p.label }))); setBusy(false) }} className="btn-blue btn-sm flex-1">{busy ? 'Splitting…' : 'Split'}</button><button onClick={onClose} className="btn-gray btn-sm flex-1">Cancel</button></div>
      </div>
    </div>
  )
}
