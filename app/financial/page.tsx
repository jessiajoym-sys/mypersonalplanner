'use client'
import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, X, Eye, EyeOff, Camera, Upload, FileText } from 'lucide-react'

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function formatMoney(amount: number | string | null | undefined, currency: string) {
  const value = Number(amount || 0)
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return currency + ' ' + value.toLocaleString('id-ID')
  }
}

function categoryCurrencyKey(category: string, currency: string) {
  return String(category || 'Lainnya').trim().toLocaleLowerCase() + '-' + currency
}

function transactionLabel(type: string) {
  if (type === 'income') return 'Pemasukan'
  if (type === 'transfer') return 'Transfer'
  if (type === 'credit_card_purchase') return 'Belanja kartu kredit'
  if (type === 'fee') return 'Biaya admin'
  return 'Pengeluaran'
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

export default function FinancialPlanner() {
  const [user, setUser] = useState<any>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [budgets, setBudgets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [showBalances, setShowBalances] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

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
  const [budgetForm, setBudgetForm] = useState({
    category: '',
    monthly_limit: 0,
    currency: 'IDR'
  })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const { data: { user: u }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!u) {
        setUser(null)
        setAccounts([])
        setTransactions([])
        setBudgets([])
        setToast('Silakan masuk untuk melihat data keuangan.')
        return false
      }
      setUser(u)

      const [
        { data: accts, error: accountsError },
        { data: txs, error: transactionsError },
        { data: bdgs, error: budgetsError }
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
          .eq('budget_month', localDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
          .is('deleted_at', null)
      ])

      const queryError = accountsError || transactionsError || budgetsError
      if (queryError) throw queryError

      setAccounts(accts || [])
      setTransactions(txs || [])
      setBudgets(bdgs || [])
      return true
    } catch (error: any) {
      setToast('Data gagal dimuat: ' + (error?.message || 'Periksa koneksi dan pengaturan database.'))
      return false
    } finally {
      setLoading(false)
    }
  }

  // Add Account
  async function addAccount() {
    if (!user) {
      setToast('Silakan masuk dulu untuk menyimpan akun.')
      return
    }
    const openingBalance = Number(accountForm.opening_balance)
    if (!accountForm.name.trim()) {
      setToast('Nama akun perlu diisi.')
      return
    }
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      setToast('Saldo awal harus berupa angka nol atau lebih.')
      return
    }
    if (accountForm.account_number_last4 && !/^\d{4}$/.test(accountForm.account_number_last4)) {
      setToast('Isi tepat 4 angka terakhir rekening, atau kosongkan.')
      return
    }
    if (accountForm.type === 'credit_card' && (!accountForm.credit_limit || Number(accountForm.credit_limit) <= 0)) {
      setToast('Masukkan limit kartu kredit yang valid.')
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
      setToast(refreshed ? 'Akun berhasil disimpan.' : 'Akun terkirim, tetapi daftar gagal dimuat ulang.')
    } catch (error: any) {
      setToast('Akun gagal disimpan: ' + (error?.message || 'Periksa koneksi dan pengaturan database.'))
    } finally {
      setSaving(false)
    }
  }

  // Tambah Transaksi
  async function addTransaction() {
    if (!user) {
      setToast('Silakan masuk dulu untuk menyimpan transaksi.')
      return
    }
    const amount = Number(txForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast('Masukkan jumlah transaksi yang lebih besar dari nol.')
      return
    }
    if (!txForm.category.trim()) {
      setToast('Pilih kategori agar pengeluaranmu mudah dirapikan.')
      return
    }
    if (!txForm.from_account_id) {
      setToast('Pilih akun untuk transaksi ini.')
      return
    }
    if (txForm.type === 'transfer' && !txForm.to_account_id) {
      setToast('Pilih akun tujuan transfer.')
      return
    }
    if (txForm.type === 'transfer' && txForm.from_account_id === txForm.to_account_id) {
      setToast('Akun asal dan tujuan harus berbeda.')
      return
    }
    const sourceAccount = accounts.find(a => a.id === txForm.from_account_id)
    const destinationAccount = accounts.find(a => a.id === txForm.to_account_id)
    if (!sourceAccount || sourceAccount.currency !== txForm.currency ||
        (txForm.type === 'transfer' && (!destinationAccount || destinationAccount.currency !== txForm.currency))) {
      setToast('Pilih akun dengan mata uang yang sama seperti transaksi.')
      return
    }
    if (txForm.type === 'credit_card_purchase' && sourceAccount.type !== 'credit_card') {
      setToast('Untuk belanja kartu kredit, pilih akun yang bertipe kartu kredit.')
      return
    }
    if (txForm.type !== 'credit_card_purchase' && sourceAccount.type === 'credit_card') {
      setToast('Pilih rekening atau tunai. Belanja kartu kredit dicatat lewat jenis transaksi khusus.')
      return
    }

    if (receiptFile && receiptFile.size > 10 * 1024 * 1024) {
      setToast('Ukuran nota maksimal 10 MB.')
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
      setToast(refreshed ? 'Transaksi berhasil disimpan.' : 'Transaksi terkirim, tetapi daftar gagal dimuat ulang.')
    } catch (error: any) {
      setToast('Transaksi gagal disimpan: ' + (error?.message || 'Periksa koneksi dan pengaturan database.'))
    } finally {
      setSaving(false)
    }
  }

  async function openReceipt(path: string) {
    if (!path) return
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
    if (error || !data?.signedUrl) {
      setToast('Nota tidak bisa dibuka: ' + (error?.message || 'tautan gagal dibuat.'))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  // Add Budget
  async function addBudget() {
    if (!user) {
      setToast('Silakan masuk dulu untuk menyimpan budget.')
      return
    }
    const limit = Number(budgetForm.monthly_limit)
    if (!budgetForm.category.trim()) {
      setToast('Nama kategori perlu diisi.')
      return
    }
    if (!Number.isFinite(limit) || limit <= 0) {
      setToast('Batas budget harus lebih besar dari nol.')
      return
    }
    if (budgets.some(b => String(b.category || '').trim().toLowerCase() === budgetForm.category.trim().toLowerCase() && b.currency === budgetForm.currency)) {
      setToast('Budget untuk kategori dan mata uang ini sudah ada bulan ini.')
      return
    }

    setSaving(true)
    try {
      const today = new Date()
      const thisMonth = localDateString(new Date(today.getFullYear(), today.getMonth(), 1))
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
      setToast(refreshed ? 'Budget berhasil disimpan.' : 'Budget terkirim, tetapi daftar gagal dimuat ulang.')
    } catch (error: any) {
      setToast('Budget gagal disimpan: ' + (error?.message || 'Periksa koneksi dan pengaturan database.'))
    } finally {
      setSaving(false)
    }
  }

  // Delete
  async function deleteAccount(id: string) {
    if (!confirm('Yakin ingin menghapus atau mengarsipkan data ini?')) return
    const { error } = await supabase.from('accounts').update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    if (error) { setToast('Gagal mengarsipkan akun: ' + error.message); return }
    setToast('Akun berhasil diarsipkan.')
    load()
  }

  async function deleteTransaction(id: string) {
    if (!confirm('Yakin ingin menghapus atau mengarsipkan data ini?')) return
    const { error } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    if (error) { setToast('Gagal menghapus transaksi: ' + error.message); return }
    setToast('Transaksi berhasil dihapus.')
    load()
  }

  async function deleteBudget(id: string) {
    if (!confirm('Delete?')) return
    const { error } = await supabase.from('budgets').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    if (error) { setToast('Gagal menghapus budget: ' + error.message); return }
    setToast('Budget berhasil dihapus.')
    load()
  }

  async function importCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!user) { setToast('Silakan masuk dulu untuk mengimpor transaksi.'); return }
    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) { setToast('CSV kosong atau tidak memiliki baris transaksi.'); return }
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
          category: cell(row, 'category', 'kategori') || (type === 'income' ? 'Pemasukan' : 'Lainnya'),
          merchant: cell(row, 'merchant', 'description', 'details', 'keterangan', 'deskripsi', 'toko') || null,
          description: cell(row, 'notes', 'catatan') || null,
          transaction_date: date, source: 'csv',
        })
      }
      if (!valid.length) {
        setToast('Tidak ada baris valid. Pastikan CSV berisi tanggal, jumlah, dan nama akun yang cocok.')
        return
      }
      if (!window.confirm('Impor ' + valid.length + ' transaksi valid?' + (skipped ? ' ' + skipped + ' baris tidak valid akan dilewati.' : ''))) return
      setSaving(true)
      const { error } = await supabase.from('transactions').insert(valid)
      if (error) throw error
      const refreshed = await load()
      setToast(refreshed ? valid.length + ' transaksi berhasil diimpor.' : 'Transaksi diimpor, tetapi daftar gagal dimuat ulang.')
    } catch (error: any) {
      setToast('CSV gagal diimpor: ' + (error?.message || 'Periksa format CSV dan izin database.'))
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
    const amount = Number(tx.amount || 0)
    const source = accounts.find(account => account.id === tx.from_account_id)
    const destination = accounts.find(account => account.id === tx.to_account_id)
    if (tx.type === 'income' && source) {
      balanceById.set(source.id, (balanceById.get(source.id) || 0) + amount)
    } else if (tx.type === 'transfer' && source) {
      balanceById.set(source.id, (balanceById.get(source.id) || 0) - amount)
      if (destination) {
        // A payment transfer to a card reduces the amount owed.
        const delta = destination.type === 'credit_card' ? -amount : amount
        balanceById.set(destination.id, (balanceById.get(destination.id) || 0) + delta)
      }
    } else if (tx.type === 'credit_card_purchase' && source?.type === 'credit_card') {
      balanceById.set(source.id, (balanceById.get(source.id) || 0) + amount)
    } else if (['expense', 'fee'].includes(tx.type) && source) {
      balanceById.set(source.id, (balanceById.get(source.id) || 0) - amount)
    }
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

  const thisMonth = localDateString().slice(0, 7)
  const monthlyIncome: any = {}
  const monthlySpending: any = {}
  transactions.forEach(tx => {
    if (!tx.transaction_date?.startsWith(thisMonth)) return
    if (tx.type === 'income') monthlyIncome[tx.currency] = (monthlyIncome[tx.currency] || 0) + Number(tx.amount)
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
    if (tx.transaction_date.startsWith(thisMonth) && 
        ['expense', 'credit_card_purchase', 'fee'].includes(tx.type)) {
      const key = categoryCurrencyKey(tx.category, tx.currency)
      if (!spending[key]) spending[key] = 0
      spending[key] += Number(tx.amount)
    }
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">💰 Keuangan</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => receiptInputRef.current?.click()} className="btn-gray btn-sm flex items-center gap-1"><Camera size={16} /> Pilih Nota</button>
          <button onClick={() => csvInputRef.current?.click()} className="btn-gray btn-sm flex items-center gap-1"><Upload size={16} /> Impor CSV</button>
          <button onClick={() => { setTab('transactions'); setShowAddTx(true) }} className="btn-blue btn-sm flex items-center gap-1"><Plus size={16} /> Tambah Transaksi</button>
          <button onClick={() => setShowBalances(!showBalances)} className="btn-gray btn-sm">
          {showBalances ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsvFile} />
          <input ref={receiptInputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
            onChange={event => {
              const file = event.target.files?.[0] || null
              event.target.value = ''
              if (!file) return
              if (!file.type.startsWith('image/') && file.type !== 'application/pdf') { setToast('Pilih foto atau PDF nota.'); return }
              if (file.size > 10 * 1024 * 1024) { setToast('Ukuran nota maksimal 10 MB.'); return }
              setReceiptFile(file)
              setShowAddTx(true)
              setTab('transactions')
              setToast('Nota terpilih. Isi detail transaksi secara manual, lalu simpan untuk melampirkan file. Data nota belum dibaca otomatis.')
            }} />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between ${toast.toLowerCase().includes('gagal') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-green-500"><X size={16} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {['dashboard', 'accounts', 'transactions', 'budgets'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t === 'dashboard' && '📊 Ringkasan'}
            {t === 'accounts' && '🏦 Akun'}
            {t === 'transactions' && '📝 Transaksi'}
            {t === 'budgets' && '💳 Budget'}
          </button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* Balances */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {balances.map(b => (
              <div key={b.currency} className="card">
                <div className="text-xs font-bold text-gray-400 uppercase mb-2">{b.currency} · Uang tersedia</div>
                <div className="text-2xl font-bold mb-4">
                  {showBalances ? `${formatMoney(b.available, b.currency)}` : '••••••'}
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  {b.accounts.map((a: any) => (
                    <div key={a.id} className="flex justify-between">
                      <span>{a.name}</span>
                      <span className={a.type === 'credit_card' ? 'text-red-500' : ''}>
                        {showBalances ? formatMoney(balanceById.get(a.id) || 0, b.currency) : '••••••'}
                      </span>
                    </div>
                  ))}
                </div>
                {b.cardDebt > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-red-600">
                    Tagihan kartu kredit: {showBalances ? formatMoney(b.cardDebt, b.currency) : '••••••'}
                  </div>
                )}
              </div>
            ))}
            {balances.length === 0 && (
              <div className="card p-5 text-sm text-gray-500 md:col-span-3">Belum ada akun. Tambahkan akun untuk mulai mencatat saldo.</div>
            )}
          </div>

          {/* Ringkasan arus uang bulanan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summaryCurrencies.map(currency => {
              const income = monthlyIncome[currency] || 0
              const spent = monthlySpending[currency] || 0
              const budget = budgets.filter(item => item.currency === currency)
                .reduce((sum: number, item: any) => sum + Number(item.monthly_limit || 0), 0)
              const percent = budget > 0 ? spent / budget * 100 : 0
              return (
                <div key={currency} className="card p-4">
                  <div className="font-bold mb-3">Ringkasan {currency} bulan ini</div>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <div><div className="text-gray-400">Pemasukan</div><div className="font-semibold text-green-600">{formatMoney(income, currency)}</div></div>
                    <div><div className="text-gray-400">Pengeluaran</div><div className="font-semibold text-red-500">{formatMoney(spent, currency)}</div></div>
                    <div><div className="text-gray-400">Selisih</div><div className={`font-semibold ${income - spent >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatMoney(income - spent, currency)}</div></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Budget terpakai</span><span>{budget > 0 ? `${percent.toFixed(0)}%` : 'Belum diatur'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className={`h-2 rounded-full ${percent > 100 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${Math.min(percent, 100)}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 mt-2">{formatMoney(spent, currency)} dari {formatMoney(budget, currency)}</div>
                </div>
              )
            })}
            {summaryCurrencies.length === 0 && <div className="card p-4 text-sm text-gray-500 md:col-span-2">Tambahkan akun atau transaksi untuk melihat ringkasan bulanan.</div>}
          </div>

          {/* Transaksi Terbaru */}
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-100 mb-3 font-bold">Transaksi Terbaru</div>
            <div className="divide-y divide-gray-50">
              {transactions.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">Belum ada transaksi.</div>
              ) : (
                transactions.slice(0, 5).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                    <div>
                      <div className="font-semibold text-sm">{tx.merchant || tx.description || tx.category}</div>
                      <div className="text-xs text-gray-400">{tx.transaction_date} · {transactionLabel(tx.type)}</div>
                    </div>
                    <div className={`font-bold text-sm ${
                      tx.type === 'income' ? 'text-green-600' : tx.type === 'transfer' ? 'text-blue-600' : 'text-red-500'
                    }`}>
                      {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔ ' : '−'}{formatMoney(tx.amount, tx.currency)}
                    </div>
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
              <Plus size={16} /> Tambah Akun
            </button>
          ) : (
            <div className="card bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Tambah Akun</h3>
                <button onClick={() => setShowAddAccount(false)} className="text-gray-400"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <input type="text" className="inp w-full text-sm" placeholder="Nama akun"
                  value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" className="inp text-sm" placeholder="Nama bank"
                    value={accountForm.bank_name} onChange={e => setAccountForm({ ...accountForm, bank_name: e.target.value })} />
                  <input type="text" inputMode="numeric" maxLength={4} className="inp text-sm" placeholder="4 angka terakhir nomor akun"
                    value={accountForm.account_number_last4}
                    onChange={e => setAccountForm({ ...accountForm, account_number_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select className="sel text-sm" value={accountForm.type}
                    onChange={e => setAccountForm({ ...accountForm, type: e.target.value })}>
                    <option value="bank">Rekening bank</option>
                    <option value="credit_card">Kartu kredit</option>
                    <option value="ewallet">Dompet digital</option>
                    <option value="cash">Tunai</option>
                  </select>
                  <select className="sel text-sm" value={accountForm.currency}
                    onChange={e => setAccountForm({ ...accountForm, currency: e.target.value })}>
                    <option value="IDR">IDR</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <input type="number" className="inp w-full text-sm" placeholder={accountForm.type === 'credit_card' ? 'Tagihan kartu saat ini (0 jika belum ada)' : 'Saldo awal'}
                  value={accountForm.opening_balance} onChange={e => setAccountForm({ ...accountForm, opening_balance: Number(e.target.value) })} />
                {accountForm.type === 'credit_card' && (
                  <>
                    <input type="number" className="inp w-full text-sm" placeholder="Limit kartu kredit"
                      value={accountForm.credit_limit || ''} onChange={e => setAccountForm({ ...accountForm, credit_limit: Number(e.target.value) })} />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" className="inp text-sm" placeholder="Tanggal tagihan"
                        value={accountForm.billing_cycle_day || ''} onChange={e => setAccountForm({ ...accountForm, billing_cycle_day: Number(e.target.value) })} />
                      <input type="number" className="inp text-sm" placeholder="Tanggal jatuh tempo"
                        value={accountForm.payment_due_day || ''} onChange={e => setAccountForm({ ...accountForm, payment_due_day: Number(e.target.value) })} />
                    </div>
                  </>
                )}
                <div className="flex gap-2">
                  <button onClick={addAccount} disabled={saving} className="btn-blue text-sm flex-1">
                    {saving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button onClick={() => setShowAddAccount(false)} className="btn-gray text-sm flex-1">Batal</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {accounts.length === 0 && <div className="card p-6 text-center text-sm text-gray-500">Belum ada akun. Tambahkan rekening, kartu, e-wallet, atau uang tunai untuk mulai.</div>}
            {accounts.map(acc => (
              <div key={acc.id} className="card p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-bold">{acc.name}</div>
                    <div className="text-xs text-gray-500">
                      {[acc.bank_name, acc.account_number_last4 ? '•••• ' + acc.account_number_last4 : null].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-xs text-gray-500">{acc.type === 'credit_card' ? 'Kartu kredit' : acc.type === 'ewallet' ? 'Dompet digital' : acc.type === 'cash' ? 'Tunai' : 'Bank'} • {formatMoney(balanceById.get(acc.id) || 0, acc.currency)}</div>
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
              <Plus size={16} /> Catat Transaksi
            </button>
          ) : (
            <div className="card bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Catat Transaksi</h3>
                <button onClick={() => setShowAddTx(false)} className="text-gray-400"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select className="sel text-sm" value={txForm.type}
                    onChange={e => setTxForm({ ...txForm, type: e.target.value, from_account_id: '', to_account_id: '' })}>
                    <option value="expense">Pengeluaran</option>
                    <option value="income">Pemasukan</option>
                    <option value="transfer">Transfer antar akun</option>
                    <option value="credit_card_purchase">Belanja kartu kredit</option>
                    <option value="fee">Biaya admin</option>
                  </select>
                  <select className="sel text-sm" value={txForm.currency}
                    onChange={e => setTxForm({ ...txForm, currency: e.target.value, from_account_id: '', to_account_id: '' })}>
                    <option value="IDR">IDR</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <input type="number" className="inp w-full text-sm" placeholder="Jumlah transaksi"
                  value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: Number(e.target.value) })} />
                <label className="block text-xs font-semibold text-gray-600">
                  {txForm.type === 'income' ? 'Masuk ke akun' : txForm.type === 'credit_card_purchase' ? 'Kartu kredit' : 'Dari akun'}
                  <select className="sel w-full text-sm mt-1" value={txForm.from_account_id}
                    onChange={e => setTxForm({ ...txForm, from_account_id: e.target.value })}>
                    <option value="">Pilih akun terkait...</option>
                    {accounts.filter(a => a.currency === txForm.currency && (txForm.type === 'credit_card_purchase' ? a.type === 'credit_card' : a.type !== 'credit_card')).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </label>
                {txForm.type === 'transfer' && (
                  <label className="block text-xs font-semibold text-gray-600">Ke akun tujuan
                    <select className="sel w-full text-sm mt-1" value={txForm.to_account_id}
                      onChange={e => setTxForm({ ...txForm, to_account_id: e.target.value })}>
                      <option value="">Pilih akun tujuan...</option>
                      {accounts.filter(a => a.currency === txForm.currency && a.id !== txForm.from_account_id).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {txForm.type === 'credit_card_purchase' && <p className="text-xs text-gray-500">Belanja ini menambah tagihan kartu. Pembayarannya dicatat sebagai transfer dari rekening ke kartu kredit.</p>}
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" className="inp text-sm" placeholder="Kategori"
                    value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })} />
                  <input type="text" className="inp text-sm" placeholder="Toko / sumber pemasukan"
                    value={txForm.merchant} onChange={e => setTxForm({ ...txForm, merchant: e.target.value })} />
                </div>
                <input type="text" className="inp w-full text-sm" placeholder="Catatan (opsional)"
                  value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })} />
                <button type="button" onClick={() => receiptInputRef.current?.click()} className="btn-gray btn-sm flex items-center gap-1">
                  <FileText size={15} /> {receiptFile ? receiptFile.name : 'Lampirkan nota'}
                </button>
                <input type="date" className="sel w-full text-sm" value={txForm.transaction_date}
                  onChange={e => setTxForm({ ...txForm, transaction_date: e.target.value })} />
                <div className="flex gap-2">
                  <button onClick={addTransaction} disabled={saving} className="btn-blue text-sm flex-1">
                    {saving ? 'Menyimpan…' : 'Save'}
                  </button>
                  <button onClick={() => setShowAddTx(false)} className="btn-gray text-sm flex-1">Batal</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {transactions.length === 0 && <div className="card p-6 text-center text-sm text-gray-500">Belum ada transaksi. Tekan “Catat Transaksi” untuk mulai.</div>}
            {transactions.map(tx => (
              <div key={tx.id} className="card p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{tx.merchant || tx.category || tx.description}</div>
                  <div className="text-xs text-gray-500">{tx.transaction_date} • {transactionLabel(tx.type)}</div>
                </div>
                <div className={`font-bold text-sm mr-4 ${
                  tx.type === 'income' ? 'text-green-600' : tx.type === 'transfer' ? 'text-blue-600' : 'text-red-500'
                }`}>
                  {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔ ' : '−'}{formatMoney(tx.amount, tx.currency)}
                </div>
                {tx.receipt_path && <button onClick={() => openReceipt(tx.receipt_path)} className="btn-gray btn-sm">Lihat nota</button>}
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
              <Plus size={16} /> Atur Budget
            </button>
          ) : (
            <div className="card bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Atur Budget Bulanan</h3>
                <button onClick={() => setShowAddBudget(false)} className="text-gray-400"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <input type="text" className="inp w-full text-sm" placeholder="Kategori"
                  value={budgetForm.category} onChange={e => setBudgetForm({ ...budgetForm, category: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" className="inp text-sm" placeholder="Batas per bulan"
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
                    {saving ? 'Menyimpan…' : 'Save'}
                  </button>
                  <button onClick={() => setShowAddBudget(false)} className="btn-gray text-sm flex-1">Batal</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {budgets.length === 0 && <div className="card p-6 text-center text-sm text-gray-500">Belum ada budget bulan ini. Buat batas untuk kategori pengeluaran yang ingin kamu pantau.</div>}
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
    </div>
  )
}
