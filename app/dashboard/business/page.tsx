'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ArrowUpRight, Plus } from 'lucide-react'

export default function BusinessDashboard() {
  const [businesses, setBusinesses] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { void load() }, [])
  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [businessResult, transactionResult] = await Promise.all([
      supabase.from('businesses').select('*').eq('user_id', user.id).eq('status', 'active').order('sort_order'),
      supabase.from('transactions').select('*').eq('user_id', user.id).is('deleted_at', null).order('transaction_date', { ascending: false }),
    ])
    if (businessResult.error || transactionResult.error) setError(businessResult.error?.message || transactionResult.error?.message || 'Unable to load business data.')
    setBusinesses(businessResult.data || []); setTransactions(transactionResult.data || []); setLoading(false)
  }
  const month = new Date().toISOString().slice(0, 7)
  const formatMoney = (amount: number, currency = 'IDR') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  const businessTotals = (id: string) => {
    const rows = transactions.filter(row => row.business_id === id && row.transaction_date?.startsWith(month))
    const income = rows.filter(row => row.type === 'income').reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const expenses = rows.filter(row => ['expense', 'fee', 'credit_card_purchase'].includes(row.type)).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    return { income, expenses, net: income - expenses, rows: rows.length }
  }
  const totalIncome = businesses.reduce((sum, business) => sum + businessTotals(business.id).income, 0)
  const totalExpenses = businesses.reduce((sum, business) => sum + businessTotals(business.id).expenses, 0)
  return <div className="max-w-6xl mx-auto space-y-5"><header className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-2xl font-bold">Business Dashboard</h1><p className="text-sm text-gray-500 mt-1">Your businesses and tagged transactions for this month.</p></div><Link href="/business/new" className="btn-blue btn-sm flex items-center gap-1"><Plus size={15} /> Add business</Link></header>{error && <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</div>}{loading ? <div className="card p-8 text-center text-gray-500">Loading businesses…</div> : <><div className="grid md:grid-cols-3 gap-3"><div className="card p-5"><div className="text-xs text-gray-500">Business income</div><b className="text-xl text-green-600">{formatMoney(totalIncome)}</b></div><div className="card p-5"><div className="text-xs text-gray-500">Business expenses</div><b className="text-xl text-red-500">{formatMoney(totalExpenses)}</b></div><div className="card p-5"><div className="text-xs text-gray-500">Net business activity</div><b className="text-xl">{formatMoney(totalIncome - totalExpenses)}</b></div></div>{businesses.length === 0 ? <div className="card p-10 text-center"><div className="text-4xl">💼</div><p className="font-semibold mt-2">No businesses yet</p><p className="text-sm text-gray-500 mt-1">Add a business to track its tasks and finances.</p><Link href="/business/new" className="btn-blue btn-sm inline-flex mt-4">Add business</Link></div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{businesses.map(business => { const totals = businessTotals(business.id); return <Link key={business.id} href={`/business/${business.id}`} className="card p-5 hover:shadow-md transition-shadow"><div className="flex justify-between"><span className="text-3xl">{business.emoji || '💼'}</span><ArrowUpRight size={17} className="text-gray-400" /></div><h2 className="font-bold text-lg mt-3">{business.name}</h2><p className="text-xs text-gray-500 mt-1 line-clamp-2">{business.description || 'Business workspace'}</p><div className="grid grid-cols-2 gap-2 mt-4 text-sm"><div><div className="text-xs text-gray-500">Income</div><b className="text-green-600">{formatMoney(totals.income)}</b></div><div><div className="text-xs text-gray-500">Expenses</div><b className="text-red-500">{formatMoney(totals.expenses)}</b></div></div><div className="text-xs text-gray-500 mt-3">{totals.rows} transactions · Net {formatMoney(totals.net)}</div></Link> })}</div>}</>}</div>
}
