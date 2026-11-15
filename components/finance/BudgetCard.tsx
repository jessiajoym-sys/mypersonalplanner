'use client'
import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { emitChange } from '@/lib/planner'
import { budgetStatus, daysInMonthOf, fmt, monthStart } from '@/lib/finance'
import type { FinanceLists } from '@/lib/financeLists'

const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const bar = (pct: number) => (pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-500')

/** Compact budget view for dashboards: one block per currency that has a budget. */
export function BudgetSummary({ txs, budgets, plans, month = new Date() }: { txs: any[]; budgets: any[]; plans: any[]; month?: Date }) {
  const today = todayLocal()
  const currencies = Array.from(new Set([...budgets.map(b => b.currency), ...plans.map(p => p.currency)]))
  if (!currencies.length) return null
  return (
    <div className="space-y-4">
      {currencies.map(c => {
        const s = budgetStatus(c, month, today, txs, budgets, plans)
        const base = s.total || s.allocated
        const pct = base ? s.spentAll / base * 100 : 0
        const left = base - s.spentAll
        const daysLeft = Math.max(1, daysInMonthOf(month) - new Date().getDate() + 1)
        return (
          <div key={c}>
            <div className="flex justify-between text-xs mb-1"><b>{c} budget</b><span className={s.over ? 'text-red-500 font-bold' : 'text-gray-500'}>{fmt(s.spentAll, c)} / {fmt(base, c)}</span></div>
            <div className="h-2 rounded-full bg-gray-100"><div className={`h-2 rounded-full ${bar(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <div className="text-[11px] text-gray-400 mt-1">{left >= 0 ? `${fmt(left, c)} left · about ${fmt(left / daysLeft, c)}/day for ${daysLeft} more days` : `Over by ${fmt(-left, c)}`}</div>
            <div className="mt-2 space-y-1.5">
              {s.cats.filter(x => x.daily > 0 || x.pct > 80).slice(0, 5).map(x => (
                <div key={x.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{x.category}</span>
                  <span className="text-gray-500 whitespace-nowrap">
                    {x.daily > 0 && <span className={x.dailyOver ? 'text-red-500 font-semibold' : ''}>today {fmt(x.today, c)}/{fmt(x.daily, c)}</span>}
                    {x.daily > 0 && ' · '}<span className={x.pct > 100 ? 'text-red-500 font-semibold' : ''}>{Math.round(x.pct)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type Props = { userId: string; month: Date; txs: any[]; budgets: any[]; plans: any[]; categories: string[]; lists: FinanceLists; onManageCategories: () => void; onChanged: () => Promise<any> | void; onToast: (m: string) => void }

/** Full planner: total per currency → split into categories → optional daily caps. */
export default function BudgetPlanner({ userId, month, txs, budgets, plans, categories, lists, onManageCategories, onChanged, onToast }: Props) {
  const [cur, setCur] = useState('')
  const [form, setForm] = useState({ category: '', limit: '', daily: '' })
  const [newCur, setNewCur] = useState('')
  const today = todayLocal(), mStart = monthStart(month)
  const currencies = useMemo(() => Array.from(new Set([...budgets.map(b => b.currency), ...plans.map(p => p.currency), ...(newCur ? [newCur] : [])])), [budgets, plans, newCur])
  const active = cur && currencies.includes(cur) ? cur : currencies[0] || ''
  const days = daysInMonthOf(month)
  const s = active ? budgetStatus(active, month, today, txs, budgets, plans) : null

  const fail = (e: any) => onToast('Could not save budget: ' + (e?.message || 'check connection') + (/daily_limit|budget_plans/.test(e?.message || '') ? ' — run lib/planner-upgrade-5.sql in Supabase first.' : ''))
  const done = async (msg: string) => { await onChanged(); emitChange(); onToast(msg) }

  async function saveTotal(v: string) {
    const n = Number(v); if (!active || !Number.isFinite(n) || n < 0 || n === (s?.total || 0)) return
    const { error } = await supabase.from('budget_plans').upsert({ user_id: userId, budget_month: mStart, currency: active, total_amount: n }, { onConflict: 'user_id,budget_month,currency' })
    error ? fail(error) : done('Total budget saved.')
  }
  async function addCat() {
    const limit = Number(form.limit)
    if (!form.category.trim() || !Number.isFinite(limit) || limit <= 0) return onToast('Enter a category and a limit above zero.')
    if (budgets.some(b => b.currency === active && b.category.trim().toLowerCase() === form.category.trim().toLowerCase())) return onToast('That category already has a budget.')
    if (form.daily && !(Number(form.daily) > 0)) return onToast('Daily cap must be above zero (or leave it empty).')
    const { data: saved, error } = await supabase.from('budgets').insert({ user_id: userId, category: form.category.trim(), monthly_limit: limit, daily_limit: form.daily ? Number(form.daily) : null, currency: active, budget_month: mStart }).select('id')
    if (error) return fail(error)
    if (!saved?.length) return onToast('Could not save budget: the database did not confirm the new row.')
    setForm({ category: '', limit: '', daily: '' }); done('Category budget added.')
  }
  async function updateCat(id: string, values: any) {
    const { error } = await supabase.from('budgets').update(values).eq('id', id).eq('user_id', userId)
    error ? fail(error) : done('Saved.')
  }
  async function removeCat(id: string) {
    if (!confirm('Remove this category budget?')) return
    const { error } = await supabase.from('budgets').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
    error ? fail(error) : done('Removed.')
  }
  async function copyLastMonth() {
    const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1)
    const { data, error } = await supabase.from('budgets').select('*').eq('user_id', userId).eq('budget_month', monthStart(prev)).is('deleted_at', null)
    if (error) return fail(error)
    const fresh = (data || []).filter((b: any) => !budgets.some(x => x.currency === b.currency && x.category.toLowerCase() === b.category.toLowerCase()))
    const { data: pp } = await supabase.from('budget_plans').select('*').eq('user_id', userId).eq('budget_month', monthStart(prev))
    const freshPlans = (pp || []).filter((p: any) => !plans.some(x => x.currency === p.currency))
    if (!fresh.length && !freshPlans.length) return onToast('Nothing to copy from last month.')
    if (fresh.length) { const r = await supabase.from('budgets').insert(fresh.map((b: any) => ({ user_id: userId, category: b.category, monthly_limit: b.monthly_limit, daily_limit: b.daily_limit ?? null, currency: b.currency, budget_month: mStart }))); if (r.error) return fail(r.error) }
    if (freshPlans.length) await supabase.from('budget_plans').insert(freshPlans.map((p: any) => ({ user_id: userId, budget_month: mStart, currency: p.currency, total_amount: p.total_amount })))
    done('Copied last month’s budget.')
  }

  if (!currencies.length) return (
    <div className="card p-6 text-center space-y-3">
      <div className="text-3xl">🎯</div><div className="font-bold">Plan your monthly budget</div>
      <p className="text-sm text-gray-500 max-w-md mx-auto">Pick a currency, set a total (e.g. ¥3,000), then split it into categories like Food with a daily cap (e.g. ¥50/day).</p>
      <div className="flex justify-center gap-2">{['CNY', 'IDR', 'USD'].map(c => <button key={c} className="btn-blue btn-sm" onClick={() => setNewCur(c)}>Start with {c}</button>)}</div>
      <button className="text-xs text-teal-600 font-semibold" onClick={copyLastMonth}>or copy last month’s budget</button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{currencies.map(c => <button key={c} onClick={() => setCur(c)} className={`px-3 py-1 rounded-md font-semibold ${active === c ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{c}</button>)}</div>
        <select className="sel text-xs" value="" onChange={e => e.target.value && (setNewCur(e.target.value), setCur(e.target.value))}><option value="">+ currency</option>{['CNY', 'IDR', 'USD', 'EUR', 'SGD'].filter(c => !currencies.includes(c)).map(c => <option key={c}>{c}</option>)}</select>
        <button className="btn-gray btn-sm text-xs ml-auto" onClick={onManageCategories}>Manage categories</button>
        <button className="btn-gray btn-sm text-xs" onClick={copyLastMonth}>Copy last month</button>
      </div>

      {s && <>
        <div className="card p-5">
          <div className="grid sm:grid-cols-3 gap-4 items-end">
            <label className="text-xs font-semibold text-gray-600">Total budget this month ({active})
              <input key={active + s.total} type="number" className="inp w-full mt-1 text-lg font-bold" defaultValue={s.total || ''} placeholder="e.g. 3000" onBlur={e => saveTotal(e.target.value)} />
            </label>
            <div><div className="text-xs text-gray-500">Split into categories</div><div className="text-lg font-bold">{fmt(s.allocated, active)}</div></div>
            <div><div className="text-xs text-gray-500">{s.unallocated >= 0 ? 'Not yet assigned' : 'Over-assigned by'}</div><div className={`text-lg font-bold ${s.unallocated < 0 ? 'text-red-500' : 'text-teal-600'}`}>{fmt(Math.abs(s.unallocated), active)}</div></div>
          </div>
          {s.total > 0 && <>
            <div className="h-3 rounded-full bg-gray-100 mt-4 overflow-hidden"><div className={`h-3 ${bar(s.spentAll / s.total * 100)}`} style={{ width: `${Math.min(100, s.spentAll / s.total * 100)}%` }} /></div>
            <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Spent {fmt(s.spentAll, active)}</span><span>{fmt(Math.max(0, s.total - s.spentAll), active)} left · ≈ {fmt(s.total / days, active)}/day overall</span></div>
          </>}
        </div>

        <div className="card divide-y divide-gray-50">
          <div className="hidden sm:grid grid-cols-[1.4fr_1fr_1fr_1.6fr_auto] gap-3 px-4 py-2 text-[11px] font-semibold text-gray-400"><span>Category</span><span>Monthly limit</span><span>Daily cap</span><span>Progress</span><span /></div>
          {s.cats.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No categories yet — add one below.</div>}
          {s.cats.map(c => (
            <div key={c.id} className="grid sm:grid-cols-[1.4fr_1fr_1fr_1.6fr_auto] gap-3 px-4 py-3 items-center text-sm">
              <b className="truncate">{c.category}{lists.rows.some(r => r.kind === 'category' && r.is_archived && r.name.toLowerCase() === String(c.category).toLowerCase()) && !lists.rows.some(r => r.kind === 'category' && !r.is_archived && r.name.toLowerCase() === String(c.category).toLowerCase()) && <span className="text-[10px] font-normal text-gray-400"> · archived category</span>}</b>
              <input key={c.id + c.limit} type="number" className="inp text-xs" defaultValue={c.limit} onBlur={e => { const n = Number(e.target.value); n > 0 && n !== c.limit && updateCat(c.id, { monthly_limit: n }) }} />
              <div><input key={c.id + 'd' + c.daily} type="number" className="inp text-xs w-full" placeholder={`≈ ${Math.round(c.limit / days)}`} defaultValue={c.daily || ''} onBlur={e => { const n = e.target.value === '' ? null : Number(e.target.value); if ((n || 0) !== c.daily && (n === null || n > 0)) updateCat(c.id, { daily_limit: n }) }} />
                {c.daily > 0 && <div className={`text-[10px] mt-0.5 ${c.dailyOver ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>today {fmt(c.today, active)}</div>}</div>
              <div><div className="h-2 rounded-full bg-gray-100"><div className={`h-2 rounded-full ${bar(c.pct)}`} style={{ width: `${Math.min(100, c.pct)}%` }} /></div>
                <div className={`text-[11px] mt-1 ${c.pct > 100 ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>{fmt(c.spent, active)} · {Math.round(c.pct)}%</div></div>
              <button onClick={() => removeCat(c.id)} className="text-gray-300 hover:text-red-500" aria-label="Remove"><Trash2 size={15} /></button>
            </div>
          ))}
          <div className="p-4 bg-gray-50 grid sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2">
            <select className="sel text-xs" value={form.category} onChange={async e => {
              if (e.target.value !== '__new') return setForm({ ...form, category: e.target.value })
              const n = prompt('New category name (it will also appear in Transactions):')?.trim(); if (!n) return
              const err = await lists.add('category', n, 'both'); err ? onToast('Could not add category: ' + err) : setForm({ ...form, category: n })
            }}><option value="">Category…</option>{categories.map(c => <option key={c}>{c}</option>)}<option value="__new">+ New category…</option></select>
            <input type="number" className="inp text-xs" placeholder="Monthly limit" value={form.limit} onChange={e => setForm({ ...form, limit: e.target.value })} />
            <input type="number" className="inp text-xs" placeholder="Daily cap (optional)" value={form.daily} onChange={e => setForm({ ...form, daily: e.target.value })} />
            <button className="btn-blue btn-sm text-xs" onClick={addCat}>Add</button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400">Spending is counted automatically from your transactions (expenses, card purchases, fees and interest, minus refunds) by category. Categories are shared with Transactions — add or archive them in Manage categories. Archiving a category never changes past budgets.</p>
      </>}
    </div>
  )
}
