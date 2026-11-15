// One place that defines what every transaction type MEANS for balances and reports.
// Debit = value leaving you (money out, or a charge on a card). Credit = value coming to you (money in, or card debt reduced).

export type TxType = 'income' | 'expense' | 'refund' | 'transfer' | 'credit_card_purchase' | 'credit_card_payment' | 'fee' | 'interest' | 'adjustment' | 'loan_disbursement' | 'loan_repayment'

export const TX_TYPES: { value: TxType; label: string; hint: string }[] = [
  { value: 'income', label: 'Income', hint: 'Money earned. Counts as income.' },
  { value: 'expense', label: 'Expense', hint: 'Money spent. Counts as spending.' },
  { value: 'refund', label: 'Refund', hint: 'Money back for something you bought. Reduces spending — not income.' },
  { value: 'transfer', label: 'Transfer', hint: 'Between your own accounts. Not income or spending.' },
  { value: 'credit_card_purchase', label: 'Credit Card Purchase', hint: 'Charge on a card. Counts as spending when it is bought.' },
  { value: 'credit_card_payment', label: 'Credit Card Payment', hint: 'Bank → card. Not spending (the purchases already counted).' },
  { value: 'fee', label: 'Fee & Charges', hint: 'Admin / annual / late fees. Counts as spending.' },
  { value: 'interest', label: 'Interest', hint: 'Interest charged. Counts as spending.' },
  { value: 'adjustment', label: 'Adjustment', hint: 'Fix a balance. Not income or spending.' },
  { value: 'loan_disbursement', label: 'Loan Disbursement', hint: 'Loan money received. Not income.' },
  { value: 'loan_repayment', label: 'Loan Repayment', hint: 'Principal paid back. Not spending (interest & fees are recorded separately).' },
]
export const TYPE_LABEL: Record<string, string> = Object.fromEntries(TX_TYPES.map(t => [t.value, t.label]))
export const typeLabel = (t: string) => TYPE_LABEL[t] || t

/** How a type is counted in income / spending reports. */
export type Flow = 'income' | 'spending' | 'refund' | 'neutral'
export function flowOf(tx: { type: string }): Flow {
  switch (tx.type) {
    case 'income': return 'income'
    case 'expense': case 'credit_card_purchase': case 'fee': case 'interest': return 'spending'
    case 'refund': return 'refund'
    default: return 'neutral'   // transfer, credit_card_payment, adjustment, loan_disbursement, loan_repayment
  }
}
export const isSpendingType = (t: string) => ['expense', 'credit_card_purchase', 'fee', 'interest'].includes(t)
/** Types that need a destination account. */
export const needsDestination = (t: string) => t === 'transfer' || t === 'credit_card_payment'

/**
 * Effect of one transaction on ONE account's balance.
 * Bank-like accounts: balance = money you have. Credit cards: balance = amount you owe.
 */
export function balanceDelta(accountId: string, accountType: string, tx: any): number {
  const amount = Number(tx.amount || 0)
  const card = accountType === 'credit_card'
  const dir = String(tx.original_direction || 'debit').toLowerCase().startsWith('c') ? 'credit' : 'debit'
  if (tx.type === 'transfer' || tx.type === 'credit_card_payment') {
    if (tx.from_account_id === accountId) return card ? -amount : -amount          // money leaves the source
    if (tx.to_account_id === accountId) return card ? -amount : amount             // arrives (a card: debt shrinks)
    return 0
  }
  if (tx.from_account_id !== accountId) return 0
  switch (tx.type) {
    case 'income': case 'refund': case 'loan_disbursement': return card ? -amount : amount
    case 'credit_card_purchase': return amount
    case 'expense': return card ? amount : -amount
    case 'fee': case 'interest': return card ? amount : -amount
    case 'loan_repayment': return card ? amount : -amount
    case 'adjustment': return dir === 'credit' ? (card ? -amount : amount) : (card ? amount : -amount)
    default: return 0
  }
}

/** Debit / Credit columns, from the account's point of view. */
export function debitCredit(tx: any): { debit: number; credit: number } {
  const a = Number(tx.amount || 0)
  if (['income', 'refund', 'loan_disbursement'].includes(tx.type)) return { debit: 0, credit: a }
  if (tx.type === 'adjustment') return String(tx.original_direction || 'debit').toLowerCase().startsWith('c') ? { debit: 0, credit: a } : { debit: a, credit: 0 }
  return { debit: a, credit: 0 }   // expense, card purchase, fee, interest, repayment, and the source side of transfers/payments
}

// ---------- import fingerprints ----------
export const norm = (s: any) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
/** FNV-1a 32-bit, twice with different seeds → 16 hex chars. Enough to tell rows apart; not a security hash. */
export function hash(s: string) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x9e3779b9
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193); h2 = Math.imul(h2 ^ c, 0x85ebca6b) }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}
/**
 * Fingerprint per row = account + date + direction + amount + original text + OCCURRENCE NUMBER.
 * Two genuinely identical purchases on the same day get occurrence 1 and 2, so both are kept,
 * while importing the same statement again gives the same fingerprints and is blocked.
 */
export function fingerprints(rows: { date: string; amount: number; direction: string; text: string }[], accountId: string): string[] {
  const seen: Record<string, number> = {}
  return rows.map(r => {
    const base = [accountId, r.date, r.direction, Number(r.amount).toFixed(2), norm(r.text)].join('|')
    seen[base] = (seen[base] || 0) + 1
    return hash(base + '#' + seen[base])
  })
}

// ---------- default lists (seeded the first time you open Finance) ----------
export const DEFAULT_PURPOSES = ['Personal', 'Business', 'China Daily', 'Travel', 'Family', 'Content / Project', 'Investment', 'Bills']
export const DEFAULT_PERSONAL_CATEGORIES = ['Food', 'Shopping', 'Transportation', 'Daily Necessities', 'Healthcare', 'Entertainment', 'Travel', 'Housing', 'Insurance', 'Other']
export const DEFAULT_BUSINESS_CATEGORIES = ['Marketing & Advertising', 'Endorsement & Influencer', 'Raw Materials', 'Packaging', 'Product Purchases / Inventory', 'Shipping & Delivery', 'Reseller & Sales Commission', 'Salary & Wages', 'Rent & Utilities', 'Operational Expenses', 'Software & Subscriptions', 'Maintenance', 'Other']
