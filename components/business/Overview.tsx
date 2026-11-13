'use client'
import { useMemo, useState } from 'react'
import { aging, computeBalance, computePnL, evaluatePlan, inventoryReport, periodRange, platformStats, ymdOf } from '@/lib/business'
import { ProgressBar } from '@/components/planner/Charts'
import { BP, Stat, m$, today } from './ui'

export default function Overview({ go, ...bp }: BP & { go: (t: string) => void }) {
  const { d } = bp
  const [range, setRange] = useState<'month' | 'quarter' | 'year'>('month')
  const p = periodRange(range, new Date())
  const pnl = computePnL(d, p.from, p.to)
  const bs = computeBalance(d, today())
  const arAg = aging(d.invoices, 'receivable', today()), apAg = aging(d.invoices, 'payable', today())
  const stats = useMemo(() => platformStats(d, p.from, p.to), [d, p.from, p.to])
  const inv = inventoryReport(d, p.from, p.to)
  const trend = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const x = new Date(new Date().getFullYear(), new Date().getMonth() - (5 - i), 1)
    const r = computePnL(d, ymdOf(x), ymdOf(new Date(x.getFullYear(), x.getMonth() + 1, 0)))
    return { label: x.toLocaleDateString('en-US', { month: 'short' }), revenue: r.revenue, net: r.net }
  }), [d])
  const maxT = Math.max(1, ...trend.map(t => t.revenue))
  const target = Number(d.biz.monthly_target || 0)
  const monthRev = range === 'month' ? pnl.revenue : computePnL(d, periodRange('month', new Date()).from, periodRange('month', new Date()).to).revenue

  const alerts: { icon: string; text: string; tab: string }[] = []
  if (inv.lowCount) alerts.push({ icon: '📦', text: `${inv.lowCount} product${inv.lowCount > 1 ? 's are' : ' is'} low on stock`, tab: 'inventory' })
  const late = (ag: typeof arAg) => ag.buckets.d30.total + ag.buckets.d60.total + ag.buckets.d90.total + ag.buckets.d90p.total
  if (late(arAg) > 0) alerts.push({ icon: '📬', text: `${m$(d, late(arAg))} of customer invoices are late`, tab: 'invoices' })
  if (late(apAg) > 0) alerts.push({ icon: '📮', text: `${m$(d, late(apAg))} of supplier bills are overdue`, tab: 'invoices' })
  stats.filter(s => s.verdict.includes('below break-even')).forEach(s => alerts.push({ icon: '📣', text: `${s.name} ads are below break-even`, tab: 'platforms' }))
  const mp = d.plans.find(x => x.period_type === 'month' && x.period_key === today().slice(0, 7))
  if (mp) { const e = evaluatePlan(d, mp, today()); if (e.revState === 'behind' || e.revState === 'at-risk') alerts.push({ icon: '🎯', text: `This month’s revenue plan is ${e.revState === 'at-risk' ? 'at risk' : 'behind'}`, tab: 'plans' }) }
  else alerts.push({ icon: '🗓️', text: 'No plan set for this month yet', tab: 'plans' })
  if (bs.cash < 0) alerts.push({ icon: '💸', text: 'Cash is negative — check opening cash in Settings', tab: 'settings' })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{(['month', 'quarter', 'year'] as const).map(r => <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-md font-semibold ${range === r ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{r === 'month' ? 'This month' : r === 'quarter' ? 'This quarter' : 'This year'}</button>)}</div>
        <div className="ml-auto flex gap-2"><button className="btn-blue btn-sm" onClick={() => go('ledger')}>+ Record sale</button><button className="btn-gray btn-sm" onClick={() => go('reports')}>Reports</button></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Revenue" value={m$(d, pnl.revenue)} tone="blue" big />
        <Stat label="Gross profit" value={m$(d, pnl.gross)} sub={`${pnl.grossMargin.toFixed(0)}% margin`} />
        <Stat label="Expenses" value={m$(d, pnl.opex)} tone="amber" />
        <Stat label="Net profit" value={m$(d, pnl.net)} sub={`${pnl.netMargin.toFixed(0)}% margin`} tone={pnl.net < 0 ? 'red' : 'green'} big />
        <Stat label="Cash on hand" value={m$(d, bs.cash)} tone={bs.cash < 0 ? 'red' : 'gray'} />
        <Stat label="Customers owe you" value={m$(d, arAg.total)} />
        <Stat label="You owe suppliers" value={m$(d, apAg.total)} />
        <Stat label="Stock value" value={m$(d, inv.total)} />
      </div>

      {target > 0 && <div className="card p-4"><div className="flex justify-between text-sm mb-1.5"><b>Monthly sales target</b><span className="text-gray-500">{m$(d, monthRev)} / {m$(d, target)}</span></div><ProgressBar pct={Math.min(100, monthRev / target * 100)} color="#14B8A6" /></div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4"><div className="font-bold text-sm mb-3">Revenue · last 6 months</div>
          <div className="flex items-end gap-2 h-32">{trend.map(t => <div key={t.label} className="flex-1 flex flex-col items-center gap-1"><div className="w-full flex flex-col justify-end h-24"><div className="w-full rounded-t-md bg-blue-400" style={{ height: `${Math.max(2, t.revenue / maxT * 100)}%` }} title={m$(d, t.revenue)} /></div><div className="text-[10px] text-gray-400">{t.label}</div><div className={`text-[10px] font-semibold ${t.net < 0 ? 'text-red-500' : 'text-green-600'}`}>{t.net === 0 ? '' : (t.net < 0 ? '−' : '+') + shortNum(Math.abs(t.net))}</div></div>)}</div>
          <div className="text-[10px] text-gray-400 mt-1">Bars = revenue · small number = net profit</div></div>
        <div className="card p-4"><div className="font-bold text-sm mb-3">Where the money goes</div>
          {pnl.revenue === 0 && pnl.opex === 0 ? <div className="text-xs text-gray-400">Nothing recorded in this period.</div> : <div className="space-y-2">{[['COGS', pnl.cogs, '#F59E0B'], ...pnl.opexLines.slice(0, 5).map(([k, v]) => [k, v, '#8B5CF6'] as [string, number, string])].map(([k, v, c]) => <div key={k as string} className="text-xs"><div className="flex justify-between"><span>{k}</span><span className="text-gray-500">{m$(d, v as number)} · {pnl.revenue ? Math.round((v as number) / pnl.revenue * 100) : 0}%</span></div><ProgressBar pct={pnl.revenue ? Math.min(100, (v as number) / pnl.revenue * 100) : 0} color={c as string} height={5} /></div>)}</div>}</div>
      </div>

      {stats.length > 0 && <div className="card p-4"><div className="font-bold text-sm mb-2">Sales by platform</div>{stats.map(s => <div key={s.name} className="flex justify-between text-xs py-1.5 border-t border-gray-50 first:border-0"><b>{s.name}</b><span className="text-gray-500">{m$(d, s.revenue)} · after fees & ads {m$(d, s.afterCosts)}</span></div>)}</div>}

      {alerts.length > 0 && <div className="card p-4 space-y-2"><div className="font-bold text-sm">Needs your attention</div>{alerts.map((a, i) => <button key={i} onClick={() => go(a.tab)} className="w-full text-left text-sm flex gap-2 hover:bg-gray-50 rounded-lg px-2 py-1.5"><span>{a.icon}</span><span>{a.text}</span><span className="ml-auto text-gray-300">→</span></button>)}</div>}
    </div>
  )
}
const shortNum = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(Math.round(n)))
