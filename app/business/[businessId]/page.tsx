'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Plus } from 'lucide-react'

export default function CustomBusinessPage() {
  const params = useParams<{ businessId: string }>()
  const businessId = String(params.businessId || '')
  const [business, setBusiness] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [taskTitle, setTaskTitle] = useState('')
  const [tab, setTab] = useState('overview')
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (businessId) void load() }, [businessId])
  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const [businessResult, transactionResult, taskResult] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', businessId).eq('user_id', user.id).maybeSingle(),
      supabase.from('transactions').select('*').eq('business_id', businessId).eq('user_id', user.id).is('deleted_at', null).order('transaction_date', { ascending: false }),
      supabase.from('todos').select('*').eq('business_id', businessId).eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    setBusiness(businessResult.data)
    setTransactions(transactionResult.data || [])
    setTasks(taskResult.data || [])
    if (businessResult.error || transactionResult.error || taskResult.error) setError((businessResult.error || transactionResult.error || taskResult.error)?.message || '')
    setLoading(false)
  }
  async function addTask() {
    if (!taskTitle.trim()) return
    const { error: saveError } = await supabase.from('todos').insert({ user_id: userId, title: taskTitle.trim(), business_id: businessId, category: business?.name || 'Business', status: 'pending', priority: 'medium' })
    if (saveError) setError(saveError.message); else { setTaskTitle(''); await load() }
  }
  async function toggleTask(task: any) {
    const { error: saveError } = await supabase.from('todos').update({ status: task.status === 'done' ? 'pending' : 'done', completed_at: task.status === 'done' ? null : new Date().toISOString() }).eq('id', task.id).eq('user_id', userId)
    if (saveError) setError(saveError.message); else await load()
  }
  const currentMonth = new Date().toISOString().slice(0, 7)
  const monthTransactions = useMemo(() => transactions.filter(row => row.transaction_date?.startsWith(currentMonth)), [transactions, currentMonth])
  const income = monthTransactions.filter(row => row.type === 'income').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const spending = monthTransactions.filter(row => ['expense', 'credit_card_purchase', 'fee'].includes(row.type)).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const fmt = (amount: number, currency = 'IDR') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)

  if (loading) return <div className="card p-10 text-center text-gray-500">Loading business…</div>
  if (!business) return <div className="card p-8"><h1 className="font-bold text-lg">Business not found</h1><p className="text-sm text-gray-500 mt-2">This business may have been archived or you may not have access to it.</p></div>

  return <div className="max-w-6xl mx-auto space-y-5"><header className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: `${business.color || '#5B7FFF'}20` }}>{business.emoji || '💼'}</div><div><h1 className="text-2xl font-bold">{business.name}</h1><p className="text-sm text-gray-500">{business.description || 'Business workspace'}</p></div></header>
    {error && <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</div>}
    <nav className="card p-2 flex flex-wrap gap-2">{['overview','tasks','financial'].map(item => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${tab === item ? 'bg-teal-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{item === 'financial' ? 'Financial Summary' : item}</button>)}</nav>
    {tab === 'overview' && <div className="space-y-4"><div className="grid md:grid-cols-3 gap-3"><div className="card p-5"><div className="text-xs text-gray-500">Income this month</div><b className="text-xl text-green-600">{fmt(income)}</b></div><div className="card p-5"><div className="text-xs text-gray-500">Expenses this month</div><b className="text-xl text-red-500">{fmt(spending)}</b></div><div className="card p-5"><div className="text-xs text-gray-500">Net this month</div><b className="text-xl">{fmt(income - spending)}</b></div></div><div className="card p-5"><h2 className="font-bold">Business at a glance</h2><p className="text-sm text-gray-500 mt-2">Record business income and expenses in Financial Planner, then assign this business to each transaction. Reports here use those tagged transactions.</p><button onClick={() => window.location.assign('/financial')} className="btn-blue btn-sm mt-4">Open Financial Planner</button></div></div>}
    {tab === 'tasks' && <div className="card p-5 space-y-4"><h2 className="font-bold">Business tasks</h2><div className="flex gap-2"><input className="inp flex-1" placeholder="Add a task" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && void addTask()} /><button onClick={() => void addTask()} className="btn-blue btn-sm"><Plus size={15} /></button></div>{tasks.length === 0 ? <p className="text-sm text-gray-500">No business tasks yet.</p> : tasks.map(task => <label key={task.id} className="flex gap-3 items-center border-b border-gray-100 py-2"><input type="checkbox" checked={task.status === 'done'} onChange={() => void toggleTask(task)} /><span className={task.status === 'done' ? 'line-through text-gray-400' : ''}>{task.title}</span></label>)}</div>}
    {tab === 'financial' && <div className="card p-5"><h2 className="font-bold">Business transactions</h2>{monthTransactions.length === 0 ? <p className="text-sm text-gray-500 mt-3">No tagged transactions this month yet. Add one in Financial Planner and choose {business.name} in the Business field.</p> : <div className="mt-3 divide-y">{monthTransactions.map(row => <div key={row.id} className="py-3 flex justify-between gap-3 text-sm"><div><b>{row.merchant || row.description || row.category}</b><div className="text-xs text-gray-500">{row.transaction_date} · {row.category}</div></div><span className={row.type === 'income' ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>{row.type === 'income' ? '+' : '−'}{fmt(Number(row.amount), row.currency)}</span></div>)}</div>}</div>}
  </div>
}
