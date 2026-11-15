'use client'
import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { emitChange } from '@/lib/planner'
import { fmt } from '@/lib/finance'
import { hash } from '@/lib/ledger'
import { methodInfo, parseCsv, parseRmb, suggestCategory, type RmbRow } from '@/lib/rmbImport'
import type { FinanceLists } from '@/lib/financeLists'

type Row = RmbRow & { file: string; include: boolean; category: string; purpose: string; mine: string; dup: '' | 'known' | 'similar' }
const PAGE = 120
const PLAT = { alipay: { label: 'Alipay', find: /alipay|支付宝|zhifubao/i }, wechat: { label: 'WeChat Pay', find: /wechat|微信|weixin|wx/i } } as const
const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function readFile(f: File): Promise<string[][]> {
  const buf = await f.arrayBuffer(), name = f.name.toLowerCase()
  if (name.endsWith('.pdf')) throw new Error('PDF statements are not supported for Alipay / WeChat (the layout cannot be read reliably). In the app export the bill as CSV (Alipay) or Excel (WeChat) instead.')
  if (/\.xlsx?$/.test(name)) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]]
    return (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][]).map(r => r.map(c => String(c ?? '')))
  }
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { text = new TextDecoder('gbk').decode(buf) }   // Alipay CSV files are GBK
  return parseCsv(text.replace(/^﻿/, ''))
}

type Props = { userId: string; accounts: any[]; lists: FinanceLists; onChanged: () => Promise<any> | void; onToast: (m: string) => void; onClose: () => void }

