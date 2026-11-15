// Business bookkeeping engine. All numbers are computed from your own rows:
//  - cash movements  = `transactions` tagged with business_id (+ bk_class)
//  - receivables / payables = `biz_invoices`
//  - inventory       = `biz_inventory` + `biz_stock_moves`
// P&L is accrual-style (invoices count when issued); the Cash Flow Statement is cash-only.
import { SPEND_TYPES } from '@/lib/finance'

export const BK_CLASSES: Record<string, { label: string; group: string }> = {
  revenue: { label: 'Sales revenue', group: 'Income' },
  cogs: { label: 'Cost of goods sold (COGS)', group: 'Cost' },
  opex: { label: 'Operating expense', group: 'Cost' },
  inventory_purchase: { label: 'Inventory purchase (stock)', group: 'Balance sheet' },
  asset_purchase: { label: 'Equipment / asset purchase', group: 'Balance sheet' },
  owner_contribution: { label: 'Owner puts money in', group: 'Owner' },
  owner_draw: { label: 'Owner takes money out', group: 'Owner' },
  loan_in: { label: 'Loan received', group: 'Financing' },
  loan_payment: { label: 'Loan repayment', group: 'Financing' },
  ar_collection: { label: 'Customer paid an invoice', group: 'Balance sheet' },
  ap_payment: { label: 'Paid a supplier bill', group: 'Balance sheet' },
  other: { label: 'Other income', group: 'Income' },
}
export const OPEX_CATEGORIES = ['Platform fees', 'Advertising', 'Shipping', 'Packaging', 'Salary / labor', 'Rent', 'Utilities', 'Software', 'Marketing & content', 'Tax & licences', 'Other']

export const isSpendTx = (t: any) => SPEND_TYPES.includes(t.type)
export const cashEffect = (t: any) => (t.type === 'income' || t.type === 'refund' ? Number(t.amount) : isSpendTx(t) ? -Number(t.amount) : 0)

/** Explicit class if set, otherwise a sensible guess from type + category. */
export function classOf(t: any): string {
  if (t.bk_class) return t.bk_class
  if (t.type === 'income') return 'revenue'
  const c = String(t.category || '').toLowerCase()
  if (/cogs|cost of goods|bahan|supplier|goods/.test(c)) return 'cogs'
  if (/inventory|stock/.test(c)) return 'inventory_purchase'
  return 'opex'
}

export const inRange = (d: string | null | undefined, from: string, to: string) => !!d && d >= from && d <= to
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
export const money = (n: number, cur = 'IDR') => {
  const sym = cur === 'IDR' ? 'Rp ' : cur === 'CNY' ? '¥' : cur === 'USD' ? '$' : cur + ' '
  const v = Math.round(n)
  return (v < 0 ? '−' : '') + sym + Math.abs(v).toLocaleString('en-US')
}
export const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0)

// ---------- periods ----------
const pad = (n: number) => String(n).padStart(2, '0')
export const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export function periodRange(type: 'month' | 'quarter' | 'year' | 'custom', ref: Date, custom?: { from: string; to: string }) {
  const y = ref.getFullYear(), m = ref.getMonth()
  if (type === 'custom' && custom) return { from: custom.from, to: custom.to, label: `${custom.from} → ${custom.to}` }
  if (type === 'year') return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) }
  if (type === 'quarter') { const q = Math.floor(m / 3); return { from: ymdOf(new Date(y, q * 3, 1)), to: ymdOf(new Date(y, q * 3 + 3, 0)), label: `${y} Q${q + 1}` } }
  return { from: ymdOf(new Date(y, m, 1)), to: ymdOf(new Date(y, m + 1, 0)), label: ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
}
export function planRange(type: string, key: string) {
  if (type === 'year') return { from: `${key}-01-01`, to: `${key}-12-31` }
  if (type === 'quarter') { const [y, q] = key.split('-Q').map(Number); return { from: ymdOf(new Date(y, (q - 1) * 3, 1)), to: ymdOf(new Date(y, q * 3, 0)) } }
  const [y, m] = key.split('-').map(Number); return { from: ymdOf(new Date(y, m - 1, 1)), to: ymdOf(new Date(y, m, 0)) }
}

