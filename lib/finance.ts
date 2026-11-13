// Shared helpers that read the REAL `transactions` table
// (type / amount / currency / transaction_date / deleted_at), grouped per currency.
export const SPEND_TYPES = ['expense', 'credit_card_purchase', 'fee']
export const TX_COLS = 'id,type,amount,currency,category,merchant,description,business_id,project_id,transaction_date,from_account_id,to_account_id'

export const CUR_SYMBOL: Record<string, string> = { IDR: 'Rp ', CNY: '¥', USD: '$', EUR: '€', SGD: 'S$' }
export const fmt = (n: number, cur = 'IDR') => (CUR_SYMBOL[cur] ?? cur + ' ') + Math.round(n).toLocaleString('en-US')

export type Totals = Record<string, number>
export const isSpend = (t: any) => SPEND_TYPES.includes(t.type)
export const isIncome = (t: any) => t.type === 'income'

/** Sum income and spending per currency. */
export function totalsByCurrency(rows: any[]) {
  const income: Totals = {}, spent: Totals = {}
  for (const t of rows) {
    const c = t.currency || 'IDR', a = Number(t.amount || 0)
    if (isIncome(t)) income[c] = (income[c] || 0) + a
    else if (isSpend(t)) spent[c] = (spent[c] || 0) + a
  }
  return { income, spent }
}
/** "Rp 1,200 · ¥300" (or a dash when empty). */
export const fmtTotals = (t: Totals) => {
  const parts = Object.entries(t).filter(([, v]) => v).map(([c, v]) => fmt(v, c))
  return parts.length ? parts.join(' · ') : '—'
}
export const netTotals = (inc: Totals, out: Totals): Totals => {
  const r: Totals = {}
  for (const c of Array.from(new Set(Object.keys(inc).concat(Object.keys(out))))) r[c] = (inc[c] || 0) - (out[c] || 0)
  return r
}

// ---------- Budget plan helpers ----------
export const monthStart = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
export const daysInMonthOf = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

/** spending per category in one currency within [prefix] (YYYY-MM or YYYY-MM-DD) */
export function spentByCategory(txs: any[], currency: string, prefix: string) {
  const m: Record<string, number> = {}
  for (const t of txs) {
    if (t.currency !== currency || !isSpend(t) || !String(t.transaction_date || '').startsWith(prefix)) continue
    const k = String(t.category || 'Other').trim().toLowerCase()
    m[k] = (m[k] || 0) + Number(t.amount || 0)
  }
  return m
}

/** Everything the budget widgets need for one currency. */
export function budgetStatus(currency: string, month: Date, today: string, txs: any[], budgets: any[], plans: any[]) {
  const ym = monthStart(month).slice(0, 7)
  const rows = budgets.filter(b => b.currency === currency)
  const plan = plans.find(p => p.currency === currency)
  const total = Number(plan?.total_amount || 0)
  const allocated = rows.reduce((s, b) => s + Number(b.monthly_limit || 0), 0)
  const monthSpent = spentByCategory(txs, currency, ym)
  const todaySpent = spentByCategory(txs, currency, today)
  const spentAll = Object.values(monthSpent).reduce((a, b) => a + b, 0)
  const cats = rows.map(b => {
    const k = String(b.category || 'Other').trim().toLowerCase()
    const limit = Number(b.monthly_limit || 0), spent = monthSpent[k] || 0
    const daily = b.daily_limit ? Number(b.daily_limit) : 0, t = todaySpent[k] || 0
    return { id: b.id, category: b.category, limit, spent, pct: limit ? spent / limit * 100 : 0, daily, today: t, dailyOver: daily > 0 && t > daily }
  })
  return { currency, plan, total, allocated, unallocated: total - allocated, spentAll, cats, over: total > 0 && spentAll > total }
}
