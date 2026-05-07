'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth } from 'date-fns'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [todos, setTodos] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [calMonth, setCalMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [eventForm, setEventForm] = useState({ title: '', date: format(new Date(), 'yyyy-MM-dd'), category: 'event', category_color: '#5B7FFF', start_time: '', end_time: '', all_day: true, notes: '' })
  const [categories, setCategories] = useState<any[]>([])
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [calMonth])

  async function load() {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    setUser(u)
    const [prof, td, hb, hl, ev, tr, cats] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', u.id).single(),
      supabase.from('todos').select('*').eq('user_id', u.id).neq('status', 'done').order('created_at', { ascending: false }).limit(5),
      supabase.from('habits').select('*').eq('user_id', u.id).eq('is_active', true),
      supabase.from('habit_logs').select('*').eq('user_id', u.id).eq('date', today),
      supabase.from('events').select('*').eq('user_id', u.id)
        .gte('date', format(startOfMonth(calMonth), 'yyyy-MM-dd'))
        .lte('date', format(endOfMonth(calMonth), 'yyyy-MM-dd'))
        .order('date'),
      supabase.from('transactions').select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(4),
      supabase.from('calendar_categories').select('*').eq('user_id', u.id),
    ])
    if (prof.data) setProfile(prof.data)
    if (td.data) setTodos(td.data)
    if (hb.data) setHabits(hb.data)
    if (hl.data) setHabitLogs(hl.data)
    if (ev.data) setEvents(ev.data)
    if (tr.data) setTransactions(tr.data)
    if (cats.data) setCategories(cats.data)
  }

  async function toggleHabit(habitId: string) {
    const done = habitLogs.some(l => l.habit_id === habitId && l.completed)
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    if (done) {
      await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('date', today).eq('user_id', u.id)
    } else {
      await supabase.from('habit_logs').upsert({ habit_id: habitId, date: today, completed: true, user_id: u.id })
    }
    load()
  }