export type BizData = { biz: any; tx: any[]; invoices: any[]; items: any[]; moves: any[]; extra: any[]; platforms: any[]; ads: any[]; budgets: any[]; plans: any[]; content: any[] }

/** Transactions that belong to this business AND its currency. */
export const bizTx = (d: BizData) => d.tx.filter(t => !t.currency || t.currency === (d.biz.currency || 'IDR'))

// ---------- Profit & Loss ----------
export function computePnL(d: BizData, from: string, to: string) {
  const tx = bizTx(d).filter(t => inRange(t.transaction_date, from, to))
  const revTx = tx.filter(t => t.type === 'income' && classOf(t) === 'revenue')
  const otherInc = tx.filter(t => t.type === 'income' && classOf(t) === 'other')
  const ar = d.invoices.filter(i => i.kind === 'receivable' && inRange(i.issue_date, from, to))
  const ap = d.invoices.filter(i => i.kind === 'payable' && inRange(i.issue_date, from, to))
  const revenue = sum(revTx.map(t => +t.amount)) + sum(ar.map(i => +i.amount))
  const otherIncome = sum(otherInc.map(t => +t.amount))
  const stockCogs = sum(d.moves.filter(m => m.kind === 'sale' && inRange(m.move_date, from, to)).map(m => Math.abs(+m.qty) * +m.unit_cost))
  const cogs = sum(tx.filter(t => isSpendTx(t) && classOf(t) === 'cogs').map(t => +t.amount)) + sum(ap.filter(i => i.bk_class === 'cogs').map(i => +i.amount)) + stockCogs
  const opexMap: Record<string, number> = {}
  tx.filter(t => isSpendTx(t) && classOf(t) === 'opex').forEach(t => { const k = t.category || 'Other'; opexMap[k] = (opexMap[k] || 0) + +t.amount })
  ap.filter(i => i.bk_class !== 'cogs').forEach(i => { const k = i.description || 'Supplier bills'; opexMap[k] = (opexMap[k] || 0) + +i.amount })
  const opexLines = Object.entries(opexMap).sort((a, b) => b[1] - a[1])
  const opex = sum(opexLines.map(l => l[1]))
  const gross = revenue - cogs
  const net = gross - opex + otherIncome
  return { revenue, cogs, gross, opexLines, opex, otherIncome, net, grossMargin: pct(gross, revenue), netMargin: pct(net, revenue), stockCogs, count: tx.length }
}

// ---------- Cash flow statement ----------
export function computeCashFlow(d: BizData, from: string, to: string) {
  const all = bizTx(d)
  const before = all.filter(t => t.transaction_date < from)
  const opening = Number(d.biz.opening_cash || 0) + sum(before.map(cashEffect))
  const tx = all.filter(t => inRange(t.transaction_date, from, to))
  const by = (cls: string, sign = 1) => sum(tx.filter(t => classOf(t) === cls && cashEffect(t) !== 0).map(t => Math.abs(+t.amount))) * sign
  const operating = [
    { label: 'Cash from sales', value: by('revenue') }, { label: 'Other income', value: by('other') }, { label: 'Customer invoices collected', value: by('ar_collection') },
    { label: 'Paid for goods sold (COGS)', value: by('cogs', -1) }, { label: 'Paid for stock / inventory', value: by('inventory_purchase', -1) },
    { label: 'Operating expenses', value: by('opex', -1) }, { label: 'Supplier bills paid', value: by('ap_payment', -1) },
  ]
  const investing = [{ label: 'Equipment / assets bought', value: by('asset_purchase', -1) }]
  const financing = [{ label: 'Owner put money in', value: by('owner_contribution') }, { label: 'Loans received', value: by('loan_in') }, { label: 'Loan repayments', value: by('loan_payment', -1) }, { label: 'Owner withdrawals', value: by('owner_draw', -1) }]
  const tot = (l: { value: number }[]) => sum(l.map(x => x.value))
  const net = tot(operating) + tot(investing) + tot(financing)
  return { opening, operating, investing, financing, opTotal: tot(operating), invTotal: tot(investing), finTotal: tot(financing), net, closing: opening + net }
}

