'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth } from 'date-fns'
import Link from 'next/link'
import { Plus, X, Trash2 } from 'lucide-react'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [todaysTasks, setTodaysTasks] = useState<any[]>([])
  const [todaysErrands, setTodaysErrands] = useState<any[]>([])
  const [todaysEvents, setTodaysEvents] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [importantEvents, setImportantEvents] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [calMonth, setCalMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showManageCats, setShowManageCats] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatColor, setEditingCatColor] = useState('')
  
  // New category form
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#5B7FFF')
  const [newCatIcon, setNewCatIcon] = useState('📅')
  const [newCatImportant, setNewCatImportant] = useState(false)

  // New task form
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    task_type: 'task',
    priority: 'medium',
    scheduled_date: format(new Date(), 'yyyy-MM-dd'),
  })

  // New event form
  const [eventForm, setEventForm] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    category: 'Meeting',
    category_color: '#22C55E',
    start_time: '',
    end_time: '',
    all_day: true,
    notes: '',
  })

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    load()
  }, [calMonth])

  async function load() {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    setUser(u)

    const [
      profRes,
      tasksRes,
      eventsRes,
      habitsRes,
      habitLogsRes,
      transRes,
      catsRes
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', u.id).single(),
      
      // Today's tasks (scheduled for today, not done or cancelled)
      supabase.from('tasks')
        .select('*')
        .eq('user_id', u.id)
        .eq('scheduled_date', today)
        .neq('status', 'cancelled')
        .neq('status', 'done')
        .order('priority', { ascending: false }),
      
      // Today's events
      supabase.from('events')
        .select('*')
        .eq('user_id', u.id)
        .eq('date', today)
        .neq('status', 'cancelled')
        .order('all_day', { ascending: false })
        .order('start_time'),
      
      // Active habits
      supabase.from('habits')
        .select('*')
        .eq('user_id', u.id)
        .eq('is_active', true)
        .order('created_at'),
      
      // Today's habit logs
      supabase.from('habit_logs')
        .select('*')
        .eq('user_id', u.id)
        .eq('date', today),
      
      // Recent transactions (keep for financial section)
      supabase.from('transactions')
        .select('*')
        .eq('user_id', u.id)
        .order('created_at', { ascending: false })
        .limit(4),
      
      // Calendar categories
      supabase.from('calendar_categories')
        .select('*')
        .eq('user_id', u.id)
        .order('created_at')
    ])

    if (profRes.data) setProfile(profRes.data)
    
    // Split tasks into regular tasks and errands
    const allTasks = tasksRes.data || []
    const tasks = allTasks.filter(t => t.task_type === 'task')
    const errands = allTasks.filter(t => t.task_type === 'errand')
    setTodaysTasks(tasks)
    setTodaysErrands(errands)

    if (eventsRes.data) setTodaysEvents(eventsRes.data)
    if (habitsRes.data) setHabits(habitsRes.data)
    if (habitLogsRes.data) setHabitLogs(habitLogsRes.data)
    if (transRes.data) setTransactions(transRes.data)
    
    if (catsRes.data && catsRes.data.length > 0) {
      setCategories(catsRes.data)
      
      // Get important events (this month)
      const { data: monthEvents } = await supabase.from('events')
        .select('*')
        .eq('user_id', u.id)
        .gte('date', format(startOfMonth(calMonth), 'yyyy-MM-dd'))
        .lte('date', format(endOfMonth(calMonth), 'yyyy-MM-dd'))
        .neq('status', 'cancelled')

      const importantCatIds = catsRes.data
        .filter(c => c.is_important)
        .map(c => c.id)

      const importantEvts = monthEvents?.filter(e => {
        const cat = catsRes.data.find(c => c.name === e.category)
        return cat?.is_important
      }) || []

      setImportantEvents(importantEvts)
    }
  }

  async function addTask() {
    if (!taskForm.title.trim()) return
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return

    const { error } = await supabase.from('tasks').insert({
      user_id: u.id,
      title: taskForm.title,
      description: taskForm.description,
      task_type: taskForm.task_type,
      priority: taskForm.priority,
      scheduled_date: taskForm.scheduled_date,
      status: 'todo',
    })

    if (error) {
      alert('Error: ' + error.message)
      return
    }

    setTaskForm({
      title: '',
      description: '',
      task_type: 'task',
      priority: 'medium',
      scheduled_date: format(new Date(), 'yyyy-MM-dd'),
    })
    setShowAddTask(false)
    load()
  }

  async function addEvent() {
    if (!eventForm.title.trim()) return
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return

    const { error } = await supabase.from('events').insert({
      user_id: u.id,
      title: eventForm.title,
      date: eventForm.date,
      category: eventForm.category,
      category_color: eventForm.category_color,
      start_time: eventForm.start_time || null,
      end_time: eventForm.end_time || null,
      all_day: eventForm.all_day,
      notes: eventForm.notes || null,
      status: 'upcoming',
    })

    if (error) {
      alert('Error: ' + error.message)
      return
    }

    setEventForm({
      title: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      category: 'Meeting',
      category_color: '#22C55E',
      start_time: '',
      end_time: '',
      all_day: true,
      notes: '',
    })
    setShowAddEvent(false)
    load()
  }

  async function toggleTaskStatus(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'todo' ? 'done' : 'todo'
    const completedAt = newStatus === 'done' ? new Date() : null

    await supabase.from('tasks')
      .update({ status: newStatus, completed_at: completedAt })
      .eq('id', taskId)

    load()
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', taskId)
    load()
  }

  async function deleteEvent(eventId: string) {
    if (!confirm('Delete this event?')) return
    await supabase.from('events').delete().eq('id', eventId)
    setSelectedEvent(null)
    load()
  }

  async function addCategory() {
    if (!newCatName.trim()) return
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return

    await supabase.from('calendar_categories').insert({
      user_id: u.id,
      name: newCatName,
      color: newCatColor,
      icon: newCatIcon,
      is_important: newCatImportant,
    })

    setNewCatName('')
    setNewCatColor('#5B7FFF')
    setNewCatIcon('📅')
    setNewCatImportant(false)
    load()
  }

  async function deleteCategory(catId: string) {
    if (!confirm('Delete this category?')) return
    await supabase.from('calendar_categories').delete().eq('id', catId)
    load()
  }

  async function toggleImportant(catId: string, current: boolean) {
    await supabase.from('calendar_categories')
      .update({ is_important: !current })
      .eq('id', catId)
    load()
  }

  async function updateCatColor(catId: string, color: string) {
    await supabase.from('calendar_categories')
      .update({ color })
      .eq('id', catId)
    setEditingCatId(null)
    load()
  }

  async function toggleHabit(habitId: string) {
    const alreadyLogged = habitLogs.some(l => l.habit_id === habitId)
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return

    if (alreadyLogged) {
      await supabase.from('habit_logs')
        .delete()
        .eq('habit_id', habitId)
        .eq('date', today)
    } else {
      await supabase.from('habit_logs').insert({
        user_id: u.id,
        habit_id: habitId,
        date: today,
        completed: true,
      })
    }
    load()
  }

  // Calendar queries
  const days = eachDayOfInterval({
    start: startOfMonth(calMonth),
    end: endOfMonth(calMonth),
  })
  const firstDay = startOfMonth(calMonth).getDay()
  const blanks = firstDay === 0 ? 6 : firstDay - 1

  async function getEventsForDay(dateStr: string) {
    const { data } = await supabase.from('events')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', dateStr)
    return data || []
  }

  const habitsCompletedToday = habitLogs.filter(l => l.completed).length
  const name = profile?.name || user?.email?.split('@')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">{greeting}, {name} ☀️</h1>
          <p className="text-xs text-gray-400 mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      {/* EVENT DETAIL MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-base">{selectedEvent.title}</div>
                <div className="text-xs text-gray-400">
                  {format(new Date(selectedEvent.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                  {selectedEvent.start_time && ` · ${selectedEvent.start_time}`}
                </div>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            {selectedEvent.notes && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm text-gray-600">
                <div className="text-xs font-bold text-gray-400 uppercase mb-1">Notes</div>
                {selectedEvent.notes}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => deleteEvent(selectedEvent.id)}
                className="btn-red btn-sm flex items-center gap-1 flex-1">
                <Trash2 size={12} /> Delete
              </button>
              <button onClick={() => setSelectedEvent(null)} className="btn-gray btn-sm flex-1">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGE CATEGORIES MODAL */}
      {showManageCats && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => setShowManageCats(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">Manage Categories 🎨</h2>
              <button onClick={() => setShowManageCats(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-1 mb-4">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-xl group">
                  <div className="relative flex-shrink-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm cursor-pointer hover:scale-110 transition-all"
                      style={{ background: editingCatId === cat.id ? '#e5e7eb' : cat.color }}
                      onClick={() => { setEditingCatId(cat.id); setEditingCatColor(cat.color) }}>
                      {editingCatId === cat.id ? '✏️' : cat.icon}
                    </div>
                    {editingCatId === cat.id && (
                      <input type="color" value={editingCatColor}
                        onChange={e => setEditingCatColor(e.target.value)}
                        onBlur={() => updateCatColor(cat.id, editingCatColor)}
                        autoFocus className="absolute inset-0 opacity-0 w-full h-full cursor-pointer rounded-full" />
                    )}
                  </div>
                  <span className="text-sm flex-1 font-semibold">{cat.name}</span>
                  <div onClick={() => toggleImportant(cat.id, cat.is_important)}
                    className={`w-8 h-4 rounded-full cursor-pointer transition-all relative flex-shrink-0
                      ${cat.is_important ? 'bg-orange-400' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all
                      ${cat.is_important ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                  {cat.is_important && <span className="text-[10px] text-orange-500 font-bold flex-shrink-0">⚡</span>}
                  <button onClick={() => deleteCategory(cat.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">+ Add Category</div>
              <div className="flex gap-2 mb-2">
                <input className="inp flex-1 text-xs" placeholder="Name"
                  value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCategory()} autoFocus />
                <div className="relative">
                  <div className="w-9 h-9 rounded-lg cursor-pointer border border-gray-200 flex items-center justify-center text-sm font-bold"
                    style={{ background: newCatColor }}>
                    {newCatIcon}
                  </div>
                  <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer rounded-lg" />
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {['📅','📝','⏰','🎂','📿','✈️','💳','🏠','💼','🎯','🏥','🎓','🌸','⚽','🎵'].map(ic => (
                  <button key={ic} onClick={() => setNewCatIcon(ic)}
                    className={`w-7 h-7 rounded-lg text-sm transition-all
                      ${newCatIcon === ic ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-gray-100 hover:bg-gray-200'}`}>
                    {ic}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div onClick={() => setNewCatImportant(!newCatImportant)}
                  className={`w-9 h-5 rounded-full cursor-pointer transition-all relative
                    ${newCatImportant ? 'bg-orange-400' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
                    ${newCatImportant ? 'right-0.5' : 'left-0.5'}`} />
                </div>
                <span className="text-xs text-gray-500">Mark as <b>Important ⚡</b></span>
              </div>
              <button className="btn-blue w-full text-xs" onClick={addCategory}>
                + Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP ROW: Calendar + Important Events */}
      <div className="grid grid-cols-[1fr_300px] gap-4 mb-4">
        {/* CALENDAR */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <button onClick={() => setCalMonth(subMonths(calMonth, 1))}
                className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 text-sm">‹</button>
              <span className="font-bold text-sm">{format(calMonth, 'MMMM yyyy')}</span>
              <button onClick={() => setCalMonth(addMonths(calMonth, 1))}
                className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 text-sm">›</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowManageCats(true)} className="btn-gray btn-sm text-xs">🎨 Categories</button>
              <button onClick={() => setShowAddEvent(true)} className="btn-blue btn-sm flex items-center gap-1 text-xs">
                <Plus size={12} /> Add Event
              </button>
            </div>
          </div>

          {showAddEvent && (
            <div className="border-b border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-gray-400 uppercase">New Event</div>
                <button onClick={() => setShowAddEvent(false)}><X size={14} className="text-gray-400" /></button>
              </div>
              <div className="flex gap-2 flex-wrap mb-2">
                <input className="inp flex-1 min-w-[160px] text-xs" placeholder="Event title"
                  value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && addEvent()} autoFocus />
                <input type="date" className="sel text-xs" value={eventForm.date}
                  onChange={e => setEventForm({ ...eventForm, date: e.target.value })} />
              </div>
              <div className="flex gap-2 mb-2">
                <select className="sel text-xs flex-1" value={eventForm.category}
                  onChange={e => {
                    const cat = categories.find(c => c.name === e.target.value)
                    setEventForm({ ...eventForm, category: e.target.value, category_color: cat?.color || '#5B7FFF' })
                  }}>
                  {categories.length > 0
                    ? categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)
                    : <option value="Meeting">Meeting</option>
                  }
                </select>
              </div>
              <div className="flex gap-2 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={eventForm.all_day}
                    onChange={e => setEventForm({ ...eventForm, all_day: e.target.checked })} />
                  All day
                </label>
                {!eventForm.all_day && (
                  <>
                    <input type="time" className="sel text-xs" value={eventForm.start_time}
                      onChange={e => setEventForm({ ...eventForm, start_time: e.target.value })} />
                    <span className="text-gray-400 text-xs">–</span>
                    <input type="time" className="sel text-xs" value={eventForm.end_time}
                      onChange={e => setEventForm({ ...eventForm, end_time: e.target.value })} />
                  </>
                )}
              </div>
              <textarea className="inp text-xs resize-none mb-2" rows={2} placeholder="Notes (optional)"
                value={eventForm.notes} onChange={e => setEventForm({ ...eventForm, notes: e.target.value })} />
              <div className="flex gap-2">
                <button className="btn-blue btn-sm" onClick={addEvent}>Save Event</button>
                <button className="btn-gray btn-sm" onClick={() => setShowAddEvent(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="p-4">
            <div className="grid grid-cols-7 mb-1">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="text-[10px] font-bold text-gray-400 text-center py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}
              {days.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const dayTasks = todaysTasks.filter(t => t.scheduled_date === dateStr)
                const dayErrands = todaysErrands.filter(e => e.scheduled_date === dateStr)
                const dayEvents = todaysEvents.filter(e => e.date === dateStr)
                const dayItems = [...dayTasks, ...dayErrands, ...dayEvents]
                const isTod = isToday(day)
                const isSel = selectedDate === dateStr

                return (
                  <div key={dateStr} onClick={() => setSelectedDate(isSel ? null : dateStr)}
                    className={`min-h-[52px] p-1 rounded-xl cursor-pointer border transition-all hover:bg-gray-50
                      ${isTod ? 'border-blue-400 bg-blue-50' : isSel ? 'border-blue-300 bg-blue-50/40' : 'border-transparent'}`}>
                    <div className={`text-[11px] font-bold mb-0.5 text-center
                      ${isTod ? 'text-blue-500' : isSameMonth(day, calMonth) ? 'text-gray-700' : 'text-gray-300'}`}>
                      {format(day, 'd')}
                    </div>
                    {dayItems.slice(0, 2).map(item => {
                      const isTask = 'task_type' in item
                      const color = isTask ? '#5B7FFF' : (item.category_color || '#22C55E')
                      const icon = isTask ? '✓' : '📅'
                      return (
                        <div key={item.id} className="text-[9px] font-semibold px-1 py-0.5 rounded mb-0.5 truncate text-white"
                          style={{ background: color }}>
                          {icon} {item.title || item.name}
                        </div>
                      )
                    })}
                    {dayItems.length > 2 && (
                      <div className="text-[9px] text-gray-400 text-center">+{dayItems.length - 2}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* IMPORTANT EVENTS */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-bold text-red-500 uppercase tracking-wide">⚡ Important</span>
          </div>
          {importantEvents.length === 0 ? (
            <div className="p-5 text-center text-gray-400 text-xs">
              No important events
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {importantEvents.slice(0, 8).map(ev => (
                <div key={ev.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedEvent(ev)}>
                  <div className="w-8 h-8 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-white"
                    style={{ background: ev.category_color || '#22C55E' }}>
                    <span className="text-xs font-bold leading-none">{format(new Date(ev.date + 'T00:00:00'), 'd')}</span>
                    <span className="text-[8px] uppercase">{format(new Date(ev.date + 'T00:00:00'), 'MMM')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{ev.title}</div>
                    <div className="text-[10px] text-gray-400">{ev.category}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MIDDLE ROW: Today's Tasks + Errands */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* TODAY'S TASKS */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-blue-50">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">✅ Today's Tasks</span>
            <span className="tag bg-blue-100 text-blue-600 text-xs">{todaysTasks.length}</span>
          </div>
          {todaysTasks.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">
              No tasks scheduled for today
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todaysTasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 group">
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 cursor-pointer transition-all flex items-center justify-center text-[10px]
                    ${t.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}
                    onClick={() => toggleTaskStatus(t.id, t.status)}>
                    {t.status === 'done' && '✓'}
                  </div>
                  <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                    {t.title}
                  </span>
                  {t.priority === 'high' && <span className="text-red-500 text-xs font-bold">●</span>}
                  <button onClick={() => deleteTask(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <button onClick={() => setShowAddTask(true)}
              className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:underline w-full justify-center">
              <Plus size={13} /> Add task
            </button>
          </div>

          {showAddTask && (
            <div className="border-t border-gray-100 bg-gray-50 p-3">
              <div className="flex gap-2 mb-2">
                <input className="inp flex-1 text-xs" placeholder="Task title..."
                  value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && addTask()} autoFocus />
                <button className="btn-blue btn-sm text-xs" onClick={addTask}>Add</button>
                <button className="btn-gray btn-sm text-xs" onClick={() => setShowAddTask(false)}>✕</button>
              </div>
            </div>
          )}
        </div>

        {/* TODAY'S ERRANDS */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-amber-50">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">🛒 Errands</span>
            <span className="tag bg-amber-100 text-amber-600 text-xs">{todaysErrands.length}</span>
          </div>
          {todaysErrands.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">
              No errands for today
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todaysErrands.map(e => (
                <div key={e.id} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 group">
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 cursor-pointer transition-all flex items-center justify-center text-[10px]
                    ${e.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}
                    onClick={() => toggleTaskStatus(e.id, e.status)}>
                    {e.status === 'done' && '✓'}
                  </div>
                  <div className="flex-1">
                    <span className={`text-sm ${e.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                      {e.title}
                    </span>
                    {e.location && <div className="text-[10px] text-gray-400">📍 {e.location}</div>}
                  </div>
                  <button onClick={() => deleteTask(e.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <button onClick={() => setTaskForm({ ...taskForm, task_type: 'errand' }); setShowAddTask(true)}
              className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold hover:underline w-full justify-center">
              <Plus size={13} /> Add errand
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Habits + To Do List */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* DAILY HABITS */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-green-50">
            <span className="text-xs font-bold text-green-600 uppercase tracking-wide">✅ Daily Habits</span>
            <Link href="/habit" className="text-xs text-green-600 font-semibold">Manage →</Link>
          </div>
          {habits.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">
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
                    <span className={`flex-1 text-xs ${done ? 'line-through text-gray-400' : ''}`}>{h.name}</span>
                  </div>
                )
              })}
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Today's progress</span>
                  <span className="font-bold text-green-600">{habitsCompletedToday}/{habits.length}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* TO DO LIST LINK */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-purple-50">
            <span className="text-xs font-bold text-purple-600 uppercase tracking-wide">📋 All Tasks</span>
            <Link href="/todo" className="text-xs text-purple-600 font-semibold">View all →</Link>
          </div>
          <div className="p-6 text-center text-gray-500 text-sm">
            View all your tasks, projects, and goals
          </div>
        </div>
      </div>

      {/* FINANCIAL */}
      {transactions && transactions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-bold text-teal-500 uppercase tracking-wide">💰 Financial — Recent</span>
            <Link href="/financial" className="text-xs text-teal-500 font-semibold">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {transactions.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <div className="flex-1">
                  <div className="text-sm font-medium">{t.description}</div>
                  <div className="text-xs text-gray-400">{t.date} · {t.category}</div>
                </div>
                <span className={`text-sm font-bold ${t.kredit ? 'text-green-500' : 'text-red-500'}`}>
                  {t.kredit ? `+Rp ${Number(t.kredit).toLocaleString()}` : `-Rp ${Number(t.debit).toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
