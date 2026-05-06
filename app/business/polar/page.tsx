'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { usePathname } from 'next/navigation'

const BIZ_INFO: Record<string, any> = {
  sambal: { name: 'Sambal Mak Tak', emoji: '🌶️', color: '#EF4444', desc: 'Homemade sambal business', target: 100000000 },
  polar: { name: 'Polar Bed', emoji: '🛏️', color: '#5B7FFF', desc: 'Blanket & bedding products', target: 100000000 },
  chishee: { name: 'Chishee Blanket', emoji: '🧣', color: '#8B5CF6', desc: 'Bulk blanket manufacturing', target: 50000000 },
  homemate: { name: 'Homemate', emoji: '🏠', color: '#22C55E', desc: 'Healthy food & property', target: 30000000 },
  jastip: { name: 'Jastip China', emoji: '✈️', color: '#14B8A6', desc: 'Personal shopper from China', target: 20000000 },
}

export default function BusinessPage() {
  const path = usePathname()
  const slug = path.split('/').pop() || 'sambal'
  const info = BIZ_INFO[slug] || BIZ_INFO.sambal
  const [todos, setTodos] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('overview')
  const [newTask, setNewTask] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [t, tr] = await Promise.all([
      supabase.from('todos').select('*').eq('user_id', user.id).eq('business_id', slug).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').eq('user_id', user.id).eq('business_id', slug).order('date', { ascending: false }).limit(10),
    ])
    if (t.data) setTodos(t.data)
    if (tr.data) setTransactions(tr.data)
  }

  async function addTask() {
    if (!newTask.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('todos').insert({ title: newTask, business_id: slug, category: info.name, user_id: user.id, status: 'pending', priority: 'medium', micro_list: [] })
    setNewTask('')
    load()
  }

  async function toggleTask(todo: any) {
    await supabase.from('todos').update({ status: todo.status === 'done' ? 'pending' : 'done' }).eq('id', todo.id)
    load()
  }

  const totalIn = transactions.reduce((s, t) => s + (t.kredit || 0), 0)
  const totalOut = transactions.reduce((s, t) => s + (t.debit || 0), 0)

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: info.color + '20' }}>{info.emoji}</div>
        <div>
          <h1 className="text-xl font-bold">{info.name}</h1>
          <p className="text-xs text-gray-400">{info.desc}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {['overview','tasks','financial','content'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all capitalize ${activeTab === t ? 'text-white' : 'bg-white border border-gray-100 text-gray-400'}`}
            style={activeTab === t ? { background: info.color } : {}}>
            {t === 'overview' ? '📊 Overview' : t === 'tasks' ? '✅ Tasks' : t === 'financial' ? '💰 Financial' : '📱 Content'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card p-4"><div className="text-xs text-gray-400 mb-1">Revenue this month</div><div className="text-xl font-bold" style={{ color: '#22C55E' }}>Rp {totalIn.toLocaleString()}</div></div>
            <div className="card p-4"><div className="text-xs text-gray-400 mb-1">Expenses this month</div><div className="text-xl font-bold text-red-500">Rp {totalOut.toLocaleString()}</div></div>
            <div className="card p-4"><div className="text-xs text-gray-400 mb-1">Profit</div><div className="text-xl font-bold text-blue-500">Rp {(totalIn - totalOut).toLocaleString()}</div></div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-bold text-gray-400 uppercase mb-3">Revenue Target Progress</div>
            <div className="flex justify-between text-sm mb-1"><span>This month</span><span className="font-bold">Rp {totalIn.toLocaleString()} / Rp {info.target.toLocaleString()}</span></div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((totalIn / info.target) * 100, 100)}%`, background: info.color }} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="card">
          <div className="flex gap-2 p-4 border-b border-gray-100">
            <input className="inp flex-1" placeholder="Add task..." value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} />
            <button className="btn-sm text-white font-semibold px-4 rounded-xl" style={{ background: info.color }} onClick={addTask}>Add</button>
          </div>
          {todos.length === 0 ? <div className="p-6 text-center text-xs text-gray-400">No tasks yet</div> :
            todos.map(t => (
              <div key={t.id} onClick={() => toggleTask(t)} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${t.status === 'done' ? 'opacity-50' : ''}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs ${t.status === 'done' ? 'text-white' : 'border-gray-200'}`} style={t.status === 'done' ? { background: info.color, borderColor: info.color } : {}}>{t.status === 'done' && '✓'}</div>
                <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-gray-400' : ''}`}>{t.title}</span>
                {t.deadline && <span className="text-xs text-gray-400">{t.deadline}</span>}
              </div>
            ))}
        </div>
      )}

      {activeTab === 'financial' && (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-xs text-blue-600">
            🔗 Transactions with category "{info.name}" from Financial Planner appear here automatically.
          </div>
          <div className="card">
            {transactions.length === 0 ? <div className="p-6 text-center text-xs text-gray-400">No transactions yet. Add them in Financial Planner with category "{info.name}"</div> :
              transactions.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                  <div className="flex-1"><div className="text-sm font-medium">{t.description}</div><div className="text-xs text-gray-400">{t.date}</div></div>
                  <span className={`text-sm font-bold ${t.kredit ? 'text-green-500' : 'text-red-500'}`}>{t.kredit ? `+Rp ${t.kredit.toLocaleString()}` : `-Rp ${t.debit?.toLocaleString()}`}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {activeTab === 'content' && (
        <div className="card p-4">
          <div className="text-sm text-gray-400 text-center py-8">Content planning coming soon!</div>
        </div>
      )}
    </div>
  )
}
