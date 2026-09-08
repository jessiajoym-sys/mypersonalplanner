'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, X, Eye, EyeOff } from 'lucide-react'

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
    transaction_date: new Date().toISOString().split('T')[0]
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
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    setUser(u)

    // Get accounts
    const { data: accts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', u.id)
      .eq('is_active', true)
      .order('currency, name')

    // Get transactions
    const { data: txs } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', u.id)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false })

    // Get budgets
    const today = new Date()
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    const { data: bdgs } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', u.id)
      .eq('budget_month', thisMonth)
      .is('deleted_at', null)

    setAccounts(accts || [])
    setTransactions(txs || [])
    setBudgets(bdgs || [])
    setLoading(false)
  }

  // Add Account
  async function addAccount() {
    if (!accountForm.name.trim()) {
      setToast('Account name required')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: accountForm.name,
      type: accountForm.type,
      currency: accountForm.currency,
      opening_balance: Number(accountForm.opening_balance),
      opening_balance_date: new Date().toISOString().split('T')[0],
      current_balance: Number(accountForm.opening_balance),
      credit_limit: accountForm.type === 'credit_card' ? Number(accountForm.credit_limit) : null,
      billing_cycle_day: accountForm.type === 'credit_card' ? accountForm.billing_cycle_day : null,
      payment_due_day: accountForm.type === 'credit_card' ? accountForm.payment_due_day : null
    })
    setSaving(false)
    if (error) {
      setToast('Error: ' + error.message)
      return
    }
    setToast('✓ Account created')
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
    load()
  }

  // Add Transaction
  async function addTransaction() {
    if (!txForm.amount || !txForm.from_account_id) {
      setToast('Amount and account required')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: txForm.type,
      amount: Number(txForm.amount),
      currency: txForm.currency,
      from_account_id: txForm.from_account_id || null,
      to_account_id: txForm.to_account_id || null,
      category: txForm.category,
      merchant: txForm.merchant || null,
      description: txForm.description || null,
      transaction_date: txForm.transaction_date,
      source: 'manual'
    })
    setSaving(false)
    if (error) {
      setToast('Error: ' + error.message)
      return
    }
    setToast('✓ Transaction added')
    setTxForm({
      type: 'expense',
      amount: 0,
      currency: 'IDR',
      from_account_id: '',
      to_account_id: '',
      category: 'Food',
      merchant: '',
      description: '',
      transaction_date: new Date().toISOString().split('T')[0]
    })
    setShowAddTx(false)
    load()
  }

  // Add Budget
  async function addBudget() {
    if (!budgetForm.category.trim()) {
      setToast('Category name required')
      return
    }
    setSaving(true)
    const today = new Date()
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    const { error } = await supabase.from('budgets').insert({
      user_id: user.id,
      category: budgetForm.category,
      monthly_limit: Number(budgetForm.monthly_limit),
      currency: budgetForm.currency,
      budget_month: thisMonth
    })
    setSaving(false)
    if (error) {
      setToast('Error: ' + error.message)
      return
    }
    setToast('✓ Budget created')
    setBudgetForm({ category: '', monthly_limit: 0, currency: 'IDR' })
    setShowAddBudget(false)
    load()
  }

  // Delete
  async function deleteAccount(id: string) {
    if (!confirm('Delete?')) return
    await supabase.from('accounts').update({ deleted_at: new Date() }).eq('id', id)
    load()
  }

  async function deleteTransaction(id: string) {
    if (!confirm('Delete?')) return
    await supabase.from('transactions').update({ deleted_at: new Date() }).eq('id', id)
    load()
  }

  async function deleteBudget(id: string) {
    if (!confirm('Delete?')) return
    await supabase.from('budgets').update({ deleted_at: new Date() }).eq('id', id)
    load()
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Loading...</div>

  // Dashboard Calculations
  const accountsByCurrency = accounts.reduce((acc: any, a: any) => {
    if (!acc[a.currency]) acc[a.currency] = []
    acc[a.currency].push(a)
    return acc
  }, {})

  const balances = Object.entries(accountsByCurrency).map(([currency, accts]: any) => ({
    currency,
    total: accts.reduce((sum: number, a: any) => sum + (a.current_balance || 0), 0),
    accounts: accts
  }))

  const thisMonth = new Date().toISOString().split('T')[0].slice(0, 7)
  const monthlySpending: any = {}
  transactions.forEach(tx => {
    if (tx.transaction_date.startsWith(thisMonth) && 
        ['expense', 'credit_card_purchase'].includes(tx.type)) {
      if (!monthlySpending[tx.currency]) monthlySpending[tx.currency] = 0
      monthlySpending[tx.currency] += Number(tx.amount)
    }
  })

  const spending: any = {}
  transactions.forEach(tx => {
    if (tx.transaction_date.startsWith(thisMonth) && 
        ['expense', 'credit_card_purchase'].includes(tx.type)) {
      const key = `${tx.category}-${tx.currency}`
      if (!spending[key]) spending[key] = 0
      spending[key] += Number(tx.amount)
    }
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">💰 Financial Planner</h1>
        <button onClick={() => setShowBalances(!showBalances)} className="btn-gray btn-sm">
          {showBalances ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg text-sm flex items-center justify-between">
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
            {t === 'dashboard' && '📊 Dashboard'}
            {t === 'accounts' && '🏦 Accounts'}
            {t === 'transactions' && '📝 Transactions'}
            {t === 'budgets' && '💳 Budgets'}
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
                <div className="text-xs font-bold text-gray-400 uppercase mb-2">{b.currency} Balance</div>
                <div className="text-2xl font-bold mb-4">
                  {showBalances ? `${b.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '••••••'}
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  {b.accounts.map((a: any) => (
                    <div key={a.id} className="flex justify-between">
                      <span>{a.name}</span>
                      <span className={a.type === 'credit_card' ? 'text-red-500' : ''}>
                        {a.current_balance.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
                    <span className={spent > budget ? 'text-red-500 font-bold' : 'text-green-500 font-bold'}>
                      {budget > 0 ? ((spent / budget) * 100).toFixed(0) : '0'}%
                    </span>
                  </div>
                  <div className="mb-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${spent > budget ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min((spent / budget) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Spent: {spent.toLocaleString()} / Budget: {budget.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Recent Transactions */}
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-100 mb-3 font-bold">Recent Transactions</div>
            <div className="divide-y divide-gray-50">
              {transactions.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">No transactions</div>
              ) : (
                transactions.slice(0, 5).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                    <div>
                      <div className="font-semibold text-sm">{tx.merchant || tx.description || tx.category}</div>
                      <div className="text-xs text-gray-400">{tx.transaction_date}</div>
                    </div>
                    <div className={`font-bold text-sm ${
                      tx.type === 'income' ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {tx.type === 'income' ? '+' : '-'}{tx.amount} {tx.currency}
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
              <Plus size={16} /> Add Account
            </button>
          ) : (
            <div className="card bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">New Account</h3>
                <button onClick={() => setShowAddAccount(false)} className="text-gray-400"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <input type="text" className="inp w-full text-sm" placeholder="Name"
                  value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <select className="sel text-sm" value={accountForm.type}
                    onChange={e => setAccountForm({ ...accountForm, type: e.target.value })}>
                    <option value="bank">Bank</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="ewallet">E-Wallet</option>
                    <option value="cash">Cash</option>
                  </select>
                  <select className="sel text-sm" value={accountForm.currency}
                    onChange={e => setAccountForm({ ...accountForm, currency: e.target.value })}>
                    <option value="IDR">IDR</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <input type="number" className="inp w-full text-sm" placeholder="Opening Balance"
                  value={accountForm.opening_balance} onChange={e => setAccountForm({ ...accountForm, opening_balance: Number(e.target.value) })} />
                {accountForm.type === 'credit_card' && (
                  <>
                    <input type="number" className="inp w-full text-sm" placeholder="Credit Limit"
                      value={accountForm.credit_limit || ''} onChange={e => setAccountForm({ ...accountForm, credit_limit: Number(e.target.value) })} />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" className="inp text-sm" placeholder="Billing Day"
                        value={accountForm.billing_cycle_day || ''} onChange={e => setAccountForm({ ...accountForm, billing_cycle_day: Number(e.target.value) })} />
                      <input type="number" className="inp text-sm" placeholder="Due Day"
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
            {accounts.map(acc => (
              <div key={acc.id} className="card p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-bold">{acc.name}</div>
                    <div className="text-xs text-gray-500">{acc.type} • {acc.currency} • {acc.current_balance.toLocaleString()}</div>
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
                <h3 className="font-bold">New Transaction</h3>
                <button onClick={() => setShowAddTx(false)} className="text-gray-400"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select className="sel text-sm" value={txForm.type}
                    onChange={e => setTxForm({ ...txForm, type: e.target.value })}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                    <option value="credit_card_purchase">CC Purchase</option>
                    <option value="fee">Fee</option>
                  </select>
                  <select className="sel text-sm" value={txForm.currency}
                    onChange={e => setTxForm({ ...txForm, currency: e.target.value })}>
                    <option value="IDR">IDR</option>
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <input type="number" className="inp w-full text-sm" placeholder="Amount"
                  value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: Number(e.target.value) })} />
                <select className="sel w-full text-sm" value={txForm.from_account_id}
                  onChange={e => setTxForm({ ...txForm, from_account_id: e.target.value })}>
                  <option value="">From Account...</option>
                  {accounts.filter(a => a.currency === txForm.currency).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" className="inp text-sm" placeholder="Category"
                    value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })} />
                  <input type="text" className="inp text-sm" placeholder="Merchant"
                    value={txForm.merchant} onChange={e => setTxForm({ ...txForm, merchant: e.target.value })} />
                </div>
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
                  <div className="text-xs text-gray-500">{tx.transaction_date} • {tx.type}</div>
                </div>
                <div className={`font-bold text-sm mr-4 ${
                  tx.type === 'income' ? 'text-green-500' : 'text-red-500'
                }`}>
                  {tx.type === 'income' ? '+' : '-'}{tx.amount} {tx.currency}
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
              <Plus size={16} /> Add Budget
            </button>
          ) : (
            <div className="card bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">New Budget</h3>
                <button onClick={() => setShowAddBudget(false)} className="text-gray-400"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <input type="text" className="inp w-full text-sm" placeholder="Category"
                  value={budgetForm.category} onChange={e => setBudgetForm({ ...budgetForm, category: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" className="inp text-sm" placeholder="Monthly Limit"
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
              const percent = (spent / budget.monthly_limit) * 100
              const isOver = spent > budget.monthly_limit
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
                    <span className="text-gray-600">{spent.toLocaleString()} / {budget.monthly_limit.toLocaleString()} {budget.currency}</span>
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
