// Loan maths. Standard monthly annuity: interest each month = opening principal × annual rate ÷ 12.
// Banks may use day-count rules, so the bank's own figure always wins: once you record an actual payment,
// the schedule uses YOUR recorded principal/interest for that installment and recalculates the rest.
export type RateChange = { effective_date: string; annual_rate: number; verified?: boolean }
export type LoanPayment = { kind: string; installment_no?: number | null; paid_date: string; principal: number; interest: number; fees: number; effect?: string | null }
export type LoanInput = {
  original_amount: number; total_months: number; annual_interest_rate: number; initial_rate?: number | null
  first_installment_date?: string | null; loan_start_date?: string | null; due_day?: number | null
  interest_type?: string | null; fixed_period_months?: number | null; next_rate_review_date?: string | null
  monthly_admin_fee?: number | null
}
export type Row = {
  no: number; due: string; opening: number; principal: number; interest: number; fees: number; total: number; closing: number
  rate: number; status: 'paid' | 'due' | 'upcoming' | 'estimate'; actual: boolean; note?: string
}

export const annuity = (principal: number, annualRate: number, months: number) => {
  if (months <= 0 || principal <= 0) return 0
  const r = annualRate / 12 / 100
  return r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months))
}
const r2 = (n: number) => Math.round(n * 100) / 100
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function addMonthsKeepDay(base: string, n: number, day?: number | null) {
  const [y, m, d] = base.split('-').map(Number)
  const t = new Date(y, m - 1 + n, 1), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  return iso(new Date(t.getFullYear(), t.getMonth(), Math.min(day || d, last)))
}

export function rateAt(loan: LoanInput, changes: RateChange[], date: string) {
  let rate = Number(loan.initial_rate ?? loan.annual_interest_rate ?? 0)
  for (const c of [...changes].sort((a, b) => a.effective_date.localeCompare(b.effective_date))) if (c.effective_date <= date) rate = Number(c.annual_rate)
  return rate
}

/** Build the full schedule. `today` decides paid / due / upcoming. */
export function buildSchedule(loan: LoanInput, changes: RateChange[], payments: LoanPayment[], today: string): Row[] {
  const n = Number(loan.total_months || 0), first = loan.first_installment_date || loan.loan_start_date
  if (!n || !first || !(loan.original_amount > 0)) return []
  const inst = new Map<number, LoanPayment>()
  payments.filter(p => p.kind === 'installment' && p.installment_no).forEach(p => inst.set(Number(p.installment_no), p))
  const prepays = payments.filter(p => p.kind.startsWith('prepayment')).sort((a, b) => a.paid_date.localeCompare(b.paid_date))
  const fullPay = prepays.find(p => p.kind === 'prepayment_full')
  const dueDay = loan.due_day || Number(first.slice(8, 10))
  const fee = Number(loan.monthly_admin_fee || 0)
  const rows: Row[] = []
  let principal = Number(loan.original_amount), pay = 0, prevRate = NaN
  const applied = new Set<LoanPayment>()
  const lastKnownRate = (date: string) => rateAt(loan, changes, date)
  // an estimate = a month after the last rate the bank confirmed that could have changed (floating / after fixed period / past review date)
  const fixedEnd = loan.fixed_period_months ? addMonthsKeepDay(first, Number(loan.fixed_period_months) - 1, dueDay) : null
  const lastChange = [...changes].sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0]?.effective_date || ''
  const isEstimate = (due: string) => {
    if (due <= today) return false
    const t = loan.interest_type || 'fixed'
    if (t === 'floating') return true
    if (t === 'fixed_then_floating' && fixedEnd && due > fixedEnd && !(lastChange && lastChange > fixedEnd)) return true
    if (loan.next_rate_review_date && due >= loan.next_rate_review_date && lastChange < loan.next_rate_review_date) return true
    return false
  }
  for (let k = 1; k <= n && principal > 0.005; k++) {
    const due = addMonthsKeepDay(first, k - 1, dueDay)
    // partial prepayments made before this due date are applied now
    for (const p of prepays) {
      if (p.kind !== 'prepayment_partial' || applied.has(p)) continue
      if (p.paid_date <= due) {
        applied.add(p)
        principal = r2(Math.max(0, principal - Number(p.principal)))
        if (p.effect !== 'shorter_tenor') pay = 0   // lower_installment: recompute below
      }
    }
    if (principal <= 0.005) break
    const rate = lastKnownRate(due), remaining = n - k + 1
    if (pay === 0 || rate !== prevRate) pay = annuity(principal, rate, remaining)   // rate change or prepayment → recalculate on remaining principal & tenor
    const note = rate !== prevRate && !Number.isNaN(prevRate) ? `Rate ${prevRate}% → ${rate}%` : undefined
    prevRate = rate
    const a = inst.get(k)
    let interest = r2(principal * rate / 12 / 100), prin = r2(Math.min(principal, pay - interest))
    if (k === n || prin > principal) prin = principal
    let fees = fee, actual = false
    if (a) { prin = Number(a.principal); interest = Number(a.interest); fees = Number(a.fees || 0); actual = true; if (prin > principal) prin = principal }
    const closing = r2(Math.max(0, principal - prin))
    const status: Row['status'] = actual ? 'paid' : due <= today ? 'due' : isEstimate(due) ? 'estimate' : 'upcoming'
    rows.push({ no: k, due, opening: r2(principal), principal: prin, interest, fees, total: r2(prin + interest + fees), closing, rate, status, actual, note })
    principal = closing
    if (actual && principal > 0 && pay > 0 && !(rate === prevRate)) pay = 0
  }
  // full repayment: the schedule stops at the settlement date
  if (fullPay) return rows.filter(r => r.actual || r.due <= fullPay.paid_date)
  return rows
}

/** Outstanding principal right now = original − principal of recorded installments − prepayments. */
export function outstandingPrincipal(loan: LoanInput, payments: LoanPayment[]) {
  const paid = payments.reduce((s, p) => s + (p.kind === 'penalty' ? 0 : Number(p.principal || 0)), 0)
  return Math.max(0, r2(Number(loan.original_amount) - paid))
}
export const totalsOf = (rows: Row[]) => ({ interest: r2(rows.reduce((s, r) => s + r.interest, 0)), principal: r2(rows.reduce((s, r) => s + r.principal, 0)), fees: r2(rows.reduce((s, r) => s + r.fees, 0)) })
