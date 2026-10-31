'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2 } from 'lucide-react'

type Loan = { id: string; name: string; lender: string | null; loan_type: string; original_amount: number; current_balance: number; monthly_payment: number; annual_interest_rate: number; total_months: number; paid_months: number; next_due_date: string | null; notes: string | null }
const blank = { name: '', lender: '', loan_type: 'mortgage', original_amount: '', current_balance: '', monthly_payment: '', annual_interest_rate: '', total_months: '', paid_months: '', next_due_date: '', notes: '' }
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0)

export default function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [form, setForm] = useState(blank)
  const [showForm, setShowForm] = useState(false)
  const [userId, setUserId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data, error: queryError } = await supabase.from('financial_loans').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (queryError) setError(queryError.message.includes('financial_loans') ? 'Set up the new loan feature first: run lib/planner-upgrade.sql in Supabase SQL Editor.' : queryError.message)
    else setLoans((data || []) as Loan[])
    setLoading(false)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setError(''); setNotice('')
    const payload = {
      user_id: userId, name: form.name.trim(), lender: form.lender.trim() || null, loan_type: form.loan_type,
      original_amount: Number(form.original_amount || 0), current_balance: Number(form.current_balance || 0),
      monthly_payment: Number(form.monthly_payment || 0), annual_interest_rate: Number(form.annual_interest_rate || 0),
      total_months: Number(form.total_months || 0), paid_months: Number(form.paid_months || 0),
      next_due_date: form.next_due_date || null, notes: form.notes.trim() || null,
    }
    const { error: saveError } = await supabase.from('financial_loans').insert(payload)
    setSaving(false)
    if (saveError) { setError(saveError.message); return }
    setForm(blank); setShowForm(false); setNotice('Loan saved.'); await load()
  }

  async function remove(loan: Loan) {
    if (!window.confirm(`Delete ${loan.name}?`)) return
    const { error: deleteError } = await supabase.from('financial_loans').delete().eq('id', loan.id).eq('user_id', userId)
    if (deleteError) setError(deleteError.message)
    else setLoans(current => current.filter(item => item.id !== loan.id))
  }

  const totals = useMemo(() => loans.reduce((sum, loan) => ({ balance: sum.balance + Number(loan.current_balance || 0), payment: sum.payment + Number(loan.monthly_payment || 0) }), { balance: 0, payment: 0 }), [loans])

  return <div className="max-w-5xl mx-auto space-y-5"><header className="flex justify-between items-center gap-3"><div><h1 className="text-2xl font-bold">Loans & Installments</h1><p className="text-sm text-gray-500 mt-1">Track your mortgage and other installment plans.</p></div><button onClick={() => setShowForm(!showForm)} className="btn-blue btn-sm flex items-center gap-1"><Plus size={15} /> Add loan</button></header>
    {error && <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</div>}{notice && <div className="rounded-xl bg-green-50 text-green-700 p-3 text-sm">{notice}</div>}
    <div className="grid md:grid-cols-2 gap-3"><div className="card p-5"><div className="text-xs text-gray-500">Current balance entered</div><div className="text-2xl font-bold mt-1">{money(totals.balance)}</div></div><div className="card p-5"><div className="text-xs text-gray-500">Monthly payments</div><div className="text-2xl font-bold mt-1">{money(totals.payment)}</div></div></div>
    {showForm && <form onSubmit={save} className="card p-5 space-y-3"><h2 className="font-bold">Add a loan or installment</h2><div className="grid md:grid-cols-2 gap-3"><label className="text-xs font-semibold">Loan name<input required className="inp w-full mt-1" placeholder="Home mortgage or laptop" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label className="text-xs font-semibold">Bank / lender<input className="inp w-full mt-1" value={form.lender} onChange={e => setForm({ ...form, lender: e.target.value })} /></label><label className="text-xs font-semibold">Type<select className="sel w-full mt-1" value={form.loan_type} onChange={e => setForm({ ...form, loan_type: e.target.value })}><option value="mortgage">Mortgage</option><option value="vehicle">Vehicle</option><option value="personal">Personal loan</option><option value="installment">Purchase installment</option><option value="other">Other</option></select></label><label className="text-xs font-semibold">Original amount (IDR)<input type="number" min="0" className="inp w-full mt-1" value={form.original_amount} onChange={e => setForm({ ...form, original_amount: e.target.value })} /></label><label className="text-xs font-semibold">Current remaining balance (IDR)<input type="number" min="0" className="inp w-full mt-1" value={form.current_balance} onChange={e => setForm({ ...form, current_balance: e.target.value })} /></label><label className="text-xs font-semibold">Monthly payment (IDR)<input type="number" min="0" className="inp w-full mt-1" value={form.monthly_payment} onChange={e => setForm({ ...form, monthly_payment: e.target.value })} /></label><label className="text-xs font-semibold">Annual interest rate (%)<input type="number" min="0" step="0.001" className="inp w-full mt-1" value={form.annual_interest_rate} onChange={e => setForm({ ...form, annual_interest_rate: e.target.value })} /></label><label className="text-xs font-semibold">Total term (months)<input type="number" min="0" className="inp w-full mt-1" value={form.total_months} onChange={e => setForm({ ...form, total_months: e.target.value })} /></label><label className="text-xs font-semibold">Months paid<input type="number" min="0" className="inp w-full mt-1" value={form.paid_months} onChange={e => setForm({ ...form, paid_months: e.target.value })} /></label><label className="text-xs font-semibold">Next due date<input type="date" className="inp w-full mt-1" value={form.next_due_date} onChange={e => setForm({ ...form, next_due_date: e.target.value })} /></label></div><label className="block text-xs font-semibold">Notes<textarea className="inp w-full mt-1" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label><p className="text-xs text-gray-500">Enter the remaining balance from your lender’s latest statement. The planner does not estimate principal from payments because interest and fees can change the result.</p><div className="flex gap-2"><button disabled={saving} className="btn-blue btn-sm">Save loan</button><button type="button" onClick={() => setShowForm(false)} className="btn-gray btn-sm">Cancel</button></div></form>}
    {loading ? <div className="card p-8 text-center text-gray-500">Loading loans…</div> : loans.length === 0 ? <div className="card p-10 text-center text-gray-500">No loans added. Start with your mortgage or an installment plan.</div> : <div className="space-y-3">{loans.map(loan => { const remaining = Math.max(0, Number(loan.total_months || 0) - Number(loan.paid_months || 0)); const progress = loan.total_months ? Math.min(100, Number(loan.paid_months || 0) / Number(loan.total_months) * 100) : 0; return <article key={loan.id} className="card p-5"><div className="flex justify-between gap-3"><div><div className="text-xs text-gray-500">{loan.lender || 'Lender not set'} · {loan.loan_type}</div><h2 className="font-bold text-lg">{loan.name}</h2></div><button aria-label={`Delete ${loan.name}`} onClick={() => void remove(loan)} className="text-gray-400 hover:text-red-600"><Trash2 size={17} /></button></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm"><div><div className="text-xs text-gray-500">Remaining balance</div><b>{money(Number(loan.current_balance))}</b></div><div><div className="text-xs text-gray-500">Monthly payment</div><b>{money(Number(loan.monthly_payment))}</b></div><div><div className="text-xs text-gray-500">Months remaining</div><b>{loan.total_months ? remaining : 'Not set'}</b></div><div><div className="text-xs text-gray-500">Interest rate</div><b>{Number(loan.annual_interest_rate)}% / year</b></div></div>{loan.total_months > 0 && <div className="mt-4"><div className="flex justify-between text-xs text-gray-500 mb-1"><span>{loan.paid_months} of {loan.total_months} months paid</span><span>{progress.toFixed(0)}%</span></div><div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${progress}%` }} /></div></div>}{loan.next_due_date && <p className="text-xs text-gray-500 mt-3">Next due: {loan.next_due_date}</p>}{loan.notes && <p className="text-sm text-gray-600 mt-3">{loan.notes}</p>}</article> })}</div>}
  </div>
}
