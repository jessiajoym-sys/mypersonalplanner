'use client'
import { useState } from 'react'
import { Printer, Trash2 } from 'lucide-react'
import { aging, budgetVsActual, computeBalance, computeCashFlow, computePnL, inventoryReport, outstanding, periodRange } from '@/lib/business'
import { BP, Stat, cur, db, m$, num, run, today } from './ui'
import Modal, { Field } from '@/components/planner/Modal'

const TABS = [['pnl', 'Profit & Loss'], ['cash', 'Cash Flow'], ['bs', 'Balance Sheet'], ['ar', 'Receivable'], ['ap', 'Payable'], ['inv', 'Inventory'], ['bva', 'Budget vs Actual']] as const
type R = typeof TABS[number][0]

const Row = ({ l, v, b, indent, tone }: { l: string; v: string; b?: boolean; indent?: boolean; tone?: string }) => <div className={`flex justify-between py-1.5 text-sm ${b ? 'font-bold border-t border-gray-200 mt-1 pt-2' : ''} ${indent ? 'pl-4 text-gray-600' : ''}`}><span>{l}</span><span className={tone}>{v}</span></div>
const Sec = ({ t }: { t: string }) => <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mt-4 mb-1">{t}</div>

export default function Reports(bp: BP) {
  const { d, userId } = bp
  const [rep, setRep] = useState<R>('pnl')
  const [ptype, setPtype] = useState<'month' | 'quarter' | 'year' | 'custom'>('month')
  const [ref, setRef] = useState(new Date())
  const [custom, setCustom] = useState({ from: today().slice(0, 8) + '01', to: today() })
  const [reg, setReg] = useState<any>(null), [bud, setBud] = useState<any>(null)
  const p = periodRange(ptype, ref, custom)
  const shift = (n: number) => setRef(r => ptype === 'year' ? new Date(r.getFullYear() + n, 0, 1) : ptype === 'quarter' ? new Date(r.getFullYear(), r.getMonth() + n * 3, 1) : new Date(r.getFullYear(), r.getMonth() + n, 1))
  const month = `${p.from.slice(0, 7)}`
  const neg = (n: number) => (n < 0 ? 'text-red-500' : '')

  const pnl = computePnL(d, p.from, p.to)
  const cf = computeCashFlow(d, p.from, p.to)
  const bs = computeBalance(d, p.to)

  async function saveReg() {
    if (!reg.name.trim()) return bp.toast('Enter a name.')
    if (await run(db.from('biz_items').insert({ user_id: userId, business_id: d.biz.id, kind: reg.kind, name: reg.name.trim(), value: num(reg.value) }), bp, 'Saved.')) setReg(null)
  }
  async function saveBud() {
    if (!bud.category.trim() || num(bud.amount) <= 0) return bp.toast('Enter a category and amount.')
    if (await run(db.from('biz_budgets').insert({ user_id: userId, business_id: d.biz.id, budget_month: month + '-01', kind: bud.kind, category: bud.kind === 'revenue' ? 'Sales' : bud.category.trim(), amount: num(bud.amount) }), bp, 'Budget saved.')) setBud(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center print:hidden">
        <div className="flex flex-wrap rounded-lg bg-gray-100 p-0.5 text-xs">{TABS.map(([k, l]) => <button key={k} onClick={() => setRep(k)} className={`px-3 py-1.5 rounded-md font-semibold ${rep === k ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{l}</button>)}</div>
        <button className="btn-gray btn-sm ml-auto flex items-center gap-1 text-xs" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
      </div>
      {['pnl', 'cash', 'bs', 'bva', 'inv'].includes(rep) && (
        <div className="flex flex-wrap gap-2 items-center print:hidden">
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{(['month', 'quarter', 'year', 'custom'] as const).map(t => <button key={t} onClick={() => setPtype(t)} className={`px-3 py-1 rounded-md font-semibold capitalize ${ptype === t ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{t}</button>)}</div>
          {ptype !== 'custom' ? <div className="flex items-center gap-1 text-sm"><button className="btn-gray btn-sm" onClick={() => shift(-1)}>‹</button><b className="min-w-[110px] text-center">{p.label}</b><button className="btn-gray btn-sm" onClick={() => shift(1)}>›</button></div>
            : <div className="flex items-center gap-1 text-xs"><input type="date" className="inp text-xs" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} />→<input type="date" className="inp text-xs" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} /></div>}
        </div>)}

      <div className="card p-5 max-w-3xl">
        <div className="mb-3"><div className="text-xs text-gray-400">{d.biz.emoji} {d.biz.name} · {cur(d)}</div><h2 className="text-lg font-bold">{TABS.find(t => t[0] === rep)![1]}{['pnl', 'cash', 'bva'].includes(rep) ? ` — ${p.label}` : rep === 'bs' ? ` — as of ${p.to}` : ''}</h2></div>

        {rep === 'pnl' && <>
          <Row l="Sales revenue" v={m$(d, pnl.revenue)} b />
          <Row l="Cost of goods sold" v={'− ' + m$(d, pnl.cogs)} indent />
          <Row l="Gross profit" v={m$(d, pnl.gross)} b tone={neg(pnl.gross)} /><div className="text-[11px] text-gray-400 text-right">Gross margin {pnl.grossMargin.toFixed(1)}%</div>
          <Sec t="Operating expenses" />{pnl.opexLines.length === 0 && <div className="text-xs text-gray-400">None recorded.</div>}
          {pnl.opexLines.map(([k, v]) => <Row key={k} l={k} v={m$(d, v)} indent />)}
          <Row l="Total operating expenses" v={'− ' + m$(d, pnl.opex)} b />
          {pnl.otherIncome > 0 && <Row l="Other income" v={m$(d, pnl.otherIncome)} />}
          <Row l="Net profit" v={m$(d, pnl.net)} b tone={pnl.net < 0 ? 'text-red-500' : 'text-green-600'} /><div className="text-[11px] text-gray-400 text-right">Net margin {pnl.netMargin.toFixed(1)}%</div>
          <p className="text-[11px] text-gray-400 mt-3">Invoices count when issued; stock sold counts as COGS using its average cost. Owner money, loans, equipment and stock purchases are not income or expense.</p></>}

        {rep === 'cash' && <>
          <Row l="Cash at start" v={m$(d, cf.opening)} b />
          <Sec t="Operating activities" />{cf.operating.filter(x => x.value).map(x => <Row key={x.label} l={x.label} v={m$(d, x.value)} indent tone={neg(x.value)} />)}<Row l="Net from operations" v={m$(d, cf.opTotal)} b tone={neg(cf.opTotal)} />
          <Sec t="Investing" />{cf.investing.filter(x => x.value).map(x => <Row key={x.label} l={x.label} v={m$(d, x.value)} indent tone={neg(x.value)} />)}<Row l="Net from investing" v={m$(d, cf.invTotal)} b />
          <Sec t="Financing & owner" />{cf.financing.filter(x => x.value).map(x => <Row key={x.label} l={x.label} v={m$(d, x.value)} indent tone={neg(x.value)} />)}<Row l="Net from financing" v={m$(d, cf.finTotal)} b />
          <Row l="Net change in cash" v={m$(d, cf.net)} b tone={neg(cf.net)} /><Row l="Cash at end" v={m$(d, cf.closing)} b />
          <p className="text-[11px] text-gray-400 mt-3">Cash only: counts when money actually moved. Starting cash comes from the opening cash you set for this business plus earlier entries.</p></>}

        {rep === 'bs' && <>
          <Sec t="Assets" /><Row l="Cash" v={m$(d, bs.cash)} indent /><Row l="Accounts receivable" v={m$(d, bs.ar)} indent /><Row l="Inventory" v={m$(d, bs.inventory)} indent />
          {bs.fixedAssets.map(a => <div key={a.id} className="flex justify-between py-1.5 text-sm pl-4 text-gray-600"><span>{a.name}</span><span className="flex items-center gap-2">{m$(d, +a.value)}<button aria-label="Delete" className="text-gray-300 hover:text-red-500 print:hidden" onClick={() => run(db.from('biz_items').delete().eq('id', a.id).eq('user_id', userId), bp, '')}><Trash2 size={12} /></button></span></div>)}
          <Row l="Total assets" v={m$(d, bs.assets)} b />
          <Sec t="Liabilities" /><Row l="Accounts payable" v={m$(d, bs.ap)} indent />
          {bs.otherLiab.map(a => <div key={a.id} className="flex justify-between py-1.5 text-sm pl-4 text-gray-600"><span>{a.name}</span><span className="flex items-center gap-2">{m$(d, +a.value)}<button aria-label="Delete" className="text-gray-300 hover:text-red-500 print:hidden" onClick={() => run(db.from('biz_items').delete().eq('id', a.id).eq('user_id', userId), bp, '')}><Trash2 size={12} /></button></span></div>)}
          <Row l="Total liabilities" v={m$(d, bs.liabilities)} b />
          <Sec t="Owner’s equity" />{bs.opening !== 0 && <Row l="Opening cash (start-up capital)" v={m$(d, bs.opening)} indent />}<Row l="Owner contributions" v={m$(d, bs.contrib)} indent /><Row l="Owner withdrawals" v={'− ' + m$(d, bs.draws)} indent /><Row l="Retained earnings (all-time profit)" v={m$(d, bs.retained)} indent tone={neg(bs.retained)} />
          {Math.abs(bs.adjustments) > 0.5 && <Row l="Opening balance & adjustments" v={m$(d, bs.adjustments)} indent tone={neg(bs.adjustments)} />}
          <Row l="Total equity" v={m$(d, bs.equity)} b />
          <div className="flex gap-2 mt-4 print:hidden"><button className="btn-gray btn-sm text-xs" onClick={() => setReg({ kind: 'asset', name: '', value: '' })}>+ Equipment / other asset</button><button className="btn-gray btn-sm text-xs" onClick={() => setReg({ kind: 'liability', name: '', value: '' })}>+ Loan / other liability</button></div>
          <p className="text-[11px] text-gray-400 mt-3">“Opening balance & adjustments” appears when the business had stock, equipment or debts before you started tracking, so everything balances. Add them above, and set opening cash in Settings.</p></>}

        {(rep === 'ar' || rep === 'ap') && (() => { const ag = aging(d.invoices, rep === 'ar' ? 'receivable' : 'payable', today()); return <>
          {Object.values(ag.buckets).map(b => <div key={b.label}><Row l={b.label} v={m$(d, b.total)} b />{b.rows.map((i: any) => <Row key={i.id} l={`${i.party} — ${i.description || ''}${i.late > 0 ? ` (${i.late}d late)` : ''}`} v={m$(d, outstanding(i))} indent />)}</div>)}
          <Row l="Total outstanding" v={m$(d, ag.total)} b /></> })()}

        {rep === 'inv' && (() => { const ir = inventoryReport(d, p.from, p.to); return <>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-gray-400"><tr className="text-left"><th className="py-1">Product</th><th className="text-right">Stock</th><th className="text-right">Bought</th><th className="text-right">Sold</th><th className="text-right">Value</th></tr></thead>
            <tbody>{ir.rows.map(r => <tr key={r.id} className="border-t border-gray-50"><td className="py-1.5">{r.name}{r.low && ' ⚠️'}</td><td className="text-right">{r.qty}</td><td className="text-right">{r.bought}</td><td className="text-right">{r.sold}</td><td className="text-right">{m$(d, r.value)}</td></tr>)}</tbody></table></div>
          <Row l="Total inventory value" v={m$(d, ir.total)} b /><Row l="COGS from stock sold in period" v={m$(d, pnl.stockCogs)} indent /></> })()}

        {rep === 'bva' && (() => { const b = budgetVsActual(d, month); return <>
          <div className="flex justify-between items-center mb-2 print:hidden"><span className="text-xs text-gray-400">Targets for {month}</span><button className="btn-gray btn-sm text-xs" onClick={() => setBud({ kind: 'expense', category: '', amount: '' })}>+ Budget line</button></div>
          {b.lines.length === 0 && <div className="text-sm text-gray-400 py-4">No budget for this month yet. Add a sales target and limits for costs like Advertising or Packaging.</div>}
          {b.lines.map(l => <div key={l.id} className="py-2 border-t border-gray-50 text-sm"><div className="flex justify-between"><b>{l.kind === 'revenue' ? '🎯 Sales target' : l.category}</b><span className="flex items-center gap-2"><span className="text-gray-500">{m$(d, l.actual)} / {m$(d, l.budget)}</span><button aria-label="Delete" className="text-gray-300 hover:text-red-500 print:hidden" onClick={() => run(db.from('biz_budgets').delete().eq('id', l.id).eq('user_id', userId), bp, '')}><Trash2 size={12} /></button></span></div>
            <div className="h-1.5 rounded-full bg-gray-100 mt-1"><div className={`h-1.5 rounded-full ${l.over ? 'bg-red-500' : l.kind === 'revenue' ? 'bg-blue-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, l.pct)}%` }} /></div>
            <div className={`text-[11px] mt-0.5 ${l.variance < 0 ? 'text-red-500' : 'text-green-600'}`}>{l.kind === 'revenue' ? (l.variance >= 0 ? `${m$(d, l.variance)} above target` : `${m$(d, -l.variance)} to go`) : (l.variance >= 0 ? `${m$(d, l.variance)} under budget` : `${m$(d, -l.variance)} over budget`)}</div></div>)}
          {b.unbudgeted.length > 0 && <><Sec t="Spent without a budget" />{b.unbudgeted.map(([k, v]) => <Row key={k} l={k} v={m$(d, v)} indent />)}</>}</> })()}
      </div>

      {reg && <Modal title={reg.kind === 'asset' ? 'Add asset' : 'Add liability'} subtitle={reg.kind === 'asset' ? 'Equipment, vehicle, deposit… at today’s value.' : 'Bank loan, installment, anything you owe.'} onClose={() => setReg(null)}><div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className="inp w-full" value={reg.name} onChange={e => setReg({ ...reg, name: e.target.value })} /></Field><Field label={`Value (${cur(d)})`}><input type="number" className="inp w-full" value={reg.value} onChange={e => setReg({ ...reg, value: e.target.value })} /></Field>
      </div><div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={saveReg}>Save</button><button className="btn-gray flex-1" onClick={() => setReg(null)}>Cancel</button></div></Modal>}
      {bud && <Modal title={`Budget for ${month}`} onClose={() => setBud(null)}><div className="grid grid-cols-2 gap-3">
        <Field label="Type"><select className="sel w-full" value={bud.kind} onChange={e => setBud({ ...bud, kind: e.target.value })}><option value="expense">Cost limit</option><option value="revenue">Sales target</option></select></Field>
        {bud.kind === 'expense' && <Field label="Category" hint="Same name as in your ledger, e.g. Advertising"><input className="inp w-full" value={bud.category} onChange={e => setBud({ ...bud, category: e.target.value })} /></Field>}
        <Field label={`Amount (${cur(d)})`}><input type="number" className="inp w-full" value={bud.amount} onChange={e => setBud({ ...bud, amount: e.target.value })} /></Field>
      </div><div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={saveBud}>Save</button><button className="btn-gray flex-1" onClick={() => setBud(null)}>Cancel</button></div></Modal>}
    </div>
  )
}
