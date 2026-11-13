'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import Modal, { Field } from '@/components/planner/Modal'
import { BK_CLASSES, OPEX_CATEGORIES, bizTx, classOf, isSpendTx } from '@/lib/business'
import { BP, Empty, acctOptions, cur, db, m$, num, run, today } from './ui'

type Kind = 'sale' | 'expense' | 'owner' | null

export default function Ledger(bp: BP) {
  const { d, userId, accounts } = bp
  const [form, setForm] = useState<Kind>(null)
  const [month, setMonth] = useState(today().slice(0, 7))
  const rows = useMemo(() => bizTx(d).filter(t => String(t.transaction_date).startsWith(month)), [d, month])
  const accts = acctOptions(accounts, cur(d))
  const shift = (n: number) => { const [y, m] = month.split('-').map(Number); const x = new Date(y, m - 1 + n, 1); setMonth(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-blue btn-sm" onClick={() => setForm('sale')}>+ Record sale</button>
        <button className="btn-gray btn-sm" onClick={() => setForm('expense')}>+ Expense / cost</button>
        <button className="btn-gray btn-sm" onClick={() => setForm('owner')}>+ Owner / loan</button>
        <div className="ml-auto flex items-center gap-1 text-sm"><button className="btn-gray btn-sm" onClick={() => shift(-1)}>‹</button><b className="w-24 text-center">{month}</b><button className="btn-gray btn-sm" onClick={() => shift(1)}>›</button></div>
      </div>
      <p className="text-xs text-gray-400">Every entry here is also a normal transaction in <Link href="/financial" className="text-teal-600 font-semibold">Financial Planner</Link>, tagged to this business. Pick the right type so your reports come out correct.</p>

      {rows.length === 0 ? <Empty icon="🧾" title="Nothing recorded this month" text="Record a sale or an expense to start your books." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead className="bg-gray-50 text-gray-500"><tr className="text-left"><th className="p-2">Date</th><th className="p-2">What</th><th className="p-2">Type</th><th className="p-2">Platform</th><th className="p-2 text-right">Amount</th><th className="w-8" /></tr></thead>
            <tbody>{rows.map(t => (
              <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                <td className="p-2 whitespace-nowrap text-gray-500">{t.transaction_date}</td>
                <td className="p-2"><div className="font-medium truncate max-w-[220px]">{t.merchant || t.category || t.description}</div><div className="text-gray-400 truncate max-w-[220px]">{t.category}{t.description ? ` · ${t.description}` : ''}</div></td>
                <td className="p-1"><select className="sel text-xs" value={classOf(t)} onChange={e => run(db.from('transactions').update({ bk_class: e.target.value }).eq('id', t.id).eq('user_id', userId), bp, '')}>
                  {Object.entries(BK_CLASSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></td>
                <td className="p-2 text-gray-500">{t.platform || '—'}</td>
                <td className={`p-2 text-right font-semibold ${t.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>{t.type === 'income' ? '+' : '−'}{m$(d, +t.amount)}</td>
                <td className="p-2"><button aria-label="Delete" className="text-gray-300 hover:text-red-500" onClick={async () => { if (confirm('Delete this entry?')) await run(db.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', t.id).eq('user_id', userId), bp, 'Deleted.') }}><Trash2 size={14} /></button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {form === 'sale' && <SaleForm {...bp} accts={accts} onClose={() => setForm(null)} />}
      {form === 'expense' && <ExpenseForm {...bp} accts={accts} onClose={() => setForm(null)} />}
      {form === 'owner' && <OwnerForm {...bp} accts={accts} onClose={() => setForm(null)} />}
    </div>
  )
}

type FP = BP & { accts: any[]; onClose: () => void }
const base = (bp: BP, f: any) => ({ user_id: bp.userId, business_id: bp.d.biz.id, currency: cur(bp.d), transaction_date: f.date, from_account_id: f.account || null, source: 'manual' })

function SaleForm(bp: FP) {
  const { d, onClose } = bp
  const [f, setF] = useState({ date: today(), platform: d.platforms[0]?.name || '', amount: '', fee: '', feeEdited: false, item: '', qty: '1', note: '', account: bp.accts[0]?.id || '' })
  const plat = d.platforms.find(p => p.name === f.platform)
  const autoFee = plat ? num(f.amount) * num(plat.fee_pct) / 100 + num(plat.fixed_fee) : 0
  const fee = f.feeEdited ? num(f.fee) : autoFee
  const item = d.items.find(i => i.id === f.item)
  const cogs = item ? num(f.qty) * num(item.unit_cost) : 0
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }))
  async function save() {
    if (num(f.amount) <= 0) return bp.toast('Enter the sale amount.')
    if (item && num(f.qty) > num(item.qty) && !confirm(`Only ${item.qty} ${item.unit} in stock. Record anyway?`)) return
    const ins: any[] = [{ ...base(bp, f), type: 'income', amount: num(f.amount), category: 'Sales', merchant: f.platform || 'Direct sale', description: f.note || (item ? `${f.qty} × ${item.name}` : null), bk_class: 'revenue', platform: f.platform || null }]
    if (fee > 0) ins.push({ ...base(bp, f), type: 'expense', amount: fee, category: 'Platform fees', merchant: f.platform, description: 'Commission & payment fee', bk_class: 'opex', platform: f.platform || null })
    const ok = await run(db.from('transactions').insert(ins), bp, '')
    if (!ok) return
    if (item) {
      await db.from('biz_stock_moves').insert({ user_id: bp.userId, business_id: d.biz.id, item_id: item.id, kind: 'sale', qty: -num(f.qty), unit_cost: num(item.unit_cost), move_date: f.date, note: f.platform })
      await db.from('biz_inventory').update({ qty: num(item.qty) - num(f.qty) }).eq('id', item.id).eq('user_id', bp.userId)
      await bp.reload()
    }
    bp.toast('Sale recorded.'); onClose()
  }
  return (
    <Modal title="Record a sale" subtitle="Creates the sale, the platform fee, and (if you pick a product) deducts stock and books COGS." onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className="inp w-full" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Platform"><select className="sel w-full" value={f.platform} onChange={e => setF(x => ({ ...x, platform: e.target.value, feeEdited: false }))}><option value="">Direct / other</option>{d.platforms.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}</select></Field>
        <Field label={`Sale amount (${cur(d)})`} hint="Gross price the customer paid"><input type="number" className="inp w-full" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Platform fee" hint={plat ? `${plat.fee_pct}% + ${plat.fixed_fee} fixed (auto)` : 'Add platforms in Sales & Ads'}><input type="number" className="inp w-full" value={f.feeEdited ? f.fee : Math.round(autoFee)} onChange={e => setF(x => ({ ...x, fee: e.target.value, feeEdited: true }))} /></Field>
        {d.items.length > 0 && <>
          <Field label="Product sold (optional)"><select className="sel w-full" value={f.item} onChange={e => set('item', e.target.value)}><option value="">—</option>{d.items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.qty} left)</option>)}</select></Field>
          <Field label="Quantity"><input type="number" className="inp w-full" value={f.qty} onChange={e => set('qty', e.target.value)} /></Field></>}
        <Field label="Deposit to account" className="col-span-2"><select className="sel w-full" value={f.account} onChange={e => set('account', e.target.value)}><option value="">Not linked to an account</option>{bp.accts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Note" className="col-span-2"><input className="inp w-full" value={f.note} onChange={e => set('note', e.target.value)} placeholder="Order no., customer…" /></Field>
      </div>
      {num(f.amount) > 0 && <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs grid grid-cols-3 gap-2"><div><div className="text-gray-400">Fee</div><b>{m$(d, fee)}</b></div><div><div className="text-gray-400">COGS</div><b>{m$(d, cogs)}</b></div><div><div className="text-gray-400">Profit on sale</div><b className={num(f.amount) - fee - cogs < 0 ? 'text-red-500' : 'text-green-600'}>{m$(d, num(f.amount) - fee - cogs)}</b></div></div>}
      <div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={save}>Save sale</button><button className="btn-gray flex-1" onClick={onClose}>Cancel</button></div>
    </Modal>
  )
}

function ExpenseForm(bp: FP) {
  const { d, onClose } = bp
  const [f, setF] = useState({ date: today(), cls: 'opex', amount: '', category: 'Packaging', who: '', platform: '', note: '', account: bp.accts[0]?.id || '' })
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }))
  async function save() {
    if (num(f.amount) <= 0) return bp.toast('Enter the amount.')
    const cat = f.cls === 'cogs' ? (f.category === 'Packaging' ? 'COGS' : f.category) : f.cls === 'inventory_purchase' ? 'Inventory' : f.cls === 'asset_purchase' ? 'Equipment' : f.category
    if (await run(db.from('transactions').insert({ ...base(bp, f), type: 'expense', amount: num(f.amount), category: cat, merchant: f.who || null, description: f.note || null, bk_class: f.cls, platform: f.platform || null }), bp, 'Expense recorded.')) onClose()
  }
  return (
    <Modal title="Record a cost" subtitle="Money going out of the business." onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className="inp w-full" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label={`Amount (${cur(d)})`}><input type="number" className="inp w-full" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="What kind of cost?" className="col-span-2" hint="COGS = what it cost to make/buy what you sold. Operating expense = running costs. Stock and equipment are assets, not expenses.">
          <select className="sel w-full" value={f.cls} onChange={e => set('cls', e.target.value)}>{['opex', 'cogs', 'inventory_purchase', 'asset_purchase'].map(k => <option key={k} value={k}>{BK_CLASSES[k].label}</option>)}</select></Field>
        {(f.cls === 'opex' || f.cls === 'cogs') && <Field label="Category"><input className="inp w-full" list="biz-cats" value={f.category} onChange={e => set('category', e.target.value)} /><datalist id="biz-cats">{OPEX_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist></Field>}
        <Field label="Paid to (supplier)"><input className="inp w-full" value={f.who} onChange={e => set('who', e.target.value)} /></Field>
        <Field label="Platform (for ads/fees)"><select className="sel w-full" value={f.platform} onChange={e => set('platform', e.target.value)}><option value="">—</option>{d.platforms.map(p => <option key={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Paid from account"><select className="sel w-full" value={f.account} onChange={e => set('account', e.target.value)}><option value="">Not linked</option>{bp.accts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Note" className="col-span-2"><input className="inp w-full" value={f.note} onChange={e => set('note', e.target.value)} /></Field>
      </div>
      <div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={save}>Save</button><button className="btn-gray flex-1" onClick={onClose}>Cancel</button></div>
    </Modal>
  )
}

function OwnerForm(bp: FP) {
  const { d, onClose } = bp
  const OPTS: Record<string, { label: string; type: string }> = { owner_contribution: { label: 'I put my own money into the business', type: 'income' }, owner_draw: { label: 'I take money out for myself', type: 'expense' }, loan_in: { label: 'Loan received', type: 'income' }, loan_payment: { label: 'Loan repayment', type: 'expense' } }
  const [f, setF] = useState({ date: today(), cls: 'owner_contribution', amount: '', note: '', account: bp.accts[0]?.id || '' })
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }))
  async function save() {
    if (num(f.amount) <= 0) return bp.toast('Enter the amount.')
    if (await run(db.from('transactions').insert({ ...base(bp, f), type: OPTS[f.cls].type, amount: num(f.amount), category: BK_CLASSES[f.cls].label, merchant: 'Owner', description: f.note || null, bk_class: f.cls }), bp, 'Recorded.')) onClose()
  }
  return (
    <Modal title="Owner money & loans" subtitle="Not income or expense — these only move cash and equity." onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="What happened?" className="col-span-2"><select className="sel w-full" value={f.cls} onChange={e => set('cls', e.target.value)}>{Object.entries(OPTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Field label="Date"><input type="date" className="inp w-full" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label={`Amount (${cur(d)})`}><input type="number" className="inp w-full" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Account" className="col-span-2"><select className="sel w-full" value={f.account} onChange={e => set('account', e.target.value)}><option value="">Not linked</option>{bp.accts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Note" className="col-span-2"><input className="inp w-full" value={f.note} onChange={e => set('note', e.target.value)} /></Field>
      </div>
      <div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={save}>Save</button><button className="btn-gray flex-1" onClick={onClose}>Cancel</button></div>
    </Modal>
  )
}
