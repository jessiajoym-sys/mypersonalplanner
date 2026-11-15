'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { emitChange } from '@/lib/planner'
import { fmt } from '@/lib/finance'

const pad = (n: number) => String(n).padStart(2, '0')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const monthEnd = (m: string) => { const [y, mo] = m.slice(0, 7).split('-').map(Number); return `${y}-${pad(mo)}-${pad(new Date(y, mo, 0).getDate())}` }

type Props = { userId: string; accounts: any[]; transactions: any[]; balanceById: Map<string, number>; onChanged: () => Promise<any> | void; onToast: (m: string) => void; onRecordPayment: (card: any) => void }

export default function CardManager({ userId, accounts, transactions, balanceById, onChanged, onToast, onRecordPayment }: Props) {
  const [stmts, setStmts] = useState<any[]>([]), [missing, setMissing] = useState(false)
  const [form, setForm] = useState<any>(null)
  const today = todayStr()
  const cards = accounts.filter(a => a.type === 'credit_card')
  const accName = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a.name])), [accounts])

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('card_statements').select('*').eq('user_id', userId).order('statement_month', { ascending: false })
    if (error) setMissing(true); else { setMissing(false); setStmts(data || []) }
  }, [userId])
  useEffect(() => { if (userId) void load() }, [load, userId])

  /** Payments that settle a statement: bank → card moves between the statement date and shortly after the due date. */
  function paymentsFor(card: any, s: any) {
    const from = s.statement_date || monthEnd(s.statement_month), due = s.due_date || addDays(from, 25), to = addDays(due, 5)
    return transactions.filter(t => (t.type === 'credit_card_payment' || t.type === 'transfer') && t.to_account_id === card.id && t.transaction_date >= from && t.transaction_date <= to)
  }
  async function saveStatement() {
    const f = form, bal = Number(f.balance)
    if (!f.month || !Number.isFinite(bal) || bal < 0) return onToast('Enter the statement month and the statement balance.')
    const row: any = { user_id: userId, account_id: f.account, statement_month: f.month + '-01', statement_date: f.date || null, due_date: f.due || null, statement_balance: bal, minimum_payment: f.min === '' ? null : Number(f.min), credit_limit: f.limit === '' ? null : Number(f.limit) }
    const { data, error } = await supabase.from('card_statements').upsert(row, { onConflict: 'user_id,account_id,statement_month' }).select('id')
    if (error || !data?.length) return onToast('Could not save statement: ' + (error?.message || 'not confirmed') + (/card_statements|schema/i.test(error?.message || '') ? ' → run lib/planner-upgrade-9.sql in Supabase.' : ''))
    setForm(null); await load(); onToast('Statement saved.')
  }
  async function convert(t: any, card: any) {
    const { error } = await supabase.from('transactions').update({ type: 'credit_card_payment', to_account_id: card.id, category: 'Other', updated_at: new Date().toISOString() }).eq('id', t.id).eq('user_id', userId)
    if (error) return onToast('Could not convert: ' + error.message)
    await supabase.from('transaction_audit').insert({ user_id: userId, transaction_id: t.id, action: 'edit', changes: { type: { from: t.type, to: 'credit_card_payment' }, to_account_id: { from: null, to: card.id } } })
    await onChanged(); emitChange(); onToast('Converted to a card payment: it no longer counts as spending.')
  }

  return (
    <div className="space-y-4">
      <div className="card p-5"><h2 className="font-bold text-lg">Credit Card Manager</h2><p className="text-sm text-gray-500">Card purchases count as spending when you buy. Paying the card from your bank is only a transfer, so nothing is counted twice. Statements below are matched with those payments.</p></div>
      {missing && <div className="rounded-xl bg-amber-50 text-amber-800 text-sm p-3">Run lib/planner-upgrade-9.sql in Supabase to keep a statement history per card.</div>}
      {cards.map(card => {
        const debt = Math.max(0, balanceById.get(card.id) || 0), limit = Number(card.credit_limit || 0), used = limit > 0 ? Math.min(debt / limit * 100, 100) : 0
        const mine = stmts.filter(s => s.account_id === card.id)
        const latest = card.last_statement_balance != null && !mine.some(s => s.statement_month.slice(0, 7) === String(card.last_statement_month || '').slice(0, 7))
          ? [{ id: 'acct', account_id: card.id, statement_month: card.last_statement_month || today.slice(0, 7) + '-01', due_date: card.statement_due_date, statement_balance: card.last_statement_balance, minimum_payment: card.minimum_payment, statement_date: null, derived: true }] : []
        const rows = [...latest, ...mine].slice(0, 6)
        const susp = transactions.filter(t => t.type === 'expense' && t.currency === card.currency && t.from_account_id !== card.id && !accounts.find(a => a.id === t.from_account_id && a.type === 'credit_card')
          && (/kartu kredit|credit card|pembayaran kartu|cc payment|bayar kartu/i.test(`${t.original_description || ''} ${t.merchant || ''}`) || (card.account_number_last4 && `${t.original_description || ''} ${t.merchant || ''}`.includes(card.account_number_last4)) || (card.bank_name && /kartu|card|cc/i.test(`${t.original_description || ''} ${t.merchant || ''}`) && `${t.original_description || ''} ${t.merchant || ''}`.toLowerCase().includes(String(card.bank_name).toLowerCase())))).slice(0, 5)
        return <div key={card.id} className="card p-5 space-y-3">
          <div className="flex justify-between gap-3 flex-wrap"><div><h3 className="font-bold">{card.name}</h3><p className="text-xs text-gray-500">{card.bank_name || 'Credit card'}{card.account_number_last4 ? ' · •••• ' + card.account_number_last4 : ''} · statement day {card.billing_cycle_day || '—'} · due day {card.payment_due_day || '—'}</p></div>
            <div className="text-right"><div className="text-xs text-gray-500">Outstanding balance</div><div className="text-xl font-bold text-red-500">{fmt(debt, card.currency)}</div></div></div>
          <div><div className="flex justify-between text-xs text-gray-500"><span>Limit {fmt(limit, card.currency)}</span><span>{limit > 0 ? `${used.toFixed(0)}% used · ${fmt(Math.max(0, limit - debt), card.currency)} available` : 'No limit set'}</span></div><div className="h-2 bg-gray-100 rounded-full mt-1"><div className={`h-2 rounded-full ${used >= 90 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${used}%` }} /></div></div>
          <div className="space-y-2">{rows.length === 0 && <p className="text-xs text-gray-400">No statements yet. Import a credit-card e-statement, or add one manually.</p>}
            {rows.map(s => {
              const pays = paymentsFor(card, s), paid = pays.reduce((x, t) => x + Number(t.amount), 0), bal = Number(s.statement_balance || 0), min = Number(s.minimum_payment || 0)
              const spent = transactions.filter(t => t.from_account_id === card.id && t.transaction_date.startsWith(String(s.statement_month).slice(0, 7)))
              const interestFees = spent.filter(t => t.type === 'interest' || t.type === 'fee').reduce((x, t) => x + Number(t.amount), 0)
              const purchases = spent.filter(t => t.type === 'credit_card_purchase').reduce((x, t) => x + Number(t.amount), 0)
              const state = bal <= 0 ? 'Nothing owed' : paid >= bal - 1 ? 'Paid in full' : min > 0 && paid >= min ? 'Minimum paid' : paid > 0 ? 'Partly paid' : s.due_date && today > s.due_date ? 'Overdue' : 'Unpaid'
              const color = state === 'Paid in full' || state === 'Nothing owed' ? 'bg-green-100 text-green-700' : state === 'Overdue' ? 'bg-red-100 text-red-600' : state === 'Unpaid' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'
              return <div key={s.id} className="border rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{String(s.statement_month).slice(0, 7)} statement</b><span className={`font-semibold px-2 py-0.5 rounded-full ${color}`}>{state}</span></div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2"><div><div className="text-gray-400">Statement balance</div><b>{fmt(bal, card.currency)}</b></div><div><div className="text-gray-400">Minimum payment</div><b>{s.minimum_payment == null ? '—' : fmt(min, card.currency)}</b></div><div><div className="text-gray-400">Due date</div><b>{s.due_date || '—'}</b></div><div><div className="text-gray-400">Paid from your accounts</div><b>{fmt(paid, card.currency)}</b></div><div><div className="text-gray-400">Purchases · interest & fees</div><b>{fmt(purchases, card.currency)} · {fmt(interestFees, card.currency)}</b></div></div>
                {pays.map(t => <div key={t.id} className="text-gray-500">↳ {t.transaction_date} paid {fmt(Number(t.amount), t.currency)} from {accName[t.from_account_id] || '—'} <span className="text-gray-400">(matched, not counted as spending)</span></div>)}
              </div>
            })}</div>
          {susp.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-xs space-y-1.5"><b className="text-amber-800">These look like payments to this card but are recorded as Expense — that would count the spending twice.</b>{susp.map(t => <div key={t.id} className="flex flex-wrap items-center justify-between gap-2"><span>{t.transaction_date} · {fmt(Number(t.amount), t.currency)} · {(t.original_description || t.merchant || '').slice(0, 50)}</span><button className="btn-blue btn-sm text-xs" onClick={() => convert(t, card)}>Convert to card payment</button></div>)}</div>}
          <div className="flex gap-2 flex-wrap"><button onClick={() => onRecordPayment(card)} className="btn-gray btn-sm">Record card payment</button><button onClick={() => setForm({ account: card.id, month: today.slice(0, 7), date: '', due: '', balance: '', min: '', limit: card.credit_limit || '' })} className="btn-gray btn-sm">Add statement</button></div>
        </div>
      })}
      {cards.length === 0 && <div className="card p-6 text-sm text-gray-500">No credit cards yet. Add a credit card account in Accounts.</div>}
      {form && <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3" onClick={() => setForm(null)}><div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
        <b>Add card statement</b>
        <div className="grid grid-cols-2 gap-2">{([['month', 'Statement month', 'month'], ['date', 'Statement date', 'date'], ['due', 'Payment due date', 'date'], ['balance', 'Statement balance', 'number'], ['min', 'Minimum payment', 'number'], ['limit', 'Credit limit', 'number']] as const).map(([k, l, t]) => <label key={k} className="text-[11px] font-semibold">{l}<input type={t} step="any" className="inp w-full text-xs mt-1" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} /></label>)}</div>
        <div className="flex gap-2"><button className="btn-blue btn-sm flex-1" onClick={saveStatement}>Save</button><button className="btn-gray btn-sm flex-1" onClick={() => setForm(null)}>Cancel</button></div></div></div>}
    </div>
  )
}
