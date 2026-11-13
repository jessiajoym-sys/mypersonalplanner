'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { onChange } from '@/lib/planner'
import { BizData, loadBiz } from '@/lib/business'
import Overview from '@/components/business/Overview'
import Ledger from '@/components/business/Ledger'
import Platforms from '@/components/business/Platforms'
import Invoices from '@/components/business/Invoices'
import Inventory from '@/components/business/Inventory'
import Reports from '@/components/business/Reports'
import Plans from '@/components/business/Plans'
import Marketing from '@/components/business/Marketing'
import Work from '@/components/business/Work'
import Settings from '@/components/business/Settings'

const TABS = [['overview', '📊 Overview'], ['ledger', '🧾 Ledger'], ['platforms', '🛒 Sales & Ads'], ['invoices', '📬 Receivable / Payable'], ['inventory', '📦 Inventory'], ['reports', '📑 Reports'], ['plans', '🗓️ Plans'], ['marketing', '🎬 Marketing'], ['work', '✅ Tasks & Projects'], ['settings', '⚙️ Settings']]

export default function BusinessPage() {
  const { businessId } = useParams<{ businessId: string }>()
  const id = decodeURIComponent(String(businessId || ''))
  const [d, setD] = useState<(BizData & { missing: boolean }) | null>(null)
  const [userId, setUserId] = useState('')
  const [accounts, setAccounts] = useState<any[]>([])
  const [tab, setTab] = useState('overview')
  const [sub, setSub] = useState<'receivable' | 'payable'>('receivable')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const [bd, ac] = await Promise.all([loadBiz(supabase, user.id, id), supabase.from('accounts').select('id,name,currency,type').eq('user_id', user.id).eq('is_active', true).order('name')])
    setD(bd); setAccounts(ac.data || []); setLoading(false)
  }, [id])
  useEffect(() => { void load() }, [load])
  useEffect(() => onChange(() => { void load() }), [load])
  useEffect(() => { try { const t = sessionStorage.getItem('biz-tab'); if (t) setTab(t) } catch {} }, [])
  const go = (t: string) => { setTab(t); try { sessionStorage.setItem('biz-tab', t) } catch {} }
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 5000) }

  if (loading) return <div className="card p-10 text-center text-gray-500">Loading business…</div>
  if (!d?.biz) return <div className="card p-8"><h1 className="font-bold text-lg">Business not found</h1><p className="text-sm text-gray-500 mt-2">It may be archived, or you may need to add it first.</p><Link href="/dashboard/business" className="btn-blue btn-sm inline-flex mt-4">Back to Business Dashboard</Link></div>
  const bp = { d, userId, accounts, reload: load, toast }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <header className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: `${d.biz.color || '#5B7FFF'}22` }}>{d.biz.emoji || '💼'}</div>
        <div><h1 className="text-2xl font-bold">{d.biz.name}</h1><p className="text-xs text-gray-500">{d.biz.description || 'Business workspace'} · books in {d.biz.currency || 'IDR'}</p></div>
      </header>
      {d.missing && <div className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">Some business tables are missing. Run <b>lib/planner-upgrade-6.sql</b> in Supabase → SQL Editor, then refresh.</div>}
      {msg && <div className={`rounded-xl p-3 text-sm ${/could not|error/i.test(msg) ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}
      <nav className="card p-2 flex gap-1.5 overflow-x-auto print:hidden">{TABS.map(([k, l]) => <button key={k} onClick={() => go(k)} className={`px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${tab === k ? 'bg-teal-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{l}</button>)}</nav>
      {tab === 'overview' && <Overview {...bp} go={go} />}
      {tab === 'ledger' && <Ledger {...bp} />}
      {tab === 'platforms' && <Platforms {...bp} />}
      {tab === 'invoices' && <div className="space-y-4"><div className="flex rounded-lg bg-gray-100 p-0.5 text-xs w-fit">{(['receivable', 'payable'] as const).map(k => <button key={k} onClick={() => setSub(k)} className={`px-4 py-1.5 rounded-md font-semibold ${sub === k ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{k === 'receivable' ? 'Customers owe me' : 'I owe suppliers'}</button>)}</div><Invoices {...bp} kind={sub} /></div>}
      {tab === 'inventory' && <Inventory {...bp} />}
      {tab === 'reports' && <Reports {...bp} />}
      {tab === 'plans' && <Plans {...bp} />}
      {tab === 'marketing' && <Marketing {...bp} />}
      {tab === 'work' && <Work {...bp} />}
      {tab === 'settings' && <Settings {...bp} />}
    </div>
  )
}
