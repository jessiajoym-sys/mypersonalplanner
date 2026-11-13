'use client'
import { useState } from 'react'
import { STATE_STYLE, evaluatePlan } from '@/lib/business'
import { ProgressBar } from '@/components/planner/Charts'
import { BP, Empty, db, m$, num, run, today } from './ui'

const nowKeys = () => { const n = new Date(), y = n.getFullYear(); return { year: String(y), quarter: `${y}-Q${Math.floor(n.getMonth() / 3) + 1}`, month: `${y}-${String(n.getMonth() + 1).padStart(2, '0')}` } }
const TYPES = [['year', 'Yearly'], ['quarter', 'Quarterly'], ['month', 'Monthly']] as const

export default function Plans(bp: BP) {
  const { d, userId } = bp
  const keys = nowKeys()
  const [type, setType] = useState<'year' | 'quarter' | 'month'>('month')
  const [key, setKey] = useState(keys.month)
  const plan = d.plans.find(p => p.period_type === type && p.period_key === key)
  const [form, setForm] = useState<any>(null)
  const pick = (t: 'year' | 'quarter' | 'month') => { setType(t); setKey(keys[t]); setForm(null) }
  const ev = plan ? evaluatePlan(d, plan, today()) : null
  const edit = form || (plan ? { rev: plan.revenue_target || '', prof: plan.profit_target || '', goals: plan.goals || '', actions: plan.actions || '', review: plan.review || {} } : { rev: '', prof: '', goals: '', actions: '', review: {} })
  const set = (k: string, v: any) => setForm({ ...edit, [k]: v })

  async function save() {
    const row = { user_id: userId, business_id: d.biz.id, period_type: type, period_key: key, revenue_target: num(edit.rev), profit_target: num(edit.prof), goals: edit.goals || null, actions: edit.actions || null, review: edit.review || {} }
    if (await run(db.from('biz_plans').upsert(row, { onConflict: 'user_id,business_id,period_type,period_key' }), bp, 'Plan saved.')) setForm(null)
  }
  const stepKey = (n: number) => {
    if (type === 'year') return String(+key + n)
    if (type === 'quarter') { let [y, q] = key.split('-Q').map(Number); q += n; while (q > 4) { q -= 4; y++ } while (q < 1) { q += 4; y-- } return `${y}-Q${q}` }
    const [y, m] = key.split('-').map(Number); const x = new Date(y, m - 1 + n, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
  }
  const st = (s: string) => STATE_STYLE[s]
  const rv = edit.review || {}

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{TYPES.map(([k, l]) => <button key={k} onClick={() => pick(k)} className={`px-3 py-1 rounded-md font-semibold ${type === k ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{l}</button>)}</div>
        <div className="flex items-center gap-1 text-sm"><button className="btn-gray btn-sm" onClick={() => { setKey(stepKey(-1)); setForm(null) }}>‹</button><b className="min-w-[90px] text-center">{key}</b><button className="btn-gray btn-sm" onClick={() => { setKey(stepKey(1)); setForm(null) }}>›</button></div>
      </div>

      {ev && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-5">
            {([['Revenue', ev.pnl.revenue, plan.revenue_target, ev.revState, ev.projectedRev], ['Net profit', ev.pnl.net, plan.profit_target, ev.profState, ev.projectedProfit]] as const).map(([l, actual, target, state, proj]) => (
              <div key={l}><div className="flex justify-between items-center mb-1"><b className="text-sm">{l}</b><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st(state).cls}`}>{st(state).label}</span></div>
                <div className="text-xl font-bold">{m$(d, actual)} <span className="text-sm font-normal text-gray-400">/ {+target ? m$(d, +target) : '—'}</span></div>
                {+target > 0 && <div className="mt-2"><ProgressBar pct={Math.min(100, actual / +target * 100)} color={state === 'at-risk' ? '#EF4444' : state === 'behind' ? '#F59E0B' : '#22C55E'} /></div>}
                {+target > 0 && ev.frac > 0 && ev.frac < 1 && <div className="text-[11px] text-gray-400 mt-1">At this pace you will finish around {m$(d, proj)} · {Math.round(ev.frac * 100)}% of the period has passed</div>}</div>))}
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-1">{ev.tips.map((t, i) => <div key={i}>💡 {t}</div>)}</div>
          <p className="text-[11px] text-gray-400">This check compares your real books with your targets using simple rules — it is not an AI forecast.</p>
        </div>)}

      <div className="card p-5 space-y-3">
        <div className="font-bold text-sm">{plan ? 'Plan' : `Set a plan for ${key}`}</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-gray-500">Revenue target<input type="number" className="inp w-full mt-1" value={edit.rev} onChange={e => set('rev', e.target.value)} /></label>
          <label className="text-xs font-semibold text-gray-500">Net profit target<input type="number" className="inp w-full mt-1" value={edit.prof} onChange={e => set('prof', e.target.value)} /></label>
        </div>
        <label className="block text-xs font-semibold text-gray-500">Goals<textarea rows={3} className="inp w-full mt-1" placeholder="What do you want to achieve?" value={edit.goals} onChange={e => set('goals', e.target.value)} /></label>
        <label className="block text-xs font-semibold text-gray-500">Actions<textarea rows={3} className="inp w-full mt-1" placeholder="What will you do to get there? (new product, ads, restock…)" value={edit.actions} onChange={e => set('actions', e.target.value)} /></label>
        <div className="border-t border-gray-100 pt-3"><div className="text-xs font-bold text-gray-500 mb-2">Review (fill in at the end of the period)</div>
          <div className="flex items-center gap-1 mb-2">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => set('review', { ...rv, rating: n })} className={`text-xl ${n <= (rv.rating || 0) ? '' : 'opacity-25'}`} aria-label={`${n} stars`}>⭐</button>)}</div>
          <div className="grid sm:grid-cols-3 gap-2">{([['went_well', 'What went well'], ['to_improve', 'What to improve'], ['learned', 'What I learned']] as const).map(([k, l]) => <label key={k} className="text-[11px] font-semibold text-gray-500">{l}<textarea rows={3} className="inp w-full mt-1 text-xs" value={rv[k] || ''} onChange={e => set('review', { ...rv, [k]: e.target.value })} /></label>)}</div></div>
        <div className="flex gap-2"><button className="btn-blue btn-sm" onClick={save}>Save plan</button>{form && <button className="btn-gray btn-sm" onClick={() => setForm(null)}>Discard changes</button>}</div>
      </div>

      {d.plans.length === 0 && <Empty icon="🗓️" title="No plans yet" text="Set a target for this month, then add a quarter and a year. You will see whether you are on track as sales come in." />}
      {d.plans.length > 0 && <div className="card"><div className="px-4 py-3 text-sm font-bold border-b border-gray-100">All plans</div>{[...d.plans].sort((a, b) => b.period_key.localeCompare(a.period_key)).map(p => { const e = evaluatePlan(d, p, today()); return (
        <button key={p.id} onClick={() => { setType(p.period_type); setKey(p.period_key); setForm(null) }} className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 text-xs text-left hover:bg-gray-50"><span className="w-20 font-semibold capitalize">{p.period_type} {p.period_key}</span><span className="flex-1 text-gray-500">Revenue {m$(d, e.pnl.revenue)} / {+p.revenue_target ? m$(d, +p.revenue_target) : '—'}</span><span className={`px-2 py-0.5 rounded-full font-semibold ${st(e.revState).cls}`}>{st(e.revState).label}</span></button>) })}</div>}
    </div>
  )
}
