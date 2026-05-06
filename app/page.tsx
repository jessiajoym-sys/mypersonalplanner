'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'

export default function Dashboard() {
  const [todos, setTodos] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [t, h, hl, e, tr] = await Promise.all([
        supabase.from('todos').select('*').eq('user_id', user.id).neq('status','done').limit(5),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', user.id).eq('date', today),
        supabase.from('events').select('*').eq('user_id', user.id).gte('date', today).order('date').limit(5),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', {ascending:false}).limit(4),
      ])
      if (t.data) setTodos(t.data)
      if (h.data) setHabits(h.data)
      if (hl.data) setHabitLogs(hl.data)
      if (e.data) setEvents(e.data)
      if (tr.data) setTransactions(tr.data)
    }
    load()
  }, [])

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay()
  const todayHabitsDone = habits.filter(h => habitLogs.some(l => l.habit_id === h.id && l.completed)).length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">Good morning, Siviya ☀️</h1>
          <p className="text-xs text-gray-400 mt-0.5">{format(now, 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-white border border-gray-100 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm">⛅ 28°C Shanghai</div>
          <div className="bg-white border border-gray-100 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm">🇨🇳 RMB = Rp 2.240 | 🇺🇸 USD = Rp 16.400</div>
        </div>
      </div>

      {/* Row 1: Calendar + Weather */}
      <div className="grid grid-cols-[1fr_260px] gap-4 mb-4">
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-blue-500 uppercase tracking-wide">📅 {format(now, 'MMMM yyyy')}</span>
            <Link href="/calendar" className="text-xs text-blue-500 font-semibold">View full →</Link>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-7 mb-1">{['M','T','W','T','F','S','S'].map((d,i)=><div key={i} className="text-[10px] font-semibold text-gray-400 text-center">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({length: firstDay === 0 ? 6 : firstDay-1}).map((_,i)=><div key={i}/>)}
              {Array.from({length: daysInMonth}).map((_,i)=>{
                const d = i+1; const isToday = d === now.getDate()
                return <div key={d} className={`text-xs text-center py-1.5 rounded-lg cursor-pointer ${isToday ? 'bg-blue-500 text-white font-bold' : 'text-gray-600 hover:bg-gray-100'}`}>{d}</div>
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl p-4 text-white" style={{background:'linear-gradient(135deg,#4A90D9,#357ABD)'}}>
            <div className="flex justify-between items-start mb-2">
              <div><div className="text-3xl font-bold">28°C</div><div className="text-xs opacity-80 mt-1">Partly Cloudy · Shanghai</div></div>
              <div className="text-4xl">⛅</div>
            </div>
            <div className="flex gap-3 text-xs opacity-80"><span>💧 72%</span><span>💨 12km/h</span></div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">💱 Exchange Rate</div>
            {[{f:'🇨🇳',p:'1 RMB → IDR',r:'Rp 2.240'},{f:'🇺🇸',p:'1 USD → IDR',r:'Rp 16.400'},{f:'🇺🇸',p:'1 USD → RMB',r:'¥ 7.32'}].map((c,i)=>(
              <div key={i} className={`flex items-center gap-2 py-1.5 text-xs ${i<2?'border-b border-gray-100':''}`}>
                <span>{c.f}</span><span className="flex-1">{c.p}</span><span className="font-bold text-blue-500">{c.r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Upcoming + Important */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <span className="text-xs font-bold text-purple-500 uppercase tracking-wide">🗓️ Upcoming This Month</span>
            <Link href="/calendar" className="text-xs text-blue-500 font-semibold">View all →</Link>
          </div>
          {events.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              No upcoming events.<br/>
              <Link href="/calendar" className="text-blue-500 font-semibold text-xs">Add one →</Link>
            </div>
          ) : events.map(ev => (
            <div key={ev.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center text-center flex-shrink-0
                ${ev.type==='exam'?'bg-blue-50 text-blue-500':ev.type==='deadline'?'bg-red-50 text-red-500':'bg-purple-50 text-purple-500'}`}>
                <span className="text-sm font-bold leading-none">{format(new Date(ev.date),'d')}</span>
                <span className="text-[9px] uppercase">{format(new Date(ev.date),'MMM')}</span>
              </div>
              <div>
                <div className="text-[13px] font-semibold">{ev.title}</div>
                <span className={`tag text-[10px] ${ev.type==='exam'?'bg-blue-50 text-blue-500':ev.type==='deadline'?'bg-red-50 text-red-500':'bg-purple-50 text-purple-500'}`}>{ev.type}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <span className="text-xs font-bold text-red-500 uppercase tracking-wide">⚡ Important</span>
            <Link href="/calendar" className="text-xs text-blue-500 font-semibold">+ Add</Link>
          </div>
          {[
            {section:'📅 Meetings', items:[{t:'Interview ECNU — online',d:'May 21 · 14.00'},{t:'Meeting Zeng Rui re: travel',d:'May 10'}]},
            {section:'⏰ Deadlines', items:[{t:'Buy plane insurance',d:'TODAY',red:true},{t:'CC BNI payment',d:'Jun 15'}]},
            {section:'📝 Exams', items:[{t:'HSK Level 4 Exam',d:'May 15'},{t:'IELTS Practice Test',d:'May 20'}]},
          ].map(s => (
            <div key={s.section} className="px-4 py-2.5 border-b border-gray-100 last:border-0">
              <div className="text-[9px] font-bold uppercase text-gray-400 mb-1.5">{s.section}</div>
              {s.items.map((item,i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0"/>
                  <span className="flex-1">{item.t}</span>
                  <span className={(item as any).red ? 'text-red-500 font-bold' : 'text-gray-400'}>{item.d}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Habit summary */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100 bg-green-50 flex justify-between items-center">
          <span className="text-xs font-bold text-green-600 uppercase tracking-wide">✅ Daily Habit — Today's Progress</span>
          <Link href="/habit" className="text-xs text-green-600 font-semibold">View detail →</Link>
        </div>
        <div className="p-4">
          {habits.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-sm">
              No habits yet. <Link href="/habit" className="text-blue-500 font-semibold">Add habits →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {habits.map(h => {
                const done = habitLogs.some(l => l.habit_id === h.id && l.completed)
                return (
                  <div key={h.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${done ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center text-[10px] ${done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200'}`}>{done && '✓'}</div>
                    <span>{h.icon}</span>
                    <span className={`text-xs ${done ? 'line-through text-gray-400' : ''}`}>{h.name}</span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-green-600">🔥 {todayHabitsDone}/{habits.length} habits done today</span>
          </div>
        </div>
      </div>

      {/* Row 4: To Do + Recent transactions */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <span className="text-xs font-bold text-blue-500 uppercase tracking-wide">✅ To Do List</span>
            <Link href="/todo" className="text-xs text-blue-500 font-semibold">View all →</Link>
          </div>
          {todos.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No tasks yet. <Link href="/todo" className="text-blue-500 font-semibold">Add one →</Link></div>
          ) : todos.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 last:border-0 text-xs hover:bg-gray-50">
              <div className="w-4 h-4 rounded border-2 border-gray-200 flex-shrink-0"/>
              <span className="flex-1">{t.title}</span>
              <span className={`tag text-[10px] ${t.category==='Study'?'bg-blue-50 text-blue-500':t.category==='Bisnis'?'bg-green-50 text-green-500':'bg-orange-50 text-orange-500'}`}>{t.category}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <span className="text-xs font-bold text-teal-500 uppercase tracking-wide">💰 Recent Transactions</span>
            <Link href="/financial" className="text-xs text-blue-500 font-semibold">View all →</Link>
          </div>
          {transactions.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No transactions yet. <Link href="/financial" className="text-blue-500 font-semibold">Add one →</Link></div>
          ) : transactions.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 last:border-0 text-xs hover:bg-gray-50">
              <div className="flex-1"><div className="font-medium">{t.description}</div><div className="text-gray-400">{t.date}</div></div>
              <span className={t.kredit ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>{t.kredit ? `+Rp ${Number(t.kredit).toLocaleString()}` : `-Rp ${Number(t.debit).toLocaleString()}`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
