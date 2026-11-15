'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Archive, Pencil, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { emitChange } from '@/lib/planner'
import { fmt } from '@/lib/finance'
import { FREQ_LABEL, candidatesFor, isAutoMatch, periodsFor, stateOf, type Period } from '@/lib/fixedMatch'
import { buildSchedule } from '@/lib/loans'
import type { FinanceLists } from '@/lib/financeLists'

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const blank = { id: '', name: '', category: 'Bills', amount: '', currency: 'IDR', frequency: 'monthly', due_day: '1', due_month: '', payment_account_id: '', match_keyword: '', status: 'active', notes: '' }
const BADGE: Record<string, string> = { paid: 'bg-green-100 text-green-700', manual: 'bg-green-100 text-green-700', skipped: 'bg-gray-100 text-gray-500', overdue: 'bg-red-100 text-red-600', due_soon: 'bg-amber-100 text-amber-700', upcoming: 'bg-gray-100 text-gray-500' }
const LABEL: Record<string, string> = { paid: '✓ Paid', manual: '✓ Paid (manual)', skipped: 'Skipped', overdue: 'Overdue / not found', due_soon: 'Due soon', upcoming: 'Upcoming' }

type Props = { userId: string; accounts: any[]; transactions: any[]; lists: FinanceLists; onChanged: () => Promise<any> | void; onToast: (m: string) => void }

