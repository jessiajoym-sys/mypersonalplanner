// Matching recurring bills to real transactions: account + amount + keyword + payment period.
export type Period = { key: string; due: string }
const pad = (n: number) => String(n).padStart(2, '0')
export const FREQ_LABEL: Record<string, string> = { monthly: 'Every month', quarterly: 'Every 3 months', semiannual: 'Every 6 months', yearly: 'Every year' }
const STEP: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }

export function dueDateIn(year: number, month: number, day: number) {
  const last = new Date(year, month, 0).getDate()
  return `${year}-${pad(month)}-${pad(Math.min(Math.max(1, day), last))}`
}

/** Periods (due months) of a bill that fall in the last `back` months up to today. */
export function periodsFor(item: any, today: string, back = 3): Period[] {
  const step = STEP[item.frequency || 'monthly'] || 1, anchor = Number(item.due_month || 1)
  const [ty, tm] = today.split('-').map(Number), out: Period[] = []
  for (let i = back - 1; i >= 0; i--) {
    const d = new Date(ty, tm - 1 - i, 1), y = d.getFullYear(), m = d.getMonth() + 1
    if (step > 1 && (((m - anchor) % step) + step) % step !== 0) continue
    out.push({ key: `${y}-${pad(m)}`, due: dueDateIn(y, m, Number(item.due_day || 1)) })
  }
  return out
}

const SPEND = ['expense', 'credit_card_purchase', 'fee', 'interest', 'loan_repayment']
const text = (t: any) => `${t.original_description || ''} ${t.my_description || ''} ${t.merchant || ''} ${t.description || ''} ${t.notes || ''}`.toLowerCase()
export const keywordsOf = (item: any): string[] =>
  String(item.match_keyword || item.name || '').split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean)
const dayDiff = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000)

export type Candidate = { tx: any; score: number; why: string[] }
/** Score every unlinked transaction against a bill's period. Amount AND (keyword OR account) are required for an automatic match. */
export function candidatesFor(item: any, period: Period, txs: any[], linkedTx: Set<string>): Candidate[] {
  const kws = keywordsOf(item), want = Number(item.amount || 0), tol = Math.max(1, want * 0.02)
  const out: Candidate[] = []
  for (const t of txs) {
    if (linkedTx.has(t.id) || !SPEND.includes(t.type) || t.currency !== item.currency) continue
    const diff = dayDiff(t.transaction_date, period.due)
    if (diff < -10 || diff > 20) continue                       // payment period: 10 days before to 20 days after the due date
    const why: string[] = []
    const amountOk = Math.abs(Number(t.amount) - want) <= tol
    const kwOk = kws.some(k => text(t).includes(k))
    const accOk = !!item.payment_account_id && t.from_account_id === item.payment_account_id
    if (amountOk) why.push('amount'); if (kwOk) why.push('keyword'); if (accOk) why.push('account')
    if (!amountOk && !(kwOk && accOk)) continue                  // manual list still shows keyword+account hits with a different amount
    const score = (amountOk ? 3 : 0) + (kwOk ? 2 : 0) + (accOk ? 1 : 0) - Math.abs(diff) / 100
    out.push({ tx: t, score, why })
  }
  return out.sort((a, b) => b.score - a.score)
}
export const isAutoMatch = (c: Candidate) => c.why.includes('amount') && (c.why.includes('keyword') || c.why.includes('account'))

export type BillState = 'paid' | 'manual' | 'skipped' | 'overdue' | 'due_soon' | 'upcoming'
export function stateOf(link: any | undefined, due: string, today: string): BillState {
  if (link) return link.status === 'skipped' ? 'skipped' : link.status === 'manual' ? 'manual' : 'paid'
  if (today > due) return 'overdue'
  return dayDiff(due, today) <= 3 ? 'due_soon' : 'upcoming'
}
