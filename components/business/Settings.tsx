'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BP, db, num, run } from './ui'

export default function Settings(bp: BP) {
  const { d, userId } = bp
  const router = useRouter()
  const b = d.biz
  const [f, setF] = useState({ name: b.name, emoji: b.emoji || '💼', description: b.description || '', currency: b.currency || 'IDR', monthly_target: b.monthly_target || '', opening_cash: b.opening_cash || '', opening_date: b.opening_date || '' })
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }))
  return (
    <div className="card p-5 max-w-xl space-y-3">
      <h2 className="font-bold">Business settings</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-gray-500 col-span-2">Name<input className="inp w-full mt-1" value={f.name} onChange={e => set('name', e.target.value)} /></label>
        <label className="text-xs font-semibold text-gray-500">Emoji<input className="inp w-full mt-1" value={f.emoji} onChange={e => set('emoji', e.target.value)} /></label>
        <label className="text-xs font-semibold text-gray-500">Currency of the books<select className="sel w-full mt-1" value={f.currency} onChange={e => set('currency', e.target.value)}>{['IDR', 'CNY', 'USD', 'EUR', 'SGD'].map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="text-xs font-semibold text-gray-500 col-span-2">Description<input className="inp w-full mt-1" value={f.description} onChange={e => set('description', e.target.value)} /></label>
        <label className="text-xs font-semibold text-gray-500">Monthly sales target<input type="number" className="inp w-full mt-1" value={f.monthly_target} onChange={e => set('monthly_target', e.target.value)} /></label>
        <label className="text-xs font-semibold text-gray-500">Opening cash<input type="number" className="inp w-full mt-1" value={f.opening_cash} onChange={e => set('opening_cash', e.target.value)} /></label>
      </div>
      <p className="text-[11px] text-gray-400">Opening cash = money the business already had before you started recording. Only transactions in {f.currency} are counted in these books.</p>
      <div className="flex gap-2 pt-1"><button className="btn-blue btn-sm" onClick={() => run(db.from('businesses').update({ name: f.name.trim(), emoji: f.emoji, description: f.description || null, currency: f.currency, monthly_target: num(f.monthly_target), opening_cash: num(f.opening_cash) }).eq('id', b.id).eq('user_id', userId), bp, 'Settings saved.')}>Save</button>
        <button className="btn-gray btn-sm text-red-600 ml-auto" onClick={async () => { if (confirm('Archive this business? It disappears from the menu; your books are kept.') && await run(db.from('businesses').update({ status: 'archived' }).eq('id', b.id).eq('user_id', userId), bp, '')) router.push('/dashboard/business') }}>Archive business</button></div>
    </div>
  )
}
