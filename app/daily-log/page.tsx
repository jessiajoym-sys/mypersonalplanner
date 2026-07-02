'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Plus, Trash2, X } from 'lucide-react'

export default function DailyLogPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [todos, setTodos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [showAddLog, setShowAddLog] = useState<string | null>(null)
  const [logForm, setLogForm] = useState({ content: '', type: 'work_log' })

  useEffect(() => { load() }, [selectedDate])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Fetch daily logs
    const { data: logsData } = await supabase.from('daily_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', selectedDate)
      .order('created_at', { ascending: false })

    // Fetch todos (all, to check which ones are from today)
    const { data: todosData } = await supabase.from('todos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (logsData) setLogs(logsData)
    if (todosData) setTodos(todosData)
    setLoading(false)
  }

  async function addLog() {
    if (!logForm.content.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('daily_logs').insert({
      user_id: user.id,
      date: selectedDate,
      type: logForm.type,
      content: logForm.content,
      time_logged: format(new Date(), 'HH:mm'),
    })
    setLogForm({ content: '', type: 'work_log' })
    setShowAddLog(null)
    load()
  }

  async function deleteLog(id: string) {
    if (!confirm('Delete this log?')) return
    await supabase.from('daily_logs').delete().eq('id', id)
    load()
  }

  async function markTodoDone(todoId: string, title: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Mark todo as done
    await supabase.from('todos').update({ status: 'done' }).eq('id', todoId)

    // Add to accomplishments
    await supabase.from('daily_logs').insert({
      user_id: user.id,
      date: selectedDate,
      type: 'accomplishment',
      content: title,
      time_logged: format(new Date(), 'HH:mm'),
    })
    load()
  }

  // Get tasks received today (todos created today or with deadline today)
  const tasksReceived = todos.filter(t => {
    const createdDate = format(new Date(t.created_at), 'yyyy-MM-dd')
    const deadlineMatch = t.deadline === selectedDate
    return createdDate === selectedDate || deadlineMatch
  })

  // Get accomplishments (todos marked done today + daily logs)
  const accomplishmentLogs = logs.filter(l => l.type === 'accomplishment')
  const completedTodos = todos.filter(t =>
    t.status === 'done' && t.updated_at && format(new Date(t.updated_at), 'yyyy-MM-dd') === selectedDate
  )

  // Get work logs
  const workLogs = logs.filter(l => l.type === 'work_log')

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">Daily Log 📝</h1>
          <p className="text-xs text-gray-400 mt-0.5">Track your tasks, accomplishments & work</p>
        </div>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-2 mb-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
        <button onClick={() => setSelectedDate(format(new Date(selectedDate).getTime() - 86400000, 'yyyy-MM-dd'))}
          className="btn-gray text-xs">‹ Prev day</button>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          className="sel text-xs flex-1" />
        <button onClick={() => setSelectedDate(format(new Date(selectedDate).getTime() + 86400000, 'yyyy-MM-dd'))}
          className="btn-gray text-xs">Next day ›</button>
        <button onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
          className="btn-blue text-xs">Today</button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading...</div>
      ) : (
        <>
          {/* TASKS RECEIVED TODAY */}
          <div className="card mb-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-blue-50">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">📥 Tasks Received Today</span>
              <span className="tag bg-blue-100 text-blue-600 text-xs">{tasksReceived.length}</span>
            </div>
            {tasksReceived.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs">No tasks received today</div>
            ) : (
              <div>
                {tasksReceived.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 group">
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 cursor-pointer transition-all
                      ${t.status === 'done' ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}
                      onClick={() => markTodoDone(t.id, t.title)} />
                    <div className="flex-1">
                      <div className={`text-sm ${t.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                        {t.title}
                      </div>
                      <div className="text-xs text-gray-400">
                        {t.category}
                        {t.deadline && ` · Deadline: ${t.deadline}`}
                      </div>
                    </div>
                    {t.status !== 'done' && (
                      <button onClick={() => markTodoDone(t.id, t.title)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-blue-500 font-semibold transition-all">
                        Mark done
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TODAY'S ACCOMPLISHMENTS */}
          <div className="card mb-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-green-50">
              <span className="text-xs font-bold text-green-600 uppercase tracking-wide">🏆 Today's Accomplishments</span>
              <span className="tag bg-green-100 text-green-600 text-xs">{accomplishmentLogs.length + completedTodos.length}</span>
            </div>
            {accomplishmentLogs.length === 0 && completedTodos.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs">
                Complete tasks to see them here
              </div>
            ) : (
              <div>
                {/* From completed todos */}
                {completedTodos.map(t => (
                  <div key={`todo-${t.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 group hover:bg-gray-50">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm line-through text-gray-600">{t.title}</div>
                      <div className="text-xs text-gray-400">{t.category}</div>
                    </div>
                    <button onClick={() => deleteLog(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {/* From daily logs */}
                {accomplishmentLogs.map(log => (
                  <div key={log.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 group hover:bg-gray-50">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm">{log.content}</div>
                      <div className="text-xs text-gray-400">{log.time_logged}</div>
                    </div>
                    <button onClick={() => deleteLog(log.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(accomplishmentLogs.length > 0 || completedTodos.length > 0) && (
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-center">
                <button onClick={() => { setShowAddLog('accomplishment'); setLogForm({ ...logForm, type: 'accomplishment' }) }}
                  className="text-xs text-green-600 font-semibold hover:underline">
                  + Add more accomplishments
                </button>
              </div>
            )}
          </div>

          {/* DAILY WORK LOG */}
          <div className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-orange-50">
              <span className="text-xs font-bold text-orange-600 uppercase tracking-wide">📋 Daily Work Log</span>
              <span className="tag bg-orange-100 text-orange-600 text-xs">{workLogs.length}</span>
            </div>
            {workLogs.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs">No work logged yet</div>
            ) : (
              <div>
                {workLogs.map(log => (
                  <div key={log.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 group hover:bg-gray-50">
                    <div className="w-4 h-4 rounded-full bg-orange-400 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm">{log.content}</div>
                      <div className="text-xs text-gray-400">{log.category} · {log.time_logged}</div>
                    </div>
                    <button onClick={() => deleteLog(log.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
              <button onClick={() => { setShowAddLog('work_log'); setLogForm({ ...logForm, type: 'work_log' }) }}
                className="flex items-center gap-1.5 text-xs text-orange-600 font-semibold hover:underline w-full justify-center">
                <Plus size={13} /> Add work log entry
              </button>
            </div>
          </div>

          {/* Add Log Modal */}
          {showAddLog && (
            <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
              onClick={() => setShowAddLog(null)}>
              <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-base">
                    Add {showAddLog === 'work_log' ? 'Work Log' : 'Accomplishment'}
                  </h2>
                  <button onClick={() => setShowAddLog(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                </div>
                <textarea className="inp text-xs resize-none mb-3" rows={3} placeholder="What did you accomplish / work on?"
                  value={logForm.content} onChange={e => setLogForm({ ...logForm, content: e.target.value })}
                  autoFocus />
                <div className="flex gap-2">
                  <button className="btn-blue flex-1" onClick={addLog}>Save</button>
                  <button className="btn-gray flex-1" onClick={() => setShowAddLog(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
