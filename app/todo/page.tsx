'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'

const DEFAULT_PROJECTS = [
  { name: 'School', color: '#5B7FFF', dot: 'bg-blue-500' },
  { name: 'Content', color: '#22C55E', dot: 'bg-green-500' },
  { name: 'Business', color: '#F97316', dot: 'bg-orange-500' },
  { name: 'Personal', color: '#FF6B8A', dot: 'bg-pink-500' },
  { name: 'Finance', color: '#14B8A6', dot: 'bg-teal-500' },
]

const STATUS_OPTIONS = [
  { val: 'todo', label: 'To Do', cls: 'bg-gray-100 text-gray-500' },
  { val: 'inprogress', label: 'In Progress', cls: 'bg-blue-50 text-blue-500' },
  { val: 'done', label: 'Done', cls: 'bg-green-50 text-green-600' },
  { val: 'blocked', label: 'Blocked', cls: 'bg-red-50 text-red-500' },
]

const REPEAT_OPTIONS = ['never', 'daily', 'weekly', 'monthly', 'yearly']

export default function TodoPage() {
  const [todos, setTodos] = useState<any[]>([])
  const [projects, setProjects] = useState(DEFAULT_PROJECTS)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'board' | 'calendar'>('list')
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [collapsedProjects, setCollapsedProjects] = useState<string[]>([])
  const [addingToProject, setAddingToProject] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('todos').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false })
    if (data) {
      setTodos(data)
      const existingProjects = [...new Set(data.map((t: any) => t.category))]
      const customProjects = existingProjects
        .filter((p: any) => p && !DEFAULT_PROJECTS.find(dp => dp.name === p))
        .map((p: any) => ({ name: p, color: '#8B5CF6', dot: 'bg-purple-500' }))
      if (customProjects.length > 0) setProjects([...DEFAULT_PROJECTS, ...customProjects])
    }
    setLoading(false)
  }

  async function quickAddTask(project: string) {
    if (!newTaskTitle.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('todos').insert({
      title: newTaskTitle,
      category: project,
      status: 'todo',
      priority: 'medium',
      repeat_type: 'never',
      micro_list: [],
      is_urgent: false,
      user_id: user.id,
    })
    setNewTaskTitle('')
    setAddingToProject(null)
    load()
  }

  async function updateField(id: string, field: string, value: any) {
    await supabase.from('todos').update({ [field]: value }).eq('id', id)
    if (field === 'status' && value === 'done') {
      const todo = todos.find(t => t.id === id)
      const { data: { user } } = await supabase.auth.getUser()
      if (todo && user) {
        await supabase.from('daily_logs').insert({
          user_id: user.id,
          date: format(new Date(), 'yyyy-MM-dd'),
          type: 'accomplishment',
          category: todo.category,
          content: todo.title,
          time_logged: format(new Date(), 'HH:mm'),
        })
      }
    }
    load()
  }

  async function deleteTodo(id: string) {
    if (!confirm('Delete this task?')) return
    await supabase.from('todos').delete().eq('id', id)
    load()
  }

  async function toggleMicro(todo: any, idx: number) {
    const list = [...(todo.micro_list || [])]
    list[idx] = { ...list[idx], done: !list[idx].done }
    await supabase.from('todos').update({ micro_list: list }).eq('id', todo.id)
    load()
  }

  async function addMicroItem(todo: any, text: string) {
    const list = [...(todo.micro_list || []), { text, done: false }]
    await supabase.from('todos').update({ micro_list: list }).eq('id', todo.id)
    load()
  }

  async function deleteMicro(todo: any, idx: number) {
    const list = (todo.micro_list || []).filter((_: any, i: number) => i !== idx)
    await supabase.from('todos').update({ micro_list: list }).eq('id', todo.id)
    load()
  }

  function addProject() {
    if (!newProjectName.trim() || projects.find(p => p.name === newProjectName)) return
    setProjects([...projects, { name: newProjectName, color: '#8B5CF6', dot: 'bg-purple-500' }])
    setNewProjectName('')
    setShowNewProject(false)
  }

  function removeProject(name: string) {
    if (DEFAULT_PROJECTS.find(p => p.name === name)) return
    if (!confirm(`Delete project "${name}"? Tasks will not be deleted.`)) return
    setProjects(projects.filter(p => p.name !== name))
  }

  function toggleCollapse(name: string) {
    setCollapsedProjects(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    )
  }

  const filtered = todos.filter(t =>
    (!filterStatus || t.status === filterStatus) &&
    (!filterPriority || t.priority === filterPriority) &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))
  )

  const getProjectTodos = (project: string) => filtered.filter(t => t.category === project)
  const getTodosByStatus = (status: string) => filtered.filter(t => t.status === status)
  const getTodosByDeadline = () => {
    const withDeadline = filtered.filter(t => t.deadline)
    const grouped: Record<string, any[]> = {}
    withDeadline.forEach(t => {
      if (!grouped[t.deadline]) grouped[t.deadline] = []
      grouped[t.deadline].push(t)
    })
    return grouped
  }

  const totalDone = todos.filter(t => t.status === 'done').length
  const totalTasks = todos.length

  const PriorityDot = ({ p }: { p: string }) => (
    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-orange-400' : 'bg-green-500'}`} />
  )

  const TaskExpandedPanel = ({ todo }: { todo: any }) => {
    const [notes, setNotes] = useState(todo.notes || '')
    const [microInput, setMicroInput] = useState('')
    const microDone = (todo.micro_list || []).filter((m: any) => m.done).length
    const microTotal = (todo.micro_list || []).length

    return (
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-4" onClick={e => e.stopPropagation()}>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wide mb-1.5">Status</div>
            <select value={todo.status} onChange={e => updateField(todo.id, 'status', e.target.value)}
              className="w-full text-xs border-none bg-transparent outline-none font-semibold cursor-pointer font-sans">
              {STATUS_OPTIONS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wide mb-1.5">Priority</div>
            <select value={todo.priority} onChange={e => updateField(todo.id, 'priority', e.target.value)}
              className="w-full text-xs border-none bg-transparent outline-none font-semibold cursor-pointer font-sans">
              <option value="high">🔴 High</option>
              <option value="medium">🟠 Medium</option>
              <option value="low">🟢 Low</option>
            </select>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wide mb-1">📅 Start Date</div>
            <input type="date" value={todo.start_date || ''} onChange={e => updateField(todo.id, 'start_date', e.target.value || null)}
              className="w-full text-xs border-none bg-transparent outline-none text-blue-500 font-semibold font-sans cursor-pointer" />
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wide mb-1">⏰ Deadline</div>
            <input type="date" value={todo.deadline || ''} onChange={e => updateField(todo.id, 'deadline', e.target.value || null)}
              className="w-full text-xs border-none bg-transparent outline-none text-red-500 font-semibold font-sans cursor-pointer" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 border border-gray-100 mb-3">
          <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wide mb-1.5">🔄 Repeat</div>
          <div className="flex gap-2">
            {REPEAT_OPTIONS.map(r => (
              <button key={r} onClick={() => updateField(todo.id, 'repeat_type', r)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg capitalize transition-all
                  ${(todo.repeat_type || 'never') === r ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 border border-gray-100 mb-3">
          <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wide mb-1.5">📝 Notes</div>
          <textarea
            className="w-full text-xs bg-transparent border-none outline-none resize-none font-sans leading-relaxed min-h-[56px]"
            placeholder="Add notes here..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => updateField(todo.id, 'notes', notes)}
          />
        </div>

        <div className="bg-white rounded-xl p-3 border border-gray-100 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wide">📋 Sub-tasks / Checklist</div>
            {microTotal > 0 && (
              <span className="text-[10px] font-semibold text-blue-500">{microDone}/{microTotal} done</span>
            )}
          </div>
          {(todo.micro_list || []).map((m: any, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 group">
              <div onClick={() => toggleMicro(todo, i)}
                className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-[9px] cursor-pointer transition-all
                  ${m.done ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 hover:border-blue-400'}`}>
                {m.done && '✓'}
              </div>
              <span className={`flex-1 text-xs ${m.done ? 'line-through text-gray-400' : ''}`}>{m.text}</span>
              <button onClick={() => deleteMicro(todo, i)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-xs">✕</button>
            </div>
          ))}
          <input
            className="w-full mt-2 text-xs bg-gray-50 px-3 py-1.5 rounded-lg outline-none font-sans border border-gray-100 placeholder:text-gray-300"
            placeholder="+ Add step (press Enter)"
            value={microInput}
            onChange={e => setMicroInput(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && microInput.trim()) {
                await addMicroItem(todo, microInput.trim())
                setMicroInput('')
              }
            }}
          />
        </div>

        <div className="flex gap-2">
          <button onClick={() => updateField(todo.id, 'status', todo.status === 'done' ? 'todo' : 'done')}
            className="btn-blue btn-sm">
            {todo.status === 'done' ? '↩ Reopen' : '✓ Mark as Done'}
          </button>
          <button onClick={() => deleteTodo(todo.id)}
            className="btn btn-sm bg-red-50 text-red-500 border border-red-200 flex items-center gap-1 hover:bg-red-100">
            <Trash2 size={11} /> Delete
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">To Do List ✅</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {totalDone}/{totalTasks} done · Task selesai → Daily Log · Deadline → Calendar
          </p>
        </div>
        <button onClick={() => setShowNewProject(true)}
          className="btn-gray flex items-center gap-1.5 text-xs">
          <Plus size={12} /> Add Project
        </button>
      </div>

      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-600">
        🔗 <span>Task selesai → otomatis masuk <b>Daily Log Accomplishments</b> · Deadline → tampil di <b>Calendar</b></span>
      </div>

      {showNewProject && (
        <div className="card p-4 mb-4 border-2 border-dashed border-blue-200">
          <div className="text-xs font-bold text-gray-400 uppercase mb-2">+ New Project/Category</div>
          <div className="flex gap-2">
            <input className="inp flex-1" placeholder="Project name (e.g. Travel, Health, Client XYZ)" autoFocus
              value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addProject()} />
            <button className="btn-blue btn-sm" onClick={addProject}>Add</button>
            <button className="btn-gray btn-sm" onClick={() => setShowNewProject(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1">
          {[
            { v: 'list', label: '☰ List' },
            { v: 'board', label: '⊞ Board' },
            { v: 'calendar', label: '📅 Calendar' },
          ].map(({ v, label }) => (
            <button key={v} onClick={() => setView(v as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${view === v ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className="inp w-40 text-xs" placeholder="🔍 Search tasks..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="sel text-xs" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All status</option>
            {STATUS_OPTIONS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
          </select>
          <select className="sel text-xs" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">All priority</option>
            <option value="high">🔴 High</option>
            <option value="medium">🟠 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : view === 'list' ? (
        <div>
          {projects.map(project => {
            const projectTodos = getProjectTodos(project.name)
            const isCollapsed = collapsedProjects.includes(project.name)
            const donePct = projectTodos.length > 0
              ? Math.round((projectTodos.filter(t => t.status === 'done').length / projectTodos.length) * 100) : 0

            return (
              <div key={project.name} className="mb-6">
                <div className="flex items-center gap-2 mb-2 group">
                  <button onClick={() => toggleCollapse(project.name)}
                    className="flex items-center gap-2 flex-1 hover:opacity-70 transition-opacity">
                    {isCollapsed
                      ? <ChevronRight size={14} className="text-gray-400" />
                      : <ChevronDown size={14} className="text-gray-400" />
                    }
                    <div className="w-3 h-3 rounded" style={{ background: project.color }} />
                    <span className="text-sm font-bold">{project.name}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {projectTodos.length} tasks
                    </span>
                    {projectTodos.length > 0 && (
                      <span className="text-xs text-gray-400">{donePct}% done</span>
                    )}
                  </button>
                  {!DEFAULT_PROJECTS.find(p => p.name === project.name) && (
                    <button onClick={() => removeProject(project.name)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-gray-300 hover:text-red-500 transition-all">
                      Delete project
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                  <>
                    {projectTodos.length > 0 && (
                      <div className="grid grid-cols-[28px_1fr_100px_90px_90px_80px_32px] gap-2 px-4 py-1.5 bg-gray-50 rounded-xl mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        <div />
                        <div>Task</div>
                        <div>Status</div>
                        <div>Deadline</div>
                        <div>Priority</div>
                        <div>Repeat</div>
                        <div />
                      </div>
                    )}

                    {projectTodos.map(todo => {
                      const isExp = expandedTask === todo.id
                      const isOverdue = todo.deadline && new Date(todo.deadline) < new Date() && todo.status !== 'done'
                      const microDone = (todo.micro_list || []).filter((m: any) => m.done).length
                      const microTotal = (todo.micro_list || []).length

                      return (
                        <div key={todo.id} className={`bg-white border border-gray-100 rounded-xl mb-1 overflow-hidden transition-all
                          ${isExp ? 'ring-2 ring-blue-400 shadow-sm' : 'hover:shadow-sm'}
                          ${todo.status === 'done' ? 'opacity-60' : ''}`}>
                          <div className="grid grid-cols-[28px_1fr_100px_90px_90px_80px_32px] gap-2 px-4 py-2.5 items-center cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => setExpandedTask(isExp ? null : todo.id)}>
                            <div onClick={e => { e.stopPropagation(); updateField(todo.id, 'status', todo.status === 'done' ? 'todo' : 'done') }}
                              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[10px] cursor-pointer transition-all
                                ${todo.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>
                              {todo.status === 'done' && '✓'}
                            </div>
                            <div>
                              <div className={`text-[13px] font-medium ${todo.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                                {todo.title}
                              </div>
                              <div className="flex gap-1.5 mt-0.5 flex-wrap">
                                {todo.is_urgent && (
                                  <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">⚡ Urgent</span>
                                )}
                                {microTotal > 0 && (
                                  <span className="text-[10px] text-gray-400">{microDone}/{microTotal} steps</span>
                                )}
                                {todo.start_date && (
                                  <span className="text-[10px] text-gray-400">Start: {todo.start_date}</span>
                                )}
                              </div>
                            </div>
                            <div onClick={e => e.stopPropagation()}>
                              <select value={todo.status} onChange={e => updateField(todo.id, 'status', e.target.value)}
                                className={`text-[10px] font-bold px-2 py-1 rounded-full cursor-pointer border-none outline-none font-sans w-full
                                  ${STATUS_OPTIONS.find(s => s.val === todo.status)?.cls || 'bg-gray-100 text-gray-500'}`}>
                                {STATUS_OPTIONS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
                              </select>
                            </div>
                            <div className={`text-xs font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                              {todo.deadline || '—'}{isOverdue && ' ⚠️'}
                            </div>
                            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <PriorityDot p={todo.priority} />
                              <select value={todo.priority} onChange={e => updateField(todo.id, 'priority', e.target.value)}
                                className="text-[10px] font-semibold border-none outline-none bg-transparent cursor-pointer font-sans capitalize">
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                              </select>
                            </div>
                            <div className="text-[10px] text-gray-400 capitalize">
                              {todo.repeat_type && todo.repeat_type !== 'never' ? `🔄 ${todo.repeat_type}` : '—'}
                            </div>
                            <div className={`text-gray-400 transition-transform ${isExp ? 'rotate-180' : ''}`}>
                              <ChevronDown size={14} />
                            </div>
                          </div>
                          {isExp && <TaskExpandedPanel todo={todo} />}
                        </div>
                      )
                    })}

                    {addingToProject === project.name ? (
                      <div className="flex gap-2 mt-1">
                        <input className="inp flex-1 text-xs" placeholder={`Add task to ${project.name}...`}
                          value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') quickAddTask(project.name); if (e.key === 'Escape') setAddingToProject(null) }} />
                        <button className="btn-blue btn-sm" onClick={() => quickAddTask(project.name)}>Add</button>
                        <button className="btn-gray btn-sm" onClick={() => setAddingToProject(null)}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingToProject(project.name); setNewTaskTitle('') }}
                        className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all w-full mt-1">
                        <Plus size={13} /> Add task to {project.name}
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
          {todos.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">✅</div>
              <div className="font-semibold mb-1">No tasks yet!</div>
              <div className="text-sm">Click "+ Add task" under any project to start</div>
            </div>
          )}
        </div>

      ) : view === 'board' ? (
        <div className="grid grid-cols-4 gap-3">
          {STATUS_OPTIONS.map(status => (
            <div key={status.val} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className={`text-xs font-bold uppercase tracking-wide ${status.cls.split(' ')[1]}`}>
                  {status.label}
                </span>
                <span className={`tag text-[10px] ${status.cls}`}>{getTodosByStatus(status.val).length}</span>
              </div>
              <div className="p-2 min-h-[200px]">
                {getTodosByStatus(status.val).map(todo => (
                  <div key={todo.id}
                    className="bg-gray-50 rounded-xl p-3 mb-2 border border-transparent hover:border-gray-200 hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => updateField(todo.id, 'status',
                      status.val === 'todo' ? 'inprogress' :
                      status.val === 'inprogress' ? 'done' : 'todo'
                    )}>
                    <div className={`text-xs font-semibold mb-2 leading-tight ${todo.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                      {todo.title}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: projects.find(p => p.name === todo.category)?.color + '20', color: projects.find(p => p.name === todo.category)?.color }}>
                        {todo.category}
                      </span>
                      <PriorityDot p={todo.priority} />
                      {todo.deadline && (
                        <span className={`text-[10px] ${new Date(todo.deadline) < new Date() && todo.status !== 'done' ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                          {todo.deadline}
                        </span>
                      )}
                    </div>
                    {(todo.micro_list || []).length > 0 && (
                      <div className="mt-2">
                        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${((todo.micro_list || []).filter((m: any) => m.done).length / (todo.micro_list || []).length) * 100}%` }} />
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5">
                          {(todo.micro_list || []).filter((m: any) => m.done).length}/{(todo.micro_list || []).length} steps
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {getTodosByStatus(status.val).length === 0 && (
                  <div className="text-center py-6 text-xs text-gray-300 italic">No tasks</div>
                )}
              </div>
            </div>
          ))}
        </div>

      ) : (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-600">
            📅 Tasks with deadlines only. Click checkbox to mark done.
          </div>
          <div className="card">
            {Object.keys(getTodosByDeadline()).length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <div className="text-4xl mb-2">📅</div>
                <div>No tasks with deadlines yet.</div>
              </div>
            ) : (
              Object.entries(getTodosByDeadline())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, tasks]) => {
                  const isOverdue = new Date(date) < new Date()
                  const isToday = date === format(new Date(), 'yyyy-MM-dd')
                  return (
                    <div key={date} className="flex gap-4 p-4 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 font-bold
                        ${isToday ? 'bg-blue-500 text-white' : isOverdue ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-600'}`}>
                        <span className="text-lg leading-none">{format(new Date(date + 'T00:00:00'), 'd')}</span>
                        <span className="text-[10px] uppercase">{format(new Date(date + 'T00:00:00'), 'MMM')}</span>
                      </div>
                      <div className="flex-1">
                        {isOverdue && !isToday && <div className="text-[10px] font-bold text-red-500 mb-1">⚠️ OVERDUE</div>}
                        {isToday && <div className="text-[10px] font-bold text-blue-500 mb-1">TODAY</div>}
                        {tasks.map(todo => (
                          <div key={todo.id} className="flex items-center gap-2.5 mb-1.5">
                            <div onClick={() => updateField(todo.id, 'status', todo.status === 'done' ? 'todo' : 'done')}
                              className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-[9px] cursor-pointer
                                ${todo.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                              {todo.status === 'done' && '✓'}
                            </div>
                            <span className={`flex-1 text-sm ${todo.status === 'done' ? 'line-through text-gray-400' : ''}`}>{todo.title}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: projects.find(p => p.name === todo.category)?.color + '20', color: projects.find(p => p.name === todo.category)?.color }}>
                              {todo.category}
                            </span>
                            <PriorityDot p={todo.priority} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
