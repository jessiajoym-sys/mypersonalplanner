'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Plus, Trash2, Upload, Camera } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CATEGORIES = ['Makan','Transport','Belanja','Personal','KPR','CC Payment','Bisnis','Polar Bed','Sambal Mak Tak','Homemate','Jastip','Lainnya']

export default function FinancialPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [activeMonth, setActiveMonth] = useState(new Date().getMonth())
  const [transactions, setTransactions] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [fixedExpenses, setFixedExpenses] = useState<any[]>([])
  const [dreamGoals, setDreamGoals] = useState<any[]>([])
  const [rmbPurchases, setRmbPurchases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddTrans, setShowAddTrans] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showAddFixed, setShowAddFixed] = useState(false)
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [showAddRmb, setShowAddRmb] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  const [transForm, setTransForm] = useState({
    date: format(new Date(),'yyyy-MM-dd'), type:'debit', description:'',
    name:'', account_name:'', business_id:'', status:'Personal',
    category:'Lainnya', currency:'IDR', debit:'', kredit:''
  })

  const [accountForm, setAccountForm] = useState({
    name:'', bank:'', account_number:'', type:'debit',
    currency:'IDR', balance:'', credit_limit:'', due_date:'',
    interest_rate:'1.75', annual_fee:'0', color:'#5B7FFF'
  })

  const [fixedForm, setFixedForm] = useState({
    name:'', amount:'', currency:'IDR', category:'Personal',
    account_id:'', due_day:'1', icon:'💳'
  })

  const [goalForm, setGoalForm] = useState({
    title:'', description:'', emoji:'🌟', target_amount:'',
    saved_amount:'0', target_years:'5', color:'#5B7FFF'
  })

  const [rmbForm, setRmbForm] = useState({
    purchase_date: format(new Date(),'yyyy-MM-dd'),
    amount_rmb:'', exchange_rate:'', source:'Alipay'
  })

  // CC Calculator state
  const [ccCalcAccount, setCcCalcAccount] = useState<any>(null)
  const [ccMonthlyUse, setCcMonthlyUse] = useState('1000000')
  const [ccCloseMonths, setCcCloseMonths] = useState('12')

  useEffect(() => { loadAll() }, [activeMonth])

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const year = new Date().getFullYear()
    const m = String(activeMonth+1).padStart(2,'0')
    const [tr, ac, fx, dg, rmb] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id',user.id)
        .gte('date',`${year}-${m}-01`).lte('date',`${year}-${m}-31`)
        .order('date',{ascending:false}),
      supabase.from('accounts').select('*').eq('user_id',user.id).eq('is_active',true).order('created_at'),
      supabase.from('fixed_expenses').select('*').eq('user_id',user.id).eq('is_active',true),
      supabase.from('dream_goals').select('*').eq('user_id',user.id),
      supabase.from('rmb_purchases').select('*').eq('user_id',user.id).order('purchase_date'),
    ])
    if (tr.data) setTransactions(tr.data)
    if (ac.data) setAccounts(ac.data)
    if (fx.data) setFixedExpenses(fx.data)
    if (dg.data) setDreamGoals(dg.data)
    if (rmb.data) setRmbPurchases(rmb.data)
    setLoading(false)
  }

  async function addTransaction() {
    if (!transForm.description) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('transactions').insert({
      ...transForm, user_id: user.id,
      debit: transForm.debit ? parseFloat(transForm.debit) : null,
      kredit: transForm.kredit ? parseFloat(transForm.kredit) : null,
    })
    setShowAddTrans(false)
    setTransForm({ date:format(new Date(),'yyyy-MM-dd'), type:'debit', description:'', name:'', account_name:'', business_id:'', status:'Personal', category:'Lainnya', currency:'IDR', debit:'', kredit:'' })
    loadAll()
  }

  async function addAccount() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('accounts').insert({
      ...accountForm, user_id: user.id,
      balance: parseFloat(accountForm.balance)||0,
      credit_limit: accountForm.credit_limit ? parseFloat(accountForm.credit_limit) : null,
      due_date: accountForm.due_date ? parseInt(accountForm.due_date) : null,
      interest_rate: parseFloat(accountForm.interest_rate)||1.75,
      annual_fee: parseFloat(accountForm.annual_fee)||0,
      is_active: true,
    })
    setShowAddAccount(false)
    setAccountForm({ name:'', bank:'', account_number:'', type:'debit', currency:'IDR', balance:'', credit_limit:'', due_date:'', interest_rate:'1.75', annual_fee:'0', color:'#5B7FFF' })
    loadAll()
  }

  async function deleteAccount(id: string) {
    if (!confirm('Delete account?')) return
    await supabase.from('accounts').update({ is_active: false }).eq('id', id)
    loadAll()
  }

  async function addFixed() {
    if (!fixedForm.name || !fixedForm.amount) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('fixed_expenses').insert({
      ...fixedForm, user_id: user.id,
      amount: parseFloat(fixedForm.amount),
      due_day: parseInt(fixedForm.due_day),
      is_active: true,
    })
    setShowAddFixed(false)
    setFixedForm({ name:'', amount:'', currency:'IDR', category:'Personal', account_id:'', due_day:'1', icon:'💳' })
    loadAll()
  }

  async function deleteFixed(id: string) {
    await supabase.from('fixed_expenses').update({ is_active: false }).eq('id', id)
    loadAll()
  }

  async function addGoal() {
    if (!goalForm.title || !goalForm.target_amount) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('dream_goals').insert({
      ...goalForm, user_id: user.id,
      target_amount: parseFloat(goalForm.target_amount),
      saved_amount: parseFloat(goalForm.saved_amount)||0,
      target_years: parseInt(goalForm.target_years)||5,
    })
    setShowAddGoal(false)
    setGoalForm({ title:'', description:'', emoji:'🌟', target_amount:'', saved_amount:'0', target_years:'5', color:'#5B7FFF' })
    loadAll()
  }

  async function addRmbPurchase() {
    if (!rmbForm.amount_rmb || !rmbForm.exchange_rate) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const amt = parseFloat(rmbForm.amount_rmb)
    const rate = parseFloat(rmbForm.exchange_rate)
    await supabase.from('rmb_purchases').insert({
      user_id: user.id,
      purchase_date: rmbForm.purchase_date,
      amount_rmb: amt,
      exchange_rate: rate,
      amount_idr: amt * rate,
      remaining_rmb: amt,
      source: rmbForm.source,
    })
    setShowAddRmb(false)
    setRmbForm({ purchase_date:format(new Date(),'yyyy-MM-dd'), amount_rmb:'', exchange_rate:'', source:'Alipay' })
    loadAll()
  }

  async function deleteTrans(id: string) {
    if (!confirm('Delete?')) return
    await supabase.from('transactions').delete().eq('id', id)
    loadAll()
  }

  async function deleteGoal(id: string) {
    if (!confirm('Delete goal?')) return
    await supabase.from('dream_goals').delete().eq('id', id)
    loadAll()
  }

  // Scan receipt with AI
  async function scanReceipt(file: File) {
    setScanning(true)
    setScanMsg('Scanning receipt...')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(',')[1]
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: file.type as any, data: base64 } },
                { type: 'text', text: 'Extract from this receipt. Reply ONLY with JSON: {"date":"YYYY-MM-DD","description":"store name","amount":number,"category":"Makan/Transport/Belanja/Lainnya"}' }
              ]
            }]
          })
        })
        const data = await res.json()
        const text = data.content?.[0]?.text || ''
        const parsed = JSON.parse(text.replace(/```json|```/g,'').trim())
        setTransForm(prev => ({
          ...prev,
          date: parsed.date || prev.date,
          description: parsed.description || prev.description,
          category: parsed.category || prev.category,
          debit: String(parsed.amount || ''),
        }))
        setScanMsg(`✅ Scanned: ${parsed.description} — ${parsed.amount?.toLocaleString()}`)
        setShowAddTrans(true)
      } catch {
        setScanMsg('Could not scan. Please fill manually.')
        setShowAddTrans(true)
      }
      setScanning(false)
    }
    reader.readAsDataURL(file)
  }

  // Calculations
  const totalIn = transactions.reduce((s,t) => s+(t.kredit||0), 0)
  const totalOut = transactions.reduce((s,t) => s+(t.debit||0), 0)
  const ccAccounts = accounts.filter(a => a.type === 'cc')
  const debitAccounts = accounts.filter(a => a.type === 'debit')
  const ewallets = accounts.filter(a => a.type === 'ewallet' || a.currency === 'RMB')
  const totalFixed = fixedExpenses.reduce((s,f) => s+f.amount, 0)

  // CC Calculator
  function calcCCPayment(account: any) {
    if (!account) return { minimum: 0, full: 0, monthly: 0 }
    const outstanding = account.balance || 0
    const rate = (account.interest_rate || 1.75) / 100
    const monthlyUse = parseFloat(ccMonthlyUse) || 0
    const months = parseInt(ccCloseMonths) || 12
    const interest = outstanding * rate
    const minimum = Math.max(outstanding * 0.1, 50000)
    const full = outstanding + interest + monthlyUse
    // Monthly payment to close in N months
    const totalDebt = outstanding
    const annualFee = (account.annual_fee || 0) / 12
    const monthly = (totalDebt * rate * Math.pow(1+rate, months)) / (Math.pow(1+rate, months)-1) + monthlyUse + annualFee
    return { minimum: Math.round(minimum), full: Math.round(full), monthly: Math.round(monthly) }
  }

  // RMB FIFO remaining
  const totalRmbBalance = rmbPurchases.reduce((s,p) => s+(p.remaining_rmb||0), 0)
  const avgRmbRate = rmbPurchases.length > 0
    ? rmbPurchases.reduce((s,p) => s+(p.exchange_rate * p.amount_rmb), 0) / rmbPurchases.reduce((s,p) => s+p.amount_rmb, 0)
    : 0

  const tabs = [
    { id:'overview', label:'📊 Overview' },
    { id:'accounts', label:'💳 Accounts' },
    { id:'transactions', label:'📋 Transactions' },
    { id:'budget', label:'🎯 Budget' },
    { id:'rmb', label:'🇨🇳 RMB' },
    { id:'cc', label:'💳 CC Manager' },
    { id:'fixed', label:'🔄 Fixed' },
    { id:'goals', label:'🌟 Goals' },
    { id:'reports', label:'📈 Reports' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Financial Planner 💰</h1>
          <p className="text-xs text-gray-400 mt-0.5">Multi-account · Multi-currency · Integrated with Business</p>
        </div>
        <div className="flex gap-2">
          <label className="btn-gray flex items-center gap-1.5 text-xs cursor-pointer">
            <Camera size={13} /> Scan Receipt
            <input type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files?.[0] && scanReceipt(e.target.files[0])} />
          </label>
          <button className="btn-gray flex items-center gap-1.5 text-xs">
            <Upload size={13} /> Import CSV
          </button>
          <button className="btn-teal flex items-center gap-1.5 text-xs"
            onClick={() => setShowAddTrans(!showAddTrans)}>
            <Plus size={13} /> Add Transaction
          </button>
        </div>
      </div>

      {scanMsg && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-3 text-xs text-blue-600 flex items-center justify-between">
          <span>{scanning ? '⏳ ' : ''}{scanMsg}</span>
          <button onClick={() => setScanMsg('')} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Month tabs */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {MONTHS.map((m,i) => (
          <button key={m} onClick={() => setActiveMonth(i)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all
              ${activeMonth===i ? 'bg-teal-500 text-white' : 'bg-white border border-gray-100 text-gray-400 hover:bg-gray-50'}`}>
            {m}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap bg-white border border-gray-100 rounded-xl p-1 mb-4">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
              ${activeTab===t.id ? 'bg-teal-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== OVERVIEW ===== */}
      {activeTab === 'overview' && (
        <div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label:'💰 Income', val:`Rp ${totalIn.toLocaleString()}`, color:'text-green-500' },
              { label:'💸 Expenses', val:`Rp ${totalOut.toLocaleString()}`, color:'text-red-500' },
              { label:'📊 Net', val:`${totalIn-totalOut >= 0 ? '+' : ''}Rp ${(totalIn-totalOut).toLocaleString()}`, color: totalIn-totalOut >= 0 ? 'text-green-500' : 'text-red-500' },
              { label:'🔄 Fixed/mo', val:`Rp ${totalFixed.toLocaleString()}`, color:'text-orange-500' },
            ].map((s,i) => (
              <div key={i} className="card p-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">{s.label}</div>
                <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Accounts summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {accounts.slice(0,6).map(acc => (
              <div key={acc.id} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ background: acc.color || '#5B7FFF' }}>
                    {acc.type === 'cc' ? '💳' : acc.currency === 'RMB' ? '🇨🇳' : '🏦'}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{acc.name}</div>
                    <div className="text-xs text-gray-400">{acc.bank} · {acc.account_number}</div>
                  </div>
                </div>
                <div className={`text-lg font-bold ${acc.type==='cc' ? 'text-red-500' : 'text-blue-500'}`}>
                  {acc.currency === 'RMB' ? '¥' : 'Rp'} {(acc.balance||0).toLocaleString()}
                </div>
                {acc.type === 'cc' && acc.credit_limit && (
                  <div className="mt-1.5">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width:`${((acc.balance||0)/acc.credit_limit)*100}%` }} />
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      Available: Rp {((acc.credit_limit||0)-(acc.balance||0)).toLocaleString()}
                      {acc.due_date && ` · Due: every ${acc.due_date}th`}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {accounts.length === 0 && (
              <div className="card p-6 text-center text-gray-400 col-span-3 text-sm">
                No accounts yet. Go to Accounts tab to add.
              </div>
            )}
          </div>

          {/* Recent transactions */}
          <div className="card">
            <div className="card-h">
              <div className="text-xs font-bold text-gray-400 uppercase">Recent Transactions</div>
              <button onClick={() => setActiveTab('transactions')} className="text-xs text-teal-500 font-semibold">View all →</button>
            </div>
            {transactions.slice(0,5).map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <div className="flex-1">
                  <div className="text-sm font-medium">{t.description}</div>
                  <div className="text-xs text-gray-400">{t.date} · {t.account_name} · {t.category}</div>
                </div>
                <span className={`text-sm font-bold ${t.kredit ? 'text-green-500' : 'text-red-500'}`}>
                  {t.kredit ? `+Rp ${Number(t.kredit).toLocaleString()}` : `-Rp ${Number(t.debit).toLocaleString()}`}
                </span>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="p-6 text-center text-gray-400 text-sm">No transactions this month</div>
            )}
          </div>
        </div>
      )}

      {/* ===== ACCOUNTS ===== */}
      {activeTab === 'accounts' && (
        <div>
          <div className="flex gap-2 mb-4">
            <button className="btn-teal btn-sm flex items-center gap-1" onClick={() => setShowAddAccount(!showAddAccount)}>
              <Plus size={12} /> Add Account
            </button>
          </div>

          {showAddAccount && (
            <div className="card p-4 mb-4">
              <div className="text-xs font-bold text-gray-400 uppercase mb-3">Add New Account</div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input className="inp text-xs" placeholder="Account name (e.g. BCA Main)" value={accountForm.name} onChange={e => setAccountForm({...accountForm, name:e.target.value})} />
                <input className="inp text-xs" placeholder="Bank name" value={accountForm.bank} onChange={e => setAccountForm({...accountForm, bank:e.target.value})} />
                <input className="inp text-xs" placeholder="Account number (last 4)" value={accountForm.account_number} onChange={e => setAccountForm({...accountForm, account_number:e.target.value})} />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <select className="sel text-xs" value={accountForm.type} onChange={e => setAccountForm({...accountForm, type:e.target.value})}>
                  <option value="debit">Debit</option>
                  <option value="cc">Credit Card</option>
                  <option value="ewallet">E-Wallet</option>
                </select>
                <select className="sel text-xs" value={accountForm.currency} onChange={e => setAccountForm({...accountForm, currency:e.target.value})}>
                  <option value="IDR">IDR</option>
                  <option value="RMB">RMB</option>
                  <option value="USD">USD</option>
                </select>
                <input className="inp text-xs" placeholder="Current balance" type="number" value={accountForm.balance} onChange={e => setAccountForm({...accountForm, balance:e.target.value})} />
              </div>
              {accountForm.type === 'cc' && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input className="inp text-xs" placeholder="Credit limit" type="number" value={accountForm.credit_limit} onChange={e => setAccountForm({...accountForm, credit_limit:e.target.value})} />
                  <input className="inp text-xs" placeholder="Due date (day of month)" type="number" value={accountForm.due_date} onChange={e => setAccountForm({...accountForm, due_date:e.target.value})} />
                  <input className="inp text-xs" placeholder="Interest rate %/month" value={accountForm.interest_rate} onChange={e => setAccountForm({...accountForm, interest_rate:e.target.value})} />
                </div>
              )}
              <div className="flex gap-2">
                <button className="btn-teal btn-sm" onClick={addAccount}>Save Account</button>
                <button className="btn-gray btn-sm" onClick={() => setShowAddAccount(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Debit accounts */}
          {debitAccounts.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">Debit Accounts</div>
              <div className="grid grid-cols-3 gap-3">
                {debitAccounts.map(acc => (
                  <div key={acc.id} className="card p-4 group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-lg"
                          style={{ background: acc.color }}>🏦</div>
                        <div>
                          <div className="text-sm font-bold">{acc.name}</div>
                          <div className="text-xs text-gray-400">{acc.bank} · {acc.account_number}</div>
                        </div>
                      </div>
                      <button onClick={() => deleteAccount(acc.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="text-xs text-gray-400 mb-1">Balance</div>
                    <div className="text-xl font-bold text-blue-500">
                      {acc.currency === 'RMB' ? '¥' : 'Rp'} {(acc.balance||0).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credit cards */}
          {ccAccounts.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">Credit Cards</div>
              <div className="grid grid-cols-3 gap-3">
                {ccAccounts.map(acc => (
                  <div key={acc.id} className="card p-4 group">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-sm font-bold">{acc.name}</div>
                        <div className="text-xs text-gray-400">{acc.bank} · ···{acc.account_number}</div>
                      </div>
                      <button onClick={() => deleteAccount(acc.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="text-xs text-gray-400 mb-1">Outstanding</div>
                    <div className="text-xl font-bold text-red-500 mb-2">Rp {(acc.balance||0).toLocaleString()}</div>
                    {acc.credit_limit && (
                      <>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                          <div className="h-full bg-red-400 rounded-full"
                            style={{ width:`${Math.min(((acc.balance||0)/acc.credit_limit)*100,100)}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-400">
                          <span>Limit: Rp {acc.credit_limit.toLocaleString()}</span>
                          {acc.due_date && <span className="text-orange-500 font-semibold">Due: every {acc.due_date}th</span>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* E-wallets */}
          {ewallets.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">E-Wallets & China</div>
              <div className="grid grid-cols-3 gap-3">
                {ewallets.map(acc => (
                  <div key={acc.id} className="card p-4 group">
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm font-bold">{acc.name}</div>
                      <button onClick={() => deleteAccount(acc.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="text-xl font-bold text-teal-500">
                      {acc.currency === 'RMB' ? '¥' : 'Rp'} {(acc.balance||0).toLocaleString()}
                    </div>
                    {acc.currency === 'RMB' && (
                      <div className="text-xs text-gray-400 mt-1">≈ Rp {((acc.balance||0) * avgRmbRate).toLocaleString()}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {accounts.length === 0 && (
            <div className="card p-10 text-center text-gray-400">
              <div className="text-4xl mb-2">💳</div>
              <div className="font-semibold mb-1">No accounts yet</div>
              <div className="text-sm">Click "Add Account" to get started</div>
            </div>
          )}
        </div>
      )}

      {/* ===== TRANSACTIONS ===== */}
      {activeTab === 'transactions' && (
        <div>
          {showAddTrans && (
            <div className="card p-4 mb-4">
              <div className="text-xs font-bold text-gray-400 uppercase mb-3">+ Add Transaction</div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                <input type="date" className="inp text-xs" value={transForm.date} onChange={e => setTransForm({...transForm, date:e.target.value})} />
                <select className="sel text-xs" value={transForm.type} onChange={e => setTransForm({...transForm, type:e.target.value})}>
                  <option value="debit">Debit/Expense</option>
                  <option value="kredit">Kredit/Income</option>
                  <option value="cc">Credit Card</option>
                </select>
                <input className="inp text-xs" placeholder="Description" value={transForm.description} onChange={e => setTransForm({...transForm, description:e.target.value})} />
                <input className="inp text-xs" placeholder="Name/Merchant" value={transForm.name} onChange={e => setTransForm({...transForm, name:e.target.value})} />
              </div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                <select className="sel text-xs" value={transForm.account_name} onChange={e => setTransForm({...transForm, account_name:e.target.value})}>
                  <option value="">Select account</option>
                  {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
                <select className="sel text-xs" value={transForm.category} onChange={e => setTransForm({...transForm, category:e.target.value})}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <select className="sel text-xs" value={transForm.status} onChange={e => setTransForm({...transForm, status:e.target.value})}>
                  <option value="Personal">Personal</option>
                  <option value="Bisnis">Bisnis</option>
                  <option value="Bukan Pribadi">Bukan Pribadi</option>
                </select>
                <select className="sel text-xs" value={transForm.currency} onChange={e => setTransForm({...transForm, currency:e.target.value})}>
                  <option value="IDR">IDR</option>
                  <option value="RMB">RMB</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input className="inp text-xs" placeholder="Amount (expense/debit)" type="number" value={transForm.debit} onChange={e => setTransForm({...transForm, debit:e.target.value, kredit:''})} />
                <input className="inp text-xs" placeholder="Amount (income/kredit)" type="number" value={transForm.kredit} onChange={e => setTransForm({...transForm, kredit:e.target.value, debit:''})} />
              </div>
              <div className="flex gap-2">
                <button className="btn-teal btn-sm" onClick={addTransaction}>Save</button>
                <button className="btn-gray btn-sm" onClick={() => setShowAddTrans(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-h">
              <div className="text-xs font-bold text-gray-400 uppercase">{transactions.length} Transactions · {MONTHS[activeMonth]}</div>
              <div className="flex gap-2">
                <span className="text-xs font-bold text-green-500">In: Rp {totalIn.toLocaleString()}</span>
                <span className="text-xs font-bold text-red-500">Out: Rp {totalOut.toLocaleString()}</span>
              </div>
            </div>
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No transactions this month</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      {['Date','Description','Account','Category','Status','Debit','Kredit',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(t => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{t.date}</td>
                        <td className="px-3 py-2 font-medium max-w-[140px] truncate">{t.description}</td>
                        <td className="px-3 py-2 text-gray-400">{t.account_name}</td>
                        <td className="px-3 py-2">
                          <span className="tag bg-gray-100 text-gray-500 text-[9px]">{t.category}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`tag text-[9px] ${t.status==='Bisnis'?'bg-green-50 text-green-500':'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                        </td>
                        <td className="px-3 py-2 text-red-500 font-semibold">{t.debit ? `Rp ${Number(t.debit).toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-2 text-green-500 font-semibold">{t.kredit ? `Rp ${Number(t.kredit).toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => deleteTrans(t.id)} className="text-gray-300 hover:text-red-500 transition-all">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== BUDGET ===== */}
      {activeTab === 'budget' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card">
            <div className="card-h"><div className="text-xs font-bold text-teal-500 uppercase">🎯 Monthly Budget</div></div>
            <div className="p-4">
              <div className="bg-blue-50 rounded-xl p-3 mb-4 text-xs text-blue-600">
                💡 Set your budget in Settings → Budget. Here you can see how you're tracking.
              </div>
              {CATEGORIES.slice(0,6).map(cat => {
                const spent = transactions.filter(t => t.category === cat).reduce((s,t) => s+(t.debit||0), 0)
                return (
                  <div key={cat} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold">{cat}</span>
                      <span className="text-red-500">Rp {spent.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${Math.min(spent/500000*100, 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="card">
            <div className="card-h"><div className="text-xs font-bold text-blue-500 uppercase">📅 Daily Budget</div></div>
            <div className="p-4">
              <div className="bg-blue-50 rounded-xl p-4 mb-3 text-center">
                <div className="text-xs text-gray-400 mb-1">Today ({format(new Date(),'MMM d')})</div>
                <div className="text-2xl font-bold text-blue-500">
                  Rp {transactions.filter(t => t.date === format(new Date(),'yyyy-MM-dd')).reduce((s,t) => s+(t.debit||0), 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-400 mt-1">spent today</div>
              </div>
              <div className="bg-teal-50 rounded-xl p-4 text-center">
                <div className="text-xs text-gray-400 mb-1">This month total</div>
                <div className="text-2xl font-bold text-teal-500">Rp {totalOut.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== RMB WALLET ===== */}
      {activeTab === 'rmb' && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card p-4"><div className="text-xs text-gray-400 mb-1">🇨🇳 Total RMB</div><div className="text-xl font-bold text-blue-500">¥ {totalRmbBalance.toLocaleString()}</div><div className="text-xs text-gray-400 mt-1">≈ Rp {(totalRmbBalance * avgRmbRate).toLocaleString()}</div></div>
            <div className="card p-4"><div className="text-xs text-gray-400 mb-1">📊 Avg Kurs (FIFO)</div><div className="text-xl font-bold text-orange-500">Rp {avgRmbRate.toFixed(0)}</div><div className="text-xs text-gray-400 mt-1">weighted average</div></div>
            <div className="card p-4"><div className="text-xs text-gray-400 mb-1">📦 Batches</div><div className="text-xl font-bold text-purple-500">{rmbPurchases.length}</div><div className="text-xs text-gray-400 mt-1">purchase records</div></div>
          </div>

          <div className="flex gap-2 mb-4">
            <button className="btn-blue btn-sm flex items-center gap-1" onClick={() => setShowAddRmb(!showAddRmb)}>
              <Plus size={12} /> Buy RMB
            </button>
          </div>

          {showAddRmb && (
            <div className="card p-4 mb-4">
              <div className="text-xs font-bold text-gray-400 uppercase mb-3">Record RMB Purchase</div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                <input type="date" className="inp text-xs" value={rmbForm.purchase_date} onChange={e => setRmbForm({...rmbForm, purchase_date:e.target.value})} />
                <input className="inp text-xs" placeholder="Amount RMB (¥)" type="number" value={rmbForm.amount_rmb} onChange={e => setRmbForm({...rmbForm, amount_rmb:e.target.value})} />
                <input className="inp text-xs" placeholder="Kurs (IDR per 1 RMB)" type="number" value={rmbForm.exchange_rate} onChange={e => setRmbForm({...rmbForm, exchange_rate:e.target.value})} />
                <select className="sel text-xs" value={rmbForm.source} onChange={e => setRmbForm({...rmbForm, source:e.target.value})}>
                  <option>Alipay</option><option>WeChat</option><option>Cash</option><option>Bank</option>
                </select>
              </div>
              {rmbForm.amount_rmb && rmbForm.exchange_rate && (
                <div className="bg-blue-50 rounded-xl p-3 mb-2 text-xs text-blue-600">
                  💡 ¥ {rmbForm.amount_rmb} × Rp {rmbForm.exchange_rate} = Rp {(parseFloat(rmbForm.amount_rmb) * parseFloat(rmbForm.exchange_rate)).toLocaleString()}
                </div>
              )}
              <div className="flex gap-2">
                <button className="btn-blue btn-sm" onClick={addRmbPurchase}>Save</button>
                <button className="btn-gray btn-sm" onClick={() => setShowAddRmb(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-h">
              <div className="text-xs font-bold text-blue-500 uppercase">🗂️ FIFO Stack — RMB Purchases</div>
            </div>
            <div className="bg-blue-50 px-4 py-2.5 text-xs text-blue-600">
              💡 First In First Out — kurs pertama dipakai dulu sampai habis, baru pakai kurs berikutnya
            </div>
            {rmbPurchases.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No RMB purchases recorded yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase">Date</th>
                      <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase">Kurs</th>
                      <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase">Bought</th>
                      <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase">IDR Paid</th>
                      <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase">Remaining</th>
                      <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase">Source</th>
                      <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rmbPurchases.map((p, i) => {
                      const isActive = p.remaining_rmb > 0
                      const isFirst = rmbPurchases.filter(x => x.remaining_rmb > 0)[0]?.id === p.id
                      return (
                        <tr key={p.id} className={`border-b border-gray-50 ${isFirst ? 'bg-green-50' : ''}`}>
                          <td className="px-4 py-2.5 text-gray-400">{p.purchase_date}</td>
                          <td className="px-4 py-2.5 font-semibold">Rp {Number(p.exchange_rate).toLocaleString()}</td>
                          <td className="px-4 py-2.5 font-semibold text-blue-500">¥ {Number(p.amount_rmb).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-red-500">Rp {Number(p.amount_idr).toLocaleString()}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold ${isActive ? 'text-green-500' : 'text-gray-400'}`}>¥ {Number(p.remaining_rmb).toLocaleString()}</span>
                              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-green-400 rounded-full" style={{ width:`${(p.remaining_rmb/p.amount_rmb)*100}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-400">{p.source}</td>
                          <td className="px-4 py-2.5">
                            <span className={`tag text-[9px] ${isFirst ? 'bg-green-100 text-green-600' : isActive ? 'bg-blue-50 text-blue-500' : 'bg-gray-100 text-gray-400'}`}>
                              {isFirst ? '← Using now' : isActive ? 'Next' : 'Used up'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== CC MANAGER ===== */}
      {activeTab === 'cc' && (
        <div>
          {ccAccounts.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
              <div className="text-4xl mb-2">💳</div>
              <div className="font-semibold mb-1">No credit cards yet</div>
              <div className="text-sm mb-3">Add a credit card in the Accounts tab first</div>
              <button className="btn-blue btn-sm" onClick={() => setActiveTab('accounts')}>Go to Accounts →</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {ccAccounts.map(acc => {
                const calc = calcCCPayment(acc)
                return (
                  <div key={acc.id} className="card">
                    <div className="px-4 py-3 text-white font-bold flex items-center justify-between rounded-t-2xl"
                      style={{ background: acc.color || '#5B7FFF' }}>
                      <span>💳 {acc.name}</span>
                      {acc.due_date && <span className="text-xs opacity-70">Due every {acc.due_date}th</span>}
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                        <div><div className="text-xs text-gray-400">Outstanding</div><div className="text-base font-bold text-red-500">Rp {(acc.balance||0).toLocaleString()}</div></div>
                        <div><div className="text-xs text-gray-400">Limit</div><div className="text-base font-bold">Rp {(acc.credit_limit||0).toLocaleString()}</div></div>
                        <div><div className="text-xs text-gray-400">Available</div><div className="text-base font-bold text-green-500">Rp {((acc.credit_limit||0)-(acc.balance||0)).toLocaleString()}</div></div>
                      </div>

                      {/* Calculator A */}
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3">
                        <div className="text-xs font-bold text-green-600 uppercase mb-2">🧮 Bayar bulan depan</div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Minimum payment:</span>
                          <span className="font-bold text-orange-500">Rp {calc.minimum.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Full payment (lunas):</span>
                          <span className="font-bold text-green-600">Rp {calc.full.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Calculator B */}
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="text-xs font-bold text-blue-600 uppercase mb-2">🧮 Tutup CC dalam N bulan</div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="text-[10px] text-gray-400">Target bulan</label>
                            <select className="sel w-full text-xs mt-0.5"
                              value={ccCalcAccount?.id === acc.id ? ccCloseMonths : '12'}
                              onChange={e => { setCcCalcAccount(acc); setCcCloseMonths(e.target.value) }}>
                              {[3,6,12,18,24].map(n => <option key={n} value={n}>{n} bulan</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400">Pakai CC/bulan</label>
                            <input className="inp text-xs mt-0.5" type="number"
                              value={ccCalcAccount?.id === acc.id ? ccMonthlyUse : '1000000'}
                              onChange={e => { setCcCalcAccount(acc); setCcMonthlyUse(e.target.value) }} />
                          </div>
                        </div>
                        <div className="bg-white rounded-xl p-2 text-center">
                          <div className="text-xs text-gray-400">Bayar per bulan:</div>
                          <div className="text-lg font-bold text-blue-500">Rp {calc.monthly.toLocaleString()}</div>
                          <div className="text-[10px] text-gray-400">untuk tutup dalam {ccCalcAccount?.id === acc.id ? ccCloseMonths : '12'} bulan</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== FIXED EXPENSES ===== */}
      {activeTab === 'fixed' && (
        <div>
          <div className="flex gap-2 mb-4">
            <button className="btn-teal btn-sm flex items-center gap-1" onClick={() => setShowAddFixed(!showAddFixed)}>
              <Plus size={12} /> Add Fixed Expense
            </button>
          </div>

          {showAddFixed && (
            <div className="card p-4 mb-4">
              <div className="text-xs font-bold text-gray-400 uppercase mb-3">Add Fixed Monthly Expense</div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input className="inp text-xs" placeholder="Name (e.g. KPR, Netflix)" value={fixedForm.name} onChange={e => setFixedForm({...fixedForm, name:e.target.value})} />
                <input className="inp text-xs" placeholder="Amount" type="number" value={fixedForm.amount} onChange={e => setFixedForm({...fixedForm, amount:e.target.value})} />
                <input className="inp text-xs" placeholder="Due day (1-31)" type="number" value={fixedForm.due_day} onChange={e => setFixedForm({...fixedForm, due_day:e.target.value})} />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <select className="sel text-xs" value={fixedForm.category} onChange={e => setFixedForm({...fixedForm, category:e.target.value})}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <select className="sel text-xs" value={fixedForm.currency} onChange={e => setFixedForm({...fixedForm, currency:e.target.value})}>
                  <option value="IDR">IDR</option><option value="RMB">RMB</option>
                </select>
                <select className="sel text-xs" value={fixedForm.icon} onChange={e => setFixedForm({...fixedForm, icon:e.target.value})}>
                  {['💳','🏠','📱','🎵','☁️','🏋️','📺','⚡','💧','🚗'].map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button className="btn-teal btn-sm" onClick={addFixed}>Save</button>
                <button className="btn-gray btn-sm" onClick={() => setShowAddFixed(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-h">
              <div className="text-xs font-bold text-red-500 uppercase">🔄 Fixed Monthly Expenses</div>
              <div className="text-xs font-bold text-red-500">Total: Rp {totalFixed.toLocaleString()}/mo</div>
            </div>
            {fixedExpenses.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No fixed expenses yet</div>
            ) : (
              fixedExpenses.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 group hover:bg-gray-50">
                  <span className="text-xl">{f.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{f.name}</div>
                    <div className="text-xs text-gray-400">Every {f.due_day}th · {f.category}</div>
                  </div>
                  <span className="tag bg-gray-100 text-gray-500 text-xs">{f.currency}</span>
                  <div className="text-sm font-bold text-red-500">{f.currency === 'RMB' ? '¥' : 'Rp'} {Number(f.amount).toLocaleString()}</div>
                  <button onClick={() => deleteFixed(f.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===== DREAM GOALS ===== */}
      {activeTab === 'goals' && (
        <div>
          <div className="flex gap-2 mb-4">
            <button className="btn-blue btn-sm flex items-center gap-1" onClick={() => setShowAddGoal(!showAddGoal)}>
              <Plus size={12} /> Add Dream Goal
            </button>
          </div>

          {showAddGoal && (
            <div className="card p-4 mb-4">
              <div className="text-xs font-bold text-gray-400 uppercase mb-3">Add Savings Goal</div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input className="inp text-xs" placeholder="Goal title (e.g. Beli Rumah)" value={goalForm.title} onChange={e => setGoalForm({...goalForm, title:e.target.value})} />
                <input className="inp text-xs" placeholder="Target amount (Rp)" type="number" value={goalForm.target_amount} onChange={e => setGoalForm({...goalForm, target_amount:e.target.value})} />
                <input className="inp text-xs" placeholder="Already saved (Rp)" type="number" value={goalForm.saved_amount} onChange={e => setGoalForm({...goalForm, saved_amount:e.target.value})} />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input className="inp text-xs" placeholder="Target in how many years?" type="number" value={goalForm.target_years} onChange={e => setGoalForm({...goalForm, target_years:e.target.value})} />
                <input className="inp text-xs" placeholder="Emoji" value={goalForm.emoji} onChange={e => setGoalForm({...goalForm, emoji:e.target.value})} />
                <input className="inp text-xs" placeholder="Description" value={goalForm.description} onChange={e => setGoalForm({...goalForm, description:e.target.value})} />
              </div>
              <div className="flex gap-2">
                <button className="btn-blue btn-sm" onClick={addGoal}>Save Goal</button>
                <button className="btn-gray btn-sm" onClick={() => setShowAddGoal(false)}>Cancel</button>
              </div>
            </div>
          )}

          {dreamGoals.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
              <div className="text-4xl mb-2">🌟</div>
              <div className="font-semibold mb-1">No dream goals yet</div>
              <div className="text-sm">Add a savings goal to see how much you need to save each month</div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {dreamGoals.map(g => {
                const pct = Math.round((g.saved_amount / g.target_amount) * 100)
                const remaining = g.target_amount - g.saved_amount
                const monthsLeft = g.target_years * 12
                const perMonth = Math.round(remaining / monthsLeft)
                return (
                  <div key={g.id} className="card p-4 group">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
                          style={{ background: g.color + '20' }}>{g.emoji}</div>
                        <div>
                          <div className="text-sm font-bold">{g.title}</div>
                          {g.description && <div className="text-xs text-gray-400">{g.description}</div>}
                        </div>
                      </div>
                      <button onClick={() => deleteGoal(g.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-gray-50 rounded-xl p-2 text-center">
                        <div className="text-[10px] text-gray-400">Target</div>
                        <div className="text-sm font-bold" style={{ color: g.color }}>Rp {Number(g.target_amount).toLocaleString()}</div>
                      </div>
                      <div className="bg-green-50 rounded-xl p-2 text-center">
                        <div className="text-[10px] text-gray-400">Saved</div>
                        <div className="text-sm font-bold text-green-500">Rp {Number(g.saved_amount).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                      <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background:g.color }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-3">
                      <span>{pct}% saved</span>
                      <span>{g.target_years} years left</span>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 text-center border" style={{ borderColor: g.color + '30' }}>
                      <div className="text-[10px] text-gray-400">Nabung per bulan dari sekarang:</div>
                      <div className="text-lg font-bold mt-0.5" style={{ color: g.color }}>Rp {perMonth.toLocaleString()}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== REPORTS ===== */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card">
            <div className="card-h"><div className="text-xs font-bold text-blue-500 uppercase">📊 Export Laporan</div></div>
            <div className="p-4">
              <div className="text-sm text-gray-400 mb-4 leading-relaxed">
                Export data keuangan untuk keperluan pajak atau arsip. Filter by periode dan kategori.
              </div>
              <div className="mb-3">
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">Periode</label>
                <div className="flex gap-2">
                  <select className="sel flex-1 text-xs">
                    {MONTHS.map((m,i) => <option key={m} value={i}>{m} {new Date().getFullYear()}</option>)}
                  </select>
                  <span className="text-gray-400 flex items-center text-sm">→</span>
                  <select className="sel flex-1 text-xs">
                    {MONTHS.map((m,i) => <option key={m} value={i}>{m} {new Date().getFullYear()}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">Filter</label>
                <div className="flex flex-wrap gap-2">
                  {['Semua','Personal','Bisnis','Sambal Mak Tak','Polar Bed','KPR'].map(f => (
                    <button key={f} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-300 transition-all">
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-blue flex-1 btn-sm">📊 Export Excel</button>
                <button className="btn-gray flex-1 btn-sm">📄 Export PDF</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><div className="text-xs font-bold text-gray-400 uppercase">📈 {MONTHS[activeMonth]} Summary</div></div>
            <div className="p-4">
              {[
                { label:'Total Income', val:`Rp ${totalIn.toLocaleString()}`, color:'text-green-500' },
                { label:'Total Expenses', val:`Rp ${totalOut.toLocaleString()}`, color:'text-red-500' },
                { label:'Net Balance', val:`${totalIn-totalOut >= 0 ? '+' : ''}Rp ${(totalIn-totalOut).toLocaleString()}`, color: totalIn-totalOut >= 0 ? 'text-green-500' : 'text-red-500' },
                { label:'Fixed Expenses', val:`Rp ${totalFixed.toLocaleString()}`, color:'text-orange-500' },
                { label:'Transactions', val:`${transactions.length} items`, color:'text-blue-500' },
              ].map((s,i) => (
                <div key={i} className="flex justify-between py-2.5 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-500">{s.label}</span>
                  <span className={`font-bold ${s.color}`}>{s.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