// ---------- Balance sheet ----------
export const outstanding = (i: any) => Math.max(0, Number(i.amount) - Number(i.paid_amount || 0))
export const inventoryValue = (items: any[]) => sum(items.filter(i => i.is_active !== false).map(i => Number(i.qty) * Number(i.unit_cost)))
export function computeBalance(d: BizData, asOf: string) {
  const all = bizTx(d).filter(t => t.transaction_date <= asOf)
  const cash = Number(d.biz.opening_cash || 0) + sum(all.map(cashEffect))
  const ar = sum(d.invoices.filter(i => i.kind === 'receivable' && i.issue_date <= asOf).map(outstanding))
  const inventory = inventoryValue(d.items)
  const fixedAssets = d.extra.filter(e => e.kind === 'asset')
  const otherLiab = d.extra.filter(e => e.kind === 'liability')
  const ap = sum(d.invoices.filter(i => i.kind === 'payable' && i.issue_date <= asOf).map(outstanding))
  const assets = cash + ar + inventory + sum(fixedAssets.map(e => +e.value))
  const liabilities = ap + sum(otherLiab.map(e => +e.value))
  const contrib = sum(all.filter(t => classOf(t) === 'owner_contribution' && t.type === 'income').map(t => +t.amount))
  const draws = sum(all.filter(t => classOf(t) === 'owner_draw' && isSpendTx(t)).map(t => +t.amount))
  const retained = computePnL(d, '0000-01-01', asOf).net
  const equity = assets - liabilities
  const opening = Number(d.biz.opening_cash || 0)
  const adjustments = equity - (opening + contrib - draws + retained)
  return { opening, cash, ar, inventory, fixedAssets, otherLiab, ap, assets, liabilities, contrib, draws, retained, equity, adjustments }
}

// ---------- AR / AP aging ----------
export function aging(invoices: any[], kind: 'receivable' | 'payable', today: string) {
  const open = invoices.filter(i => i.kind === kind && outstanding(i) > 0.005)
  const buckets: Record<string, { label: string; total: number; rows: any[] }> = {
    current: { label: 'Not due yet', total: 0, rows: [] }, d30: { label: '1–30 days late', total: 0, rows: [] },
    d60: { label: '31–60 days late', total: 0, rows: [] }, d90: { label: '61–90 days late', total: 0, rows: [] }, d90p: { label: '90+ days late', total: 0, rows: [] },
  }
  for (const i of open) {
    const due = i.due_date || i.issue_date
    const late = Math.floor((new Date(today).getTime() - new Date(due).getTime()) / 86400000)
    const k = late <= 0 ? 'current' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'd90p'
    buckets[k].total += outstanding(i); buckets[k].rows.push({ ...i, late })
  }
  return { buckets, total: sum(Object.values(buckets).map(b => b.total)), count: open.length }
}

// ---------- Inventory report ----------
export function inventoryReport(d: BizData, from: string, to: string) {
  const rows = d.items.filter(i => i.is_active !== false).map(i => {
    const mv = d.moves.filter(m => m.item_id === i.id && inRange(m.move_date, from, to))
    const bought = sum(mv.filter(m => m.kind === 'purchase').map(m => +m.qty)), sold = sum(mv.filter(m => m.kind === 'sale').map(m => Math.abs(+m.qty)))
    const value = Number(i.qty) * Number(i.unit_cost)
    const low = Number(i.reorder_level) > 0 && Number(i.qty) <= Number(i.reorder_level)
    const margin = Number(i.sell_price) > 0 ? pct(Number(i.sell_price) - Number(i.unit_cost), Number(i.sell_price)) : null
    return { ...i, bought, sold, value, low, margin }
  })
  return { rows, total: sum(rows.map(r => r.value)), lowCount: rows.filter(r => r.low).length }
}