async function addEvent() {
    if (!eventForm.title.trim()) return
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) { alert('Not logged in'); return }
    const { data, error } = await supabase.from('events').insert({
      title: eventForm.title,
      date: eventForm.date,
      category: eventForm.category,
      category_color: eventForm.category_color,
      start_time: eventForm.start_time || null,
      end_time: eventForm.end_time || null,
      all_day: eventForm.all_day,
      notes: eventForm.notes || null,
      user_id: u.id,
    })
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    setShowAddEvent(false)
    setEventForm({ title: '', date: format(new Date(), 'yyyy-MM-dd'), category: 'event', category_color: '#5B7FFF', start_time: '', end_time: '', all_day: true, notes: '' })
    load()
  }

  async function deleteEvent(id: string) {
    await supabase.from('events').delete().eq('id', id)
    load()
  }

  const days = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })
  const firstDay = startOfMonth(calMonth).getDay()
  const blanks = firstDay === 0 ? 6 : firstDay - 1
  const eventsOnDay = (dateStr: string) => events.filter(e => e.date === dateStr)
  const selectedEvents = selectedDate ? eventsOnDay(selectedDate) : []
  const importantEvents = events.filter(e => {
    const cat = categories.find(c => c.name === e.category)
    return cat?.is_important
  })
  const todayHabitsDone = habits.filter(h => habitLogs.some(l => l.habit_id === h.id && l.completed)).length
  const name = profile?.name || user?.email?.split('@')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const CAT_COLORS: Record<string, string> = {
    'Meeting': '#22C55E', 'Exam': '#5B7FFF', 'Deadline': '#EF4444',
    'Birthday': '#FF6B8A', 'Church': '#8B5CF6', 'Travel': '#14B8A6',
    'Payment Due': '#F97316', 'Personal': '#9090A8', 'event': '#5B7FFF',
  }

  const getCatColor = (cat: string) => {
    const found = categories.find(c => c.name === cat)
    return found?.color || CAT_COLORS[cat] || '#5B7FFF'
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">{greeting}, {name} ☀️</h1>
          <p className="text-xs text-gray-400 mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-white border border-gray-100 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm">⛅ Shanghai</div>
          <div className="bg-white border border-gray-100 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm">🇨🇳 RMB · 🇺🇸 USD</div>
        </div>
      </div>

      {/* ROW 1: Calendar + Important */}
      <div className="grid grid-cols-[1fr_300px] gap-4 mb-4">

        {/* CALENDAR */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <button onClick={() => setCalMonth(subMonths(calMonth, 1))} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 text-sm">‹</button>
              <span className="font-bold text-sm">{format(calMonth, 'MMMM yyyy')}</span>
              <button onClick={() => setCalMonth(addMonths(calMonth, 1))} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 text-sm">›</button>
            </div>
            <button onClick={() => setShowAddEvent(true)} className="btn-blue btn-sm flex items-center gap-1 text-xs">
              <Plus size={12} /> Add Event
            </button>
          </div>

          {/* Add event form */}
          {showAddEvent && (
            <div className="border-b border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-gray-400 uppercase">New Event</div>
                <button onClick={() => setShowAddEvent(false)}><X size={14} className="text-gray-400" /></button>
              </div>
              <div className="flex gap-2 flex-wrap mb-2">
                <input className="inp flex-1 min-w-[160px] text-xs" placeholder="Event title" value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && addEvent()} autoFocus />
                <input type="date" className="sel text-xs" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} />
                <select className="sel text-xs" value={eventForm.category} onChange={e => {
                  const cat = categories.find(c => c.name === e.target.value)
                  setEventForm({ ...eventForm, category: e.target.value, category_color: cat?.color || CAT_COLORS[e.target.value] || '#5B7FFF' })
                }}>
                  {categories.length > 0
                    ? categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)
                    : ['event','Meeting','Exam','Deadline','Birthday','Church','Travel','Payment Due'].map(c => <option key={c} value={c}>{c}</option>)
                  }
                </select>
              </div>
              <div className="flex gap-2 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={eventForm.all_day} onChange={e => setEventForm({ ...eventForm, all_day: e.target.checked })} />
                  All day
                </label>
                {!eventForm.all_day && (
                  <>
                    <input type="time" className="sel text-xs" value={eventForm.start_time} onChange={e => setEventForm({ ...eventForm, start_time: e.target.value })} />
                    <span className="text-gray-400 text-xs flex items-center">–</span>
                    <input type="time" className="sel text-xs" value={eventForm.end_time} onChange={e => setEventForm({ ...eventForm, end_time: e.target.value })} />
                  </>
                )}
              </div>
              <textarea className="inp text-xs resize-none mb-2" rows={2} placeholder="Notes (optional)" value={eventForm.notes} onChange={e => setEventForm({ ...eventForm, notes: e.target.value })} />
              <div className="flex gap-2">
                <button className="btn-blue btn-sm" onClick={addEvent}>Save Event</button>
                <button className="btn-gray btn-sm" onClick={() => setShowAddEvent(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="text-[10px] font-bold text-gray-400 text-center py-1">{d}</div>
              ))}
            </div>
            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}
              {days.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const dayEvents = eventsOnDay(dateStr)
                const isTod = isToday(day)
                const isSel = selectedDate === dateStr
                return (
                  <div key={dateStr} onClick={() => setSelectedDate(isSel ? null : dateStr)}
                    className={`min-h-[52px] p-1 rounded-xl cursor-pointer border transition-all hover:bg-gray-50
                      ${isTod ? 'border-blue-400 bg-blue-50' : isSel ? 'border-blue-300 bg-blue-50/40' : 'border-transparent'}`}>
                    <div className={`text-[11px] font-bold mb-0.5 text-center ${isTod ? 'text-blue-500' : isSameMonth(day, calMonth) ? 'text-gray-700' : 'text-gray-300'}`}>
                      {format(day, 'd')}
                    </div>
                    {dayEvents.slice(0, 2).map(ev => (
                      <div key={ev.id} className="text-[9px] font-semibold px-1 py-0.5 rounded mb-0.5 truncate text-white"
                        style={{ background: getCatColor(ev.category) }}>
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && <div className="text-[9px] text-gray-400 text-center">+{dayEvents.length - 2}</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected day popup */}
          {selectedDate && (
            <div className="border-t border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-gray-500">{format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMMM d')}</div>
                <div className="flex gap-1.5">
                  <button onClick={() => { setEventForm({ ...eventForm, date: selectedDate }); setShowAddEvent(true) }}
                    className="text-xs text-blue-500 font-semibold hover:underline">+ Add</button>
                  <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                </div>
              </div>
              {selectedEvents.length === 0 ? (
                <div className="text-xs text-gray-400 italic">No events. Click + Add to create one.</div>
              ) : selectedEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 mb-1.5 group">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getCatColor(ev.category) }} />
                  <span className="text-sm flex-1 font-medium">{ev.title}</span>
                  {ev.start_time && <span className="text-xs text-gray-400">{ev.start_time}</span>}
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: getCatColor(ev.category) }}>{ev.category}</span>
                  <button onClick={() => deleteEvent(ev.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-2 px-4 py-2.5 border-t border-gray-100 flex-wrap">
            {(categories.length > 0 ? categories : [
              { name: 'Meeting', color: '#22C55E' }, { name: 'Exam', color: '#5B7FFF' },
              { name: 'Deadline', color: '#EF4444' }, { name: 'Birthday', color: '#FF6B8A' },
              { name: 'Church', color: '#8B5CF6' },
            ]).slice(0, 6).map((cat: any) => (
              <div key={cat.name} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
                <span className="text-[10px] text-gray-400">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* IMPORTANT */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-bold text-red-500 uppercase tracking-wide">⚡ Important</span>
            <Link href="/calendar" className="text-xs text-blue-500 font-semibold">Manage →</Link>
          </div>
          {importantEvents.length === 0 ? (
            <div className="p-5 text-center text-gray-400 text-xs">
              No important events.<br/>
              <Link href="/calendar" className="text-blue-500 font-semibold">Add categories in Calendar →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {importantEvents.slice(0, 8).map(ev => (
                <div key={ev.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50">
                  <div className="w-8 h-8 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-white"
                    style={{ background: getCatColor(ev.category) }}>
                    <span className="text-xs font-bold leading-none">{format(new Date(ev.date), 'd')}</span>
                    <span className="text-[8px] uppercase">{format(new Date(ev.date), 'MMM')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{ev.title}</div>
                    <div className="text-[10px] text-gray-400">{ev.category}{ev.start_time ? ` · ${ev.start_time}` : ''}</div>
                  </div>
                  <div className={`text-[10px] font-bold ${ev.date === today ? 'text-red-500' : 'text-gray-400'}`}>
                    {ev.date === today ? 'TODAY' : format(new Date(ev.date), 'MMM d')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* ROW 2: Habit + To Do */}
      <div className="grid grid-cols-2 gap-4 mb-4">

        {/* DAILY HABIT */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-green-50">
            <span className="text-xs font-bold text-green-600 uppercase tracking-wide">✅ Daily Habit</span>
            <Link href="/habit" className="text-xs text-green-600 font-semibold">View detail →</Link>
          </div>
          {habits.length === 0 ? (
            <div className="p-5 text-center text-gray-400 text-xs">
              No habits yet. <Link href="/habit" className="text-blue-500 font-semibold">Add habits →</Link>
            </div>
          ) : (
            <>
              {habits.map(h => {
                const done = habitLogs.some(l => l.habit_id === h.id && l.completed)
                return (
                  <div key={h.id} onClick={() => toggleHabit(h.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 transition-all ${done ? 'bg-green-50/30' : ''}`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center text-[10px] transition-all
                      ${done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200 hover:border-green-400'}`}>
                      {done && '✓'}
                    </div>
                    <span className="text-base">{h.icon}</span>
                    <span className={`flex-1 text-sm ${done ? 'line-through text-gray-400' : ''}`}>{h.name}</span>
                  </div>
                )
              })}
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Today's progress</span>
                  <span className="font-bold text-green-600">{todayHabitsDone}/{habits.length}</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${habits.length > 0 ? (todayHabitsDone / habits.length) * 100 : 0}%` }} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* TO DO LIST */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-bold text-blue-500 uppercase tracking-wide">✅ To Do — Today</span>
            <Link href="/todo" className="text-xs text-blue-500 font-semibold">View all →</Link>
          </div>
          {todos.length === 0 ? (
            <div className="p-5 text-center text-gray-400 text-xs">
              No tasks. <Link href="/todo" className="text-blue-500 font-semibold">Add one →</Link>
            </div>
          ) : (
            todos.map(t => (
              <div key={t.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-xs">
                <div className="w-4 h-4 rounded border-2 border-gray-200 flex-shrink-0" />
                <span className="flex-1 text-sm">{t.title}</span>
                {t.deadline && (
                  <span className={`text-[10px] font-semibold ${new Date(t.deadline) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                    {t.deadline}
                  </span>
                )}
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: t.category === 'School' ? '#EEF1FF' : t.category === 'Content' ? '#F0FDF4' : t.category === 'Business' ? '#FFF7ED' : '#F6F5FA', color: t.category === 'School' ? '#5B7FFF' : t.category === 'Content' ? '#22C55E' : t.category === 'Business' ? '#F97316' : '#9090A8' }}>
                  {t.category}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ROW 3: Financial */}
      <div className="card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-xs font-bold text-teal-500 uppercase tracking-wide">💰 Financial — Recent</span>
          <Link href="/financial" className="text-xs text-teal-500 font-semibold">View all →</Link>
        </div>
        {transactions.length === 0 ? (
          <div className="p-5 text-center text-gray-400 text-xs">
            No transactions yet. <Link href="/financial" className="text-blue-500 font-semibold">Add one →</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {transactions.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <div className="flex-1">
                  <div className="text-sm font-medium">{t.description}</div>
                  <div className="text-xs text-gray-400">{t.date} · {t.account_name} · {t.category}</div>
                </div>
                <span className={`text-sm font-bold ${t.kredit ? 'text-green-500' : 'text-red-500'}`}>
                  {t.kredit ? `+Rp ${Number(t.kredit).toLocaleString()}` : `-Rp ${Number(t.debit).toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
