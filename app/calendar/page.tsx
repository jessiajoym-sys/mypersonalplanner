'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth, addMonths, subMonths } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date())
  const [events, setEvents] = useState<any[]>([])
  const [selected, setSelected] = useState<string|null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({title:'', date:format(new Date(),'yyyy-MM-dd'), type:'event', notes:''})

  useEffect(() => { load() }, [month])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('events').select('*').eq('user_id',user.id)
      .gte('date', format(startOfMonth(month),'yyyy-MM-dd'))
      .lte('date', format(endOfMonth(month),'yyyy-MM-dd'))
      .order('date')
    if (data) setEvents(data)
  }

  async function add() {
    if (!form.title.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('events').insert({...form, user_id:user.id})
    setShowAdd(false)
    setForm({title:'',date:format(new Date(),'yyyy-MM-dd'),type:'event',notes:''})
    load()
  }

  async function del(id: string) {
    await supabase.from('events').delete().eq('id', id)
    load()
  }

  const days = eachDayOfInterval({start:startOfMonth(month),end:endOfMonth(month)})
  const fd = startOfMonth(month).getDay()
  const onDay = (d: string) => events.filter(e=>e.date===d)
  const tc: Record<string,string> = {event:'bg-purple-100 text-purple-600',deadline:'bg-red-100 text-red-500',exam:'bg-blue-100 text-blue-500',meeting:'bg-green-100 text-green-600'}

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Calendar 📅</h1>
        <button onClick={()=>setShowAdd(true)} className="btn-blue flex items-center gap-1 text-xs"><Plus size={13}/>Add Event</button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={()=>setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e=>e.stopPropagation()}>
            <h2 className="font-bold mb-4">Add Event</h2>
            <div className="flex flex-col gap-3">
              <input className="inp" placeholder="Event title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} />
              <input type="date" className="inp" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
              <select className="sel w-full" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                {['event','deadline','exam','meeting'].map(t=><option key={t}>{t}</option>)}
              </select>
              <textarea className="inp resize-none" rows={2} placeholder="Notes (optional)" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
              <div className="flex gap-2 justify-end">
                <button className="btn-gray" onClick={()=>setShowAdd(false)}>Cancel</button>
                <button className="btn-blue" onClick={add}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_280px] gap-4">
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button className="btn-gray px-2 py-1 text-sm" onClick={()=>setMonth(subMonths(month,1))}>‹</button>
            <span className="font-bold">{format(month,'MMMM yyyy')}</span>
            <button className="btn-gray px-2 py-1 text-sm" onClick={()=>setMonth(addMonths(month,1))}>›</button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-7 mb-1">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div key={d} className="text-[10px] text-gray-400 text-center font-semibold">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({length:fd===0?6:fd-1}).map((_,i)=><div key={i}/>)}
              {days.map(day=>{
                const ds = format(day,'yyyy-MM-dd')
                const de = onDay(ds)
                const isSel = selected===ds
                return (
                  <div key={ds} onClick={()=>setSelected(isSel?null:ds)}
                    className={`min-h-[56px] p-1 rounded-xl cursor-pointer border transition-all
                      ${isToday(day)?'border-blue-400 bg-blue-50':isSel?'border-blue-300 bg-blue-50/50':'border-transparent hover:bg-gray-50'}`}>
                    <div className={`text-xs font-bold mb-0.5 ${isToday(day)?'text-blue-500':isSameMonth(day,month)?'text-gray-700':'text-gray-300'}`}>{format(day,'d')}</div>
                    {de.slice(0,2).map(ev=>(
                      <div key={ev.id} className={`text-[9px] font-semibold px-1 rounded truncate mb-0.5 ${tc[ev.type]||'bg-gray-100 text-gray-500'}`}>{ev.title}</div>
                    ))}
                    {de.length>2&&<div className="text-[9px] text-gray-400">+{de.length-2}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-xs font-bold text-gray-400 uppercase">{selected?format(new Date(selected),'EEEE, MMMM d'):'Select a date'}</div>
          </div>
          {selected ? (
            onDay(selected).length===0 ? (
              <div className="p-6 text-center text-gray-400 text-sm py-10">
                <div className="text-3xl mb-2">📅</div>
                No events<br/>
                <button onClick={()=>{setForm({...form,date:selected});setShowAdd(true)}} className="text-blue-500 text-xs font-semibold mt-2">+ Add event</button>
              </div>
            ) : (
              <div>
                {onDay(selected).map(ev=>(
                  <div key={ev.id} className="p-4 border-b border-gray-100 group">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-sm">{ev.title}</div>
                        <span className={`tag text-[10px] mt-1 inline-block ${tc[ev.type]}`}>{ev.type}</span>
                        {ev.notes&&<div className="text-xs text-gray-400 mt-1">{ev.notes}</div>}
                      </div>
                      <button onClick={()=>del(ev.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"><Trash2 size={13}/></button>
                    </div>
                  </div>
                ))}
                <div className="p-3">
                  <button onClick={()=>{setForm({...form,date:selected});setShowAdd(true)}} className="w-full text-xs text-blue-500 font-semibold py-2 border border-dashed border-blue-200 rounded-xl hover:bg-blue-50 transition-colors">+ Add event</button>
                </div>
              </div>
            )
          ) : (
            <div className="p-6 text-center text-gray-400 py-12 text-sm">👆 Click a date to see events</div>
          )}
        </div>
      </div>
    </div>
  )
}