// ---------- Budget vs actual ----------
export function budgetVsActual(d: BizData, month: string /* YYYY-MM */) {
  const from = `${month}-01`, to = ymdOf(new Date(+month.slice(0, 4), +month.slice(5, 7), 0))
  const p = computePnL(d, from, to)
  const lines = d.budgets.filter(b => String(b.budget_month).startsWith(month)).map(b => {
    const actual = b.kind === 'revenue' ? p.revenue : String(b.category).toLowerCase() === 'cogs' ? p.cogs : (p.opexLines.find(l => l[0].toLowerCase() === String(b.category).toLowerCase())?.[1] || 0)
    const budget = Number(b.amount)
    const variance = b.kind === 'revenue' ? actual - budget : budget - actual
    return { ...b, actual, budget, variance, over: b.kind !== 'revenue' && actual > budget, pct: pct(actual, budget) }
  })
  const budgeted = new Set(lines.map(l => String(l.category).toLowerCase()))
  const unbudgeted = p.opexLines.filter(l => !budgeted.has(l[0].toLowerCase()))
  return { lines, unbudgeted, pnl: p }
}

// ---------- Platforms & ads ----------
export function platformStats(d: BizData, from: string, to: string) {
  const tx = bizTx(d).filter(t => inRange(t.transaction_date, from, to) && t.platform)
  const names = Array.from(new Set([...d.platforms.map(p => p.name), ...tx.map(t => t.platform)]))
  const pnl = computePnL(d, from, to)
  const gm = pnl.revenue ? pnl.gross / pnl.revenue : 0.3
  return names.map(name => {
    const mine = tx.filter(t => t.platform === name)
    const revenue = sum(mine.filter(t => t.type === 'income' && classOf(t) === 'revenue').map(t => +t.amount))
    const fees = sum(mine.filter(t => isSpendTx(t) && /fee|commission/i.test(t.category || '')).map(t => +t.amount))
    const adTx = sum(mine.filter(t => isSpendTx(t) && /advert|ads/i.test(t.category || '')).map(t => +t.amount))
    const adRows = d.ads.filter(a => a.platform === name && a.period_end >= from && a.period_start <= to)
    const adSpend = Math.max(adTx, sum(adRows.map(a => +a.spend)))
    const adSales = sum(adRows.map(a => +a.ad_sales)), clicks = sum(adRows.map(a => +a.clicks || 0)), impressions = sum(adRows.map(a => +a.impressions || 0)), orders = sum(adRows.map(a => +a.orders || 0))
    const feePct = pct(fees, revenue)
    const breakEven = 1 / Math.max(0.05, gm - feePct / 100)
    const roas = adSpend ? adSales / adSpend : 0
    const afterCosts = revenue - fees - adSpend
    let verdict = ''
    if (adSpend > 0 && adSales > 0) verdict = roas >= breakEven * 1.5 ? 'Ads are working well — consider scaling the budget.' : roas >= breakEven ? 'Ads roughly pay for themselves. Keep testing creatives.' : `ROAS ${roas.toFixed(1)}× is below break-even (~${breakEven.toFixed(1)}×): pause weak campaigns or fix price/creative.`
    else if (adSpend > 0) verdict = 'Add ad sales / orders to see if this spend pays off.'
    return { name, revenue, fees, feePct, adSpend, adSales, clicks, impressions, orders, roas, breakEven, afterCosts, afterPct: pct(afterCosts, revenue), ctr: pct(clicks, impressions), cpc: clicks ? adSpend / clicks : 0, cpa: orders ? adSpend / orders : 0, verdict }
  }).sort((a, b) => b.revenue - a.revenue)
}

