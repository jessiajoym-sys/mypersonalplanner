'use client'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal, { Field } from '@/components/planner/Modal'
import { inventoryReport, periodRange } from '@/lib/business'
import { BP, Empty, Stat, acctOptions, cur, db, m$, num, run, today } from './ui'

export default function Inventory(bp: BP) {
  const { d, userId } = bp
  const [item, setItem] = useState<any>(null), [stock, setStock] = useState<any>(null)
  const p = periodRange('month', new Date())
  const rep = inventoryReport(d, p.from, p.to)
  const accts = acctOptions(bp.accounts, cur(d))

  async function saveItem() {
    if (!item.name.trim()) return bp.toast('Give the product a name.')
    const row = { name: item.name.trim(), sku: item.sku || null, unit: item.unit || 'pcs', unit_cost: num(item.unit_cost), sell_price: num(item.sell_price), reorder_level: num(item.reorder_level) }
    if (item.id) { if (await run(db.from('biz_inventory').update(row).eq('id', item.id).eq('user_id', userId), bp, 'Saved.')) setItem(null); return }
    const { data, error } = await db.from('biz_inventory').insert({ ...row, user_id: userId, business_id: d.biz.id, qty: num(item.qty) }).select().single()
    if (error) return bp.toast('Could not save: ' + error.message + ' — run lib/planner-upgrade-6.sql first.')
    if (num(item.qty) > 0) await db.from('biz_stock_moves').insert({ user_id: userId, business_id: d.biz.id, item_id: data.id, kind: 'adjust', qty: num(item.qty), unit_cost: num(item.unit_cost), move_date: today(), note: 'Opening stock' })
    await bp.reload(); bp.toast('Product added.'); setItem(null)
  }
  async function saveStock() {
    const q = num(stock.qty); const it = stock.item
    if (q === 0) return bp.toast('Enter a quantity.')
    const buying = stock.mode === 'purchase'
    const qty = stock.mode === 'purchase' ? Math.abs(q) : q          // adjust may be negative
    const cost = buying ? num(stock.cost) : num(it.unit_cost)
    await db.from('biz_stock_moves').insert({ user_id: userId, business_id: d.biz.id, item_id: it.id, kind: stock.mode, qty, unit_cost: cost, move_date: stock.date, note: stock.note || null })
    const newQty = num(it.qty) + qty
    const avg = buying && newQty > 0 ? (num(it.qty) * num(it.unit_cost) + qty * cost) / newQty : num(it.unit_cost)   // weighted average cost
    if (buying && stock.record && cost * qty > 0) await db.from('transactions').insert({ user_id: userId, business_id: d.biz.id, type: 'expense', amount: cost * qty, currency: cur(d), category: 'Inventory', merchant: stock.supplier || it.name, description: `Restock ${qty} × ${it.name}`, bk_class: 'inventory_purchase', transaction_date: stock.date, from_account_id: stock.account || null, source: 'manual' })
    if (await run(db.from('biz_inventory').update({ qty: newQty, unit_cost: avg }).eq('id', it.id).eq('user_id', userId), bp, 'Stock updated.')) setStock(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><div><h2 className="font-bold">Inventory</h2><p className="text-xs text-gray-500">Stock on hand, its value, and what is running low. Selling a product in “Record sale” deducts stock and books COGS for you.</p></div>
        <button className="btn-blue btn-sm ml-auto" onClick={() => setItem({ name: '', sku: '', unit: 'pcs', qty: '', unit_cost: '', sell_price: '', reorder_level: '' })}>+ Product</button></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Stock value" value={m$(d, rep.total)} sub="at cost" big /><Stat label="Products" value={String(rep.rows.length)} />
        <Stat label="Low on stock" value={String(rep.lowCount)} tone={rep.lowCount ? 'red' : 'gray'} /><Stat label="Sold this month" value={String(rep.rows.reduce((s, r) => s + r.sold, 0))} sub="units" /></div>
      {rep.rows.length === 0 ? <Empty icon="📦" title="No products yet" text="Add what you sell (e.g. a sambal flavour, a blanket model) with its cost and selling price." /> : (
        <div className="card overflow-x-auto"><table className="w-full text-xs min-w-[720px]">
          <thead className="bg-gray-50 text-gray-500"><tr className="text-left"><th className="p-2">Product</th><th className="p-2 text-right">In stock</th><th className="p-2 text-right">Unit cost</th><th className="p-2 text-right">Sell price</th><th className="p-2 text-right">Margin</th><th className="p-2 text-right">Value</th><th className="p-2 text-right">Bought / sold (month)</th><th /></tr></thead>
          <tbody>{rep.rows.map(r => <tr key={r.id} className="border-t border-gray-50">
            <td className="p-2"><b>{r.name}</b>{r.sku && <span className="text-gray-400"> · {r.sku}</span>}{r.low && <span className="ml-2 text-[10px] font-semibold bg-red-100 text-red-600 rounded-full px-2 py-0.5">Low</span>}</td>
            <td className={`p-2 text-right font-semibold ${r.low ? 'text-red-500' : ''}`}>{r.qty} {r.unit}</td><td className="p-2 text-right">{m$(d, +r.unit_cost)}</td><td className="p-2 text-right">{+r.sell_price ? m$(d, +r.sell_price) : '—'}</td>
            <td className="p-2 text-right">{r.margin === null ? '—' : r.margin.toFixed(0) + '%'}</td><td className="p-2 text-right">{m$(d, r.value)}</td><td className="p-2 text-right text-gray-500">{r.bought} / {r.sold}</td>
            <td className="p-2 whitespace-nowrap text-right"><button className="text-teal-600 font-semibold mr-2" onClick={() => setStock({ item: r, mode: 'purchase', qty: '', cost: r.unit_cost, date: today(), supplier: '', record: true, account: accts[0]?.id || '', note: '' })}>Restock</button>
              <button className="text-gray-500 mr-2" onClick={() => setStock({ item: r, mode: 'adjust', qty: '', date: today(), note: '' })}>Adjust</button><button className="text-gray-500 mr-2" onClick={() => setItem(r)}>Edit</button>
              <button aria-label="Delete" className="text-gray-300 hover:text-red-500" onClick={async () => { if (confirm(`Delete ${r.name}?`)) await run(db.from('biz_inventory').delete().eq('id', r.id).eq('user_id', userId), bp, 'Deleted.') }}><Trash2 size={13} className="inline" /></button></td></tr>)}</tbody></table></div>)}

      {item && <Modal title={item.id ? 'Edit product' : 'New product'} onClose={() => setItem(null)}><div className="grid grid-cols-2 gap-3">
        <Field label="Name" className="col-span-2"><input className="inp w-full" value={item.name} onChange={e => setItem({ ...item, name: e.target.value })} /></Field>
        <Field label="SKU (optional)"><input className="inp w-full" value={item.sku || ''} onChange={e => setItem({ ...item, sku: e.target.value })} /></Field>
        <Field label="Unit"><input className="inp w-full" value={item.unit} onChange={e => setItem({ ...item, unit: e.target.value })} /></Field>
        {!item.id && <Field label="Stock now"><input type="number" className="inp w-full" value={item.qty} onChange={e => setItem({ ...item, qty: e.target.value })} /></Field>}
        <Field label={`Cost per unit (${cur(d)})`}><input type="number" className="inp w-full" value={item.unit_cost} onChange={e => setItem({ ...item, unit_cost: e.target.value })} /></Field>
        <Field label="Selling price"><input type="number" className="inp w-full" value={item.sell_price} onChange={e => setItem({ ...item, sell_price: e.target.value })} /></Field>
        <Field label="Warn me when stock ≤"><input type="number" className="inp w-full" value={item.reorder_level} onChange={e => setItem({ ...item, reorder_level: e.target.value })} /></Field>
      </div><div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={saveItem}>Save</button><button className="btn-gray flex-1" onClick={() => setItem(null)}>Cancel</button></div></Modal>}

      {stock && <Modal title={stock.mode === 'purchase' ? `Restock ${stock.item.name}` : `Adjust ${stock.item.name}`} subtitle={stock.mode === 'purchase' ? 'Cost is averaged with your existing stock.' : 'Use a negative number for damaged / lost / gifted items.'} onClose={() => setStock(null)}><div className="grid grid-cols-2 gap-3">
        <Field label={stock.mode === 'purchase' ? 'Quantity bought' : 'Change in quantity'}><input type="number" className="inp w-full" value={stock.qty} onChange={e => setStock({ ...stock, qty: e.target.value })} /></Field>
        <Field label="Date"><input type="date" className="inp w-full" value={stock.date} onChange={e => setStock({ ...stock, date: e.target.value })} /></Field>
        {stock.mode === 'purchase' && <><Field label="Cost per unit"><input type="number" className="inp w-full" value={stock.cost} onChange={e => setStock({ ...stock, cost: e.target.value })} /></Field>
          <Field label="Supplier"><input className="inp w-full" value={stock.supplier} onChange={e => setStock({ ...stock, supplier: e.target.value })} /></Field>
          <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={stock.record} onChange={e => setStock({ ...stock, record: e.target.checked })} /> Also record the payment in my ledger</label>
          {stock.record && <Field label="Paid from" className="col-span-2"><select className="sel w-full" value={stock.account} onChange={e => setStock({ ...stock, account: e.target.value })}><option value="">Not linked</option>{accts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}</>}
        <Field label="Note" className="col-span-2"><input className="inp w-full" value={stock.note} onChange={e => setStock({ ...stock, note: e.target.value })} /></Field>
      </div><div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={saveStock}>Save</button><button className="btn-gray flex-1" onClick={() => setStock(null)}>Cancel</button></div></Modal>}
    </div>
  )
}
