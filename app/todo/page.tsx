'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { DEFAULT_PROJECTS, STATUS_OPTIONS, REPEAT_OPTIONS, createTask, setTaskStatus, deleteTask as deleteTaskLib, updateTask, onChange, todayStr } from '@/lib/planner'
import TaskForm from '@/components/planner/TaskForm'
import SmartCalendar from '@/components/planner/SmartCalendar'

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
  const [showDone, setShowDone] = useState(false)
  const [boardBy, setBoardBy] = useState<'status' | 'project'>('status')
  const [form, setForm] = useState<{ initial?: any; defaults?: any } | null>(null)

  useEffect(() => { load(); return onChange(load) }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('todos').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false })
    if (data) {
      setTodos(data.map((t: any) => t.status === 'pending' ? { ...t, status: 'todo' } : t))
      const existingProjects = Array.from(new Set(data.map((t: any) => t.category)))
      const customProjects = existingProjects
        .filter((p: any) => p && !DEFAULT_PROJECTS.find(dp => dp.name === p))
        .map((p: any) => ({ name: p, color: '#8B5CF6', dot: 'bg-purple-500' }))
      if (customProjects.length > 0) setProjects([...DEFAULT_PROJECTS, ...customProjects])
    }
    setLoading(false)
  }

  async function quickAddTask(project: string) {
    if (!newTaskTitle.trim()) return
    await createTask({ title: newTaskTitle, category: project, scheduled_date: todayStr() })
    setNewTaskTitle('')
    setAddingToProject(null)
  }

  async function updateField(id: string, field: string, value: any) {
    const todo = todos.find(t => t.id === id)
    if (field === 'status' && todo) await setTaskStatus(todo, value)
    else await updateTask(id, { [field]: value })
  }

  async function deleteTodo(id: string) {
    if (!confirm('Delete this task?')) return
    await deleteTaskLib(id)
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
    (showDone || !!filterStatus || t.status !== 'done') &&
    (!filterStatus || t.status === filterStatus) &&
    (!filterPriority || t.priority === filterPriority) &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))
  )

  const getProjectTodos = (project: string) => filtered.filter(t => t.category === project || (t.tags || []).includes(project))
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
          <button onClick={() => setForm({ initial: todo })} className="btn-gray btn-sm">✏️ Edit all details</button>
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
          <h1 className="text-xl font-bold">Tasks & To-Do ✅</h1>
          <p className="text-xs text-gray-400 mt-0.5">{totalDone}/{totalTasks} done · every task you add here also appears on the Main Dashboard, Calendar and Daily Log</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNewProject(true)} className="btn-gray flex items-center gap-1.5 text-xs"><Plus size={12} /> Add Project</button>
          <button onClick={() => setForm({})} className="btn-blue flex items-center gap-1.5 text-xs"><Plus size={12} /> New Task</button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-600">
        🔗 <span>Ticking a task here logs it in <b>Daily Log → Accomplishments</b>. Dates & deadlines show in the <b>Calendar</b>. A task can belong to one main project and also appear in others via “Also belongs to”.</span>
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
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer px-1"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show done</label>
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
                                {todo.category !== project.name && <span className="text-[10px] text-purple-500 font-semibold">also here · main: {todo.category}</span>}
                                {todo.scheduled_date && <span className="text-[10px] text-gray-400">📅 {todo.scheduled_date}{todo.scheduled_time ? ' ' + todo.scheduled_time : ''}</span>}
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
        <div>
          <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 w-fit mb-3">
            {[{ v: 'status', l: 'By status' }, { v: 'project', l: 'By project' }].map(o => (
              <button key={o.v} onClick={() => setBoardBy(o.v as any)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${boardBy === o.v ? 'bg-purple-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>{o.l}</button>
            ))}
          </div>
          <div className={`grid gap-3 ${boardBy === 'status' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-flow-col auto-cols-[260px] overflow-x-auto pb-2'}`}>
            {(boardBy === 'status' ? STATUS_OPTIONS.map(s => ({ key: s.val, label: s.label, cls: s.cls, color: '', items: getTodosByStatus(s.val) }))
              : projects.map(pr => ({ key: pr.name, label: pr.name, cls: '', color: pr.color, items: getProjectTodos(pr.name) }))).map(col => (
              <div key={col.key} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100" style={col.color ? { borderTop: `3px solid ${col.color}` } : {}}>
                  <span className={`text-xs font-bold uppercase tracking-wide ${col.cls ? col.cls.split(' ')[1] : ''}`}>{col.label}</span>
                  <span className={`tag text-[10px] ${col.cls || 'bg-gray-100 text-gray-500'}`}>{col.items.length}</span>
                </div>
                <div className="p-2 min-h-[160px]">
                  {col.items.map((todo: any) => (
                    <div key={todo.id} className="bg-gray-50 rounded-xl p-3 mb-2 border border-transparent hover:border-gray-200 hover:bg-white hover:shadow-sm transition-all">
                      <div className="flex items-start gap-2">
                        <button aria-label="Toggle done" onClick={() => updateField(todo.id, 'status', todo.status === 'done' ? 'todo' : 'done')}
                          className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-[9px] ${todo.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>{todo.status === 'done' && '✓'}</button>
                        <button className={`flex-1 text-left text-xs font-semibold leading-tight ${todo.status === 'done' ? 'line-through text-gray-400' : ''}`} onClick={() => setForm({ initial: todo })}>{todo.title}</button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {boardBy === 'status' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: projects.find(p => p.name === todo.category)?.color + '20', color: projects.find(p => p.name === todo.category)?.color }}>{todo.category}</span>}
                        {boardBy === 'project' && (
                          <select value={todo.status} onChange={e => updateField(todo.id, 'status', e.target.value)} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border-none outline-none cursor-pointer ${STATUS_OPTIONS.find(s => s.val === todo.status)?.cls}`}>
                            {STATUS_OPTIONS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
                          </select>)}
                        {boardBy === 'project' && todo.category !== col.key && <span className="text-[9px] text-purple-500 font-semibold">also here · main: {todo.category}</span>}
                        <PriorityDot p={todo.priority} />
                        {todo.deadline && <span className={`text-[10px] ${todo.deadline < todayStr() && todo.status !== 'done' ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>⏰ {todo.deadline}</span>}
                      </div>
                      {(todo.micro_list || []).length > 0 && (
                        <div className="mt-2"><div className="h-1 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${((todo.micro_list || []).filter((m: any) => m.done).length / (todo.micro_list || []).length) * 100}%` }} /></div></div>
                      )}
                    </div>
                  ))}
                  {col.items.length === 0 && <div className="text-center py-6 text-xs text-gray-300 italic">No tasks</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

      ) : (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-600">📅 This is the same calendar as on the Main Dashboard: tasks, deadlines, events, repeats and holidays. Switch between day, week, month and year.</div>
          <SmartCalendar defaultView="month" />
        </div>
      )}

      {form && <TaskForm initial={form.initial} defaults={form.defaults} onClose={() => setForm(null)} onSaved={load} />}
    </div>
  )
}