// ---------- Plans (yearly / quarterly / monthly) ----------
export function evaluatePlan(d: BizData, plan: any, todayStr: string) {
  const { from, to } = planRange(plan.period_type, plan.period_key)
  const p = computePnL(d, from, to)
  const total = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 + 1
  const elapsed = Math.min(total, Math.max(0, (new Date(todayStr).getTime() - new Date(from).getTime()) / 86400000 + 1))
  const frac = total ? elapsed / total : 0
  const rt = Number(plan.revenue_target || 0), pt = Number(plan.profit_target || 0)
  const revPace = rt && frac ? p.revenue / (rt * frac) : 0, profPace = pt && frac ? p.net / (pt * frac) : 0
  const projectedRev = frac ? p.revenue / frac : 0, projectedProfit = frac ? p.net / frac : 0
  const state = (x: number, has: boolean) => (!has ? 'no-target' : frac === 0 ? 'not-started' : x >= 1.05 ? 'ahead' : x >= 0.9 ? 'on-track' : x >= 0.6 ? 'behind' : 'at-risk')
  const rs = state(revPace, rt > 0), ps = state(profPace, pt > 0)
  const tips: string[] = []
  if (rt && frac > 0 && revPace < 0.9) tips.push(`Revenue is ${Math.round(revPace * 100)}% of where it should be by now. To hit the target you need about ${Math.round((rt - p.revenue) / Math.max(1, total - elapsed))}/day for the rest of the period.`)
  if (p.revenue > 0 && p.grossMargin < 20) tips.push(`Gross margin is only ${p.grossMargin.toFixed(0)}% — check product cost or prices.`)
  if (p.revenue > 0 && pct(p.opex, p.revenue) > 40) tips.push(`Operating costs eat ${pct(p.opex, p.revenue).toFixed(0)}% of revenue. Look at ${p.opexLines[0]?.[0] || 'your biggest expense'} first.`)
  if (pt && frac > 0 && profPace < 0.9 && revPace >= 0.9) tips.push('Sales are fine but profit lags — costs or platform fees are the problem, not demand.')
  if (!tips.length && (rs === 'on-track' || rs === 'ahead')) tips.push('On track. Keep doing what works and review again next week.')
  return { from, to, pnl: p, frac, revPace, profPace, projectedRev, projectedProfit, revState: rs, profState: ps, tips }
}
export const STATE_STYLE: Record<string, { label: string; cls: string }> = {
  ahead: { label: 'Ahead 🚀', cls: 'bg-green-100 text-green-700' }, 'on-track': { label: 'On track ✅', cls: 'bg-emerald-100 text-emerald-700' },
  behind: { label: 'Behind ⚠️', cls: 'bg-amber-100 text-amber-700' }, 'at-risk': { label: 'At risk 🔴', cls: 'bg-red-100 text-red-600' },
  'not-started': { label: 'Not started', cls: 'bg-gray-100 text-gray-500' }, 'no-target': { label: 'No target set', cls: 'bg-gray-100 text-gray-500' },
}

// ---------- Loading ----------
export async function loadBiz(supabase: any, userId: string, bizId: string): Promise<BizData & { missing: boolean }> {
  const q = (table: string, extra?: (x: any) => any) => { let x = supabase.from(table).select('*').eq('user_id', userId).eq('business_id', bizId); if (extra) x = extra(x); return x }
  const [b, tx, inv, it, mv, ex, pl, ad, bu, pn, ct] = await Promise.all([
    supabase.from('businesses').select('*').eq('id', bizId).eq('user_id', userId).maybeSingle(),
    q('transactions', x => x.is('deleted_at', null).order('transaction_date', { ascending: false })),
    q('biz_invoices', x => x.order('issue_date', { ascending: false })), q('biz_inventory', x => x.order('name')), q('biz_stock_moves', x => x.order('move_date', { ascending: false })),
    q('biz_items'), q('biz_platforms', x => x.order('name')), q('biz_ads', x => x.order('period_end', { ascending: false })), q('biz_budgets'), q('biz_plans'),
    q('content_ideas', x => x.order('idea_date', { ascending: false })),
  ])
  const ok = (r: any) => (r.error ? [] : r.data || [])
  const missing = [inv, it, mv, ex, pl, ad, bu, pn].some((r: any) => r.error)
  return { biz: b.data ? { currency: 'IDR', opening_cash: 0, ...b.data } : null, tx: ok(tx), invoices: ok(inv), items: ok(it), moves: ok(mv), extra: ok(ex), platforms: ok(pl), ads: ok(ad), budgets: ok(bu), plans: ok(pn), content: ok(ct), missing }
}
