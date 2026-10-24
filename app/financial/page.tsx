'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, X, Eye, EyeOff } from 'lucide-react'

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

function transactionLabel(type: string) {
  if (type === 'income') return 'Pemasukan'
  if (type === 'transfer') return 'Transfer'
  if (type === 'credit_card_purchase') return 'Belanja kartu kredit'
  if (type === 'fee') return 'Biaya admin'
  return 'Pengeluaran'
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

  // Account Form
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [accountForm, setAccountForm] = useState({
    name: '',
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
    if (accountForm.type === 'credit_card' && (!accountForm.credit_limit || Number(accountForm.credit_limit) <= 0)) {
      setToast('Masukkan limit kartu kredit yang valid.')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('accounts').insert({
        user_id: user.id,
        name: accountForm.name.trim(),
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

  // Add Transaction
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

    setSaving(true)
    try {
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
        source: 'manual'
      })
      if (error) throw error

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
      const refreshed = await load()
      setToast(refreshed ? 'Transaksi berhasil disimpan.' : 'Transaksi terkirim, tetapi daftar gagal dimuat ulang.')
    } catch (error: any) {
      setToast('Transaksi gagal disimpan: ' + (error?.message || 'Periksa koneksi dan pengaturan database.'))
    } finally {
      setSaving(false)
    }
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

  if (loading) return <div className="p-6 text-center text-gray-400">Loading...</div>

  // Dashboard Calculations
  const accountsByCurrency = accounts.reduce((acc: any, a: any) => {
    if (!acc[a.currency]) acc[a.currency] = []
    acc[a.currency].push(a)
    return acc
  }, {})

  const balances = Object.entries(accountsByCurrency).map(([currency, accts]: any) => {
    const moneyAccounts = accts.filter((a: any) => a.type !== 'credit_card')
    const cards = accts.filter((a: any) => a.type === 'credit_card')
    return {
      currency,
      available: moneyAccounts.reduce((sum: number, a: any) => sum + Number(a.current_balance || 0), 0),
      cardDebt: cards.reduce((sum: number, a: any) => sum + Number(a.current_balance || 0), 0),
      accounts: accts
    }
  })

  const thisMonth = localDateString().slice(0, 7)
  const monthlySpending: any = {}
  transactions.forEach(tx => {
    if (tx.transaction_date.startsWith(thisMonth) && 
        ['expense', 'credit_card_purchase', 'fee'].includes(tx.type)) {
      if (!monthlySpending[tx.currency]) monthlySpending[tx.currency] = 0
      monthlySpending[tx.currency] += Number(tx.amount)
    }
  })

  const spending: any = {}
  transactions.forEach(tx => {
    if (tx.transaction_date.startsWith(thisMonth) && 
        ['expense', 'credit_card_purchase', 'fee'].includes(tx.type)) {
      const key = `${tx.category}-${tx.currency}`
      if (!spending[key]) spending[key] = 0
      spending[key] += Number(tx.amount)
    }
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">💰 Keuangan</h1>
        <button onClick={() => setShowBalances(!showBalances)} className="btn-gray btn-sm">
          {showBalances ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
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
                        {showBalances ? formatMoney(a.current_balance, b.currency) : '••••••'}
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

          {/* Monthly Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(monthlySpending).map(([currency, spent]: any) => {
              const budget = budgets
                .filter(b => b.currency === currency)
                .reduce((sum: number, b: any) => sum + Number(b.monthly_limit), 0)
              
              return (
                <div key={currency} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold">{currency} This Month</h3>
                    <span className={spent > budget ? 'text-red-500 font-bold' : budget === 0 ? 'text-gray-500 font-bold' : 'text-green-500 font-bold'}>
                      {budget > 0 ? ((spent / budget) * 100).toFixed(0) : '0'}%
                    </span>
                  </div>
                  <div className="mb-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${spent > budget ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ width: `${budget > 0 ? Math.min((spent / budget) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Terpakai: {formatMoney(spent, currency)} / Budget: {formatMoney(budget, currency)}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Transaksi Terbaru */}
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-100 mb-3 font-bold">Recent Transactions</div>
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
                <input type="number" className="inp w-full text-sm" placeholder="Saldo awal"
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
            {accounts.map(acc => (
              <div key={acc.id} className="card p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-bold">{acc.name}</div>
                    <div className="text-xs text-gray-500">{acc.type === 'credit_card' ? 'Kartu kredit' : acc.type === 'ewallet' ? 'Dompet digital' : acc.type === 'cash' ? 'Tunai' : 'Bank'} • {formatMoney(acc.current_balance, acc.currency)}</div>
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
                    onChange={e => setTxForm({ ...txForm, type: e.target.value })}>
                    <option value="expense">Pengeluaran</option>
                    <option value="income">Pemasukan</option>
                    <option value="transfer">Transfer antar akun</option>
                    <option value="credit_card_purchase">Belanja kartu kredit</option>
                    <option value="fee">Biaya admin</option>
                  </select>
                  <select className="sel text-sm" value={txForm.currency}
                    onChange={e => setTxForm({ ...txForm, currency: e.target.value })}>
                    <option value="IDR">IDR</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <input type="number" className="inp w-full text-sm" placeholder="Jumlah transaksi"
                  value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: Number(e.target.value) })} />
                <select className="sel w-full text-sm" value={txForm.from_account_id}
                  onChange={e => setTxForm({ ...txForm, from_account_id: e.target.value })}>
                  <option value="">Pilih akun terkait...</option>
                  {accounts.filter(a => a.currency === txForm.currency).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {txForm.type === 'transfer' && (
                  <select className="sel w-full text-sm" value={txForm.to_account_id}
                    onChange={e => setTxForm({ ...txForm, to_account_id: e.target.value })}>
                    <option value="">Pilih akun tujuan...</option>
                    {accounts.filter(a => a.currency === txForm.currency && a.id !== txForm.from_account_id).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" className="inp text-sm" placeholder="Kategori"
                    value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })} />
                  <input type="text" className="inp text-sm" placeholder="Toko / sumber pemasukan"
                    value={txForm.merchant} onChange={e => setTxForm({ ...txForm, merchant: e.target.value })} />
                </div>
                <input type="text" className="inp w-full text-sm" placeholder="Catatan (opsional)"
                  value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })} />
                <input type="date" className="sel w-full text-sm" value={txForm.transaction_date}
                  onChange={e => setTxForm({ ...txForm, transaction_date: e.target.value })} />
                <div className="flex gap-2">
                  <button onClick={addTransaction} disabled={saving} className="btn-blue text-sm flex-1">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setShowAddTx(false)} className="btn-gray text-sm flex-1">Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
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
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setShowAddBudget(false)} className="btn-gray text-sm flex-1">Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {budgets.map(budget => {
              const key = `${budget.category}-${budget.currency}`
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
