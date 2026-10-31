'use client'
import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, X, Eye, EyeOff, Camera, Upload, FileText, Pencil } from 'lucide-react'

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function formatMoney(amount: number | string | null | undefined, currency: string) {
  const value = Number(amount || 0)
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return currency + ' ' + value.toLocaleString('en-US')
  }
}

function categoryCurrencyKey(category: string, currency: string) {
  return String(category || 'Other').trim().toLocaleLowerCase() + '-' + currency
}

function transactionLabel(type: string) {
  if (type === 'income') return 'Income / refund'
  if (type === 'transfer') return 'Transfer'
  if (type === 'credit_card_purchase') return 'Credit card purchase'
  if (type === 'fee') return 'Fee / interest'
  return 'Expense'
}

const FINANCE_CATEGORIES = [
  'Housing', 'Utilities', 'Groceries', 'Dining', 'Transport', 'Health', 'Shopping',
  'Personal care', 'Family', 'Education', 'Travel', 'Entertainment', 'Subscriptions',
  'Work & business', 'Fees & interest', 'Gifts & donations', 'Salary',
  'Freelance & business income', 'Investment income', 'Refund', 'Other'
]

function transactionBalanceDelta(accountId: string, accountType: string, tx: any) {
  const amount = Number(tx.amount || 0)
  if (tx.type === 'income' && tx.from_account_id === accountId) return accountType === 'credit_card' ? -amount : amount
  if (tx.type === 'transfer') {
    if (tx.from_account_id === accountId) return -amount
    if (tx.to_account_id === accountId) return accountType === 'credit_card' ? -amount : amount
  }
  if (tx.from_account_id !== accountId) return 0
  if (tx.type === 'credit_card_purchase') return amount
  if (tx.type === 'expense') return -amount
  if (tx.type === 'fee') return accountType === 'credit_card' ? amount : -amount
  return 0
}

function parseMoneyInput(value: string) {
  let raw = value.trim().replace(/[^0-9,.-]/g, '')
  if (raw.includes(',') && raw.includes('.')) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) raw = raw.replace(/\./g, '').replace(',', '.')
    else raw = raw.replace(/,/g, '')
  } else if (raw.includes(',')) {
    const decimals = raw.length - raw.lastIndexOf(',') - 1
    raw = decimals > 0 && decimals <= 2 ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
  } else if ((raw.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(raw)) {
    raw = raw.replace(/\./g, '')
  }
  return Number(raw)
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') {
      cell += '"'
      i++
    } else if (char === '"') quoted = !quoted
    else if ((char === ',' || char === ';') && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some(value => value)) rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  row.push(cell.trim())
  if (row.some(value => value)) rows.push(row)
  return rows
}

type PdfStatementKind = 'debit' | 'credit_card'
type StatementDraft = { id: string; date: string; merchant: string; amount: number; type: string; category: string; include: boolean; raw: string; sourceFile?: string }

type StatementSummary = { opening: number | null; credits: number | null; debits: number | null; closing: number | null; previousBill: number | null; currentBill: number | null; minimumPayment: number | null; dueDate: string | null; creditLimit: number | null }

function parseStatementSummary(text: string): StatementSummary {
  const flat = text.replace(/\s+/g, ' ')
  const amount = (label: string) => {
    const match = flat.match(new RegExp(label + String.raw`\s*:?\s*([0-9][0-9.,]*)`, 'i'))
    return match ? parseMoneyInput(match[1]) : null
  }
  const finalTotalMatches = Array.from(flat.matchAll(/\bTOTAL\s+([0-9][0-9.,]*)/gi))
  const bcaFinalTotal = finalTotalMatches.length ? parseMoneyInput(finalTotalMatches[finalTotalMatches.length - 1][1]) : null
  const dueMatch = flat.match(/TANGGAL JATUH TEMPO\s*:?\s*(\d{1,2})[-/](\d{1,2})[-/](\d{4})/i)
  const dueDate = dueMatch ? `${dueMatch[3]}-${String(Number(dueMatch[2])).padStart(2,'0')}-${String(Number(dueMatch[1])).padStart(2,'0')}` : null
  return {
    opening: amount('SALDO AWAL'), credits: amount('MUTASI CR'), debits: amount('MUTASI DB'), closing: amount('SALDO AKHIR'),
    previousBill: amount('TAGIHAN BULAN LALU') ?? amount('SALDO SEBELUMNYA'),
    currentBill: amount('TAGIHAN BULAN INI') ?? bcaFinalTotal,
    minimumPayment: amount('PEMBAYARAN MINIMUM'), dueDate, creditLimit: amount('BATAS KREDIT')
  }
}

function statementDate(raw: string, year: number) {
  const match = raw.match(/^(\d{1,2})(?:[/-](\d{1,2})|[-\s]([A-Z]{3}))(?:[/-](\d{2,4}))?$/i)
  if (!match) return ''
  const day = Number(match[1])
  const monthNames: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, MEI: 5, JUN: 6, JUL: 7, AUG: 8, AGU: 8, SEP: 9, OCT: 10, OKT: 10, NOV: 11, DEC: 12, DES: 12 }
  const month = match[2] ? Number(match[2]) : monthNames[String(match[3] || '').toUpperCase()]
  const yearToken = match[4]
  const fullYear = yearToken ? (Number(yearToken) < 100 ? 2000 + Number(yearToken) : Number(yearToken)) : year
  if (!month) return ''
  const date = new Date(fullYear, month - 1, day)
  if (date.getFullYear() !== fullYear || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  return localDateString(date)
}

function statementMonthFromFilename(name: string, fallback: Date) {
  const monthNames: Record<string, number> = { JANUARI: 0, JAN: 0, FEBRUARI: 1, FEB: 1, MARET: 2, MAR: 2, APRIL: 3, APR: 3, MEI: 4, MAY: 4, JUNI: 5, JUN: 5, JULI: 6, JUL: 6, AGUSTUS: 7, AGU: 7, AUG: 7, SEPTEMBER: 8, SEP: 8, OKTOBER: 9, OKT: 9, OCT: 9, NOVEMBER: 10, NOV: 10, DESEMBER: 11, DES: 11, DEC: 11 }
  const upper = name.toLocaleUpperCase()
  const monthToken = Object.keys(monthNames).sort((a, b) => b.length - a.length).find(token => new RegExp(`(?:^|[^A-Z])${token}(?:$|[^A-Z])`).test(upper))
  const yearMatch = upper.match(/\b20\d{2}\b/)
  return new Date(yearMatch ? Number(yearMatch[0]) : fallback.getFullYear(), monthToken ? monthNames[monthToken] : fallback.getMonth(), 1)
}

function parseStatementCandidates(text: string, kind: PdfStatementKind, year: number): StatementDraft[] {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const starts = /^\d{1,2}(?:[/-]\d{1,2}|[-\s][A-Z]{3})(?:[/-]\d{2,4})?\b/i
  const ignored = /^(saldo awal|saldo akhir|mutasi cr|mutasi db|total tagihan|tagihan bulan|batas kredit|sisa kredit|pembayaran minimum|tanggal jatuh tempo|ringkasan|informasi|jumlah poin|halaman)\b/i
  const records: { first: string; rest: string[] }[] = []
  let current: { first: string; rest: string[] } | null = null
  for (const line of lines) {
    if (ignored.test(line)) { if (current) records.push(current); current = null; continue }
    if (starts.test(line)) {
      if (current) records.push(current)
      current = { first: line, rest: [] }
    } else if (current && !/^\d+\s*\/?\s*\d*$/.test(line)) current.rest.push(line)
  }
  if (current) records.push(current)

  const moneyPattern = /\b(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})\b/gi
  const drafts: StatementDraft[] = []
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    const dateToken = record.first.match(starts)?.[0] || ''
    const date = statementDate(dateToken, year)
    const amounts = Array.from(record.first.matchAll(moneyPattern)).map(m => parseMoneyInput(m[0])).filter(value => Number.isFinite(value) && value > 0)
    if (!date || amounts.length === 0) continue
    // Debit statements often show both the movement and the running balance; the movement is the earlier amount.
    const amount = kind === 'debit' && amounts.length > 1 ? amounts[amounts.length - 2] : amounts[amounts.length - 1]
    const raw = [record.first, ...record.rest].join(' ').replace(dateToken, '').trim()
    if (/\b(saldo awal|saldo akhir|mutasi cr|mutasi db|total tagihan|tagihan bulan ini|batas kredit|sisa kredit|pembayaran minimum|tanggal jatuh tempo)\b/i.test(raw)) continue
    const merchant = raw
      .replace(moneyPattern, ' ')
      .replace(/\b(?:MID|DDR|TGH|ADM|QR)\s*:?\s*\S+/gi, ' ')
      .replace(/\s+/g, ' ').trim()
    const isPayment = /\b(pembayaran|payment|bayar tagihan)\b/i.test(raw)
    const isFee = /\b(biaya|admin|bunga|fee|interest)\b/i.test(raw)
    const isCredit = /\bCR\s*$/i.test(record.first)
    const type = kind === 'credit_card'
      ? (isPayment ? 'skip' : isFee ? 'fee' : isCredit ? 'income' : 'credit_card_purchase')
      : (isPayment ? 'skip' : (/\b(CR|CREDIT)\b/i.test(record.first) ? 'income' : 'expense'))
    drafts.push({ id: String(index), date, merchant: merchant || raw || 'Statement transaction', amount, type, category: isFee ? 'Fees & interest' : isCredit ? 'Refund' : 'Other', include: type !== 'skip', raw })
  }
  return drafts
}

