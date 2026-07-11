'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth } from 'date-fns'
import Link from 'next/link'
import { Plus, X, Trash2 } from 'lucide-react'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [todos, setTodos] = useState<any[]>([])
  const [errands, setErrands] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [calMonth, setCalMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [showAddErrand, setShowAddErrand] = useState(false)
  const [showManageCats, setShowManageCats] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#5B7FFF')
  const [newCatIcon, setNewCatIcon] = useState('📅')
  const [newCatParent, setNewCatParent] = useState('')
  const [newCatImportant, setNewCatImportant] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatColor, setEditingCatColor] = useState('')
  const [newErrandTitle, setNewErrandTitle] = useState('')
  const [eventForm, setEventForm] = useState({
    title: '', date: format(new Date(), 'yyyy-MM-dd'),
    category: 'Meeting', sub_category: '', category_color: '#22C55E',
    start_time: '', end_time: '', all_day: true, notes: ''
  })
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [calMonth])

  async function load() {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    setUser(u)
    const [prof, td, er, hb, hl, ev, tr, cats] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', u.id).single(),
      supabase.from('todos').select('*').eq('user_id', u.id).neq('status', 'done').order('created_at', { ascending: false }).limit(5),
      supabase.from('errands').select('*').eq('user_id', u.id).eq('date', today).eq('completed', false).order('created_at'),
      supabase.from('habits').select('*').eq('user_id', u.id).eq('is_active', true),
      supabase.from('habit_logs').select('*').eq('user_id', u.id).eq('date', today),
      supabase.from('events').select('*').eq('user_id', u.id)
        .gte('date', format(startOfMonth(calMonth), 'yyyy-MM-dd'))
        .lte('date', format(endOfMonth(calMonth), 'yyyy-MM-dd'))
        .order('date'),
      supabase.from('transactions').select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(4),
      supabase.from('calendar_categories').select('*').eq('user_id', u.id).order('created_at'),
    ])
    if (prof.data) setProfile(prof.data)
    if (td.data) setTodos(td.data)
    if (er.data) setErrands(er.data)
    if (hb.data) setHabits(hb.data)
    if (hl.data) setHabitLogs(hl.data)
    if (ev.data) setEvents(ev.data)
    if (tr.data) setTransactions(tr.data)
    if (cats.data && cats.data.length > 0) {
      setCategories(cats.data)
    } else {
      const defaults = [
        { name: 'Meeting', color: '#22C55E', icon: '🤝', is_important: true, parent_id: null, user_id: u.id },
        { name: 'Exam', color: '#5B7FFF', icon: '📝', is_important: true, parent_id: null, user_id: u.id },
        { name: 'Deadline', color: '#EF4444', icon: '⏰', is_important: true, parent_id: null, user_id: u.id },
        { name: 'Birthday', color: '#FF6B8A', icon: '🎂', is_important: true, parent_id: null, user_id: u.id },
        { name: 'Church', color: '#8B5CF6', icon: '📿', is_important: true, parent_id: null, user_id: u.id },
        { name: 'Travel', color: '#14B8A6', icon: '✈️', is_important: false, parent_id: null, user_id: u.id },
        { name: 'Payment Due', color: '#F97316', icon: '💳', is_important: true, parent_id: null, user_id: u.id },
        { name: 'Personal', color: '#9090A8', icon: '🌸', is_important: false, parent_id: null, user_id: u.id },
      ]
      await supabase.from('calendar_categories').insert(defaults)
      const { data: fresh } = await supabase.from('calendar_categories').select('*').eq('user_id', u.id).order('created_at')
      if (fresh) setCategories(fresh)
    }
  }

  async function addErrand() {
    if (!newErrandTitle.trim()) return
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return

    const { error } = await supabase.from('errands').insert({
      user_id: u.id,
      title: newErrandTitle,
      date: today,
      completed: false,
    })

    if (error) { alert('Error: ' + error.message); return }

    // Add to daily logs - Tasks Received Today
    await supabase.from('daily_logs').insert({
      user_id: u.id,
      date: today,
      type: 'task_received',
      category: 'Errands',
      content: `🛒 ${newErrandTitle}`,
      time_logged: format(new Date(), 'HH:mm'),
    })

    setNewErrandTitle('')
    setShowAddErrand(false)
    load()
  }

  async function toggleErrand(errandId: string, title: string, currentCompleted: boolean) {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return

    await supabase.from('errands').update({ completed: !currentCompleted, updated_at: new Date() }).eq('id', errandId)

    if (!currentCompleted) {
      // Add to accomplishments
      await supabase.from('daily_logs').insert({
        user_id: u.id,
        date: today,
        type: 'accomplishment',
        content: `✓ ${title}`,
        time_logged: format(new Date(), 'HH:mm'),
      })
    }

    load()
  }

  async function deleteErrand(errandId: string) {
    if (!confirm('Delete this errand?')) return
    await supabase.from('errands').delete().eq('id', errandId)
    load()
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
    const { error } = await supabase.from('events').insert({
      title: eventForm.title,
      date: eventForm.date,
      category: eventForm.category,
      sub_category: eventForm.sub_category || null,
      category_color: eventForm.category_color,
      start_time: eventForm.start_time || null,
      end_time: eventForm.end_time || null,
      all_day: eventForm.all_day,
      notes: eventForm.notes || null,
      user_id: u.id,
    })
    if (error) { alert('Error: ' + error.message); return }

    if (eventForm.date === today) {
      await supabase.from('daily_logs').insert({
        user_id: u.id,
        date: today,
        type: 'task_received',
        category: eventForm.category,
        content: `📅 ${eventForm.title}${eventForm.start_time ? ` · ${eventForm.start_time}` : ''}`,
        time_logged: format(new Date(), 'HH:mm'),
      })
    }

    setShowAddEvent(false)
    setEventForm({
      title: '', date: format(new Date(), 'yyyy-MM-dd'),
      category: 'Meeting', sub_category: '', category_color: '#22C55E',
      start_time: '', end_time: '', all_day: true, notes: ''
    })
    load()
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this event?')) return
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) { alert('Error deleting: ' + error.message); return }
    setSelectedEvent(null)
    setSelectedDate(null)
    load()
  }

  async function addCategory() {
    if (!newCatName.trim()) return
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    const parentCat = categories.find(c => c.name === newCatParent)
    await supabase.from('calendar_categories').insert({
      name: newCatName,
      color: newCatColor,
      icon: newCatIcon,
      is_important: newCatImportant,
      parent_id: parentCat?.id || null,
      user_id: u.id
    })
    setNewCatName(''); setNewCatColor('#5B7FFF'); setNewCatIcon('📅')
    setNewCatParent(''); setNewCatImportant(false)
    load()
  }

  async function deleteCategory(id: string) {
    if (!confirm('Delete this category? Sub-categories will also be deleted.')) return
    await supabase.from('calendar_categories').delete().eq('id', id)
    load()
  }

  async function toggleImportant(id: string, current: boolean) {
    await supabase.from('calendar_categories').update({ is_important: !current }).eq('id', id)
    load()
  }

  async function updateCatColor(id: string, color: string) {
    await supabase.from('calendar_categories').update({ color }).eq('id', id)
    setEditingCatId(null)
    load()
  }

  async function updateCatIcon(id: string, icon: string) {
    await supabase.from('calendar_categories').update({ icon }).eq('id', id)
    load()
  }

  const parentCats = categories.filter(c => !c.parent_id)
  const subCats = (parentId: string) => categories.filter(c => c.parent_id === parentId)
  const selectedParentCat = categories.find(c => c.name === eventForm.category)
  const subCatsForSelected = selectedParentCat ? subCats(selectedParentCat.id) : []

  const days = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })
  const firstDay = startOfMonth(calMonth).getDay()
  const blanks = firstDay === 0 ? 6 : firstDay - 1
  const eventsOnDay = (dateStr: string) => events.filter(e => e.date === dateStr)
  const selectedDateEvents = selectedDate ? eventsOnDay(selectedDate) : []

  const importantEvents = events.filter(e => {
    const cat = categories.find(c => c.name === e.category)
    const sub = categories.find(c => c.name === e.sub_category)
    return (cat?.is_important || sub?.is_important) && e.date >= today
  }).sort((a, b) => a.date.localeCompare(b.date))

  const todayHabitsDone = habits.filter(h => habitLogs.some(l => l.habit_id === h.id && l.completed)).length
  const name = profile?.name || user?.email?.split('@')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const getCatColor = (cat: string, subCat?: string) => {
    if (subCat) {
      const found = categories.find(c => c.name === subCat)
      if (found) return found.color
    }
    return categories.find(c => c.name === cat)?.color || '#5B7FFF'
  }

  const getCatIcon = (cat: string, subCat?: string) => {
    if (subCat) {
      const found = categories.find(c => c.name === subCat)
      if (found) return found.icon
    }
    return categories.find(c => c.name === cat)?.icon || '📅'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">{greeting}, {name} ☀️</h1>
          <p className="text-xs text-gray-400 mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-lg"
                  style={{ background: getCatColor(selectedEvent.category, selectedEvent.sub_category) }}>
                  {getCatIcon(selectedEvent.category, selectedEvent.sub_category)}
                </div>
                <div>
                  <div className="font-bold text-base">{selectedEvent.title}</div>
                  <div className="text-xs text-gray-400">
                    {format(new Date(selectedEvent.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                    {selectedEvent.start_time && ` · ${selectedEvent.start_time}`}
                    {selectedEvent.end_time && ` – ${selectedEvent.end_time}`}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <div className="flex gap-2 mb-3 flex-wrap">
              <span className="tag text-xs text-white px-2 py-1"
                style={{ background: getCatColor(selectedEvent.category, selectedEvent.sub_category) }}>
                {getCatIcon(selectedEvent.category, selectedEvent.sub_category)} {selectedEvent.sub_category || selectedEvent.category}
              </span>
              {selectedEvent.sub_category && (
                <span className="tag text-xs bg-gray-100 text-gray-500 px-2 py-1">
                  {selectedEvent.category}
                </span>
              )}
              {selectedEvent.all_day && (
                <span className="tag text-xs bg-blue-50 text-blue-500 px-2 py-1">All day</span>
              )}
            </div>

            {selectedEvent.notes && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm text-gray-600 leading-relaxed">
                <div className="text-xs font-bold text-gray-400 uppercase mb-1">📝 Notes</div>
                {selectedEvent.notes}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => deleteEvent(selectedEvent.id)}
                className="btn-red btn-sm flex items-center gap-1 flex-1">
                <Trash2 size={12} /> Delete Event
              </button>
              <button onClick={() => setSelectedEvent(null)} className="btn-gray btn-sm flex-1">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
              {parentCats.map(cat => (
                <div key={cat.id}>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-xl group">
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
                  {subCats(cat.id).map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 px-3 py-2 ml-6 bg-white border border-gray-100 rounded-xl mt-0.5 group">
                      <div className="relative flex-shrink-0">
                        <div className="w-5 h-5 rounded-full cursor-pointer hover:scale-110 transition-all"
                          style={{ background: editingCatId === sub.id ? '#e5e7eb' : sub.color }}
                          onClick={() => { setEditingCatId(sub.id); setEditingCatColor(sub.color) }}>
                        </div>
                        {editingCatId === sub.id && (
                          <input type="color" value={editingCatColor}
                            onChange={e => setEditingCatColor(e.target.value)}
                            onBlur={() => updateCatColor(sub.id, editingCatColor)}
                            autoFocus className="absolute inset-0 opacity-0 w-full h-full cursor-pointer rounded-full" />
                        )}
                      </div>
                      <span className="text-xs flex-1">{sub.icon} {sub.name}</span>
                      <div onClick={() => toggleImportant(sub.id, sub.is_important)}
                        className={`w-8 h-4 rounded-full cursor-pointer transition-all relative flex-shrink-0
                          ${sub.is_important ? 'bg-orange-400' : 'bg-gray-200'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all
                          ${sub.is_important ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                      {sub.is_important && <span className="text-[10px] text-orange-500 font-bold flex-shrink-0">⚡</span>}
                      <button onClick={() => deleteCategory(sub.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">+ Add Category / Sub-category</div>
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
              <div className="mb-2">
                <label className="text-xs text-gray-400 block mb-1">Sub-category of:</label>
                <select className="sel w-full text-xs" value={newCatParent} onChange={e => setNewCatParent(e.target.value)}>
                  <option value="">— Main category —</option>
                  {parentCats.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {['📅','📝','⏰','🎂','📿','✈️','💳','🏠','💼','🎯','🏥','🎓','🌸','⚽','🎵','📖','🧪','💻','🤝','🏋️'].map(ic => (
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
                + Add {newCatParent ? `Sub-category under "${newCatParent}"` : 'Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP ROW: Calendar + Errands */}
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
              <div className="flex gap-2 flex-wrap mb-2">
                <select className="sel text-xs flex-1" value={eventForm.category} onChange={e => {
                  if (e.target.value === '__manage__') { setShowManageCats(true); return }
                  const cat = categories.find(c => c.name === e.target.value)
                  setEventForm({ ...eventForm, category: e.target.value, sub_category: '', category_color: cat?.color || '#5B7FFF' })
                }}>
                  {parentCats.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                  <option value="__manage__">⚙️ Manage categories...</option>
                </select>
                {subCatsForSelected.length > 0 && (
                  <select className="sel text-xs flex-1" value={eventForm.sub_category}
                    onChange={e => {
                      const sub = categories.find(c => c.name === e.target.value)
                      setEventForm({ ...eventForm, sub_category: e.target.value, category_color: sub?.color || eventForm.category_color })
                    }}>
                    <option value="">— No sub-category —</option>
                    {subCatsForSelected.map(s => <option key={s.id} value={s.name}>{s.icon} {s.name}</option>)}
                  </select>
                )}
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
                    <span className="text-gray-400 text-xs flex items-center">–</span>
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
                const dayEvents = eventsOnDay(dateStr)
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
                    {dayEvents.slice(0, 2).map(ev => (
                      <div key={ev.id}
                        onClick={e => { e.stopPropagation(); setSelectedEvent(ev) }}
                        className="text-[9px] font-semibold px-1 py-0.5 rounded mb-0.5 truncate text-white flex items-center gap-0.5 hover:opacity-80 cursor-pointer"
                        style={{ background: getCatColor(ev.category, ev.sub_category) }}>
                        <span>{getCatIcon(ev.category, ev.sub_category)}</span>
                        <span className="truncate">{ev.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] text-gray-400 text-center">+{dayEvents.length - 2}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {selectedDate && (
            <div className="border-t border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-gray-500">
                  {format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMMM d')}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => { setEventForm({ ...eventForm, date: selectedDate }); setShowAddEvent(true) }}
                    className="text-xs text-blue-500 font-semibold hover:underline">+ Add</button>
                  <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                </div>
              </div>
              {selectedDateEvents.length === 0 ? (
                <div className="text-xs text-gray-400 italic">No events. Click + Add to create one.</div>
              ) : selectedDateEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 mb-1.5 group cursor-pointer"
                  onClick={() => setSelectedEvent(ev)}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: getCatColor(ev.category, ev.sub_category) }} />
                  <span className="text-sm flex-1 font-medium hover:text-blue-500 transition-colors">{ev.title}</span>
                  {ev.start_time && <span className="text-xs text-gray-400">{ev.start_time}</span>}
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: getCatColor(ev.category, ev.sub_category) }}>
                    {getCatIcon(ev.category, ev.sub_category)} {ev.sub_category || ev.category}
                  </span>
                  <button onClick={e => { e.stopPropagation(); deleteEvent(ev.id) }}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 px-4 py-2.5 border-t border-gray-100 flex-wrap">
            {parentCats.slice(0, 6).map(cat => (
              <div key={cat.name} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
                <span className="text-[10px] text-gray-400">{cat.icon} {cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ERRANDS */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-amber-50">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">🛒 Errands</span>
            <span className="tag bg-amber-100 text-amber-600 text-xs">{errands.length}</span>
          </div>
          {errands.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">
              No errands for today
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {errands.map(e => (
                <div key={e.id} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 group">
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 cursor-pointer transition-all flex items-center justify-center text-[10px]
                    ${e.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}
                    onClick={() => toggleErrand(e.id, e.title, e.completed)}>
                    {e.completed && '✓'}
                  </div>
                  <span className={`flex-1 text-sm ${e.completed ? 'line-through text-gray-400' : ''}`}>
                    {e.title}
                  </span>
                  <button onClick={() => deleteErrand(e.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <button onClick={() => setShowAddErrand(!showAddErrand)}
              className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold hover:underline w-full justify-center">
              <Plus size={13} /> Add errand
            </button>
          </div>

          {showAddErrand && (
            <div className="border-t border-gray-100 bg-gray-50 p-3">
              <div className="flex gap-2">
                <input className="inp flex-1 text-xs" placeholder="New errand..."
                  value={newErrandTitle} onChange={e => setNewErrandTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addErrand()} autoFocus />
                <button className="btn-blue btn-sm text-xs" onClick={addErrand}>Add</button>
                <button className="btn-gray btn-sm text-xs" onClick={() => setShowAddErrand(false)}>✕</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ROW: Daily Habits + Important + To Do */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* DAILY HABITS */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-green-50">
            <span className="text-xs font-bold text-green-600 uppercase tracking-wide">✅ Daily Habit</span>
            <Link href="/habit" className="text-xs text-green-600 font-semibold">View detail →</Link>
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

        {/* IMPORTANT */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-bold text-red-500 uppercase tracking-wide">⚡ Important</span>
            <span className="text-[10px] text-gray-400">Today & up</span>
          </div>
          {importantEvents.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">
              No important events.<br />
              <span className="text-blue-500 cursor-pointer font-semibold text-[10px]"
                onClick={() => setShowManageCats(true)}>
                Mark category as Important →
              </span>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {importantEvents.slice(0, 6).map(ev => (
                <div key={ev.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedEvent(ev)}>
                  <div className="w-6 h-6 rounded-lg flex flex-col items-center justify-center flex-shrink-0 text-white text-[10px]"
                    style={{ background: getCatColor(ev.category, ev.sub_category) }}>
                    <span className="font-bold leading-none">{format(new Date(ev.date + 'T00:00:00'), 'd')}</span>
                    <span className="text-[7px] uppercase">{format(new Date(ev.date + 'T00:00:00'), 'M')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{ev.title}</div>
                    <div className="text-[9px] text-gray-400 truncate">
                      {ev.sub_category || ev.category}
                    </div>
                  </div>
                  <div className={`text-[9px] font-bold flex-shrink-0 ${ev.date === today ? 'text-red-500' : 'text-gray-400'}`}>
                    {ev.date === today ? 'T' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TO DO TODAY */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-bold text-blue-500 uppercase tracking-wide">✅ To Do</span>
            <Link href="/todo" className="text-xs text-blue-500 font-semibold">View all →</Link>
          </div>
          {todos.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">
              No tasks. <Link href="/todo" className="text-blue-500 font-semibold">Add one →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {todos.slice(0, 6).map(t => (
                <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50">
                  <div className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" />
                  <span className="flex-1 text-xs">{t.title}</span>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                    {t.category}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FINANCIAL — Full width */}
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
