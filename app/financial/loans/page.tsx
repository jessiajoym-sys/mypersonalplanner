'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Archive, ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react'
import StatementFiles from '@/components/finance/StatementFiles'
import LoanDetail from '@/components/finance/LoanDetail'
import { fmt } from '@/lib/finance'
import { outstandingPrincipal } from '@/lib/loans'

const TYPES = [['mortgage', 'Mortgage / KPR'], ['installment', 'Purchase installment (laptop, Coway…)'], ['vehicle', 'Vehicle'], ['personal', 'Personal loan'], ['other', 'Other financing']]
const blank = { id: '', name: '', lender: '', loan_type: 'mortgage', currency: 'IDR', original_amount: '', current_balance: '', annual_interest_rate: '', interest_type: 'fixed', fixed_period_months: '', total_months: '', loan_start_date: '', first_installment_date: '', due_day: '', payment_account_id: '', monthly_payment: '', monthly_admin_fee: '', next_rate_review_date: '', match_keyword: '', status: 'active', notes: '' }

export default function LoansPage() {
  const [loans, setLoans] = useState<any[]>([]), [rates, setRates] = useState<any[]>([]), [pays, setPays] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([]), [txs, setTxs] = useState<any[]>([])
  const [form, setForm] = useState<any>(null)
  const [open, setOpen] = useState<string>('')
  const [userId, setUserId] = useState('')
  const [msg, setMsg] = useState<{ t: string; bad: boolean } | null>(null)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [showClosed, setShowClosed] = useState(false)
  const say = (t: string, bad = false) => setMsg({ t, bad })

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const q = (t: string) => supabase.from(t).select('*').eq('user_id', user.id)
    const [l, r, p, a, t] = await Promise.all([q('financial_loans').order('created_at', { ascending: false }), q('loan_rate_changes'), q('loan_payments'), q('accounts').eq('is_active', true), supabase.from('transactions').select('*').eq('user_id', user.id).is('deleted_at', null).eq('type', 'expense').order('transaction_date', { ascending: false }).limit(600)])
    if (l.error) say(l.error.message, true)
    else setLoans(l.data || [])
    setRates(r.error ? [] : r.data || []); setPays(p.error ? [] : p.data || []); setAccounts(a.data || []); setTxs(t.data || [])
    if (r.error || p.error) say('Run lib/planner-upgrade-9.sql in Supabase (after upgrade 8) to unlock schedules, rate changes and payments.', true)
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg(null)
    const f = form, n = (v: any) => (v === '' || v == null ? null : Number(v))
    const payload: any = {
      user_id: userId, name: f.name.trim(), lender: f.lender.trim() || null, loan_type: f.loan_type, currency: f.currency,
      original_amount: Number(f.original_amount || 0), annual_interest_rate: Number(f.annual_interest_rate || 0), initial_rate: Number(f.annual_interest_rate || 0),
      interest_type: f.interest_type, fixed_period_months: n(f.fixed_period_months), total_months: Number(f.total_months || 0),
      loan_start_date: f.loan_start_date || null, first_installment_date: f.first_installment_date || null, due_day: n(f.due_day),
      payment_account_id: f.payment_account_id || null, monthly_payment: Number(f.monthly_payment || 0), monthly_admin_fee: Number(f.monthly_admin_fee || 0),
      next_rate_review_date: f.next_rate_review_date || null, match_keyword: f.match_keyword.trim() || null, status: f.status, notes: f.notes.trim() || null,
      current_balance: f.current_balance === '' ? Number(f.original_amount || 0) : Number(f.current_balance),
    }
    if (!payload.name || payload.original_amount <= 0 || payload.total_months <= 0) { setSaving(false); return say('Enter a name, an original principal above zero and the tenor in months.', true) }
    if (f.id) delete payload.initial_rate   // editing must not rewrite the starting rate used by the schedule
    const res = f.id ? await supabase.from('financial_loans').update(payload).eq('id', f.id).eq('user_id', userId).select('id') : await supabase.from('financial_loans').insert(payload).select('id')
    setSaving(false)
    if (res.error || !res.data?.length) return say('Could not save: ' + (res.error?.message || 'the database did not confirm the row') + (/column|schema cache/i.test(res.error?.message || '') ? ' → run lib/planner-upgrade-9.sql in Supabase first.' : ''), true)
    setForm(null); say('Loan saved.'); await load()
  }
  async function closeLoan(l: any) {
    if (!confirm(`Close "${l.name}"? It is hidden from this list (not deleted) and its payment history is kept.`)) return
    const { error } = await supabase.from('financial_loans').update({ status: 'closed' }).eq('id', l.id).eq('user_id', userId)
    error ? say('Could not close: ' + error.message, true) : (say('Loan closed.'), await load())
  }

  const visible = loans.filter(l => showClosed || (l.status || 'active') === 'active' || l.status === 'paid_off')
  const totals = useMemo(() => {
    const m: Record<string, { bal: number; pay: number }> = {}
    visible.filter(l => (l.status || 'active') === 'active').forEach(l => { const c = l.currency || 'IDR', p = pays.filter(x => x.loan_id === l.id); const t = (m[c] ||= { bal: 0, pay: 0 }); t.bal += p.length ? outstandingPrincipal(l, p) : Number(l.current_balance || 0); t.pay += Number(l.monthly_payment || 0) })
    return m
  }, [visible, pays])
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value })
  const inp = 'inp w-full mt-1 text-sm'

  return <div className="max-w-5xl mx-auto space-y-5">
    <header className="flex justify-between items-center gap-3 flex-wrap"><div><h1 className="text-2xl font-bold">Loans & Installments</h1><p className="text-sm text-gray-500">KPR, laptop and Coway installments, personal loans. Principal reduces what you owe; interest and fees are expenses.</p></div>
      <div className="flex gap-2"><button onClick={() => setShowClosed(!showClosed)} className="btn-gray btn-sm text-xs">{showClosed ? 'Hide closed' : 'Show closed'}</button><button onClick={() => setForm({ ...blank })} className="btn-blue btn-sm flex items-center gap-1"><Plus size={16} /> Add loan</button></div></header>
    {msg && <div role="status" className={`rounded-xl p-3 text-sm ${msg.bad ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg.t}</div>}
    {Object.keys(totals).length > 0 && <div className="grid md:grid-cols-2 gap-3">{Object.entries(totals).map(([c, v]) => <div key={c} className="card p-5"><div className="text-xs text-gray-500">{c} · outstanding principal / monthly installments</div><div className="text-2xl font-bold mt-1">{fmt(v.bal, c)}</div><div className="text-sm text-gray-500">{fmt(v.pay, c)} per month</div></div>)}</div>}

    {form && <form onSubmit={save} className="card p-5 space-y-3">
      <h2 className="font-bold">{form.id ? 'Edit loan' : 'Add a loan or installment'}</h2>
      <div className="grid md:grid-cols-3 gap-3">
        <label className="text-xs font-semibold">Loan name<input required className={inp} placeholder="KPR rumah / Laptop / Coway" value={form.name} onChange={set('name')} /></label>
        <label className="text-xs font-semibold">Lender<input className={inp} value={form.lender} onChange={set('lender')} /></label>
        <label className="text-xs font-semibold">Type<select className={'sel w-full mt-1 text-sm'} value={form.loan_type} onChange={set('loan_type')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="text-xs font-semibold">Currency<select className={'sel w-full mt-1 text-sm'} value={form.currency} onChange={set('currency')}>{['IDR', 'CNY', 'USD', 'EUR', 'SGD'].map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="text-xs font-semibold">Original principal<input type="number" min="0" step="any" className={inp} value={form.original_amount} onChange={set('original_amount')} /></label>
        <label className="text-xs font-semibold">Outstanding principal now<input type="number" min="0" step="any" className={inp} placeholder="same as original if new" value={form.current_balance} onChange={set('current_balance')} /></label>
        <label className="text-xs font-semibold">Interest rate (% / year){form.id && <span className="font-normal text-gray-400"> — starting rate; changes go in the Rates tab</span>}<input type="number" step="0.01" min="0" className={inp} value={form.annual_interest_rate} onChange={set('annual_interest_rate')} /></label>
        <label className="text-xs font-semibold">Interest type<select className={'sel w-full mt-1 text-sm'} value={form.interest_type} onChange={set('interest_type')}><option value="fixed">Fixed</option><option value="floating">Floating</option><option value="fixed_then_floating">Fixed period, then floating</option></select></label>
        {form.interest_type === 'fixed_then_floating' && <label className="text-xs font-semibold">Fixed-rate period (months)<input type="number" min="1" className={inp} value={form.fixed_period_months} onChange={set('fixed_period_months')} /></label>}
        <label className="text-xs font-semibold">Next rate review date<input type="date" className={inp} value={form.next_rate_review_date} onChange={set('next_rate_review_date')} /></label>
        <label className="text-xs font-semibold">Tenor (months)<input type="number" min="1" className={inp} value={form.total_months} onChange={set('total_months')} /></label>
        <label className="text-xs font-semibold">Loan start date<input type="date" className={inp} value={form.loan_start_date} onChange={set('loan_start_date')} /></label>
        <label className="text-xs font-semibold">First installment date<input type="date" className={inp} value={form.first_installment_date} onChange={set('first_installment_date')} /></label>
        <label className="text-xs font-semibold">Due day of month<input type="number" min="1" max="31" className={inp} value={form.due_day} onChange={set('due_day')} /></label>
        <label className="text-xs font-semibold">Monthly installment (from the bank)<input type="number" step="any" className={inp} value={form.monthly_payment} onChange={set('monthly_payment')} /></label>
        <label className="text-xs font-semibold">Monthly admin fee<input type="number" step="any" className={inp} value={form.monthly_admin_fee} onChange={set('monthly_admin_fee')} /></label>
        <label className="text-xs font-semibold">Payment account<select className={'sel w-full mt-1 text-sm'} value={form.payment_account_id} onChange={set('payment_account_id')}><option value="">—</option>{accounts.filter(a => a.currency === form.currency && a.type !== 'credit_card').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="text-xs font-semibold">Statement keywords<input className={inp} placeholder="e.g. BTN, KPR" value={form.match_keyword} onChange={set('match_keyword')} /></label>
        <label className="text-xs font-semibold">Status<select className={'sel w-full mt-1 text-sm'} value={form.status} onChange={set('status')}><option value="active">Active</option><option value="paid_off">Paid off</option><option value="closed">Closed</option></select></label>
      </div>
      <label className="text-xs font-semibold block">Notes<input className={inp} value={form.notes} onChange={set('notes')} /></label>
      <p className="text-[11px] text-gray-400">The schedule is calculated from principal, rate, tenor and the first installment date. Floating rates are never predicted — enter each rate your bank confirms.</p>
      <div className="flex gap-2"><button disabled={saving} className="btn-blue btn-sm">{saving ? 'Saving…' : 'Save loan'}</button><button type="button" onClick={() => setForm(null)} className="btn-gray btn-sm">Cancel</button></div>
    </form>}

    {loading ? <div className="card p-8 text-center text-gray-500">Loading loans…</div> : visible.length === 0 ? <div className="card p-10 text-center text-gray-500">No loans yet. Add your KPR or an installment plan.</div> :
      <div className="space-y-3">{visible.map(l => {
        const p = pays.filter(x => x.loan_id === l.id), c = l.currency || 'IDR'
        const out = p.length ? outstandingPrincipal(l, p) : Number(l.current_balance || 0)
        const done = p.filter(x => x.kind === 'installment').length || Number(l.paid_months || 0)
        const pct = l.total_months ? Math.min(100, done / l.total_months * 100) : 0
        const isOpen = open === l.id
        return <article key={l.id} className="card p-5">
          <div className="flex justify-between gap-3"><div><div className="text-xs text-gray-500">{l.lender || 'Lender not set'} · {TYPES.find(t => t[0] === l.loan_type)?.[1] || l.loan_type} · {l.interest_type === 'floating' ? 'floating' : l.interest_type === 'fixed_then_floating' ? 'fixed → floating' : 'fixed'} {Number(l.annual_interest_rate)}%{l.status !== 'active' ? ` · ${l.status}` : ''}</div><h2 className="font-bold text-lg">{l.name}</h2></div>
            <div className="flex items-start gap-3 text-gray-400"><button aria-label="Edit" onClick={() => setForm({ ...blank, ...Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v ?? ''])), annual_interest_rate: l.initial_rate ?? l.annual_interest_rate })} className="hover:text-teal-600"><Pencil size={16} /></button><button aria-label="Close loan" onClick={() => closeLoan(l)} className="hover:text-red-600"><Archive size={16} /></button></div></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm"><div><div className="text-xs text-gray-500">Outstanding principal</div><b>{fmt(out, c)}</b></div><div><div className="text-xs text-gray-500">Monthly installment</div><b>{fmt(Number(l.monthly_payment || 0), c)}</b></div><div><div className="text-xs text-gray-500">Installments paid</div><b>{done} / {l.total_months || '—'}</b></div><div><div className="text-xs text-gray-500">Original principal</div><b>{fmt(Number(l.original_amount), c)}</b></div></div>
          {l.total_months > 0 && <div className="h-2 rounded-full bg-gray-100 mt-3"><div className="h-2 rounded-full bg-teal-500" style={{ width: `${pct}%` }} /></div>}
          <button onClick={() => setOpen(isOpen ? '' : l.id)} className="mt-3 text-xs font-semibold text-teal-600 flex items-center gap-1">{isOpen ? <>Hide details <ChevronUp size={14} /></> : <>Schedule, rates & payments <ChevronDown size={14} /></>}</button>
          {isOpen && <><LoanDetail loan={l} rates={rates.filter(r => r.loan_id === l.id)} payments={p} accounts={accounts} txs={txs} userId={userId} reload={load} say={say} /><div className="mt-3"><StatementFiles table="financial_loans" row={l} userId={userId} onChanged={() => void load()} /></div></>}
        </article>
      })}</div>}
  </div>
}
