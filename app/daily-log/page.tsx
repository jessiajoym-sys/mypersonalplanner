'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addDays, subDays } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'

const sections = [
  {key:'task_received', label:'Tasks Received Today', icon:'📥', color:'text-blue-500', bg:'bg-blue-50', hint:'New tasks added today...'},
  {key:'accomplishment', label:"Today's Accomplishments", icon:'🏆', color:'text-green-600', bg:'bg-green-50', hint:'What did you accomplish...'},
  {key:'work_log', label:'Daily Work Log', icon:'📋', color:'text-purple-600', bg:'bg-purple-50', hint:'Work activity, client update...'},
]

export default function DailyLogPage() {
  const [date, setDate] = useState(new Date())
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [inputs, setInputs] = useState<Record<string,string>>({})
  const [cats, setCats] = useState<Record<string,string>>({})

  useEffect(() => { load() }, [date])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('daily_logs').select('*')
      .eq('user_id', user.id).eq('date', format(date,'yyyy-MM-dd')).order('created_at')
    if (data) setLogs(data)
    setLoading(false)
  }

  async function add(type: string) {
    const content = inputs[type]
    if (!content?.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('daily_logs').insert({
      date: format(date,'yyyy-MM-dd'), type, content,
      category: cats[type]||'General',
      time_logged: format(new Date(),'HH:mm'),
      user_id: user.id,
    })
    setInputs(p=>({...p,[type]:''}))
    load()
  }

  async function del(id: string) {
    await supabase.from('daily_logs').delete().eq('id', id)
    load()
  }

  const byType = (t: string) => logs.filter(l=>l.type===t)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Daily Log 📝</h1>
          <p className="text-xs text-gray-400 mt-0.5">1 page per day · add tasks, accomplishments & work log</p>
        </div>
      </div>

      {/* Date nav */}
      <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 mb-4 shadow-sm">
        <button className="btn-gray text-xs" onClick={()=>setDate(subDays(date,1))}>‹ Yesterday</button>
        <div className="text-center">
          <div className="font-bold text-[16px]">{format(date,'EEEE, MMMM d, yyyy')}</div>
          <div className="text-xs text-gray-400 mt-0.5">Day {format(date,'d')} of May</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-blue text-xs" onClick={()=>setDate(new Date())}>Today</button>
          <button className="btn-gray text-xs" onClick={()=>setDate(addDays(date,1))}>Tomorrow ›</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {sections.map(s=>(
          <div key={s.key} className={`${s.bg} border border-gray-100 rounded-xl p-3 flex items-center gap-3`}>
            <span className="text-2xl">{s.icon}</span>
            <div>
              <div className={`text-xl font-bold ${s.color}`}>{byType(s.key).length}</div>
              <div className="text-[11px] text-gray-400">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 3 columns */}
      <div className="grid grid-cols-3 gap-4">
        {sections.map(s=>(
          <div key={s.key} className="card">
            <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 ${s.bg}`}>
              <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${s.color}`}>
                <span>{s.icon}</span>{s.label}
              </div>
              <span className={`text-xs font-semibold ${s.color}`}>{byType(s.key).length}</span>
            </div>

            {/* Input */}
            <div className="flex gap-2 p-3 border-b border-gray-100">
              {s.key==='work_log' && (
                <select className="sel text-xs w-24 flex-shrink-0"
                  value={cats[s.key]||'General'} onChange={e=>setCats(p=>({...p,[s.key]:e.target.value}))}>
                  {['General','Bisnis','Personal','Finance','China'].map(c=><option key={c}>{c}</option>)}
                </select>
              )}
              <input className="inp text-xs flex-1" placeholder={s.hint}
                value={inputs[s.key]||''} onChange={e=>setInputs(p=>({...p,[s.key]:e.target.value}))}
                onKeyDown={e=>e.key==='Enter'&&add(s.key)} />
              <button onClick={()=>add(s.key)} className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center flex-shrink-0">
                <Plus size={15}/>
              </button>
            </div>

            {/* Items */}
            {loading ? <div className="p-4 text-xs text-center text-gray-400">Loading...</div> :
             byType(s.key).length === 0 ? (
              <div className="p-4 text-xs text-center text-gray-400 italic">Nothing yet. Add above!</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {byType(s.key).map(log=>(
                  <div key={log.id} className="flex items-start gap-2 px-4 py-2.5 hover:bg-gray-50 group">
                    {s.key!=='work_log' && <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 mt-1.5"/>}
                    {s.key==='work_log' && <span className="tag bg-gray-100 text-gray-500 text-[9px] flex-shrink-0 mt-0.5">{log.category}</span>}
                    <div className="flex-1">
                      <div className="text-xs leading-relaxed">{log.content}</div>
                      {log.time_logged && <div className="text-[10px] text-gray-400 mt-0.5">{log.time_logged}</div>}
                    </div>
                    <button onClick={()=>del(log.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
