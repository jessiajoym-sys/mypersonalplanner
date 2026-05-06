'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addDays, addWeeks, subWeeks } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'

const dayColors = ['border-blue-200','border-pink-200','border-green-200','border-orange-200','border-purple-200','border-teal-200','border-yellow-200']
const dayBg = ['bg-blue-50','bg-pink-50','bg-green-50','bg-orange-50','bg-purple-50','bg-teal-50','bg-yellow-50']
const dayText = ['text-blue-500','text-pink-500','text-green-600','text-orange-500','text-purple-600','text-teal-600','text-yellow-600']

export default function WeeklyPage() {
  const [weekStart, setWeekStart] = useState(new Date())
  const [tasks, setTasks] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState<string|null>(null)
  const [input, setInput] = useState('')
  const [time, setTime] = useState('')
  const days = Array.from({length:7},(_,i)=>addDays(weekStart,i))

  useEffect(() => { load() }, [weekStart])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('daily_logs').select('*')
      .eq('user_id', user.id).eq('type','week_task')
      .gte('date', format(weekStart,'yyyy-MM-dd'))
      .lte('date', format(addDays(weekStart,6),'yyyy-MM-dd'))
    if (data) setTasks(data)
  }

  async function add(date: string) {
    if (!input.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('daily_logs').insert({date, type:'week_task', content:input, time_logged:time||null, category:'General', user_id:user.id})
    setInput(''); setTime(''); setShowAdd(null)
    load()
  }

  async function toggle(t: any) {
    const content = t.content.startsWith('[✓]') ? t.content.replace('[✓]','').trim() : `[✓] ${t.content}`
    await supabase.from('daily_logs').update({content}).eq('id',t.id)
    load()
  }

  async function del(id: string) {
    await supabase.from('daily_logs').delete().eq('id',id)
    load()
  }

  const forDay = (d: string) => tasks.filter(t=>t.date===d)
  const done = tasks.filter(t=>t.content.startsWith('[✓]')).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Weekly Schedule 📆</h1>
          <p className="text-xs text-gray-400 mt-0.5">Rolling 7 days · Click + to add tasks</p>
        </div>
        <div className="text-xs text-gray-400 bg-white border border-gray-100 px-3 py-1.5 rounded-full">{done}/{tasks.length} done</div>
      </div>

      <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 mb-4 shadow-sm">
        <button className="btn-gray text-xs" onClick={()=>setWeekStart(subWeeks(weekStart,1))}>‹ Prev</button>
        <div className="text-center">
          <div className="font-bold">{format(weekStart,'MMM d')} – {format(addDays(weekStart,6),'MMM d, yyyy')}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-blue text-xs" onClick={()=>setWeekStart(new Date())}>Today</button>
          <button className="btn-gray text-xs" onClick={()=>setWeekStart(addWeeks(weekStart,1))}>Next ›</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {days.map((day,idx)=>{
          const ds = format(day,'yyyy-MM-dd')
          const dt = forDay(ds)
          const isToday = ds===format(new Date(),'yyyy-MM-dd')
          const isLast = idx===6
          return (
            <div key={ds} className={`card ${isLast?'col-span-2':''} ${isToday?'ring-2 ring-blue-400':''}`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 ${dayBg[idx]}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center border ${dayColors[idx]} ${dayBg[idx]}`}>
                    <span className={`text-base font-bold leading-none ${dayText[idx]}`}>{format(day,'d')}</span>
                    <span className={`text-[9px] uppercase ${dayText[idx]}`}>{format(day,'MMM')}</span>
                  </div>
                  <div>
                    <div className={`font-bold text-sm ${dayText[idx]}`}>{format(day,'EEEE')}</div>
                    <div className="text-[10px] text-gray-400">{format(day,'MMMM d, yyyy')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isToday&&<span className="tag bg-blue-500 text-white text-[10px]">TODAY</span>}
                  <button onClick={()=>setShowAdd(showAdd===ds?null:ds)} className="w-7 h-7 rounded-lg bg-white/80 border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-blue-500 hover:text-white transition-all"><Plus size={13}/></button>
                </div>
              </div>
              {showAdd===ds&&(
                <div className="flex gap-2 p-3 border-b border-gray-100 bg-gray-50">
                  <input className="inp text-xs flex-1" placeholder="Task..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add(ds)} autoFocus/>
                  <input type="time" className="sel text-xs w-24" value={time} onChange={e=>setTime(e.target.value)}/>
                  <button className="btn-blue text-xs" onClick={()=>add(ds)}>Add</button>
                  <button className="btn-gray text-xs" onClick={()=>setShowAdd(null)}>✕</button>
                </div>
              )}
              {dt.length===0?(
                <div className="p-4 text-center text-xs text-gray-400 italic cursor-pointer hover:bg-gray-50" onClick={()=>setShowAdd(ds)}>+ Add tasks for this day</div>
              ):(
                dt.map(t=>(
                  <div key={t.id} onClick={()=>toggle(t)} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer group">
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-[9px] transition-all ${t.content.startsWith('[✓]')?'bg-green-500 border-green-500 text-white':'border-gray-200'}`}>
                      {t.content.startsWith('[✓]')&&'✓'}
                    </div>
                    <span className={`flex-1 text-xs ${t.content.startsWith('[✓]')?'line-through text-gray-400':''}`}>{t.content.replace('[✓]','').trim()}</span>
                    {t.time_logged&&<span className="text-[10px] text-gray-400">{t.time_logged}</span>}
                    <button onClick={e=>{e.stopPropagation();del(t.id)}} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"><Trash2 size={11}/></button>
                  </div>
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