export default function RmbImport({ userId, accounts, lists, onChanged, onToast, onClose }: Props) {
  const cny = accounts.filter(a => a.currency === 'CNY')
  const [rows, setRows] = useState<Row[]>([]), [files, setFiles] = useState<string[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [platAcc, setPlatAcc] = useState<Record<string, string>>({})        // platform → account id
  const [methodAcc, setMethodAcc] = useState<Record<string, string>>({})    // `${platform}|${method}` → account id | 'wallet' | 'skip'
  const [filter, setFilter] = useState<'all' | 'import' | 'skipped' | 'dups'>('import')
  const [limit, setLimit] = useState(PAGE)
  const say = (t: string, ok = false) => { setMsg({ ok, t }) }

  const platforms = Array.from(new Set(rows.map(r => r.platform)))
  const methods = useMemo(() => {
    const m = new Map<string, { platform: string; key: string; label: string; last4?: string; n: number }>()
    rows.forEach(r => { const i = methodInfo(r.platform, r.method); if (i.wallet) return; const k = `${r.platform}|${i.key}`; const e = m.get(k); if (e) e.n++; else m.set(k, { platform: r.platform, key: i.key, label: i.label, last4: i.last4, n: 1 }) })
    return Array.from(m.entries())
  }, [rows])

  async function onFiles(list: FileList | null) {
    if (!list?.length) return
    setBusy(true); setMsg(null)
    try {
      const all: Row[] = [], names: string[] = [], notes: string[] = []
      for (const f of Array.from(list)) {
        const res: any = parseRmb(await readFile(f), `${names.length}-`)
        if (res.error) { say(`${f.name}: ${res.error}`); setBusy(false); return }
        names.push(f.name)
        notes.push(`${f.name}: ${res.rows.length} rows (${res.platform === 'alipay' ? 'Alipay' : 'WeChat Pay'})${res.problems.length ? `, ${res.problems.length} skipped` : ''}`)
        res.rows.forEach((r: RmbRow) => all.push({ ...r, file: f.name, include: r.kind !== 'skip', category: r.kind === 'income' ? '' : suggestCategory(r.sourceCategory, r.original, lists.categories), purpose: '', mine: '', dup: '' }))
      }
      // the same order in two files (overlapping periods) is kept once
      const seen = new Set<string>(); const uniq = all.filter(r => { const k = `${r.platform}|${r.orderId}`; if (seen.has(k)) return false; seen.add(k); return true })
      // default accounts
      const pa: Record<string, string> = {}
      for (const p of ['alipay', 'wechat'] as const) pa[p] = cny.find(a => PLAT[p].find.test(`${a.name} ${a.bank_name || ''}`))?.id || ''
      setPlatAcc(pa)
      const ma: Record<string, string> = {}
      uniq.forEach(r => { const i = methodInfo(r.platform, r.method); if (i.wallet) return; const k = `${r.platform}|${i.key}`; if (!(k in ma)) ma[k] = (i.last4 && cny.find(a => a.account_number_last4 === i.last4)?.id) || 'wallet' })
      setMethodAcc(ma); setFiles(names); setRows(uniq); setLimit(PAGE); setFilter('import')
      say(`Read ${uniq.length} transactions from ${notes.join(' · ')}. Next: choose the accounts below, review, then Save.`, true)
      void checkDuplicates(uniq)
    } catch (e: any) { say(e?.message || 'Could not read this file.') }
    setBusy(false)
  }

  const fp = (r: RmbRow) => hash(`${r.platform}|${r.orderId}`)
  function accountFor(r: Row): string | 'skip' {
    const i = methodInfo(r.platform, r.method)
    if (i.wallet) return platAcc[r.platform] || ''
    const m = methodAcc[`${r.platform}|${i.key}`] || 'wallet'
    return m === 'wallet' ? platAcc[r.platform] || '' : m
  }

  /** Step "Check duplicates": same order already imported (exact), or an existing transaction that looks identical (same account, amount, ±1 day). */
  async function checkDuplicates(list: Row[] = rows, keepTicks = false) {
    if (!list.length) return
    setBusy(true)
    try {
      const hashes = list.map(fp), known = new Set<string>()
      for (let i = 0; i < hashes.length; i += 150) {
        const { data, error } = await supabase.from('transactions').select('import_hash').eq('user_id', userId).in('import_hash', hashes.slice(i, i + 150))
        if (error) throw error; (data || []).forEach((d: any) => known.add(d.import_hash))
      }
      const dates = list.map(r => r.date).sort(), min = dates[0], max = dates[dates.length - 1]
      const ex: any[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('transactions').select('transaction_date,amount,from_account_id,import_hash,source_ref').eq('user_id', userId).is('deleted_at', null).eq('currency', 'CNY').gte('transaction_date', min).lte('transaction_date', max).range(from, from + 999)
        if (error) throw error; ex.push(...(data || [])); if ((data || []).length < 1000) break
      }
      const idx = new Map<string, string[]>(); ex.forEach(t => { const k = `${t.from_account_id}|${Number(t.amount).toFixed(2)}`; (idx.get(k) || idx.set(k, []).get(k)!).push(t.transaction_date) })
      const day = (s: string) => Math.round(new Date(s).getTime() / 86400000)
      setRows(list.map(r => {
        if (known.has(fp(r))) return { ...r, dup: 'known', include: false }
        const acc = accountFor(r), cand = idx.get(`${acc}|${r.amount.toFixed(2)}`) || []
        const sim = r.kind !== 'skip' && cand.some(d => Math.abs(day(d) - day(r.date)) <= 1)
        return { ...r, dup: sim ? 'similar' : '', include: keepTicks ? r.include : sim ? false : r.kind !== 'skip' }
      }))
    } catch (e: any) { say('Could not check duplicates: ' + (e?.message || e)) }
    setBusy(false)
  }

  async function createAccount(p: 'alipay' | 'wechat') {
    const { data, error } = await supabase.from('accounts').insert({ user_id: userId, name: PLAT[p].label, type: 'ewallet', currency: 'CNY', opening_balance: 0, opening_balance_date: dstr(new Date()), current_balance: 0 }).select('id')
    if (error || !data?.length) return say('Could not create account: ' + (error?.message || 'not confirmed'))
    await onChanged(); setPlatAcc({ ...platAcc, [p]: data[0].id }); say(`${PLAT[p].label} CNY account created.`, true)
  }

  const typeOf = (r: Row) => { const acc = accounts.find(a => a.id === accountFor(r)); return r.kind === 'refund' ? 'refund' : r.kind === 'income' ? (acc?.type === 'credit_card' ? 'refund' : 'income') : acc?.type === 'credit_card' ? 'credit_card_purchase' : 'expense' }
  const patch = (id: string, v: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...v } : r)))
  const shown = useMemo(() => rows.filter(r => filter === 'all' ? true : filter === 'import' ? r.kind !== 'skip' && r.dup !== 'known' : filter === 'skipped' ? r.kind === 'skip' : r.dup !== ''), [rows, filter])
  const selected = rows.filter(r => r.include)
  const sums = useMemo(() => { let out = 0, inc = 0; selected.forEach(r => { r.kind === 'expense' ? (out += r.amount) : (inc += r.amount) }); return { out, inc } }, [selected])
  const merchants = useMemo(() => { const m = new Map<string, { n: number; total: number }>(); rows.filter(r => r.kind === 'expense' && r.include).forEach(r => { const e = m.get(r.counterparty) || { n: 0, total: 0 }; e.n++; e.total += r.amount; m.set(r.counterparty, e) }); return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n).slice(0, 12) }, [rows])
  const [merchCat, setMerchCat] = useState<Record<string, string>>({})

  async function save() {
    setMsg(null)
    const need = platforms.filter(p => !platAcc[p]); if (need.length) return say(`Choose (or create) the CNY account for ${need.map(p => PLAT[p as 'alipay'].label).join(' and ')}.`)
    const sel = rows.filter(r => r.include && r.kind !== 'skip' && accountFor(r) !== 'skip')
    if (!sel.length) return say('Select at least one transaction to save.')
    setBusy(true)
    try {
      await checkDuplicates(undefined, true)   // final authority: re-check against the database right before saving
      const fresh = (await new Promise<Row[]>(res => setRows(r => { res(r); return r }))).filter(r => r.include && r.kind !== 'skip' && r.dup !== 'known' && accountFor(r) !== 'skip')
      const seen = new Set<string>()
      const batchId = crypto.randomUUID()
      const out = fresh.filter(r => { const h = fp(r); if (seen.has(h)) return false; seen.add(h); return true }).map(r => {
        const type = typeOf(r), credit = r.kind !== 'expense'
        return { user_id: userId, type, amount: r.amount, currency: 'CNY', from_account_id: accountFor(r), to_account_id: null, category: r.category || 'Other', merchant: r.mine.trim() || r.counterparty || r.item || null, original_description: r.original || r.counterparty, my_description: r.mine.trim() || null, original_amount: r.amount, original_direction: credit ? 'credit' : 'debit', purpose: r.purpose || null, transaction_date: r.date, source: 'manual', source_file: r.file, source_ref: `${r.platform}:${r.orderId}`, import_batch: batchId, import_hash: fp(r), description: null, notes: null }
      })
      let inserted = 0, err = ''
      for (let i = 0; i < out.length; i += 100) {
        setMsg({ ok: true, t: `Saving… ${Math.min(i + 100, out.length)} of ${out.length}` })
        const { data, error } = await supabase.from('transactions').insert(out.slice(i, i + 100)).select('id')
        if (error) { err = error.message; break }; inserted += (data || []).length
      }
      const { count, error: ce } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('import_batch', batchId).is('deleted_at', null)
      const confirmed = count || 0
      if (ce) err = err || 'Saved rows could not be re-read: ' + ce.message
      await supabase.from('import_batches').insert({ id: batchId, user_id: userId, kind: 'rmb', file_names: files, rows_selected: sel.length, rows_saved: confirmed, rows_skipped_duplicates: sel.length - out.length, status: err || confirmed !== out.length ? 'partial' : 'saved', error: err || null })
      await onChanged(); emitChange()
      if (err || confirmed !== out.length) return say(`Could not save everything: ${confirmed} of ${out.length} rows are in the database.${err ? ' Database said: ' + err : ''}${/column|schema|check/i.test(err) ? ' → run lib/planner-upgrade-8.sql in Supabase.' : ''} Press Save again — rows already saved are skipped.`)
      onToast(`Saved ${confirmed} RMB transactions and confirmed them in the database.${sel.length - out.length ? ` ${sel.length - out.length} duplicates skipped.` : ''}`)
      onClose()
    } catch (e: any) { say('Could not save: ' + (e?.message || e)) }
    setBusy(false)
  }

  const accOpts = (extra?: boolean) => <>{extra && <option value="wallet">Platform account</option>}{cny.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}{extra && <option value="skip">Skip these rows</option>}</>
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[94vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start"><div><h2 className="font-bold text-lg">Import Alipay / WeChat Pay</h2><p className="text-xs text-gray-500">Upload → Extract → Preview → Edit → Categorize → Check duplicates → Save. Amounts stay in CNY; nothing is converted.</p></div><button onClick={onClose} className="text-gray-400"><X size={18} /></button></div>
        {msg && <div role="alert" className={`sticky top-0 z-10 rounded-lg p-3 text-sm ${msg.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{msg.t}</div>}

        <div className="rounded-xl border border-dashed border-gray-300 p-4">
          <input type="file" multiple accept=".csv,.xlsx,.xls,.pdf" disabled={busy} onChange={e => { void onFiles(e.target.files); e.target.value = '' }} />
          <p className="text-[11px] text-gray-400 mt-2">Alipay: CSV (GBK is handled). WeChat: Excel (.xlsx). You can select several files at once; an order that appears twice is kept once.</p>
        </div>

        {rows.length > 0 && <>
          <div className="grid md:grid-cols-2 gap-3">
            {platforms.map(p => <div key={p} className="rounded-xl bg-gray-50 p-3 text-xs space-y-1.5"><b>{PLAT[p as 'alipay'].label} account</b>
              <div className="flex gap-2"><select className="sel text-xs flex-1" value={platAcc[p] || ''} onChange={e => { setPlatAcc({ ...platAcc, [p]: e.target.value }) }}><option value="">Choose a CNY account…</option>{accOpts()}</select><button className="btn-gray btn-sm text-xs" onClick={() => createAccount(p as 'alipay')}>+ Create</button></div></div>)}
            {methods.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-xs space-y-2 md:col-span-2"><b className="text-amber-800">Paid with a bank card or credit card through the app</b>
              <p className="text-amber-700">These payments also appear on that card’s own statement. Put them on that account — or skip them here if you will import that statement — so they are not counted twice.</p>
              {methods.map(([k, m]) => <div key={k} className="flex flex-wrap items-center gap-2"><span className="w-64">{m.label} <span className="text-gray-400">· {m.n} rows via {PLAT[m.platform as 'alipay'].label}</span></span><select className="sel text-xs" value={methodAcc[k] || 'wallet'} onChange={e => setMethodAcc({ ...methodAcc, [k]: e.target.value })}>{accOpts(true)}</select></div>)}
              <button className="btn-gray btn-sm text-xs" onClick={() => void checkDuplicates()}>Re-check duplicates with these accounts</button></div>}
          </div>

          {merchants.length > 0 && <div className="rounded-xl border p-3 text-xs space-y-2"><b>Categorize by merchant</b> <span className="text-gray-400">— set once, applies to every row from that merchant</span>
            <div className="grid md:grid-cols-2 gap-x-6 gap-y-1">{merchants.map(([name, v]) => <div key={name} className="flex items-center gap-2"><span className="flex-1 truncate" title={name}>{name} <span className="text-gray-400">×{v.n} · {fmt(v.total, 'CNY')}</span></span>
              <select className="sel text-xs" value={merchCat[name] || ''} onChange={e => { setMerchCat({ ...merchCat, [name]: e.target.value }); setRows(rs => rs.map(r => r.counterparty === name && r.kind === 'expense' ? { ...r, category: e.target.value } : r)) }}><option value="">—</option>{lists.categories.map(c => <option key={c}>{c}</option>)}</select></div>)}</div></div>}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(['import', 'all', 'skipped', 'dups'] as const).map(f => <button key={f} onClick={() => { setFilter(f); setLimit(PAGE) }} className={`px-3 py-1 rounded-lg font-semibold ${filter === f ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{f === 'import' ? 'To import' : f === 'all' ? 'All rows' : f === 'skipped' ? `Skipped by default (${rows.filter(r => r.kind === 'skip').length})` : `Duplicates (${rows.filter(r => r.dup).length})`}</button>)}
            <span className="ml-auto flex gap-2"><button className="btn-gray btn-sm text-xs" onClick={() => setRows(rs => rs.map(r => r.kind === 'income' && r.amount < 1 ? { ...r, include: false } : r))}>Untick income under ¥1</button><button className="btn-gray btn-sm text-xs" onClick={() => setRows(rs => rs.map(r => r.kind === 'income' ? { ...r, include: false } : r))}>Untick all income</button><button className="btn-gray btn-sm text-xs" onClick={() => setRows(rs => rs.map(r => r.kind !== 'skip' && r.dup !== 'known' && r.dup !== 'similar' ? { ...r, include: true } : r))}>Tick all</button></span>
          </div>

          <div className="overflow-x-auto border rounded-xl max-h-[46vh] overflow-y-auto"><table className="w-full text-xs min-w-[1100px]"><thead className="bg-gray-50 sticky top-0 text-left"><tr><th className="p-2">Include</th><th className="p-2">Date</th><th className="p-2">Original description</th><th className="p-2">My description</th><th className="p-2">Account</th><th className="p-2 text-right">Debit / Credit</th><th className="p-2">Type</th><th className="p-2">Category</th><th className="p-2">Purpose</th><th className="p-2">Note</th></tr></thead><tbody>
            {shown.slice(0, limit).map(r => { const acc = accountFor(r), credit = r.kind !== 'expense'; return <tr key={r.id} className={`border-t align-top ${r.kind === 'skip' || r.dup ? 'bg-gray-50/70' : ''}`}>
              <td className="p-2"><input type="checkbox" checked={r.include} disabled={r.dup === 'known'} onChange={e => patch(r.id, { include: e.target.checked })} /></td>
              <td className="p-2 whitespace-nowrap">{r.date}</td>
              <td className="p-2 max-w-xs text-gray-500 break-words" title={r.original}>{r.original || '—'}</td>
              <td className="p-2"><input className="inp text-xs w-36" value={r.mine} onChange={e => patch(r.id, { mine: e.target.value })} placeholder="optional" /></td>
              <td className="p-2 whitespace-nowrap">{acc === 'skip' ? <span className="text-gray-400">skipped</span> : accounts.find(a => a.id === acc)?.name || <span className="text-red-500">no account</span>}</td>
              <td className={`p-2 text-right font-semibold whitespace-nowrap ${credit ? 'text-green-600' : 'text-red-500'}`}>{credit ? '+' : '−'}{r.amount.toFixed(2)}</td>
              <td className="p-2 whitespace-nowrap">{r.kind === 'skip' ? '—' : typeOf(r) === 'refund' ? 'Refund' : typeOf(r) === 'income' ? 'Income' : typeOf(r) === 'credit_card_purchase' ? 'Card purchase' : 'Expense'}</td>
              <td className="p-2"><select className="sel text-xs" value={r.category} onChange={e => patch(r.id, { category: e.target.value })}><option value="">—</option>{Array.from(new Set([...lists.categories, r.category].filter(Boolean))).map(c => <option key={c}>{c}</option>)}</select></td>
              <td className="p-2"><select className="sel text-xs" value={r.purpose} onChange={e => patch(r.id, { purpose: e.target.value })}><option value="">—</option>{lists.purposes.map(p => <option key={p}>{p}</option>)}</select></td>
              <td className="p-2 text-[11px] text-amber-700">{r.dup === 'known' ? 'Already imported' : r.dup === 'similar' ? 'Looks like an existing transaction (same account, amount, ±1 day) — unticked' : r.skipReason || (r.status && !/成功|已到账|支付成功|已存入|对方已收钱|已收钱|已转账/.test(r.status) ? r.status : '')}</td></tr> })}
            {shown.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-gray-400">Nothing in this view.</td></tr>}
          </tbody></table></div>
          {shown.length > limit && <button className="text-xs text-teal-600 font-semibold" onClick={() => setLimit(l => l + PAGE)}>Show more ({shown.length - limit} left)</button>}

          <div className="flex flex-wrap items-center gap-3 border-t pt-3"><span className="text-sm"><b>{selected.length}</b> selected · spending <b className="text-red-500">{fmt(sums.out, 'CNY')}</b> · money in <b className="text-green-600">{fmt(sums.inc, 'CNY')}</b></span>
            <button disabled={busy} onClick={save} className="btn-blue btn-sm ml-auto">{busy ? 'Working…' : `Save ${selected.length} selected transactions`}</button></div>
        </>}
      </div>
    </div>
  )
}