export default function FixedBills({ userId, accounts, transactions, lists, onChanged, onToast }: Props) {
  const [bills, setBills] = useState<any[]>([]), [links, setLinks] = useState<any[]>([])
  const [loans, setLoans] = useState<any[]>([]), [loanPays, setLoanPays] = useState<any[]>([]), [loanRates, setLoanRates] = useState<any[]>([])
  const [form, setForm] = useState<any>(null)
  const [picker, setPicker] = useState<string>('')           // `${billId}:${period}` being manually corrected
  const [note, setNote] = useState('')
  const today = todayStr()
  const accName = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a.name])), [accounts])
  const txById = useMemo(() => Object.fromEntries(transactions.map(t => [t.id, t])), [transactions])

  const load = useCallback(async () => {
    const q = (t: string) => supabase.from(t).select('*').eq('user_id', userId)
    const [b, l, ln, lp, lr] = await Promise.all([q('financial_fixed_expenses').eq('is_active', true).order('due_day'), q('fixed_payments'), q('financial_loans'), q('loan_payments'), q('loan_rate_changes')])
    setBills(b.data || []); setLoans(ln.error ? [] : ln.data || []); setLoanPays(lp.error ? [] : lp.data || []); setLoanRates(lr.error ? [] : lr.data || [])
    if (l.error) setNote('Run lib/planner-upgrade-9.sql in Supabase to turn on automatic matching and manual corrections.'); else { setLinks(l.data || []); setNote('') }
    return { bills: b.data || [], links: l.error ? null : l.data || [] }
  }, [userId])
  useEffect(() => { if (userId) void load() }, [load, userId])

  const linkOf = (billId: string, period: string) => links.find(l => l.fixed_id === billId && l.period === period)
  const usedTx = useMemo(() => new Set<string>([...links.map(l => l.transaction_id).filter(Boolean), ...loanPays.flatMap(p => (Array.isArray(p.transaction_ids) ? p.transaction_ids : []))]), [links, loanPays])
  const activeBills = bills.filter(b => (b.status || 'active') === 'active')

  /** Link every bill/period that has exactly one convincing transaction (amount + keyword or account). Safe to repeat. */
  async function runMatching(quiet = false) {
    const fresh = await load()
    if (!fresh.links) return
    const taken = new Set<string>([...fresh.links.map((l: any) => l.transaction_id).filter(Boolean), ...loanPays.flatMap(p => (Array.isArray(p.transaction_ids) ? p.transaction_ids : []))])
    const add: any[] = []
    for (const b of fresh.bills.filter((x: any) => (x.status || 'active') === 'active')) {
      for (const per of periodsFor(b, today)) {
        if (fresh.links.some((l: any) => l.fixed_id === b.id && l.period === per.key)) continue
        const best = candidatesFor(b, per, transactions, taken).filter(isAutoMatch)[0]
        if (!best) continue
        taken.add(best.tx.id)
        add.push({ user_id: userId, fixed_id: b.id, period: per.key, transaction_id: best.tx.id, status: 'paid', matched_by: 'auto' })
      }
    }
    if (!add.length) { if (!quiet) onToast('Matching done: no new payments found.'); return }
    const { error } = await supabase.from('fixed_payments').insert(add)
    if (error) { if (!quiet) onToast('Could not save matches: ' + error.message); return }
    await load(); emitChange()
    onToast(`Matched ${add.length} bill payment${add.length > 1 ? 's' : ''} with your transactions.`)
  }
  // auto-match when the page opens and whenever the transactions change (e.g. after an import)
  useEffect(() => { if (userId && transactions.length && bills.length && !note) void runMatching(true) /* eslint-disable-next-line */ }, [transactions.length, bills.length])

  async function saveBill() {
    const f = form, amount = Number(f.amount), day = Number(f.due_day)
    if (!f.name.trim() || !(amount > 0) || !(day >= 1 && day <= 31)) return onToast('Enter a name, an amount above zero and a due day from 1 to 31.')
    if (f.frequency !== 'monthly' && !(Number(f.due_month) >= 1 && Number(f.due_month) <= 12)) return onToast('Choose the due month for a quarterly / half-yearly / yearly bill.')
    const payload: any = { user_id: userId, name: f.name.trim(), category: f.category || 'Bills', amount, currency: f.currency, due_day: day, frequency: f.frequency, due_month: f.frequency === 'monthly' ? null : Number(f.due_month), payment_account_id: f.payment_account_id || null, match_keyword: f.match_keyword.trim() || null, status: f.status, notes: f.notes.trim() || null }
    const res = f.id ? await supabase.from('financial_fixed_expenses').update(payload).eq('id', f.id).eq('user_id', userId).select('id') : await supabase.from('financial_fixed_expenses').insert(payload).select('id')
    if (res.error || !res.data?.length) return onToast('Could not save bill: ' + (res.error?.message || 'not confirmed') + (/column|schema/i.test(res.error?.message || '') ? ' → run lib/planner-upgrade-9.sql in Supabase.' : ''))
    setForm(null); await load(); await onChanged(); emitChange(); onToast('Bill saved.')
  }
  async function archive(id: string) {
    if (!confirm('Archive this bill? Past payment links are kept.')) return
    const { error } = await supabase.from('financial_fixed_expenses').update({ is_active: false }).eq('id', id).eq('user_id', userId)
    error ? onToast('Could not archive bill: ' + error.message) : (await load(), await onChanged(), emitChange())
  }
  async function setLink(bill: any, per: Period, txId: string | null, status: 'paid' | 'manual' | 'skipped') {
    const existing = linkOf(bill.id, per.key)
    if (existing) { const { error } = await supabase.from('fixed_payments').delete().eq('id', existing.id).eq('user_id', userId); if (error) return onToast('Could not change: ' + error.message) }
    if (txId || status !== 'paid') {
      if (txId && usedTx.has(txId) && existing?.transaction_id !== txId) return onToast('That transaction is already linked to another bill or loan installment.')
      const { error } = await supabase.from('fixed_payments').insert({ user_id: userId, fixed_id: bill.id, period: per.key, transaction_id: txId, status, matched_by: 'manual' })
      if (error) return onToast('Could not save: ' + error.message)
    }
    setPicker(''); await load(); emitChange(); onToast('Saved.')
  }

  // loan installments (read-only here; recorded in Loans)
  const loanRows = useMemo(() => loans.filter(l => (l.status || 'active') === 'active').map(l => {
    const sched = buildSchedule(l, loanRates.filter(r => r.loan_id === l.id), loanPays.filter(p => p.loan_id === l.id), today)
    return { loan: l, next: sched.find(r => !r.actual) }
  }).filter(x => x.next), [loans, loanRates, loanPays, today])

  const totals: Record<string, number> = {}
  activeBills.filter(b => (b.frequency || 'monthly') === 'monthly').forEach(b => { totals[b.currency] = (totals[b.currency] || 0) + Number(b.amount) })
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="space-y-4">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-lg">Fixed Expenses</h2><p className="text-sm text-gray-500">Recurring bills and installments. A bill turns <b>Paid</b> when an imported or recorded transaction matches its amount, keyword/account and period — and is linked to that transaction.</p></div>
        <div className="flex gap-2"><button className="btn-gray btn-sm text-xs" onClick={() => runMatching()}>Run matching</button><button className="btn-blue btn-sm flex items-center gap-1" onClick={() => setForm({ ...blank, currency: accounts[0]?.currency || 'IDR' })}><Plus size={15} /> Add bill</button></div></div>
      {note && <div className="rounded-xl bg-amber-50 text-amber-800 text-sm p-3">{note}</div>}

      {form && <div className="card p-4 space-y-3">
        <b>{form.id ? 'Edit bill' : 'New recurring bill'}</b>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="text-xs font-semibold">Name<input className="inp w-full mt-1 text-sm" placeholder="Coway, insurance, Netflix…" value={form.name} onChange={set('name')} /></label>
          <label className="text-xs font-semibold">Category<select className="sel w-full mt-1 text-sm" value={form.category} onChange={set('category')}>{Array.from(new Set([...lists.categories, 'Bills', form.category])).map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="text-xs font-semibold">Amount<input type="number" step="any" className="inp w-full mt-1 text-sm" value={form.amount} onChange={set('amount')} /></label>
          <label className="text-xs font-semibold">Currency<select className="sel w-full mt-1 text-sm" value={form.currency} onChange={set('currency')}>{['IDR', 'CNY', 'USD', 'EUR', 'SGD'].map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="text-xs font-semibold">Frequency<select className="sel w-full mt-1 text-sm" value={form.frequency} onChange={set('frequency')}>{Object.entries(FREQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-xs font-semibold">Due day (1–31)<input type="number" min="1" max="31" className="inp w-full mt-1 text-sm" value={form.due_day} onChange={set('due_day')} /></label>
          {form.frequency !== 'monthly' && <label className="text-xs font-semibold">Due month (1–12)<input type="number" min="1" max="12" className="inp w-full mt-1 text-sm" value={form.due_month} onChange={set('due_month')} /></label>}
          <label className="text-xs font-semibold">Payment account<select className="sel w-full mt-1 text-sm" value={form.payment_account_id} onChange={set('payment_account_id')}><option value="">Any</option>{accounts.filter(a => a.currency === form.currency).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="text-xs font-semibold md:col-span-2">Matching keywords (comma-separated)<input className="inp w-full mt-1 text-sm" placeholder="defaults to the name" value={form.match_keyword} onChange={set('match_keyword')} /></label>
          <label className="text-xs font-semibold">Status<select className="sel w-full mt-1 text-sm" value={form.status} onChange={set('status')}><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></label>
          <label className="text-xs font-semibold md:col-span-2">Notes<input className="inp w-full mt-1 text-sm" value={form.notes} onChange={set('notes')} /></label>
        </div>
        <div className="flex gap-2"><button className="btn-blue btn-sm" onClick={saveBill}>Save</button><button className="btn-gray btn-sm" onClick={() => setForm(null)}>Cancel</button></div>
      </div>}

      {Object.keys(totals).length > 0 && <div className="card p-4 flex flex-wrap gap-x-6 gap-y-1 text-sm"><span className="text-gray-500">Monthly bills total:</span>{Object.entries(totals).map(([c, v]) => <b key={c}>{fmt(v, c)}</b>)}</div>}

      {loanRows.length > 0 && <div className="space-y-2"><h3 className="text-sm font-bold text-gray-500">Loan installments</h3>{loanRows.map(({ loan, next }) => {
        const st = stateOf(undefined, next!.due, today)
        return <div key={loan.id} className="card p-4 flex flex-wrap items-center justify-between gap-3"><div><b>🏦 {loan.name}</b><div className="text-xs text-gray-500">Installment #{next!.no} · due {next!.due} · principal {fmt(next!.principal, loan.currency || 'IDR')} + interest {fmt(next!.interest, loan.currency || 'IDR')}{next!.status === 'estimate' ? ' (estimate)' : ''}</div></div>
          <div className="flex items-center gap-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${BADGE[st]}`}>{LABEL[st]}</span><b>{fmt(next!.total, loan.currency || 'IDR')}</b><Link href="/financial/loans" className="text-xs text-teal-600 font-semibold">Open loan →</Link></div></div>
      })}</div>}

      <div className="space-y-3">
        {bills.map(b => {
          const pers = periodsFor(b, today), shown = pers.slice(-1)[0], inactive = (b.status || 'active') !== 'active'
          const history = pers.slice(0, -1).filter(p => linkOf(b.id, p.key) || p.due < today)
          return <div key={b.id} className={`card p-4 space-y-2 ${inactive ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><b>{b.name}</b> <span className="text-[11px] text-gray-400">{inactive ? `· ${b.status}` : ''}</span><div className="text-xs text-gray-500">{b.category} · {FREQ_LABEL[b.frequency || 'monthly']} · due day {b.due_day}{b.payment_account_id ? ` · pays from ${accName[b.payment_account_id] || '—'}` : ''}{b.match_keyword ? ` · keywords: ${b.match_keyword}` : ''}</div></div>
              <div className="flex items-center gap-3"><b>{fmt(Number(b.amount), b.currency)}</b><button className="text-gray-400 hover:text-teal-600" onClick={() => setForm({ ...blank, ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v ?? ''])) })} aria-label="Edit"><Pencil size={15} /></button><button className="text-gray-400 hover:text-red-500" onClick={() => archive(b.id)} aria-label="Archive"><Archive size={15} /></button></div></div>
            {!inactive && [...history.slice(-2), ...(shown ? [shown] : [])].map(per => {
              const link = linkOf(b.id, per.key), tx = link?.transaction_id ? txById[link.transaction_id] : null, st = stateOf(link, per.due, today)
              const key = `${b.id}:${per.key}`
              const cands = picker === key ? candidatesFor(b, per, transactions, usedTx).slice(0, 8) : []
              return <div key={per.key} className="border-t border-gray-50 pt-2 text-xs space-y-1.5">
                <div className="flex flex-wrap items-center gap-2"><span className="text-gray-400 w-20">{per.key} · due {per.due.slice(5)}</span><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${BADGE[st]}`}>{LABEL[st]}</span>
                  {tx && <span className="text-gray-600">{tx.transaction_date} · {fmt(Number(tx.amount), tx.currency)} · {accName[tx.from_account_id] || ''} · {(tx.my_description || tx.original_description || tx.merchant || '').slice(0, 48)}{link?.matched_by === 'manual' ? ' (manual)' : ''}</span>}
                  {link && !tx && link.status === 'paid' && <span className="text-amber-600">linked transaction was archived or removed</span>}
                  <span className="ml-auto flex gap-3 text-teal-600 font-semibold">
                    <button onClick={() => setPicker(picker === key ? '' : key)}>{link ? 'Change match' : 'Find / link transaction'}</button>
                    {!link && <button onClick={() => setLink(b, per, null, 'manual')}>Mark paid</button>}
                    {!link && <button className="text-gray-400" onClick={() => setLink(b, per, null, 'skipped')}>Skip</button>}
                    {link && <button className="text-red-500" onClick={() => setLink(b, per, null, 'paid').then(() => undefined)}>Unlink</button>}
                  </span></div>
                {picker === key && <div className="rounded-lg bg-gray-50 p-2 space-y-1">{cands.length === 0 ? <div className="text-gray-400">No unlinked transaction within 10 days before to 20 days after the due date. Import the statement first, or use “Mark paid”.</div> : cands.map(c => <div key={c.tx.id} className="flex items-center justify-between gap-2"><span>{c.tx.transaction_date} · {fmt(Number(c.tx.amount), c.tx.currency)} · {accName[c.tx.from_account_id] || ''} · {(c.tx.original_description || c.tx.merchant || '').slice(0, 44)} <span className="text-gray-400">({c.why.join(' + ')})</span></span><button className="btn-blue btn-sm text-xs" onClick={() => setLink(b, per, c.tx.id, 'paid')}>Use this</button></div>)}</div>}
              </div>
            })}
          </div>
        })}
        {bills.length === 0 && <div className="card p-5 text-sm text-gray-500">No recurring bills yet. Add insurance, Coway, subscriptions… They appear in your calendar and are ticked off automatically when a matching transaction shows up.</div>}
      </div>
    </div>
  )
}
