'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { onChange } from '@/lib/planner'
import { STATE_STYLE, aging, computeBalance, computePnL, evaluatePlan, inventoryReport, money, periodRange } from '@/lib/business'
import { loadBiz } from '@/lib/business'

const todayS = () => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }

export default function BusinessDashboard() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [range, setRange] = useState<'month' | 'quarter' | 'year'>('month')

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: list } = await supabase.from('businesses').select('*').eq('user_id', user.id).eq('status', 'active').order('sort_order')
    const all = await Promise.all((list || []).map(b => loadBiz(supabase, user.id, b.id)))
    setRows(all.filter(x => x.biz)); setMissing(all.some(x => x.missing)); setLoading(false)
  }
  useEffect(() => { void load() }, [])
  useEffect(() => onChange(() => { void load() }), [])

  const p = periodRange(range, new Date())
  const data = rows.map(d => {
    const pnl = computePnL(d, p.from, p.to), bs = computeBalance(d, todayS())
    const plan = d.plans.find((x: any) => x.period_type === 'month' && x.period_key === todayS().slice(0, 7))
    return { d, pnl, bs, ar: aging(d.invoices, 'receivable', todayS()).total, ap: aging(d.invoices, 'payable', todayS()).total, low: inventoryReport(d, p.from, p.to).lowCount, plan: plan ? evaluatePlan(d, plan, todayS()) : null }
  })
  const totals: Record<string, { rev: number; net: number; cash: number }> = {}
  data.forEach(x => { const c = x.d.biz.currency || 'IDR'; const t = (totals[c] ||= { rev: 0, net: 0, cash: 0 }); t.rev += x.pnl.revenue; t.net += x.pnl.net; t.cash += x.bs.cash })
  const maxRev = Math.max(1, ...data.map(x => x.pnl.revenue))

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center gap-3"><div><h1 className="text-2xl font-bold">Business Dashboard</h1><p className="text-sm text-gray-500 mt-1">All your businesses side by side, from the books you keep in each one.</p></div>
        <div className="ml-auto flex items-center gap-2"><div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{(['month', 'quarter', 'year'] as const).map(r => <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-md font-semibold ${range === r ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{r === 'month' ? 'Month' : r === 'quarter' ? 'Quarter' : 'Year'}</button>)}</div>
          <Link href="/business/new" className="btn-blue btn-sm flex items-center gap-1"><Plus size={15} /> Add business</Link></div></header>
      {missing && <div className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">Run <b>lib/planner-upgrade-6.sql</b> in Supabase → SQL Editor to unlock invoices, inventory, platforms and plans.</div>}
      {loading ? <div className="card p-8 text-center text-gray-500">Loading businesses…</div> : data.length === 0 ? (
        <div className="card p-10 text-center"><div className="text-4xl">💼</div><p className="font-semibold mt-2">No businesses yet</p><p className="text-sm text-gray-500 mt-1">Add a business to start its books, inventory, platforms and plans.</p><Link href="/business/new" className="btn-blue btn-sm inline-flex mt-4">Add business</Link></div>
      ) : <>
        <div className="grid gap-3 md:grid-cols-3">{Object.entries(totals).map(([c, t]) => <div key={c} className="card p-5"><div className="text-xs font-bold text-gray-400 uppercase">{c} · {p.label}</div><div className="text-2xl font-bold mt-1">{money(t.rev, c)}</div><div className="text-xs text-gray-500 mt-1">revenue · net <b className={t.net < 0 ? 'text-red-500' : 'text-green-600'}>{money(t.net, c)}</b> · cash {money(t.cash, c)}</div></div>)}</div>
        {data.length > 1 && <div className="card p-4"><div className="font-bold text-sm mb-3">Revenue by business</div><div className="space-y-2">{[...data].sort((a, b) => b.pnl.revenue - a.pnl.revenue).map(x => <div key={x.d.biz.id} className="flex items-center gap-3 text-xs"><span className="w-32 truncate">{x.d.biz.emoji} {x.d.biz.name}</span><div className="flex-1 h-3 rounded-full bg-gray-100"><div className="h-3 rounded-full" style={{ width: `${x.pnl.revenue / maxRev * 100}%`, background: x.d.biz.color || '#5B7FFF' }} /></div><span className="w-28 text-right text-gray-500">{money(x.pnl.revenue, x.d.biz.currency)}</span></div>)}</div><p className="text-[10px] text-gray-400 mt-2">Bars compare raw numbers; businesses in different currencies are not converted.</p></div>}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{data.map(x => { const c = x.d.biz.currency || 'IDR'; return (
          <Link key={x.d.biz.id} href={`/business/${x.d.biz.id}`} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between"><span className="text-3xl">{x.d.biz.emoji || '💼'}</span><ArrowUpRight size={17} className="text-gray-400" /></div>
            <h2 className="font-bold text-lg mt-2">{x.d.biz.name}</h2>
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm"><div><div className="text-xs text-gray-500">Revenue</div><b>{money(x.pnl.revenue, c)}</b></div><div><div className="text-xs text-gray-500">Net profit</div><b className={x.pnl.net < 0 ? 'text-red-500' : 'text-green-600'}>{money(x.pnl.net, c)}</b></div>
              <div><div className="text-xs text-gray-500">Cash</div><b>{money(x.bs.cash, c)}</b></div><div><div className="text-xs text-gray-500">Owed to you</div><b>{money(x.ar, c)}</b></div></div>
            <div className="flex flex-wrap gap-1.5 mt-3">{x.plan && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATE_STYLE[x.plan.revState].cls}`}>Plan: {STATE_STYLE[x.plan.revState].label}</span>}{x.low > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">{x.low} low stock</span>}{x.ap > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Bills {money(x.ap, c)}</span>}</div>
          </Link>) })}</div>
      </>}
    </div>
  )
}
