'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, subDays } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'

export default function HabitPage() {
  const [habits, setHabits] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('✅')
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')
  const last7 = Array.from({length:7},(_,i)=>format(subDays(new Date(),6-i),'yyyy-MM-dd'))
  const icons = ['✅','💧','📖','🏃','📱','📿','🥗','📔','💊','🧘','💪','😴','🎯','✏️','🚴']

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [h, l] = await Promise.all([
      supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at'),
      supabase.from('habit_logs').select('*').eq('user_id', user.id).gte('date', last7[0]),
    ])
    if (h.data) setHabits(h.data)
    if (l.data) setLogs(l.data)
    setLoading(false)
  }

  function isDone(habitId: string, date: string) {
    return logs.some(l => l.habit_id===habitId && l.date===date && l.completed)
  }

  async function toggle(habitId: string, date: string) {
    const done = isDone(habitId, date)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (done) {
      await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('date', date).eq('user_id', user.id)
    } else {
      await supabase.from('habit_logs').upsert({habit_id:habitId, date, completed:true, user_id:user.id})
    }
    load()
  }

  async function addHabit() {
    if (!newName.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('habits').insert({name:newName, icon:newIcon, is_active:true, user_id:user.id})
    setNewName('')
    load()
  }

  async function delHabit(id: string) {
    if (!confirm('Delete habit?')) return
    await supabase.from('habits').update({is_active:false}).eq('id', id)
    load()
  }

  const todayDone = habits.filter(h => isDone(h.id, today)).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Daily Habit 💧</h1>
          <p className="text-xs text-gray-400 mt-0.5">Click checkboxes to track · Add/delete habits below</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-center">
            <div className="text-lg font-bold text-green-600">{todayDone}/{habits.length}</div>
            <div className="text-[10px] text-green-500">Done today</div>
          </div>
        </div>
      </div>

      {/* Add habit */}
      <div className="card p-4 mb-4">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">+ Add New Habit</div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1 flex-wrap">
            {icons.map(ic=>(
              <button key={ic} onClick={()=>setNewIcon(ic)}
                className={`w-8 h-8 rounded-lg text-base transition-all ${newIcon===ic?'bg-blue-500':'bg-gray-100 hover:bg-gray-200'}`}>
                {ic}
              </button>
            ))}
          </div>
          <input className="inp flex-1 min-w-[160px]" placeholder="Habit name..."
            value={newName} onChange={e=>setNewName(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&addHabit()} />
          <button onClick={addHabit} className="btn-blue flex items-center gap-1"><Plus size={14}/>Add</button>
        </div>
      </div>

      {/* Today */}
      <div className="card mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-green-50">
          <span className="text-xs font-bold text-green-600 uppercase tracking-wide">✅ Today — {format(new Date(),'EEEE, MMMM d')}</span>
          <span className="text-xs text-green-500">{todayDone}/{habits.length} done</span>
        </div>
        {loading ? <div className="p-6 text-center text-gray-400">Loading...</div> :
         habits.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No habits yet. Add one above!</div>
        ) : (
          <>
            {habits.map(h => {
              const done = isDone(h.id, today)
              return (
                <div key={h.id} onClick={()=>toggle(h.id, today)}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 group transition-all ${done?'bg-green-50/30':''}`}>
                  <div className={`w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all
                    ${done?'bg-green-500 border-green-500 text-white':'border-gray-200 group-hover:border-green-300'}`}>
                    {done&&'✓'}
                  </div>
                  <span className="text-lg">{h.icon}</span>
                  <span className={`flex-1 text-sm font-medium ${done?'line-through text-gray-400':''}`}>{h.name}</span>
                  <button onClick={e=>{e.stopPropagation();delHabit(h.id)}}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                    <Trash2 size={13}/>
                  </button>
                </div>
              )
            })}
            {/* Progress */}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Today's progress</span>
                <span className="font-bold text-green-600">{Math.round((todayDone/Math.max(habits.length,1))*100)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{width:`${(todayDone/Math.max(habits.length,1))*100}%`}}/>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Weekly */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-xs font-bold text-blue-500 uppercase tracking-wide">📊 Last 7 Days</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2 text-gray-400 font-semibold">Habit</th>
                {last7.map(d=>(
                  <th key={d} className={`px-2 py-2 text-center font-semibold w-9 ${d===today?'text-blue-500':''}`}>
                    <div>{format(new Date(d),'EEE')}</div>
                    <div className={`text-[10px] mt-0.5 ${d===today?'bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center mx-auto':''}`}>
                      {format(new Date(d),'d')}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-gray-400 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {habits.map(h => {
                const score = last7.filter(d=>isDone(h.id,d)).length
                return (
                  <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 flex items-center gap-2 font-medium"><span>{h.icon}</span>{h.name}</td>
                    {last7.map(d=>(
                      <td key={d} className="px-2 py-2 text-center">
                        <div onClick={()=>toggle(h.id,d)}
                          className={`w-6 h-6 rounded-full mx-auto cursor-pointer flex items-center justify-center text-[10px] transition-all
                            ${isDone(h.id,d)?'bg-green-500 text-white':d===today?'border-2 border-dashed border-gray-200 hover:border-green-300':'bg-gray-100'}`}>
                          {isDone(h.id,d)&&'✓'}
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <span className={`font-bold ${score>=5?'text-green-500':score>=3?'text-orange-500':'text-red-500'}`}>{score}/7</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
