'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Plus, Trash2, ChevronDown } from 'lucide-react'

export default function TodoPage() {
  const [todos, setTodos] = useState<any[]>([])
  const [expanded, setExpanded] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newCat, setNewCat] = useState('Personal')
  const [newStart, setNewStart] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [newPriority, setNewPriority] = useState('medium')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('todos').select('*').eq('user_id', user.id).order('created_at', {ascending:false})
    if (data) setTodos(data)
    setLoading(false)
  }

  async function add() {
    if (!newTitle.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('todos').insert({
      title: newTitle, category: newCat, start_date: newStart||null,
      deadline: newDeadline||null, priority: newPriority,
      status: 'pending', is_urgent: newPriority==='high',
      micro_list: [], user_id: user.id,
    })
    setNewTitle(''); setNewStart(''); setNewDeadline('')
    load()
  }

  async function toggleDone(todo: any) {
    await supabase.from('todos').update({
      status: todo.status==='done' ? 'pending' : 'done',
      completed_at: todo.status==='done' ? null : new Date().toISOString(),
    }).eq('id', todo.id)
    load()
  }

  async function del(id: string) {
    if (!confirm('Delete this task?')) return
    await supabase.from('todos').delete().eq('id', id)
    load()
  }

  async function updateNotes(id: string, notes: string) {
    await supabase.from('todos').update({ notes }).eq('id', id)
  }

  async function addMicro(todo: any, text: string) {
    const list = [...(todo.micro_list||[]), {text, done: false}]
    await supabase.from('todos').update({ micro_list: list }).eq('id', todo.id)
    load()
  }

  async function toggleMicro(todo: any, i: number) {
    const list = [...(todo.micro_list||[])]
    list[i] = {...list[i], done: !list[i].done}
    await supabase.from('todos').update({ micro_list: list }).eq('id', todo.id)
    load()
  }

  const cats = ['Study','Bisnis','Personal','Lainnya']
  const catColor: Record<string,string> = {
    Study:'bg-blue-50 text-blue-500', Bisnis:'bg-green-50 text-green-500',
    Personal:'bg-orange-50 text-orange-500', Lainnya:'bg-purple-50 text-purple-500'
  }
  const filtered = todos.filter(t => !filterCat || t.category===filterCat)
  const done = todos.filter(t => t.status==='done').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">To Do List ✅</h1>
          <p className="text-xs text-gray-400 mt-0.5">Click task to expand · check to mark done</p>
        </div>
        <div className="text-xs text-gray-400 bg-white border border-gray-100 px-3 py-1.5 rounded-full shadow-sm">
          {done}/{todos.length} done
        </div>
      </div>

      {/* Add form */}
      <div className="card p-4 mb-4">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">+ Add New Task</div>
        <div className="flex gap-2 flex-wrap">
          <input className="inp flex-[2] min-w-[180px]" placeholder="Task name..."
            value={newTitle} onChange={e=>setNewTitle(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()} />
          <select className="sel" value={newCat} onChange={e=>setNewCat(e.target.value)}>
            {cats.map(c=><option key={c}>{c}</option>)}
          </select>
          <input type="date" className="sel" value={newStart} onChange={e=>setNewStart(e.target.value)} title="Start date" />
          <input type="date" className="sel" value={newDeadline} onChange={e=>setNewDeadline(e.target.value)} title="Deadline" />
          <select className="sel" value={newPriority} onChange={e=>setNewPriority(e.target.value)}>
            <option value="high">🔴 High</option>
            <option value="medium">🟠 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
          <button onClick={add} className="btn-blue flex items-center gap-1"><Plus size={14}/>Add</button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-3">
        <select className="sel text-xs" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {cats.map(c=><option key={c}>{c}</option>)}
        </select>
        <select className="sel text-xs">
          <option>All status</option><option>Pending</option><option>Done</option>
        </select>
      </div>

      {/* Tasks */}
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No tasks yet. Add one above!</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(todo => (
            <div key={todo.id} className={`card transition-all ${expanded===todo.id?'ring-2 ring-blue-400':''} ${todo.status==='done'?'opacity-60':''}`}>
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={()=>setExpanded(expanded===todo.id?null:todo.id)}>
                <div onClick={e=>{e.stopPropagation();toggleDone(todo)}}
                  className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center text-[10px] transition-all
                    ${todo.status==='done'?'bg-green-500 border-green-500 text-white':'border-gray-200 hover:border-green-300'}`}>
                  {todo.status==='done'&&'✓'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13.5px] font-medium ${todo.status==='done'?'line-through text-gray-400':''}`}>{todo.title}</div>
                  <div className="flex gap-2 mt-1 flex-wrap items-center">
                    <span className={`tag text-[10px] ${catColor[todo.category]||''}`}>{todo.category}</span>
                    {todo.is_urgent&&<span className="tag bg-red-50 text-red-500 text-[10px] border border-red-200">⚡ Urgent</span>}
                    {todo.start_date&&<span className="text-[10px] text-gray-400">Start: {todo.start_date}</span>}
                    {todo.deadline&&<span className="text-[10px] text-gray-400">Deadline: {todo.deadline}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${todo.priority==='high'?'bg-red-500':todo.priority==='medium'?'bg-orange-400':'bg-green-500'}`}/>
                  <div className={`text-gray-400 transition-transform ${expanded===todo.id?'rotate-180':''}`}><ChevronDown size={15}/></div>
                </div>
              </div>

              {/* Expanded */}
              {expanded===todo.id && (
                <div className="border-t border-gray-100 bg-gray-50 p-4" onClick={e=>e.stopPropagation()}>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      {label:'Category', val:todo.category},
                      {label:'Start Date', val:todo.start_date||'—', blue:true},
                      {label:'Deadline', val:todo.deadline||'—', red:!!todo.deadline},
                    ].map((b,i)=>(
                      <div key={i} className="bg-white rounded-xl p-3 border border-gray-100">
                        <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">{b.label}</div>
                        <div className={`text-sm font-semibold ${b.blue?'text-blue-500':b.red?'text-red-500':''}`}>{b.val}</div>
                      </div>
                    ))}
                  </div>
                  {/* Notes */}
                  <div className="bg-white rounded-xl p-3 border border-gray-100 mb-3">
                    <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">📝 Notes</div>
                    <textarea className="w-full text-xs bg-transparent border-none outline-none resize-none font-sans leading-relaxed min-h-[48px]"
                      placeholder="Add notes here..." defaultValue={todo.notes||''}
                      onBlur={e=>updateNotes(todo.id, e.target.value)} />
                  </div>
                  {/* Micro list */}
                  <div className="bg-white rounded-xl p-3 border border-gray-100 mb-3">
                    <div className="text-[9px] font-bold uppercase text-gray-400 mb-2">📋 Steps (micro-list)</div>
                    {(todo.micro_list||[]).map((m:any,i:number)=>(
                      <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0 text-xs">
                        <div onClick={()=>toggleMicro(todo,i)}
                          className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-[9px] cursor-pointer
                            ${m.done?'bg-blue-500 border-blue-500 text-white':'border-gray-200'}`}>
                          {m.done&&'✓'}
                        </div>
                        <span className={`flex-1 ${m.done?'line-through text-gray-400':''}`}>{m.text}</span>
                      </div>
                    ))}
                    <input className="w-full text-xs bg-gray-50 px-2 py-1.5 rounded-lg mt-1 outline-none font-sans border border-gray-100"
                      placeholder="+ Add step (press Enter)"
                      onKeyDown={async e=>{
                        if(e.key==='Enter'&&(e.target as HTMLInputElement).value){
                          await addMicro(todo,(e.target as HTMLInputElement).value)
                          ;(e.target as HTMLInputElement).value=''
                        }
                      }} />
                  </div>
                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={()=>toggleDone(todo)} className="btn-blue text-xs py-1.5">
                      {todo.status==='done'?'↩ Reopen':'✓ Mark Done'}
                    </button>
                    <button onClick={()=>del(todo.id)} className="btn text-xs py-1.5 bg-red-50 text-red-500 border border-red-200 flex items-center gap-1">
                      <Trash2 size={12}/>Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
