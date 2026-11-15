'use client'
import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { emitChange } from '@/lib/planner'
import { fmt } from '@/lib/finance'
import { buildSchedule, outstandingPrincipal, totalsOf, type LoanPayment, type RateChange } from '@/lib/loans'

const NEEDS = /original_description|my_description|source_ref|split_group|schema cache|loan_payments|loan_rate_changes|column/i
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const num = (v: any) => (v === '' || v == null ? 0 : Number(v))

type Props = { loan: any; rates: any[]; payments: any[]; accounts: any[]; txs: any[]; userId: string; reload: () => Promise<void>; say: (m: string, bad?: boolean) => void }

export default function LoanDetail({ loan, rates, payments, accounts, txs, userId, reload, say }: Props) {
  const [tab, setTab] = useState<'schedule' | 'rates' | 'payments'>('schedule')
  const cur = loan.currency || 'IDR'
  const sched = useMemo(() => buildSchedule(loan, rates as RateChange[], payments as LoanPayment[], today()), [loan, rates, payments])
  const out = payments.length ? outstandingPrincipal(loan, payments) : Number(loan.current_balance || 0)
  const nextRow = sched.find(r => !r.actual)
  const tot = totalsOf(sched)
  const accs = accounts.filter(a => a.currency === cur && a.type !== 'credit_card')
  const fail = (e: any) => say('Could not save: ' + (e?.message || e) + (NEEDS.test(String(e?.message || e)) ? ' → run lib/planner-upgrade-8.sql and planner-upgrade-9.sql in Supabase.' : ''), true)

  // ---------- record an installment (creates ledger rows: principal / interest / fees separately) ----------
  const [form, setForm] = useState<any>(null)
  function openRecord(row: any, linkTx?: any) {
    const interest = row ? row.interest : 0, fees = row ? row.fees : 0
    const total = linkTx ? Number(linkTx.amount) : row ? row.total : 0
    setForm({ no: row?.no || 1, date: linkTx?.transaction_date || today(), account: linkTx?.from_account_id || loan.payment_account_id || '', principal: String(Math.max(0, Math.round((total - interest - fees) * 100) / 100)), interest: String(interest), fees: String(fees), linkTx: linkTx || null })
  }
  async function saveInstallment() {
    const f = form, principal = num(f.principal), interest = num(f.interest), fees = num(f.fees)
    if (!f.account) return say('Choose the account the installment was paid from.', true)
    if (principal < 0 || interest < 0 || fees < 0 || principal + interest + fees <= 0) return say('Enter principal, interest and fees (not negative, total above zero).', true)
    if (payments.some(p => p.kind === 'installment' && p.installment_no === Number(f.no))) return say(`Installment #${f.no} is already recorded (no duplicate payments).`, true)
    const base = { user_id: userId, currency: cur, from_account_id: f.account, category: 'Loan', merchant: loan.lender || loan.name, purpose: 'Bills', transaction_date: f.date, source: 'manual', source_ref: `loan:${loan.id}:${f.no}` }
    const label = `${loan.name} installment #${f.no}`
    const ids: string[] = []
    try {
      if (f.linkTx) {
        // an imported bank line that holds the whole installment: turn it into the principal part, add interest/fees beside it
        const t = f.linkTx
        const { error } = await supabase.from('transactions').update({ type: 'loan_repayment', amount: principal || t.amount, my_description: `${label} – principal`, category: 'Loan', source_ref: base.source_ref, updated_at: new Date().toISOString() }).eq('id', t.id).eq('user_id', userId)
        if (error) throw error
        ids.push(t.id)
        await supabase.from('transaction_audit').insert({ user_id: userId, transaction_id: t.id, action: 'edit', changes: { type: { from: t.type, to: 'loan_repayment' }, amount: { from: t.amount, to: principal } } })
        const extra = [interest > 0 && { type: 'interest', amount: interest, my_description: `${label} – interest` }, fees > 0 && { type: 'fee', amount: fees, my_description: `${label} – fees` }].filter(Boolean) as any[]
        if (extra.length) {
          const { data, error: e2 } = await supabase.from('transactions').insert(extra.map(x => ({ ...base, ...x, original_description: t.original_description || null, source_file: t.source_file || null, from_account_id: t.from_account_id, transaction_date: t.transaction_date }))).select('id')
          if (e2 || (data || []).length !== extra.length) throw e2 || new Error('interest/fee rows were not created')
          ids.push(...(data || []).map((d: any) => d.id))
        }
      } else {
        const rows = [principal > 0 && { type: 'loan_repayment', amount: principal, my_description: `${label} – principal` }, interest > 0 && { type: 'interest', amount: interest, my_description: `${label} – interest` }, fees > 0 && { type: 'fee', amount: fees, my_description: `${label} – fees` }].filter(Boolean) as any[]
        const { data, error } = await supabase.from('transactions').insert(rows.map(x => ({ ...base, ...x }))).select('id')
        if (error || (data || []).length !== rows.length) throw error || new Error('rows were not created')
        ids.push(...(data || []).map((d: any) => d.id))
      }
      const { error: pe } = await supabase.from('loan_payments').insert({ user_id: userId, loan_id: loan.id, kind: 'installment', installment_no: Number(f.no), due_date: sched.find(r => r.no === Number(f.no))?.due || null, paid_date: f.date, principal, interest, fees, transaction_ids: ids })
      if (pe) throw pe
      await syncLoan(principal)
      setForm(null); await reload(); emitChange()
      say(`Installment #${f.no} saved: principal ${fmt(principal, cur)} (reduces the loan), interest ${fmt(interest, cur)} and fees ${fmt(fees, cur)} (expenses).`)
    } catch (e) { fail(e) }
  }
  async function syncLoan(principalPaid: number, closed = false) {
    const newOut = Math.max(0, Math.round((out - principalPaid) * 100) / 100)
    const done = payments.filter(p => p.kind === 'installment').length + 1
    await supabase.from('financial_loans').update({ current_balance: newOut, paid_months: done, ...(closed || newOut <= 0.005 ? { status: 'paid_off' } : {}) }).eq('id', loan.id).eq('user_id', userId)
  }
  async function undo(p: any) {
    if (!confirm('Undo this payment? Its ledger rows are archived (restorable) and the loan balance goes back up.')) return
    const ids: string[] = Array.isArray(p.transaction_ids) ? p.transaction_ids : []
    if (ids.length) { const { error } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).in('id', ids).eq('user_id', userId); if (error) return fail(error) }
    const { error } = await supabase.from('loan_payments').delete().eq('id', p.id).eq('user_id', userId); if (error) return fail(error)
    await supabase.from('financial_loans').update({ current_balance: Math.round((out + Number(p.principal || 0)) * 100) / 100, status: 'active' }).eq('id', loan.id).eq('user_id', userId)
    await reload(); emitChange(); say('Payment undone.')
  }
  async function backfill() {
    const past = sched.filter(r => !r.actual && r.due <= today())
    if (!past.length) return say('No past installments to backfill.', true)
    if (!confirm(`Mark ${past.length} past installments as paid using the schedule figures? No ledger transactions are created — use this only for history you don't want to import.`)) return
    const { error } = await supabase.from('loan_payments').insert(past.map(r => ({ user_id: userId, loan_id: loan.id, kind: 'installment', installment_no: r.no, due_date: r.due, paid_date: r.due, principal: r.principal, interest: r.interest, fees: r.fees, note: 'backfilled from schedule' })))
    if (error) return fail(error)
    const last = past[past.length - 1]
    await supabase.from('financial_loans').update({ current_balance: last.closing, paid_months: last.no }).eq('id', loan.id).eq('user_id', userId)
    await reload(); say(`${past.length} installments marked as paid.`)
  }

  // ---------- rates ----------
  const [rate, setRate] = useState({ date: today(), rate: '', verified: true, note: '' })
  async function addRate() {
    const r = Number(rate.rate); if (!rate.date || !Number.isFinite(r) || r < 0) return say('Enter an effective date and a rate (e.g. 8.75).', true)
    const { error } = await supabase.from('loan_rate_changes').insert({ user_id: userId, loan_id: loan.id, effective_date: rate.date, annual_rate: r, verified: rate.verified, note: rate.note || null })
    if (error) return fail(error)
    await supabase.from('financial_loans').update({ annual_interest_rate: r, ...(loan.initial_rate == null ? { initial_rate: loan.annual_interest_rate } : {}) }).eq('id', loan.id).eq('user_id', userId)
    setRate({ date: today(), rate: '', verified: true, note: '' }); await reload(); say('Rate saved. Future installments were recalculated on the remaining principal and tenor.')
  }
  async function delRate(id: string) { if (!confirm('Delete this rate change?')) return; const { error } = await supabase.from('loan_rate_changes').delete().eq('id', id).eq('user_id', userId); error ? fail(error) : (await reload(), say('Deleted.')) }

  // ---------- prepayment ----------
  const [pre, setPre] = useState<any>(null)
  async function savePrepay() {
    const full = pre.kind === 'prepayment_full', principal = full ? out : num(pre.amount), penalty = num(pre.penalty)
    if (!pre.account) return say('Choose the account the money came from.', true)
    if (!(principal > 0) || principal > out + 0.005) return say(`Prepayment must be above zero and not more than the outstanding ${fmt(out, cur)}.`, true)
    const base = { user_id: userId, currency: cur, from_account_id: pre.account, category: 'Loan', merchant: loan.lender || loan.name, purpose: 'Bills', transaction_date: pre.date, source: 'manual', source_ref: `loan:${loan.id}:prepay` }
    const rows = [{ ...base, type: 'loan_repayment', amount: principal, my_description: `${loan.name} – ${full ? 'full repayment' : 'partial prepayment'}` }, ...(penalty > 0 ? [{ ...base, type: 'fee', amount: penalty, my_description: `${loan.name} – prepayment penalty` }] : [])]
    try {
      const { data, error } = await supabase.from('transactions').insert(rows).select('id')
      if (error || (data || []).length !== rows.length) throw error || new Error('rows were not created')
      const { error: pe } = await supabase.from('loan_payments').insert({ user_id: userId, loan_id: loan.id, kind: pre.kind, paid_date: pre.date, principal, interest: 0, fees: penalty, effect: full ? null : pre.effect, transaction_ids: (data || []).map((d: any) => d.id) })
      if (pe) throw pe
      await supabase.from('financial_loans').update({ current_balance: Math.round((out - principal) * 100) / 100, ...(full ? { status: 'paid_off' } : {}) }).eq('id', loan.id).eq('user_id', userId)
      setPre(null); await reload(); emitChange(); say(full ? 'Loan fully repaid.' : 'Prepayment saved; the schedule was recalculated.')
    } catch (e) { fail(e) }
  }

  // bank lines that look like this loan's installment (for linking)
  const linkedIds = new Set(payments.flatMap(p => (Array.isArray(p.transaction_ids) ? p.transaction_ids : [])))
  const candidates = useMemo(() => {
    if (!nextRow) return []
    const kw = String(loan.match_keyword || loan.lender || loan.name || '').split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean)
    return txs.filter(t => t.type === 'expense' && t.currency === cur && !linkedIds.has(t.id) && Math.abs(new Date(t.transaction_date).getTime() - new Date(nextRow.due).getTime()) <= 12 * 86400000
      && Math.abs(Number(t.amount) - nextRow.total) <= Math.max(1, nextRow.total * 0.02)
      && (kw.some(k => `${t.original_description || ''} ${t.merchant || ''} ${t.my_description || ''}`.toLowerCase().includes(k)) || (loan.payment_account_id && t.from_account_id === loan.payment_account_id))).slice(0, 5)
  }, [txs, nextRow, loan, payments])

  const inp = 'inp text-xs w-full'
  const review = loan.next_rate_review_date && loan.next_rate_review_date <= today()
  return (
    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div><div className="text-xs text-gray-500">Outstanding principal</div><b>{fmt(out, cur)}</b></div>
        <div><div className="text-xs text-gray-500">Next installment</div><b>{nextRow ? `${fmt(nextRow.total, cur)} · ${nextRow.due}` : '—'}</b>{nextRow?.status === 'estimate' && <span className="text-[10px] text-amber-600"> estimate</span>}</div>
        <div><div className="text-xs text-gray-500">Interest still to pay (schedule)</div><b>{fmt(totalsOf(sched.filter(r => !r.actual)).interest, cur)}</b></div>
        <div><div className="text-xs text-gray-500">Interest paid so far</div><b>{fmt(sched.filter(r => r.actual).reduce((s, r) => s + r.interest, 0), cur)}</b></div>
      </div>
      {review && <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-3">Rate review date {loan.next_rate_review_date} has passed. Enter the new rate your bank confirmed under “Rates” — future installments are only estimates until then.</div>}
      {candidates.length > 0 && <div className="rounded-lg bg-teal-50 text-teal-800 text-xs p-3 space-y-1.5"><b>Possible payment found in your imported transactions</b>{candidates.map(t => <div key={t.id} className="flex flex-wrap items-center gap-2"><span>{t.transaction_date} · {fmt(Number(t.amount), cur)} · {(t.original_description || t.merchant || '').slice(0, 50)}</span><button className="btn-blue btn-sm text-xs" onClick={() => { openRecord(nextRow, t); setTab('payments') }}>Link as installment #{nextRow!.no}</button></div>)}</div>}

      <div className="flex flex-wrap gap-2">
        {(['schedule', 'rates', 'payments'] as const).map(k => <button key={k} onClick={() => setTab(k)} className={`px-3 py-1 text-xs rounded-lg font-semibold ${tab === k ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{k === 'schedule' ? 'Schedule' : k === 'rates' ? 'Interest rates' : 'Payments & prepayment'}</button>)}
        {nextRow && <button className="btn-blue btn-sm text-xs ml-auto" onClick={() => { openRecord(nextRow); setTab('payments') }}>Record installment #{nextRow.no}</button>}
      </div>

      {tab === 'schedule' && (sched.length === 0 ? <p className="text-sm text-gray-500">Add the original principal, tenor, interest rate and first installment date (Edit) to generate the schedule.</p> : <>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto border rounded-xl"><table className="w-full text-xs min-w-[760px]"><thead className="bg-gray-50 sticky top-0 text-left"><tr><th className="p-2">#</th><th className="p-2">Due</th><th className="p-2 text-right">Opening principal</th><th className="p-2 text-right">Principal</th><th className="p-2 text-right">Interest</th><th className="p-2 text-right">Total installment</th><th className="p-2 text-right">Closing principal</th><th className="p-2">Rate</th><th className="p-2">Status</th></tr></thead><tbody>
          {sched.map(r => <tr key={r.no} className={`border-t ${r.actual ? 'bg-green-50/40' : r.status === 'due' ? 'bg-red-50/40' : ''}`}><td className="p-2">{r.no}</td><td className="p-2">{r.due}</td><td className="p-2 text-right">{fmt(r.opening, cur)}</td><td className="p-2 text-right">{fmt(r.principal, cur)}</td><td className="p-2 text-right">{fmt(r.interest, cur)}</td><td className="p-2 text-right font-semibold">{fmt(r.total, cur)}</td><td className="p-2 text-right">{fmt(r.closing, cur)}</td><td className="p-2">{r.rate}%{r.note && <div className="text-[10px] text-amber-600">{r.note}</div>}</td><td className="p-2">{r.actual ? '✓ Paid' : r.status === 'due' ? 'Due / unpaid' : r.status === 'estimate' ? 'Estimate' : 'Upcoming'}</td></tr>)}
        </tbody></table></div>
        <p className="text-[11px] text-gray-400">Interest each month = opening principal × rate ÷ 12. Your bank may round or count days differently — record the bank’s actual figures and the schedule follows them. Over the full term: interest {fmt(tot.interest, cur)}. Future floating rates are never guessed: rows after a rate review are marked “Estimate” at the last rate you entered.</p>
        <button className="text-xs text-teal-600 font-semibold" onClick={backfill}>Mark all past installments as paid (history only)</button></>)}

      {tab === 'rates' && <div className="space-y-2">
        <div className="text-xs text-gray-500">Starting rate: <b>{loan.initial_rate ?? loan.annual_interest_rate}%</b> · {loan.interest_type === 'floating' ? 'floating' : loan.interest_type === 'fixed_then_floating' ? `fixed for ${loan.fixed_period_months || '?'} months, then floating` : 'fixed'}{loan.next_rate_review_date ? ` · next review ${loan.next_rate_review_date}` : ''}</div>
        {rates.map(r => <div key={r.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"><span>From <b>{r.effective_date}</b>: <b>{r.annual_rate}%</b> {r.verified ? <span className="text-[10px] text-green-600">bank-confirmed</span> : <span className="text-[10px] text-amber-600">not verified</span>} {r.note && <span className="text-xs text-gray-400">· {r.note}</span>}</span><button onClick={() => delRate(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></div>)}
        {rates.length === 0 && <p className="text-xs text-gray-400">No rate changes yet.</p>}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end"><label className="text-[11px] font-semibold">Effective date<input type="date" className={inp} value={rate.date} onChange={e => setRate({ ...rate, date: e.target.value })} /></label><label className="text-[11px] font-semibold">New rate % / year<input type="number" step="0.01" className={inp} value={rate.rate} onChange={e => setRate({ ...rate, rate: e.target.value })} /></label><label className="text-[11px] font-semibold">Note<input className={inp} value={rate.note} onChange={e => setRate({ ...rate, note: e.target.value })} placeholder="e.g. bank letter" /></label><label className="text-[11px] font-semibold flex items-center gap-1 pb-2"><input type="checkbox" checked={rate.verified} onChange={e => setRate({ ...rate, verified: e.target.checked })} /> from the bank</label><button className="btn-blue btn-sm text-xs" onClick={addRate}>Add rate change</button></div>
      </div>}

      {tab === 'payments' && <div className="space-y-3">
        {form && <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 space-y-2">
          <b className="text-sm">Record installment #{form.no}{form.linkTx ? ' (linking an imported bank line)' : ''}</b>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <label className="text-[11px] font-semibold">Installment #<input type="number" className={inp} value={form.no} onChange={e => setForm({ ...form, no: e.target.value })} /></label>
            <label className="text-[11px] font-semibold">Paid on<input type="date" className={inp} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
            <label className="text-[11px] font-semibold">From account<select className="sel text-xs w-full" value={form.account} onChange={e => setForm({ ...form, account: e.target.value })}><option value="">Choose…</option>{accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className="text-[11px] font-semibold">Principal<input type="number" step="any" className={inp} value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} /></label>
            <label className="text-[11px] font-semibold">Interest<input type="number" step="any" className={inp} value={form.interest} onChange={e => setForm({ ...form, interest: e.target.value })} /></label>
            <label className="text-[11px] font-semibold">Admin fees<input type="number" step="any" className={inp} value={form.fees} onChange={e => setForm({ ...form, fees: e.target.value })} /></label>
          </div>
          <div className="text-[11px] text-gray-500">Total paid {fmt(num(form.principal) + num(form.interest) + num(form.fees), cur)}. Principal reduces the loan (not an expense); interest and fees are recorded as expenses.</div>
          <div className="flex gap-2"><button className="btn-blue btn-sm text-xs" onClick={saveInstallment}>Save</button><button className="btn-gray btn-sm text-xs" onClick={() => setForm(null)}>Cancel</button></div>
        </div>}
        {pre && <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
          <b className="text-sm">{pre.kind === 'prepayment_full' ? 'Full repayment' : 'Partial prepayment'}</b>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <label className="text-[11px] font-semibold">Date<input type="date" className={inp} value={pre.date} onChange={e => setPre({ ...pre, date: e.target.value })} /></label>
            <label className="text-[11px] font-semibold">From account<select className="sel text-xs w-full" value={pre.account} onChange={e => setPre({ ...pre, account: e.target.value })}><option value="">Choose…</option>{accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            {pre.kind !== 'prepayment_full' && <label className="text-[11px] font-semibold">Principal paid<input type="number" step="any" className={inp} value={pre.amount} onChange={e => setPre({ ...pre, amount: e.target.value })} /></label>}
            <label className="text-[11px] font-semibold">Penalty / fee<input type="number" step="any" className={inp} value={pre.penalty} onChange={e => setPre({ ...pre, penalty: e.target.value })} /></label>
            {pre.kind !== 'prepayment_full' && <label className="text-[11px] font-semibold">Afterwards<select className="sel text-xs w-full" value={pre.effect} onChange={e => setPre({ ...pre, effect: e.target.value })}><option value="lower_installment">Lower the installment</option><option value="shorter_tenor">Shorten the tenor</option></select></label>}
          </div>
          {pre.kind === 'prepayment_full' && <div className="text-[11px] text-gray-500">Settles the outstanding principal of {fmt(out, cur)}. Add interest owed up to today in “Penalty / fee” only if the bank charges it separately.</div>}
          <div className="flex gap-2"><button className="btn-blue btn-sm text-xs" onClick={savePrepay}>Save</button><button className="btn-gray btn-sm text-xs" onClick={() => setPre(null)}>Cancel</button></div>
        </div>}
        <div className="flex gap-2">{!pre && <><button className="btn-gray btn-sm text-xs" onClick={() => setPre({ kind: 'prepayment_partial', date: today(), account: loan.payment_account_id || '', amount: '', penalty: '', effect: 'lower_installment' })}>Partial prepayment</button><button className="btn-gray btn-sm text-xs" onClick={() => setPre({ kind: 'prepayment_full', date: today(), account: loan.payment_account_id || '', amount: '', penalty: '', effect: '' })}>Full repayment</button></>}</div>
        <div className="space-y-1.5">{[...payments].sort((a, b) => b.paid_date.localeCompare(a.paid_date)).map(p => <div key={p.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-xs"><span><b>{p.kind === 'installment' ? `Installment #${p.installment_no}` : p.kind === 'prepayment_full' ? 'Full repayment' : 'Partial prepayment'}</b> · {p.paid_date} · principal {fmt(Number(p.principal), cur)} · interest {fmt(Number(p.interest), cur)} · fees {fmt(Number(p.fees), cur)}{p.note && <span className="text-gray-400"> · {p.note}</span>}</span><button onClick={() => undo(p)} className="text-gray-300 hover:text-red-500" aria-label="Undo"><Trash2 size={14} /></button></div>)}{payments.length === 0 && <p className="text-xs text-gray-400">No payments recorded yet.</p>}</div>
      </div>}
    </div>
  )
}