export default function FinancialPlanner() {
  const [user, setUser] = useState<any>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [budgets, setBudgets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [fixedExpenses, setFixedExpenses] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [goalContributions, setGoalContributions] = useState<Record<string, string>>({})
  const [showBalances, setShowBalances] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const statementInputRef = useRef<HTMLInputElement>(null)
  const [statementFiles, setStatementFiles] = useState<File[]>([])
  const [statementKind, setStatementKind] = useState<PdfStatementKind>('debit')
  const [statementPassword, setStatementPassword] = useState('')
  const [statementAccountId, setStatementAccountId] = useState('')
  const [statementTransferAccountId, setStatementTransferAccountId] = useState('')
  const [statementDrafts, setStatementDrafts] = useState<StatementDraft[]>([])
  const [statementSummary, setStatementSummary] = useState<StatementSummary | null>(null)
  const [statementSnapshotMonth, setStatementSnapshotMonth] = useState<Date | null>(null)
  const [statementModal, setStatementModal] = useState(false)
  const [statementBusy, setStatementBusy] = useState(false)

  // Account Form
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [accountForm, setAccountForm] = useState({
    name: '',
    bank_name: '',
    account_number_last4: '',
    type: 'bank',
    currency: 'IDR',
    opening_balance: 0,
    credit_limit: null as number | null,
    billing_cycle_day: null as number | null,
    payment_due_day: null as number | null
  })

  // Transaction Form
  const [showAddTx, setShowAddTx] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
  const [transactionEditForm, setTransactionEditForm] = useState({ merchant: '', category: '', description: '' })
  const [txForm, setTxForm] = useState({
    type: 'expense',
    amount: 0,
    currency: 'IDR',
    from_account_id: '',
    to_account_id: '',
    category: 'Food',
    merchant: '',
    description: '',
    transaction_date: localDateString()
  })

  // Budget Form
  const [showAddBudget, setShowAddBudget] = useState(false)
  const [budgetForm, setBudgetForm] = useState({ category: '', monthly_limit: 0, currency: 'IDR' })
  const [fixedForm, setFixedForm] = useState({ name: '', category: 'Bills', amount: 0, currency: 'IDR', due_day: 1 })
  const [goalForm, setGoalForm] = useState({ name: '', target_amount: 0, currency: 'IDR', target_date: '' })

  useEffect(() => { load() }, [selectedMonth])

  async function load() {
    try {
      const { data: { user: u }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!u) {
        setUser(null)
        setAccounts([])
        setTransactions([])
        setBudgets([])
        setFixedExpenses([])
        setGoals([])
        setToast('Please sign in to view financial data.')
        return false
      }
      setUser(u)

      const budgetMonth = localDateString(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1))
      const [
        { data: accts, error: accountsError },
        { data: txs, error: transactionsError },
        { data: bdgs, error: budgetsError },
        { data: fixedRows, error: fixedError },
        { data: goalRows, error: goalsError }
      ] = await Promise.all([
        supabase.from('accounts')
          .select('*')
          .eq('user_id', u.id)
          .eq('is_active', true)
          .order('currency, name'),
        supabase.from('transactions')
          .select('*')
          .eq('user_id', u.id)
          .is('deleted_at', null)
          .order('transaction_date', { ascending: false }),
        supabase.from('budgets')
          .select('*')
          .eq('user_id', u.id)
          .eq('budget_month', budgetMonth)
          .is('deleted_at', null),
        supabase.from('financial_fixed_expenses').select('*').eq('user_id', u.id).eq('is_active', true).order('due_day'),
        supabase.from('financial_goals').select('*').eq('user_id', u.id).eq('is_active', true).order('target_date')
      ])

      const queryError = accountsError || transactionsError || budgetsError || fixedError || goalsError
      if (queryError) throw queryError

      setAccounts(accts || [])
      setTransactions(txs || [])
      setBudgets(bdgs || [])
      setFixedExpenses(fixedRows || [])
      setGoals(goalRows || [])
      return true
    } catch (error: any) {
      setToast('Could not load data: ' + (error?.message || 'Check your connection and database settings.'))
      return false
    } finally {
      setLoading(false)
    }
  }

  async function readStatementPdf() {
    if (!statementFiles.length) { setToast('Pilih satu atau beberapa file PDF statement terlebih dahulu.'); return }
    const oversized = statementFiles.filter(file => file.size > 25 * 1024 * 1024)
    if (oversized.length) { setToast('Ukuran maksimal tiap PDF 25 MB. Terlalu besar: ' + oversized.map(file => file.name).join(', ')); return }
    setStatementBusy(true)
    try {
      // PDF bytes and password are processed in this browser; neither is uploaded to Supabase.
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      // Serve the matching worker from this app's own origin. package.json's
      // predev/prebuild scripts copy it from pdfjs-dist into /public.
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const allDrafts: StatementDraft[] = []
      const fileErrors: string[] = []
      let latestSummary: StatementSummary | null = null
      let latestSnapshotMonth: Date | null = null
      const orderedFiles = [...statementFiles].sort((a, b) => statementMonthFromFilename(a.name, selectedMonth).getTime() - statementMonthFromFilename(b.name, selectedMonth).getTime())
      for (let fileIndex = 0; fileIndex < orderedFiles.length; fileIndex++) {
        const file = orderedFiles[fileIndex]
        try {
          const fileMonth = statementMonthFromFilename(file.name, selectedMonth)
          const bytes = new Uint8Array(await file.arrayBuffer())
          const document = await pdfjs.getDocument({ data: bytes, password: statementPassword || undefined }).promise
          const pageTexts: string[] = []
          for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
            const page = await document.getPage(pageNumber)
            // Use the stream reader API for Safari compatibility.
            const content = { items: [] as any[], styles: Object.create(null) as Record<string, any>, lang: undefined as string | undefined }
            const textReader = page.streamTextContent().getReader()
            try {
              while (true) {
                const chunk = await textReader.read()
                if (chunk.done) break
                if (chunk.value.lang) content.lang = chunk.value.lang
                Object.assign(content.styles, chunk.value.styles)
                content.items.push(...chunk.value.items)
              }
            } finally { textReader.releaseLock() }
            const rows: { y: number; x: number; text: string }[] = []
            for (const item of content.items as any[]) {
              if (!('str' in item) || !item.str.trim()) continue
              rows.push({ y: Math.round(item.transform[5]), x: item.transform[4], text: item.str.trim() })
            }
            rows.sort((a, b) => b.y - a.y || a.x - b.x)
            const grouped: { y: number; items: { x: number; text: string }[] }[] = []
            for (const item of rows) {
              let line = grouped.find(candidate => Math.abs(candidate.y - item.y) <= 2)
              if (!line) { line = { y: item.y, items: [] }; grouped.push(line) }
              line.items.push({ x: item.x, text: item.text })
            }
            pageTexts.push(grouped.map(line => line.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')).join('\n'))
            page.cleanup()
          }
          const extracted = pageTexts.join('\n')
          if (!extracted.trim()) { fileErrors.push(file.name + ': Could not extract text (this may be a scanned PDF).'); continue }
          const summary = parseStatementSummary(extracted)
          const snapshotValue = statementKind === 'credit_card' ? summary.currentBill : summary.closing
          if (snapshotValue !== null && (!latestSnapshotMonth || fileMonth >= latestSnapshotMonth)) {
            latestSummary = summary
            latestSnapshotMonth = fileMonth
          }
          const drafts = parseStatementCandidates(extracted, statementKind, fileMonth.getFullYear())
          if (!drafts.length) { fileErrors.push(file.name + ': Text was extracted, but the transaction format was not recognized.'); continue }
          allDrafts.push(...drafts.map((draft, rowIndex) => ({ ...draft, id: fileIndex + '-' + rowIndex + '-' + draft.id, sourceFile: file.name })))
        } catch (error: any) {
          fileErrors.push(file.name + ': ' + (String(error?.message || '').toLowerCase().includes('password') ? 'The password is incorrect or differs from the other PDFs in this batch.' : String(error?.message || 'Could not be read.')))
        }
      }
      setStatementPassword('')
      setStatementSummary(latestSummary)
      setStatementSnapshotMonth(latestSnapshotMonth)
      if (!allDrafts.length) {
        setStatementDrafts([])
        setToast('No transactions were recognized. ' + fileErrors.join(' '))
        return
      }
      setStatementDrafts(allDrafts)
      setStatementPassword('')
      const matching = accounts.filter(account => statementKind === 'credit_card' ? account.type === 'credit_card' : account.type !== 'credit_card')
      if (!matching.some(account => account.id === statementAccountId)) setStatementAccountId(matching[0]?.id || '')
      setToast(allDrafts.length + ' rows found in ' + orderedFiles.length + ' PDFs. Review them before saving.' + (fileErrors.length ? ' Some files need attention: ' + fileErrors.join(' ') : ''))
    } catch (error: any) {
      setStatementPassword('')
      const message = String(error?.message || '')
      setToast(/password/i.test(message) ? 'The PDF password is incorrect or missing. It is used only to read this file.' : 'Could not read PDF: ' + (message || 'Unknown file format.'))
    } finally {
      setStatementBusy(false)
    }
  }

  async function importStatementDrafts() {
    if (!user || !statementAccountId) { setToast('Choose the matching statement account.'); return }
    const account = accounts.find(item => item.id === statementAccountId)
    if (!account || (statementKind === 'credit_card' && account.type !== 'credit_card') || (statementKind === 'debit' && account.type === 'credit_card')) {
      setToast('The account type must match the statement type.'); return
    }
    const selected = statementDrafts.filter(row => row.include && row.type !== 'skip')
    if (!selected.length) { setToast('Select at least one transaction to save.'); return }
    if (selected.some(row => row.type === 'transfer') && !statementTransferAccountId) { setToast('Choose a destination account for the transfer row.'); return }
    const target = accounts.find(item => item.id === statementTransferAccountId)
    if (selected.some(row => row.type === 'transfer') && (!target || target.id === account.id || target.currency !== account.currency)) {
      setToast('The source and destination accounts must be different and use the same currency.'); return
    }
    const rows = selected.map(row => ({
      user_id: user.id, type: row.type, amount: row.amount, currency: account.currency,
      from_account_id: account.id, to_account_id: row.type === 'transfer' ? target?.id : null,
      category: row.category.trim() || 'Other', merchant: row.merchant.trim() || null,
      description: 'Diimpor dari PDF statement', transaction_date: row.date, source: 'manual'
    }))
    const signatures = new Set(transactions.map(tx => [tx.transaction_date, tx.from_account_id, tx.type, Number(tx.amount), String(tx.merchant || '').trim().toLowerCase()].join('|')))
    const uniqueRows = rows.filter(row => {
      const signature = [row.transaction_date, row.from_account_id, row.type, Number(row.amount), String(row.merchant || '').trim().toLowerCase()].join('|')
      if (signatures.has(signature)) return false
      signatures.add(signature)
      return true
    })
    if (!uniqueRows.length) { setToast('These transactions appear to have already been imported. No duplicates were saved.'); return }
    const skipped = rows.length - uniqueRows.length
    const snapshotBalance = statementKind === 'credit_card' ? statementSummary?.currentBill : statementSummary?.closing
    const snapshotNote = snapshotBalance === null || snapshotBalance === undefined
      ? ' The closing balance could not be read from the PDF, so the account balance will not be reconciled automatically.'
      : ' Closing balance PDF ' + formatMoney(snapshotBalance, account.currency) + ' akan dicocokkan otomatis.'
    if (!window.confirm('Save ' + uniqueRows.length + ' transactions?' + (skipped ? ' ' + skipped + ' duplicates skipped.' : '') + ' Check that dates, types, and amounts are correct.' + snapshotNote)) return
    setSaving(true)
    try {
      const { error } = await supabase.from('transactions').insert(uniqueRows)
      if (error) throw error
      if (statementSummary) {
        if (snapshotBalance !== null && snapshotBalance !== undefined) {
          const snapshotMonth = statementSnapshotMonth || selectedMonth
          const monthEnd = localDateString(new Date(snapshotMonth.getFullYear(), snapshotMonth.getMonth() + 1, 0))
          const rowsThroughStatement = [...transactions, ...uniqueRows].filter(row => row.transaction_date <= monthEnd)
          const ledgerActivity = rowsThroughStatement.reduce((sum, row) => sum + transactionBalanceDelta(account.id, account.type, row), 0)
          const summaryUpdate: any = {
            opening_balance: snapshotBalance - ledgerActivity,
            current_balance: snapshotBalance
          }
          if (statementKind === 'credit_card') {
            summaryUpdate.last_statement_month = localDateString(new Date(snapshotMonth.getFullYear(), snapshotMonth.getMonth(), 1))
            summaryUpdate.last_statement_balance = snapshotBalance
            summaryUpdate.minimum_payment = statementSummary.minimumPayment
            summaryUpdate.statement_due_date = statementSummary.dueDate
            summaryUpdate.credit_limit = statementSummary.creditLimit || account.credit_limit
          }
          const { error: summaryError } = await supabase.from('accounts').update(summaryUpdate).eq('id', account.id).eq('user_id', user.id)
          if (summaryError) setToast('Transactions saved, but the statement balance could not be reconciled: ' + summaryError.message)
        }
      }
      setStatementDrafts([])
      setStatementSummary(null)
      setStatementFiles([])
      setStatementModal(false)
      const refreshed = await load()
      setToast(refreshed ? uniqueRows.length + ' statement transactions saved.' : 'Transactions were submitted, but the list could not be refreshed.')
    } catch (error: any) { setToast('Could not save statement transactions: ' + (error?.message || 'Check the database.')) }
    finally { setSaving(false) }
  }

  // Add Account
  async function addAccount() {
    if (!user) {
      setToast('Please sign in to save an account.')
      return
    }
    const openingBalance = Number(accountForm.opening_balance)
    if (!accountForm.name.trim()) {
      setToast('Enter an account name.')
      return
    }
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      setToast('Opening balance must be zero or greater.')
      return
    }
    if (accountForm.account_number_last4 && !/^\d{4}$/.test(accountForm.account_number_last4)) {
      setToast('Isi tepat 4 angka terakhir rekening, atau kosongkan.')
      return
    }
    if (accountForm.type === 'credit_card' && (!accountForm.credit_limit || Number(accountForm.credit_limit) <= 0)) {
      setToast('Enter a valid credit limit.')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('accounts').insert({
        user_id: user.id,
        name: accountForm.name.trim(),
        bank_name: accountForm.bank_name.trim() || null,
        account_number_last4: accountForm.account_number_last4 || null,
        type: accountForm.type,
        currency: accountForm.currency,
        opening_balance: openingBalance,
        opening_balance_date: localDateString(),
        current_balance: openingBalance,
        credit_limit: accountForm.type === 'credit_card' ? Number(accountForm.credit_limit) : null,
        billing_cycle_day: accountForm.type === 'credit_card' ? accountForm.billing_cycle_day : null,
        payment_due_day: accountForm.type === 'credit_card' ? accountForm.payment_due_day : null
      })
      if (error) throw error

      setAccountForm({
        name: '',
        bank_name: '',
        account_number_last4: '',
        type: 'bank',
        currency: 'IDR',
        opening_balance: 0,
        credit_limit: null,
        billing_cycle_day: null,
        payment_due_day: null
      })
      setShowAddAccount(false)
      const refreshed = await load()
      setToast(refreshed ? 'Account saved.' : 'Account was submitted, but the list could not be refreshed.')
    } catch (error: any) {
      setToast('Could not save account: ' + (error?.message || 'Check your connection and database settings.'))
    } finally {
      setSaving(false)
    }
  }

  // Add Transaction
  async function addTransaction() {
    if (!user) {
      setToast('Please sign in to save a transaction.')
      return
    }
    const amount = Number(txForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast('Enter a transaction amount greater than zero.')
      return
    }
    if (!txForm.category.trim()) {
      setToast('Choose a category to keep your spending organized.')
      return
    }
    if (!txForm.from_account_id) {
      setToast('Choose an account for this transaction.')
      return
    }
    if (txForm.type === 'transfer' && !txForm.to_account_id) {
      setToast('Choose a destination account for this transfer.')
      return
    }
    if (txForm.type === 'transfer' && txForm.from_account_id === txForm.to_account_id) {
      setToast('Choose two different source and destination accounts.')
      return
    }
    const sourceAccount = accounts.find(a => a.id === txForm.from_account_id)
    const destinationAccount = accounts.find(a => a.id === txForm.to_account_id)
    if (!sourceAccount || sourceAccount.currency !== txForm.currency ||
        (txForm.type === 'transfer' && (!destinationAccount || destinationAccount.currency !== txForm.currency))) {
      setToast('Choose an account with the same currency as the transaction.')
      return
    }
    if (txForm.type === 'credit_card_purchase' && sourceAccount.type !== 'credit_card') {
      setToast('For a credit card purchase, choose a credit card account.')
      return
    }
    if (txForm.type !== 'credit_card_purchase' && sourceAccount.type === 'credit_card') {
      setToast('Choose a bank or cash account. Credit card purchases use the dedicated transaction type.')
      return
    }

    if (receiptFile && receiptFile.size > 10 * 1024 * 1024) {
      setToast('Receipts must be 10 MB or smaller.')
      return
    }
    setSaving(true)
    let uploadedPath = ''
    try {
      if (receiptFile) {
        const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        uploadedPath = user.id + '/' + Date.now() + '-' + safeName
        const { error: uploadError } = await supabase.storage.from('receipts').upload(uploadedPath, receiptFile, {
          upsert: false,
          contentType: receiptFile.type || 'application/octet-stream'
        })
        if (uploadError) throw uploadError
      }
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        type: txForm.type,
        amount,
        currency: txForm.currency,
        from_account_id: txForm.from_account_id,
        to_account_id: txForm.type === 'transfer' ? txForm.to_account_id : null,
        category: txForm.category.trim(),
        merchant: txForm.merchant.trim() || null,
        description: txForm.description.trim() || null,
        transaction_date: txForm.transaction_date,
        source: 'manual',
        receipt_path: uploadedPath || null
      })
      if (error) {
        if (uploadedPath) await supabase.storage.from('receipts').remove([uploadedPath])
        throw error
      }

      setTxForm({
        type: 'expense',
        amount: 0,
        currency: 'IDR',
        from_account_id: '',
        to_account_id: '',
        category: 'Food',
        merchant: '',
        description: '',
        transaction_date: localDateString()
      })
      setShowAddTx(false)
      setReceiptFile(null)
      const refreshed = await load()
      setToast(refreshed ? 'Transaction saved.' : 'Transactions were submitted, but the list could not be refreshed.')
    } catch (error: any) {
      setToast('Could not save transaction: ' + (error?.message || 'Check your connection and database settings.'))
    } finally {
      setSaving(false)
    }
  }

  async function openReceipt(path: string) {
    if (!path) return
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
    if (error || !data?.signedUrl) {
      setToast('Could not open receipt: ' + (error?.message || 'Could not create a link.'))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  // Add Budget
  async function addBudget() {
    if (!user) {
      setToast('Please sign in to save a budget.')
      return
    }
    const limit = Number(budgetForm.monthly_limit)
    if (!budgetForm.category.trim()) {
      setToast('Enter a category name.')
      return
    }
    if (!Number.isFinite(limit) || limit <= 0) {
      setToast('Batas budget harus lebih besar dari nol.')
      return
    }
    if (budgets.some(b => String(b.category || '').trim().toLowerCase() === budgetForm.category.trim().toLowerCase() && b.currency === budgetForm.currency)) {
      setToast('A budget already exists for this category and currency this month.')
      return
    }

    setSaving(true)
    try {
      const thisMonth = localDateString(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1))
      const { error } = await supabase.from('budgets').insert({
        user_id: user.id,
        category: budgetForm.category.trim(),
        monthly_limit: limit,
        currency: budgetForm.currency,
        budget_month: thisMonth
      })
      if (error) throw error

      setBudgetForm({ category: '', monthly_limit: 0, currency: 'IDR' })
      setShowAddBudget(false)
      const refreshed = await load()
      setToast(refreshed ? 'Budget saved.' : 'Budget was submitted, but the list could not be refreshed.')
    } catch (error: any) {
      setToast('Could not save budget: ' + (error?.message || 'Check your connection and database settings.'))
    } finally {
      setSaving(false)
    }
  }

  async function addFixedExpense() {
    if (!user) { setToast('Silakan masuk dulu.'); return }
    const amount = Number(fixedForm.amount)
    if (!fixedForm.name.trim() || !Number.isFinite(amount) || amount <= 0 || fixedForm.due_day < 1 || fixedForm.due_day > 31) {
      setToast('Enter a name, a positive amount, and a due day from 1 to 31.')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('financial_fixed_expenses').insert({
        user_id: user.id, name: fixedForm.name.trim(), category: fixedForm.category.trim() || 'Bills',
        amount, currency: fixedForm.currency, due_day: Number(fixedForm.due_day), is_active: true
      })
      if (error) throw error
      setFixedForm({ name: '', category: 'Bills', amount: 0, currency: 'IDR', due_day: 1 })
      const refreshed = await load()
      setToast(refreshed ? 'Recurring bill saved.' : 'Bill was submitted, but the list could not be refreshed.')
    } catch (error: any) { setToast('Could not save bill: ' + (error?.message || 'Check the database.')) }
    finally { setSaving(false) }
  }

  async function archiveFixedExpense(id: string) {
    if (!confirm('Arsipkan tagihan rutin ini?')) return
    const { error } = await supabase.from('financial_fixed_expenses').update({ is_active: false }).eq('id', id).eq('user_id', user.id)
    if (error) { setToast('Could not archive bill: ' + error.message); return }
    setToast('Recurring bill archived.')
    load()
  }

  async function addGoal() {
    if (!user) { setToast('Silakan masuk dulu.'); return }
    const target = Number(goalForm.target_amount)
    if (!goalForm.name.trim() || !Number.isFinite(target) || target <= 0) {
      setToast('Enter a goal name and a target greater than zero.')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('financial_goals').insert({
        user_id: user.id, name: goalForm.name.trim(), target_amount: target, current_amount: 0,
        currency: goalForm.currency, target_date: goalForm.target_date || null, is_active: true
      })
      if (error) throw error
      setGoalForm({ name: '', target_amount: 0, currency: 'IDR', target_date: '' })
      const refreshed = await load()
      setToast(refreshed ? 'Savings goal created.' : 'Goal was submitted, but the list could not be refreshed.')
    } catch (error: any) { setToast('Could not save goal: ' + (error?.message || 'Check the database.')) }
    finally { setSaving(false) }
  }

  async function addGoalContribution(goal: any) {
    const amount = Number(goalContributions[goal.id])
    if (!Number.isFinite(amount) || amount <= 0) { setToast('Masukkan jumlah progres yang valid.'); return }
    const nextAmount = Math.min(Number(goal.current_amount || 0) + amount, Number(goal.target_amount))
    const { error } = await supabase.from('financial_goals').update({ current_amount: nextAmount }).eq('id', goal.id).eq('user_id', user.id)
    if (error) { setToast('Could not save progress: ' + error.message); return }
    setGoalContributions({ ...goalContributions, [goal.id]: '' })
    setToast('Goal progress updated.')
    load()
  }

  async function archiveGoal(id: string) {
    if (!confirm('Archive this savings goal?')) return
    const { error } = await supabase.from('financial_goals').update({ is_active: false }).eq('id', id).eq('user_id', user.id)
    if (error) { setToast('Could not archive goal: ' + error.message); return }
    setToast('Savings goal archived.')
    load()
  }

  // Delete
  async function deleteAccount(id: string) {
    if (!confirm('Yakin ingin menghapus atau mengarsipkan data ini?')) return
    const { error } = await supabase.from('accounts').update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    if (error) { setToast('Could not archive account: ' + error.message); return }
    setToast('Account archived.')
    load()
  }

  async function deleteTransaction(id: string) {
    if (!confirm('Yakin ingin menghapus atau mengarsipkan data ini?')) return
    const { error } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    if (error) { setToast('Could not delete transaction: ' + error.message); return }
    setToast('Transaction deleted.')
    load()
  }

  function startEditTransaction(tx: any) {
    setEditingTransaction(tx)
    setTransactionEditForm({ merchant: tx.merchant || '', category: tx.category || '', description: tx.description || '' })
  }

  async function saveTransactionText() {
    if (!user || !editingTransaction) return
    if (!transactionEditForm.merchant.trim() && !transactionEditForm.category.trim()) {
      setToast('Enter a transaction name or category first.')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('transactions').update({
        merchant: transactionEditForm.merchant.trim() || null,
        category: transactionEditForm.category.trim() || 'Other',
        description: transactionEditForm.description.trim() || null
      }).eq('id', editingTransaction.id).eq('user_id', user.id)
      if (error) throw error
      setEditingTransaction(null)
      const refreshed = await load()
      setToast(refreshed ? 'Transaction name and note updated.' : 'Changes were saved, but the list could not be refreshed.')
    } catch (error: any) {
      setToast('Could not update transaction: ' + (error?.message || 'Periksa koneksi dan database.'))
    } finally { setSaving(false) }
  }

  async function deleteBudget(id: string) {
    if (!confirm('Delete?')) return
    const { error } = await supabase.from('budgets').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    if (error) { setToast('Gagal menghapus budget: ' + error.message); return }
    setToast('Budget deleted.')
    load()
  }

  async function importCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!user) { setToast('Please sign in before importing transactions.'); return }
    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) { setToast('The CSV is empty or has no transaction rows.'); return }
      const headers = rows[0].map(value => value.toLowerCase().replace(/[\s_-]+/g, ' ').trim())
      const column = (...names: string[]) => headers.findIndex(header => names.includes(header))
      const cell = (row: string[], ...names: string[]) => {
        const index = column(...names)
        return index < 0 ? '' : (row[index] || '').trim()
      }
      const valid: any[] = []
      let skipped = 0
      for (const row of rows.slice(1)) {
        const rawDate = cell(row, 'date', 'transaction date', 'tanggal')
        let date = ''
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) date = rawDate
        else {
          const dmy = rawDate.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
          if (dmy) date = dmy[3] + '-' + String(Number(dmy[2])).padStart(2, '0') + '-' + String(Number(dmy[1])).padStart(2, '0')
          else {
            const parsed = new Date(rawDate)
            if (!Number.isNaN(parsed.getTime())) date = localDateString(parsed)
          }
        }

        const debitText = cell(row, 'debit', 'withdrawal', 'keluar')
        const creditText = cell(row, 'credit', 'deposit', 'masuk')
        const amountText = cell(row, 'amount', 'jumlah', 'nominal')
        let amount = parseMoneyInput(amountText)
        const typeText = cell(row, 'type', 'transaction type', 'jenis').toLowerCase()
        let type = 'expense'
        if (typeText.includes('income') || typeText.includes('pemasukan') || typeText === 'in') type = 'income'
        else if (typeText.includes('transfer')) type = 'transfer'
        else if (typeText.includes('fee') || typeText.includes('biaya')) type = 'fee'
        else if (typeText.includes('credit')) type = 'credit_card_purchase'
        else if (!amountText && parseMoneyInput(creditText) > 0) {
          amount = parseMoneyInput(creditText)
          type = 'income'
        } else if (!amountText) amount = parseMoneyInput(debitText)

        const currency = (cell(row, 'currency', 'mata uang') || 'IDR').toUpperCase()
        const accountName = cell(row, 'account', 'account name', 'from account', 'akun', 'rekening')
        const matchingAccounts = accounts.filter(item => item.currency === currency)
        const account = accounts.find(item => item.name.toLowerCase() === accountName.toLowerCase() || item.id === accountName)
          || (matchingAccounts.length === 1 ? matchingAccounts[0] : null)
        const toName = cell(row, 'to account', 'destination account', 'akun tujuan')
        const toAccount = accounts.find(item => item.name.toLowerCase() === toName.toLowerCase() || item.id === toName)
        if (!date || !Number.isFinite(amount) || amount <= 0 || !account || account.currency !== currency ||
            (type === 'transfer' && (!toAccount || toAccount.id === account.id || toAccount.currency !== currency))) {
          skipped++
          continue
        }
        valid.push({
          user_id: user.id, type, amount, currency, from_account_id: account.id,
          to_account_id: type === 'transfer' ? toAccount.id : null,
          category: cell(row, 'category', 'kategori') || (type === 'income' ? 'Income' : 'Other'),
          merchant: cell(row, 'merchant', 'description', 'details', 'keterangan', 'deskripsi', 'toko') || null,
          description: cell(row, 'notes', 'catatan') || null,
          transaction_date: date, source: 'csv',
        })
      }
      if (!valid.length) {
        setToast('No valid rows found. Make sure the CSV has a date, amount, and matching account name.')
        return
      }
      if (!window.confirm('Import ' + valid.length + ' valid transactions?' + (skipped ? ' ' + skipped + ' invalid rows will be skipped.' : ''))) return
      setSaving(true)
      const { error } = await supabase.from('transactions').insert(valid)
      if (error) throw error
      const refreshed = await load()
      setToast(refreshed ? valid.length + '  transactions imported.' : 'Transactions were imported, but the list could not be refreshed.')
    } catch (error: any) {
      setToast('Could not import CSV: ' + (error?.message || 'Check the CSV format and database permissions.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Loading...</div>

  // Dashboard Calculations
  const accountsByCurrency = accounts.reduce((acc: any, a: any) => {
    if (!acc[a.currency]) acc[a.currency] = []
    acc[a.currency].push(a)
    return acc
  }, {})

  // Balance is opening balance plus saved ledger entries. This keeps the displayed balance
  // correct without relying on a separate manual balance update after every transaction.
  const balanceById = new Map<string, number>()
  accounts.forEach(account => {
    balanceById.set(account.id, Number(account.opening_balance ?? account.current_balance ?? 0))
  })
  transactions.forEach(tx => {
    accounts.forEach(account => {
      const delta = transactionBalanceDelta(account.id, account.type, tx)
      if (delta) balanceById.set(account.id, (balanceById.get(account.id) || 0) + delta)
    })
  })

  const balances = Object.entries(accountsByCurrency).map(([currency, accts]: any) => {
    const moneyAccounts = accts.filter((a: any) => a.type !== 'credit_card')
    const cards = accts.filter((a: any) => a.type === 'credit_card')
    return {
      currency,
      available: moneyAccounts.reduce((sum: number, a: any) => sum + (balanceById.get(a.id) || 0), 0),
      cardDebt: cards.reduce((sum: number, a: any) => sum + Math.max(0, balanceById.get(a.id) || 0), 0),
      accounts: accts
    }
  })

  const thisMonth = localDateString(selectedMonth).slice(0, 7)
  const monthlyIncome: any = {}
  const monthlySpending: any = {}
  transactions.forEach(tx => {
    if (!tx.transaction_date?.startsWith(thisMonth)) return
    const sourceAccount = accounts.find(account => account.id === tx.from_account_id)
    if (tx.type === 'income' && sourceAccount?.type === 'credit_card') {
      monthlySpending[tx.currency] = (monthlySpending[tx.currency] || 0) - Number(tx.amount)
    } else if (tx.type === 'income') {
      monthlyIncome[tx.currency] = (monthlyIncome[tx.currency] || 0) + Number(tx.amount)
    }
    if (['expense', 'credit_card_purchase', 'fee'].includes(tx.type)) {
      monthlySpending[tx.currency] = (monthlySpending[tx.currency] || 0) + Number(tx.amount)
    }
  })
  const summaryCurrencies = Array.from(new Set([
    ...accounts.map(account => account.currency),
    ...transactions.filter(tx => tx.transaction_date?.startsWith(thisMonth)).map(tx => tx.currency),
    ...budgets.map(budget => budget.currency),
  ]))

  const spending: any = {}
  transactions.forEach(tx => {
    const sourceAccount = accounts.find(account => account.id === tx.from_account_id)
    if (tx.transaction_date.startsWith(thisMonth) &&
        (['expense', 'credit_card_purchase', 'fee'].includes(tx.type) || (tx.type === 'income' && sourceAccount?.type === 'credit_card'))) {
      const key = categoryCurrencyKey(tx.category, tx.currency)
      if (!spending[key]) spending[key] = 0
      spending[key] += tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount)
    }
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <datalist id="finance-category-options">{FINANCE_CATEGORIES.map(category => <option key={category} value={category} />)}</datalist>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold">Financial Planner 💰</h1><p className="text-sm text-gray-400 mt-1">Multi-account · Multi-currency · Connected to your business</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => statementInputRef.current?.click()} className="btn-gray btn-sm flex items-center gap-1"><FileText size={16} /> Import E-Statement PDF</button>
          <button onClick={() => receiptInputRef.current?.click()} className="btn-gray btn-sm flex items-center gap-1"><Camera size={16} /> Scan Receipt</button>
          <button onClick={() => csvInputRef.current?.click()} className="btn-gray btn-sm flex items-center gap-1"><Upload size={16} /> Import CSV</button>
          <button onClick={() => { setTab('transactions'); setShowAddTx(true) }} className="btn-blue btn-sm flex items-center gap-1"><Plus size={16} /> Add Transaction</button>
          <button onClick={() => setShowBalances(!showBalances)} className="btn-gray btn-sm">
          {showBalances ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsvFile} />
          <input ref={statementInputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={event => {
            const files = Array.from(event.target.files || [])
            event.target.value = ''
            if (!files.length) return
            setStatementFiles(files)
            setStatementDrafts([])
            setStatementSummary(null)
            setStatementSnapshotMonth(null)
            setStatementPassword('')
            setStatementModal(true)
          }} />
          <input ref={receiptInputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
            onChange={event => {
              const file = event.target.files?.[0] || null
              event.target.value = ''
              if (!file) return
              if (!file.type.startsWith('image/') && file.type !== 'application/pdf') { setToast('Choose a receipt photo or PDF.'); return }
              if (file.size > 10 * 1024 * 1024) { setToast('Receipts must be 10 MB or smaller.'); return }
              setReceiptFile(file)
              setShowAddTx(true)
              setTab('transactions')
              setToast('Receipt selected. Enter the transaction details manually and save to attach it. Receipt details are not read automatically.')
            }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-4 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {Array.from({ length: 12 }, (_, month) => (
            <button key={month} onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), month, 1))}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${selectedMonth.getMonth() === month ? 'bg-teal-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
              {new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(selectedMonth.getFullYear(), month, 1))}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{selectedMonth.getFullYear()}</span>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between ${(toast.toLowerCase().includes('gagal') || toast.toLowerCase().includes('failed') || toast.toLowerCase().includes('error')) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-green-500"><X size={16} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 rounded-2xl bg-white p-2 overflow-x-auto">
        {['overview', 'accounts', 'transactions', 'budgets', 'rmb', 'ccm', 'fixed', 'goals', 'reports'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
              tab === t ? 'bg-teal-500 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {t === 'overview' && '📊 Overview'}
            {t === 'accounts' && '💳 Accounts'}
            {t === 'transactions' && '📋 Transactions'}
            {t === 'budgets' && '🎯 Budget'}
            {t === 'rmb' && '🇨🇳 RMB'}
            {t === 'ccm' && '💳 CCM Manager'}
            {t === 'fixed' && '🔁 Fixed'}
            {t === 'goals' && '🌟 Goals'}
            {t === 'reports' && '📈 Reports'}
          </button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Balances */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {balances.map(b => (
              <div key={b.currency} className="card p-5 md:p-6">
                <div className="text-xs font-bold text-gray-400 uppercase mb-2">{b.currency} · Available cash</div>
                <div className="text-2xl font-bold mb-4">
                  {showBalances ? `${formatMoney(b.available, b.currency)}` : '••••••'}
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  {b.accounts.map((a: any) => (
                    <div key={a.id} className="flex justify-between gap-4 py-1">
                      <span>{a.name}</span>
                      <span className={a.type === 'credit_card' ? 'text-red-500' : ''}>
                        {showBalances ? formatMoney(balanceById.get(a.id) || 0, b.currency) : '••••••'}
                      </span>
                    </div>
                  ))}
                </div>
                {b.cardDebt > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-red-600">
                    Credit card debt: {showBalances ? formatMoney(b.cardDebt, b.currency) : '••••••'}
                  </div>
                )}
              </div>
            ))}
            {balances.length === 0 && (
              <div className="card p-5 text-sm text-gray-500 md:col-span-3">No accounts yet. Add an account to start tracking balances.</div>
            )}
          </div>

          {/* Monthly cash flow summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summaryCurrencies.map(currency => {
              const income = monthlyIncome[currency] || 0
              const spent = monthlySpending[currency] || 0
              const budget = budgets.filter(item => item.currency === currency)
                .reduce((sum: number, item: any) => sum + Number(item.monthly_limit || 0), 0)
              const percent = budget > 0 ? spent / budget * 100 : 0
              return (
                <div key={currency} className="card p-5 md:p-6">
                  <div className="font-bold mb-3">{currency} summary this month</div>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <div><div className="text-gray-400">Income</div><div className="font-semibold text-green-600">{formatMoney(income, currency)}</div></div>
                    <div><div className="text-gray-400">Spending</div><div className="font-semibold text-red-500">{formatMoney(spent, currency)}</div></div>
                    <div><div className="text-gray-400">Net</div><div className={`font-semibold ${income - spent >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatMoney(income - spent, currency)}</div></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Budget used</span><span>{budget > 0 ? `${percent.toFixed(0)}%` : 'Not set'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className={`h-2 rounded-full ${percent > 100 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${Math.min(percent, 100)}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 mt-2">{formatMoney(spent, currency)} of {formatMoney(budget, currency)}</div>
                </div>
              )
            })}
            {summaryCurrencies.length === 0 && <div className="card p-4 text-sm text-gray-500 md:col-span-2">Add an account or transaction to see your monthly summary.</div>}
          </div>

          <div className="card p-5 md:p-6 border border-teal-100"><div className="flex flex-wrap items-center justify-between gap-2 mb-2"><h2 className="font-bold text-lg">Private Money Insights</h2><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">Calculated on this device</span></div><p className="text-xs text-gray-500 mb-4">These simple monthly insights are calculated on your device. This is not generative AI. PDFs, PDF passwords, account numbers, and transaction data are not sent to an AI service.</p><div className="space-y-2">{summaryCurrencies.map(currency => <p key={currency} className="rounded-xl bg-gray-50 p-3 text-sm">{(monthlySpending[currency] || 0) > (monthlyIncome[currency] || 0) ? currency + ': Spending is ' + formatMoney((monthlySpending[currency] || 0) - (monthlyIncome[currency] || 0), currency) + ' above recorded income this month.' : currency + ': Recorded spending is within recorded income this month.'}</p>)}</div>{summaryCurrencies.length === 0 && <p className="text-sm text-gray-500">Add transactions to see private monthly insights.</p>}</div>

          {/* Recent Transactions */}
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100 font-bold">Recent Transactions</div>
            <div className="divide-y divide-gray-50">
              {transactions.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">No transactions yet.</div>
              ) : (
                transactions.slice(0, 5).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 p-5 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm">{tx.merchant || tx.description || tx.category}</div>
                      <div className="text-xs text-gray-400">{tx.transaction_date} · {transactionLabel(tx.type)}</div>
                    </div>
                    <div className={`font-bold text-sm ${
                      tx.type === 'income' ? 'text-green-600' : tx.type === 'transfer' ? 'text-blue-600' : 'text-red-500'
                    }`}>
                      {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔ ' : '−'}{formatMoney(tx.amount, tx.currency)}
                    </div>
                    <button onClick={() => startEditTransaction(tx)} aria-label="Edit transaction name" title="Edit name or note" className="text-gray-400 hover:text-blue-600"><Pencil size={15}/></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNTS TAB */}
      {tab === 'accounts' && (
        <div className="space-y-4">
          {!showAddAccount ? (
            <button onClick={() => setShowAddAccount(true)} className="btn-blue btn-sm flex items-center gap-1">
              <Plus size={16} /> Add Account
            </button>
          ) : (
            <div className="card bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Add Account</h3>
                <button onClick={() => setShowAddAccount(false)} className="text-gray-400"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <input type="text" className="inp w-full text-sm" placeholder="Account name"
                  value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" className="inp text-sm" placeholder="Bank name"
                    value={accountForm.bank_name} onChange={e => setAccountForm({ ...accountForm, bank_name: e.target.value })} />
                  <input type="text" inputMode="numeric" maxLength={4} className="inp text-sm" placeholder="Last 4 account digits"
                    value={accountForm.account_number_last4}
                    onChange={e => setAccountForm({ ...accountForm, account_number_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select className="sel text-sm" value={accountForm.type}
                    onChange={e => setAccountForm({ ...accountForm, type: e.target.value })}>
                    <option value="bank">Bank account</option>
                    <option value="credit_card">Credit card</option>
                    <option value="ewallet">Digital wallet</option>
                    <option value="cash">Cash</option>
                  </select>
                  <select className="sel text-sm" value={accountForm.currency}
                    onChange={e => setAccountForm({ ...accountForm, currency: e.target.value })}>
                    <option value="IDR">IDR</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <p className="rounded-lg bg-white/70 px-3 py-2 text-xs text-gray-600">You do not need to calculate an opening balance. The planner will reconcile it using the closing balance from a statement PDF you read and save.</p>
                {accountForm.type === 'credit_card' && (
                  <>
                    <input type="number" className="inp w-full text-sm" placeholder="Credit limit"
                      value={accountForm.credit_limit || ''} onChange={e => setAccountForm({ ...accountForm, credit_limit: Number(e.target.value) })} />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" className="inp text-sm" placeholder="Statement day"
                        value={accountForm.billing_cycle_day || ''} onChange={e => setAccountForm({ ...accountForm, billing_cycle_day: Number(e.target.value) })} />
                      <input type="number" className="inp text-sm" placeholder="Payment due day"
                        value={accountForm.payment_due_day || ''} onChange={e => setAccountForm({ ...accountForm, payment_due_day: Number(e.target.value) })} />
                    </div>
                  </>
                )}
                <div className="flex gap-2">
                  <button onClick={addAccount} disabled={saving} className="btn-blue text-sm flex-1">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setShowAddAccount(false)} className="btn-gray text-sm flex-1">Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {accounts.length === 0 && <div className="card p-6 text-center text-sm text-gray-500">No accounts yet. Add a bank account, credit card, digital wallet, or cash account to get started.</div>}
            {accounts.map(acc => (
              <div key={acc.id} className="card p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-bold">{acc.name}</div>
                    <div className="text-xs text-gray-500">
                      {[acc.bank_name, acc.account_number_last4 ? '•••• ' + acc.account_number_last4 : null].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-xs text-gray-500">{acc.type === 'credit_card' ? 'Credit card' : acc.type === 'ewallet' ? 'Digital wallet' : acc.type === 'cash' ? 'Cash' : 'Bank account'} • {formatMoney(balanceById.get(acc.id) || 0, acc.currency)}</div>
                  </div>
                  <button onClick={() => deleteAccount(acc.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TRANSACTIONS TAB */}
      {tab === 'transactions' && (
        <div className="space-y-4">
          {!showAddTx ? (
            <button onClick={() => setShowAddTx(true)} className="btn-blue btn-sm flex items-center gap-1">
              <Plus size={16} /> Add Transaction
            </button>
          ) : (
            <div className="card bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Add Transaction</h3>
                <button onClick={() => setShowAddTx(false)} className="text-gray-400"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select className="sel text-sm" value={txForm.type}
                    onChange={e => setTxForm({ ...txForm, type: e.target.value, from_account_id: '', to_account_id: '' })}>
                    <option value="expense">Expense</option>
                    <option value="income">Income / refund</option>
                    <option value="transfer">Transfer between accounts</option>
                    <option value="credit_card_purchase">Credit card purchase</option>
                    <option value="fee">Fee / interest</option>
                  </select>
                  <select className="sel text-sm" value={txForm.currency}
                    onChange={e => setTxForm({ ...txForm, currency: e.target.value, from_account_id: '', to_account_id: '' })}>
                    <option value="IDR">IDR</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <input type="number" className="inp w-full text-sm" placeholder="Amount"
                  value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: Number(e.target.value) })} />
                <label className="block text-xs font-semibold text-gray-600">
                  {txForm.type === 'income' ? 'Deposit to account' : txForm.type === 'credit_card_purchase' ? 'Credit card' : 'From account'}
                  <select className="sel w-full text-sm mt-1" value={txForm.from_account_id}
                    onChange={e => setTxForm({ ...txForm, from_account_id: e.target.value })}>
                    <option value="">Choose an account...</option>
                    {accounts.filter(a => a.currency === txForm.currency && (txForm.type === 'credit_card_purchase' ? a.type === 'credit_card' : a.type !== 'credit_card')).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </label>
                {txForm.type === 'transfer' && (
                  <label className="block text-xs font-semibold text-gray-600">To account
                    <select className="sel w-full text-sm mt-1" value={txForm.to_account_id}
                      onChange={e => setTxForm({ ...txForm, to_account_id: e.target.value })}>
                      <option value="">Choose a destination account...</option>
                      {accounts.filter(a => a.currency === txForm.currency && a.id !== txForm.from_account_id).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {txForm.type === 'credit_card_purchase' && <p className="text-xs text-gray-500">This purchase increases your card balance. Record the payment as a transfer from your bank account to the card.</p>}
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" className="inp text-sm" list="finance-category-options" placeholder="Category"
                    value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })} />
                  <input type="text" className="inp text-sm" placeholder="Merchant / income source"
                    value={txForm.merchant} onChange={e => setTxForm({ ...txForm, merchant: e.target.value })} />
                </div>
                <input type="text" className="inp w-full text-sm" placeholder="Note (optional)"
                  value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })} />
                <button type="button" onClick={() => receiptInputRef.current?.click()} className="btn-gray btn-sm flex items-center gap-1">
                  <FileText size={15} /> {receiptFile ? receiptFile.name : 'Lampirkan nota'}
                </button>
                <input type="date" className="sel w-full text-sm" value={txForm.transaction_date}
                  onChange={e => setTxForm({ ...txForm, transaction_date: e.target.value })} />
                <div className="flex gap-2">
                  <button onClick={addTransaction} disabled={saving} className="btn-blue text-sm flex-1">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setShowAddTx(false)} className="btn-gray text-sm flex-1">Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {transactions.length === 0 && <div className="card p-6 text-center text-sm text-gray-500">No transactions yet. Select “Add Transaction” to get started.</div>}
            {transactions.map(tx => (
                <div key={tx.id} className="card p-4 flex items-center justify-between gap-3 hover:bg-gray-50">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{tx.merchant || tx.category || tx.description}</div>
                  <div className="text-xs text-gray-500">{tx.transaction_date} • {transactionLabel(tx.type)}</div>
                </div>
                <div className={`font-bold text-sm mr-4 ${
                  tx.type === 'income' ? 'text-green-600' : tx.type === 'transfer' ? 'text-blue-600' : 'text-red-500'
                }`}>
                  {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔ ' : '−'}{formatMoney(tx.amount, tx.currency)}
                </div>
                {tx.receipt_path && <button onClick={() => openReceipt(tx.receipt_path)} className="btn-gray btn-sm">View receipt</button>}
                <button onClick={() => startEditTransaction(tx)} aria-label="Edit transaction name" title="Edit name or note" className="text-gray-400 hover:text-blue-600"><Pencil size={16}/></button>
                <button onClick={() => deleteTransaction(tx.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BUDGETS TAB */}
      {tab === 'budgets' && (
        <div className="space-y-4">
          {!showAddBudget ? (
            <button onClick={() => setShowAddBudget(true)} className="btn-blue btn-sm flex items-center gap-1">
              <Plus size={16} /> Set Budget
            </button>
          ) : (
            <div className="card bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Set Monthly Budget</h3>
                <button onClick={() => setShowAddBudget(false)} className="text-gray-400"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <input type="text" className="inp w-full text-sm" list="finance-category-options" placeholder="Category"
                  value={budgetForm.category} onChange={e => setBudgetForm({ ...budgetForm, category: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" className="inp text-sm" placeholder="Monthly limit"
                    value={budgetForm.monthly_limit} onChange={e => setBudgetForm({ ...budgetForm, monthly_limit: Number(e.target.value) })} />
                  <select className="sel text-sm" value={budgetForm.currency}
                    onChange={e => setBudgetForm({ ...budgetForm, currency: e.target.value })}>
                    <option value="IDR">IDR</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={addBudget} disabled={saving} className="btn-blue text-sm flex-1">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setShowAddBudget(false)} className="btn-gray text-sm flex-1">Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {budgets.length === 0 && <div className="card p-6 text-center text-sm text-gray-500">No budgets for this month yet. Set a limit for a spending category you want to track.</div>}
            {budgets.map(budget => {
              const key = categoryCurrencyKey(budget.category, budget.currency)
              const spent = spending[key] || 0
              const limit = Number(budget.monthly_limit)
              const percent = limit > 0 ? (spent / limit) * 100 : 0
              const isOver = spent > limit
              return (
                <div key={budget.id} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-bold">{budget.category}</div>
                    <button onClick={() => deleteBudget(budget.id)} className="text-gray-400 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mb-2">
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${isOver ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{formatMoney(spent, budget.currency)} / {formatMoney(budget.monthly_limit, budget.currency)}</span>
                    <span className={`font-bold ${isOver ? 'text-red-500' : 'text-green-500'}`}>
                      {percent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {tab === 'rmb' && (
        <div className="space-y-4">
          <div className="card p-5"><h2 className="font-bold text-lg">RMB / Yuan</h2><p className="text-sm text-gray-500">Shows CNY accounts and transactions only. Values are not converted to IDR.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div className="rounded-xl bg-gray-50 p-4"><div className="text-xs text-gray-500">Available balance</div><b className="text-xl">{formatMoney(balances.find(item => item.currency === 'CNY')?.available || 0, 'CNY')}</b></div>
              <div className="rounded-xl bg-gray-50 p-4"><div className="text-xs text-gray-500">Income this month</div><b className="text-xl text-green-600">{formatMoney(monthlyIncome.CNY || 0, 'CNY')}</b></div>
              <div className="rounded-xl bg-gray-50 p-4"><div className="text-xs text-gray-500">Spending this month</div><b className="text-xl text-red-500">{formatMoney(monthlySpending.CNY || 0, 'CNY')}</b></div>
            </div>
          </div>
          <div className="card p-4"><h3 className="font-bold mb-3">CNY Accounts</h3>
            {accounts.filter(item => item.currency === 'CNY').length === 0 ? <p className="text-sm text-gray-500">No CNY accounts yet. Add an account with CNY currency in Accounts.</p> : accounts.filter(item => item.currency === 'CNY').map(item => <div key={item.id} className="flex justify-between border-b py-3 text-sm"><span>{item.name}</span><b>{formatMoney(balanceById.get(item.id) || 0, 'CNY')}</b></div>)}
          </div>
          <div className="card p-4"><h3 className="font-bold mb-3">CNY Transactions</h3>
            {transactions.filter(tx => tx.currency === 'CNY').slice(0, 20).map(tx => <div key={tx.id} className="flex justify-between border-b py-3 text-sm"><span>{tx.transaction_date} · {tx.merchant || tx.category}</span><b>{transactionLabel(tx.type)} · {formatMoney(tx.amount, 'CNY')}</b></div>)}
            {transactions.filter(tx => tx.currency === 'CNY').length === 0 && <p className="text-sm text-gray-500">No CNY transactions yet.</p>}
          </div>
        </div>
      )}

      {tab === 'ccm' && (
        <div className="space-y-4">
          <div className="card p-5"><h2 className="font-bold text-lg">Credit Card Manager</h2><p className="text-sm text-gray-500">Track card balances, credit limits, statement dates, and payment due dates.</p></div>
          {accounts.filter(item => item.type === 'credit_card').map(card => {
            const debt = Math.max(0, balanceById.get(card.id) || 0)
            const limit = Number(card.credit_limit || 0)
            const used = limit > 0 ? Math.min(debt / limit * 100, 100) : 0
            return <div key={card.id} className="card p-5"><div className="flex justify-between gap-3"><div><h3 className="font-bold">{card.name}</h3><p className="text-xs text-gray-500">{card.bank_name || 'Credit card'}{card.account_number_last4 ? ' · •••• ' + card.account_number_last4 : ''}</p></div><div className="text-right"><div className="text-xs text-gray-500">Current card balance</div><b className="text-red-600">{formatMoney(debt, card.currency)}</b></div></div>
              <div className="mt-4"><div className="flex justify-between text-xs text-gray-500"><span>Limit: {formatMoney(limit, card.currency)}</span><span>{limit > 0 ? `${used.toFixed(0)}% used` : 'No limit set'}</span></div><div className="h-2 bg-gray-100 rounded-full mt-1"><div className={`h-2 rounded-full ${used >= 90 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${used}%` }} /></div></div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-sm"><div><div className="text-xs text-gray-400">Date cetak</div><b>{card.billing_cycle_day || 'Not set'}</b></div><div><div className="text-xs text-gray-400">Due date</div><b>{card.payment_due_day || 'Not set'}</b></div></div>
              {(card.last_statement_balance != null || card.minimum_payment != null) && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs"><b>Latest statement summary</b><div className="mt-1">{card.last_statement_month || ''} · Statement bill: {card.last_statement_balance == null ? '—' : formatMoney(card.last_statement_balance, card.currency)} · Minimum payment: {card.minimum_payment == null ? '—' : formatMoney(card.minimum_payment, card.currency)} · Due date: {card.statement_due_date || '—'}</div></div>}
              <button onClick={() => { setTab('transactions'); setTxForm({ ...txForm, type: 'transfer', currency: card.currency, to_account_id: card.id, from_account_id: '' }) }} className="btn-gray btn-sm mt-4">Record card payment</button>
            </div>
          })}
          {accounts.filter(item => item.type === 'credit_card').length === 0 && <div className="card p-6 text-sm text-gray-500">No credit cards yet. Add a credit card account in Accounts.</div>}
        </div>
      )}

      {tab === 'fixed' && (
        <div className="space-y-4">
          <div className="card p-5"><h2 className="font-bold text-lg">Fixed Expenses</h2><p className="text-sm text-gray-500">Recurring bills and due dates. This is a reminder; record a transaction when you pay.</p></div>
          <div className="card p-4"><div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input className="inp text-sm" placeholder="Bill name" value={fixedForm.name} onChange={e => setFixedForm({ ...fixedForm, name: e.target.value })} />
            <input className="inp text-sm" placeholder="Category" value={fixedForm.category} onChange={e => setFixedForm({ ...fixedForm, category: e.target.value })} />
            <input className="inp text-sm" type="number" min="1" placeholder="Amount" value={fixedForm.amount || ''} onChange={e => setFixedForm({ ...fixedForm, amount: Number(e.target.value) })} />
            <select className="sel text-sm" value={fixedForm.currency} onChange={e => setFixedForm({ ...fixedForm, currency: e.target.value })}><option value="IDR">IDR</option><option value="CNY">CNY</option><option value="USD">USD</option></select>
            <div className="flex gap-2"><input className="inp text-sm w-20" type="number" min="1" max="31" aria-label="Payment due day" value={fixedForm.due_day} onChange={e => setFixedForm({ ...fixedForm, due_day: Number(e.target.value) })} /><button onClick={addFixedExpense} disabled={saving} className="btn-blue btn-sm">Add</button></div>
          </div><p className="text-xs text-gray-400 mt-2">The last number is the due day (1–31).</p></div>
          <div className="space-y-2">{fixedExpenses.map(item => <div key={item.id} className="card p-4 flex items-center justify-between"><div><b>{item.name}</b><div className="text-xs text-gray-500">{item.category} · due on day {item.due_day}</div></div><div className="flex items-center gap-3"><b>{formatMoney(item.amount, item.currency)}</b><button onClick={() => archiveFixedExpense(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button></div></div>)}{fixedExpenses.length === 0 && <div className="card p-5 text-sm text-gray-500">No recurring bills yet.</div>}</div>
        </div>
      )}

      {tab === 'goals' && (
        <div className="space-y-4">
          <div className="card p-5"><h2 className="font-bold text-lg">Savings Goals</h2><p className="text-sm text-gray-500">Track your savings targets and progress. Progress here does not move money between accounts.</p></div>
          <div className="card p-4"><div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input className="inp text-sm" placeholder="Goal name" value={goalForm.name} onChange={e => setGoalForm({ ...goalForm, name: e.target.value })} />
            <input className="inp text-sm" type="number" min="1" placeholder="Target" value={goalForm.target_amount || ''} onChange={e => setGoalForm({ ...goalForm, target_amount: Number(e.target.value) })} />
            <select className="sel text-sm" value={goalForm.currency} onChange={e => setGoalForm({ ...goalForm, currency: e.target.value })}><option value="IDR">IDR</option><option value="CNY">CNY</option><option value="USD">USD</option></select>
            <input className="sel text-sm" type="date" aria-label="Date target" value={goalForm.target_date} onChange={e => setGoalForm({ ...goalForm, target_date: e.target.value })} />
            <button onClick={addGoal} disabled={saving} className="btn-blue btn-sm">Create goal</button>
          </div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{goals.map(goal => { const current = Number(goal.current_amount || 0); const target = Number(goal.target_amount || 0); const percent = target > 0 ? Math.min(current / target * 100, 100) : 0; return <div key={goal.id} className="card p-4"><div className="flex justify-between"><div><b>{goal.name}</b><div className="text-xs text-gray-500">{goal.target_date ? `Target ${goal.target_date}` : 'No target date'}</div></div><button onClick={() => archiveGoal(goal.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button></div><div className="mt-3 flex justify-between text-sm"><span>{formatMoney(current, goal.currency)}</span><b>{formatMoney(target, goal.currency)}</b></div><div className="h-2 bg-gray-100 rounded-full mt-1"><div className="h-2 bg-teal-500 rounded-full" style={{ width: `${percent}%` }} /></div><div className="text-xs text-gray-500 mt-1">{percent.toFixed(0)}% reached</div>{percent < 100 && <div className="flex gap-2 mt-3"><input className="inp text-sm" type="number" min="1" placeholder="Add progress" value={goalContributions[goal.id] || ''} onChange={e => setGoalContributions({ ...goalContributions, [goal.id]: e.target.value })} /><button onClick={() => addGoalContribution(goal)} className="btn-gray btn-sm">Save</button</div>}</div> })}{goals.length === 0 && <div className="card p-5 text-sm text-gray-500">No savings goals yet.</div>}</div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="card p-5"><h2 className="font-bold text-lg">Monthly Reports</h2><p className="text-sm text-gray-500">Income and spending summary for the selected month.</p></div>
          {summaryCurrencies.map(currency => {
            const periodRows = transactions.filter(tx => tx.currency === currency && tx.transaction_date?.startsWith(thisMonth))
            const income = periodRows.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + Number(tx.amount), 0)
            const expenses = periodRows.filter(tx => ['expense', 'fee', 'credit_card_purchase'].includes(tx.type)).reduce((sum, tx) => sum + Number(tx.amount), 0)
            const categories = new Map<string, number>()
            periodRows.filter(tx => ['expense', 'fee', 'credit_card_purchase'].includes(tx.type)).forEach(tx => categories.set(tx.category || 'Other', (categories.get(tx.category || 'Other') || 0) + Number(tx.amount)))
            return <div key={currency} className="card p-5"><h3 className="font-bold mb-3">{currency} · {selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3><div className="grid grid-cols-3 gap-2 text-sm mb-4"><div><div className="text-gray-400 text-xs">Income</div><b className="text-green-600">{formatMoney(income, currency)}</b></div><div><div className="text-gray-400 text-xs">Spending</div><b className="text-red-500">{formatMoney(expenses, currency)}</b></div><div><div className="text-gray-400 text-xs">Net</div><b>{formatMoney(income - expenses, currency)}</b></div></div><h4 className="font-semibold text-sm">Spending by category</h4>{Array.from(categories.entries()).map(([category, amount]) => <div key={category} className="flex justify-between border-b py-2 text-sm"><span>{category}</span><span>{formatMoney(amount, currency)}</span></div>)}{categories.size === 0 && <p className="text-sm text-gray-500 mt-2">No spending recorded this month.</p>}</div>
          })}
          {summaryCurrencies.length === 0 && <div className="card p-5 text-sm text-gray-500">No report data yet.</div>}
        </div>
      )}


      {editingTransaction && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-6" onClick={() => setEditingTransaction(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><div><h2 className="font-bold text-lg">Edit transaction</h2><p className="text-xs text-gray-500 mt-1">The amount and date will not change.</p></div><button onClick={() => setEditingTransaction(null)} className="text-gray-400"><X size={18}/></button></div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-600">Transaction name<input className="inp w-full mt-1" value={transactionEditForm.merchant} onChange={event => setTransactionEditForm({ ...transactionEditForm, merchant: event.target.value })} placeholder="For example: Lunch" /></label>
              <label className="block text-xs font-semibold text-gray-600">Category<input list="finance-category-options" className="inp w-full mt-1" value={transactionEditForm.category} onChange={event => setTransactionEditForm({ ...transactionEditForm, category: event.target.value })} placeholder="For example: Dining" /></label>
              <label className="block text-xs font-semibold text-gray-600">Note<input className="inp w-full mt-1" value={transactionEditForm.description} onChange={event => setTransactionEditForm({ ...transactionEditForm, description: event.target.value })} placeholder="Optional" /></label>
              <div className="flex gap-2 pt-1"><button onClick={saveTransactionText} disabled={saving} className="btn-blue btn-sm flex-1">{saving ? 'Saving…' : 'Save changes'}</button><button onClick={() => setEditingTransaction(null)} className="btn-gray btn-sm flex-1">Cancel</button></div>
            </div>
          </div>
        </div>
      )}

      {statementModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-6" onClick={() => { setStatementModal(false); setStatementPassword(''); setStatementFiles([]) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4"><div><h2 className="font-bold text-lg">Import Multiple E-Statement PDFs</h2><p className="text-xs text-gray-500 mt-1">PDFs and passwords are read in this browser only. Select multiple PDFs; only transactions you approve will be saved.</p><p className="text-xs text-amber-700 mt-1">Each batch must use PDFs for the same account and statement type, with the same password. Create a separate batch for each account. The month is detected from the filename (for example: BCA January 2026.pdf); if missing, the planner uses the month selected on this page.</p></div><button onClick={() => { setStatementModal(false); setStatementPassword(''); setStatementFiles([]) }} className="text-gray-400"><X size={18}/></button></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <label className="text-xs font-semibold text-gray-600">Statement type<select className="sel w-full mt-1" value={statementKind} onChange={event => { setStatementKind(event.target.value as PdfStatementKind); setStatementAccountId(''); setStatementDrafts([]) }}><option value="debit">Bank account</option><option value="credit_card">Credit card</option></select></label>
              <label className="text-xs font-semibold text-gray-600">Matching account<select className="sel w-full mt-1" value={statementAccountId} onChange={event => setStatementAccountId(event.target.value)}><option value="">Choose an account...</option>{accounts.filter(account => statementKind === 'credit_card' ? account.type === 'credit_card' : account.type !== 'credit_card').map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
              <label className="text-xs font-semibold text-gray-600">PDF password (if required)<input className="inp w-full mt-1" type="password" autoComplete="new-password" value={statementPassword} onChange={event => setStatementPassword(event.target.value)} placeholder="Only used to open this file" /></label>
            </div>
            <div className="mb-4"><div className="max-h-24 overflow-y-auto text-xs text-gray-500 mb-2">{statementFiles.length ? statementFiles.map(file => <div key={file.name}>{file.name}</div>) : 'No PDF selected'}</div><button onClick={readStatementPdf} disabled={!statementFiles.length || statementBusy} className="btn-blue btn-sm">{statementBusy ? 'Reading PDFs…' : `Read ${statementFiles.length} PDFs on this device`}</button></div>
              {statementDrafts.length > 0 && <>
              <div className="rounded-lg bg-amber-50 text-amber-800 p-3 text-xs mb-3">Review dates, amounts, types, and categories before saving. Scanned image PDFs are not supported yet. Credit card payments are unselected by default to avoid counting a payment twice when it is also listed in your bank account.</div>
              {statementSummary && (statementSummary.currentBill !== null || statementSummary.minimumPayment !== null || statementSummary.closing !== null) && <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">{statementKind === 'credit_card' ? <><div className="card p-3 text-xs">Previous statement bill<br/><b>{statementSummary.previousBill === null ? '—' : formatMoney(statementSummary.previousBill, accounts.find(item=>item.id===statementAccountId)?.currency || 'IDR')}</b></div><div className="card p-3 text-xs">Current statement bill<br/><b>{statementSummary.currentBill === null ? '—' : formatMoney(statementSummary.currentBill, accounts.find(item=>item.id===statementAccountId)?.currency || 'IDR')}</b></div><div className="card p-3 text-xs">Minimum payment<br/><b>{statementSummary.minimumPayment === null ? '—' : formatMoney(statementSummary.minimumPayment, accounts.find(item=>item.id===statementAccountId)?.currency || 'IDR')}</b></div><div className="card p-3 text-xs">Due date<br/><b>{statementSummary.dueDate || '—'}</b></div></> : <><div className="card p-3 text-xs">Opening balance<br/><b>{statementSummary.opening === null ? '—' : formatMoney(statementSummary.opening, accounts.find(item=>item.id===statementAccountId)?.currency || 'IDR')}</b></div><div className="card p-3 text-xs">Credits (CR)<br/><b>{statementSummary.credits === null ? '—' : formatMoney(statementSummary.credits, accounts.find(item=>item.id===statementAccountId)?.currency || 'IDR')}</b></div><div className="card p-3 text-xs">Debits (DB)<br/><b>{statementSummary.debits === null ? '—' : formatMoney(statementSummary.debits, accounts.find(item=>item.id===statementAccountId)?.currency || 'IDR')}</b></div><div className="card p-3 text-xs">Closing balance<br/><b>{statementSummary.closing === null ? '—' : formatMoney(statementSummary.closing, accounts.find(item=>item.id===statementAccountId)?.currency || 'IDR')}</b></div></>}</div>}
              {statementKind === 'debit' && statementDrafts.some(row => row.type === 'transfer') && <label className="block text-xs font-semibold text-gray-600 mb-3">Destination account for card transfer<select className="sel mt-1 w-full" value={statementTransferAccountId} onChange={event => setStatementTransferAccountId(event.target.value)}><option value="">Choose a destination account...</option>{accounts.filter(account => account.currency === accounts.find(item => item.id === statementAccountId)?.currency && account.id !== statementAccountId).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
              <div className="overflow-x-auto border rounded-xl"><table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="p-2">Include</th><th className="p-2">PDF source</th><th className="p-2">Date</th><th className="p-2">Description</th><th className="p-2">Amount</th><th className="p-2">Type</th><th className="p-2">Category</th></tr></thead><tbody>{statementDrafts.map((row,index)=><tr key={row.id} className="border-t"><td className="p-2 text-center"><input type="checkbox" checked={row.include} onChange={event=>setStatementDrafts(statementDrafts.map((item,i)=>i===index?{...item,include:event.target.checked}:item))}/></td><td className="p-2 max-w-40 truncate" title={row.sourceFile}>{row.sourceFile}</td><td className="p-2"><input className="inp w-32 text-xs" type="date" value={row.date} onChange={event=>setStatementDrafts(statementDrafts.map((item,i)=>i===index?{...item,date:event.target.value}:item))}/></td><td className="p-2"><input className="inp min-w-48 text-xs" value={row.merchant} onChange={event=>setStatementDrafts(statementDrafts.map((item,i)=>i===index?{...item,merchant:event.target.value}:item))}/></td><td className="p-2"><input className="inp w-28 text-xs" type="number" min="0" step="0.01" value={row.amount} onChange={event=>setStatementDrafts(statementDrafts.map((item,i)=>i===index?{...item,amount:Number(event.target.value)}:item))}/></td><td className="p-2"><select className="sel text-xs" value={row.type} onChange={event=>setStatementDrafts(statementDrafts.map((item,i)=>i===index?{...item,type:event.target.value,include:event.target.value!=='skip'}:item))}>{statementKind==='credit_card'?<><option value="credit_card_purchase">Card purchase</option><option value="income">Refund</option><option value="fee">Fee / interest</option><option value="skip">Skip (for example, card payment)</option></>:<><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option><option value="fee">Fee</option><option value="skip">Skip</option></>}</select></td><td className="p-2"><input className="inp w-28 text-xs" list="finance-category-options" value={row.category} onChange={event=>setStatementDrafts(statementDrafts.map((item,i)=>i===index?{...item,category:event.target.value}:item))}/></td></tr>)}</tbody></table></div>
              <div className="flex justify-end gap-2 mt-4"><button onClick={importStatementDrafts} disabled={saving} className="btn-blue btn-sm">Save selected transactions ({statementDrafts.filter(row=>row.include&&row.type!=='skip').length})</button></div>
            </>}
          </div>
        </div>
      )}
    </div>
  )
}
