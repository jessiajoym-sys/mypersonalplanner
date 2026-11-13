'use client'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal, { Field } from '@/components/planner/Modal'
import { aging, outstanding } from '@/lib/business'
import { BP, Empty, Stat, acctOptions, cur, db, m$, num, run, today } from './ui'

export default function Invoices(bp: BP & { kind: 'receivable' | 'payable' }) {
  const { d, userId, kind } = bp
  const isAR = kind === 'receivable'
  const [form, setForm] = useState<any>(null), [pay, setPay] = useState<any>(null)
  const ag = aging(d.invoices, kind, today())
  const rows = d.invoices.filter(i => i.kind === kind)
  const accts = acctOptions(bp.accounts, cur(d))

  async function save() {
    if (!form.party.trim() || num(form.amount) <= 0) return bp.toast(`Enter who ${isAR ? 'owes you' : 'you owe'} and the amount.`)
    if (await run(db.from('biz_invoices').insert({ user_id: userId, business_id: d.biz.id, kind, party: form.party.trim(), description: form.description || null, bk_class: isAR ? 'revenue' : form.cls, amount: num(form.amount), issue_date: form.issue, due_date: form.due || null }), bp, 'Saved.')) setForm(null)
  }
  async function pay_() {
    const inv = pay.inv, amt = Math.min(num(pay.amount), outstanding(inv))
    if (amt <= 0) return bp.toast('Enter the amount paid.')
    const ok = await run(db.from('transactions').insert({ user_id: userId, business_id: d.biz.id, type: isAR ? 'income' : 'expense', amount: amt, currency: cur(d), category: isAR ? 'Invoice payment' : 'Supplier payment', merchant: inv.party, description: inv.description || null, bk_class: isAR ? 'ar_collection' : 'ap_payment', transaction_date: pay.date, from_account_id: pay.account || null, source: 'manual' }), bp, '')
    if (!ok) return
    const paid = num(inv.paid_amount) + amt
    await db.from('biz_invoices').update({ paid_amount: paid, paid_date: paid >= num(inv.amount) ? pay.date : null }).eq('id', inv.id).eq('user_id', userId)
    await bp.reload(); bp.toast('Payment recorded.'); setPay(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><div><h2 className="font-bold">{isAR ? 'Accounts Receivable' : 'Accounts Payable'}</h2><p className="text-xs text-gray-500">{isAR ? 'Money customers still owe you. Counted as revenue when you issue the invoice.' : 'Bills you still have to pay suppliers. Counted as a cost when the bill is dated.'}</p></div>
        <button className="btn-blue btn-sm ml-auto" onClick={() => setForm({ party: '', description: '', amount: '', issue: today(), due: '', cls: 'cogs' })}>+ {isAR ? 'Invoice' : 'Bill'}</button></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total open" value={m$(d, ag.total)} sub={`${ag.count} ${isAR ? 'invoices' : 'bills'}`} big />
        {Object.entries(ag.buckets).slice(0, 4).map(([k, b]) => <Stat key={k} label={b.label} value={m$(d, b.total)} tone={k === 'current' ? 'gray' : b.total ? 'red' : 'gray'} />)}
      </div>
      {ag.buckets.d90p.total > 0 && <div className="rounded-xl bg-red-50 text-red-700 text-xs p-3">{m$(d, ag.buckets.d90p.total)} is more than 90 days late.</div>}
      {rows.length === 0 ? <Empty icon={isAR ? '📬' : '📮'} title={isAR ? 'No invoices yet' : 'No bills yet'} text={isAR ? 'Use this when a customer buys now and pays later (e.g. wholesale / Chishee orders).' : 'Use this when a supplier delivers now and you pay later.'} /> : (
        <div className="card divide-y divide-gray-50">{rows.map(i => {
          const left = outstanding(i), late = left > 0 && (i.due_date || i.issue_date) < today()
          return <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="flex-1 min-w-[160px]"><b>{i.party}</b><div className="text-xs text-gray-400">{i.description || '—'} · issued {i.issue_date}{i.due_date ? ` · due ${i.due_date}` : ''}</div></div>
            <div className="text-right"><div className="font-semibold">{m$(d, +i.amount)}</div>{num(i.paid_amount) > 0 && <div className="text-[11px] text-gray-400">paid {m$(d, +i.paid_amount)}</div>}</div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${left === 0 ? 'bg-green-100 text-green-700' : late ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{left === 0 ? 'Paid' : late ? 'Late' : 'Open'}</span>
            {left > 0 && <button className="btn-gray btn-sm text-xs" onClick={() => setPay({ inv: i, amount: left, date: today(), account: accts[0]?.id || '' })}>{isAR ? 'Got paid' : 'Paid it'}</button>}
            <button aria-label="Delete" className="text-gray-300 hover:text-red-500" onClick={async () => { if (confirm('Delete this record? Payments already recorded stay in your ledger.')) await run(db.from('biz_invoices').delete().eq('id', i.id).eq('user_id', userId), bp, 'Deleted.') }}><Trash2 size={14} /></button></div>
        })}</div>)}

      {form && <Modal title={isAR ? 'New invoice' : 'New supplier bill'} onClose={() => setForm(null)}><div className="grid grid-cols-2 gap-3">
        <Field label={isAR ? 'Customer' : 'Supplier'}><input className="inp w-full" value={form.party} onChange={e => setForm({ ...form, party: e.target.value })} /></Field>
        <Field label={`Amount (${cur(d)})`}><input type="number" className="inp w-full" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Date issued"><input type="date" className="inp w-full" value={form.issue} onChange={e => setForm({ ...form, issue: e.target.value })} /></Field>
        <Field label="Due date"><input type="date" className="inp w-full" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} /></Field>
        {!isAR && <Field label="This bill is for" className="col-span-2"><select className="sel w-full" value={form.cls} onChange={e => setForm({ ...form, cls: e.target.value })}><option value="cogs">Goods / materials (COGS)</option><option value="opex">Running costs (operating expense)</option></select></Field>}
        <Field label="What for" className="col-span-2"><input className="inp w-full" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
      </div><div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={save}>Save</button><button className="btn-gray flex-1" onClick={() => setForm(null)}>Cancel</button></div></Modal>}

      {pay && <Modal title={isAR ? 'Record payment received' : 'Record payment made'} subtitle={`${pay.inv.party} · ${m$(d, outstanding(pay.inv))} open`} onClose={() => setPay(null)}><div className="grid grid-cols-2 gap-3">
        <Field label="Amount"><input type="number" className="inp w-full" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></Field>
        <Field label="Date"><input type="date" className="inp w-full" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} /></Field>
        <Field label="Account" className="col-span-2"><select className="sel w-full" value={pay.account} onChange={e => setPay({ ...pay, account: e.target.value })}><option value="">Not linked</option>{accts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      </div><p className="text-[11px] text-gray-400 mt-2">This adds a cash entry to your ledger. It is not counted as revenue again.</p><div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={pay_}>Save</button><button className="btn-gray flex-1" onClick={() => setPay(null)}>Cancel</button></div></Modal>}
    </div>
  )
}
