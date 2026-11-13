import { supabase } from './supabase'
import { format, addDays, addWeeks, addMonths, addYears, parseISO } from 'date-fns'

// ---------- constants ----------
export const DEFAULT_PROJECTS = [
  { name: 'School', color: '#5B7FFF', dot: 'bg-blue-500' },
  { name: 'Content', color: '#22C55E', dot: 'bg-green-500' },
  { name: 'Business', color: '#F97316', dot: 'bg-orange-500' },
  { name: 'Personal', color: '#FF6B8A', dot: 'bg-pink-500' },
  { name: 'Finance', color: '#14B8A6', dot: 'bg-teal-500' },
]
export const projectColor = (name?: string | null) =>
  DEFAULT_PROJECTS.find(p => p.name === name)?.color || '#8B5CF6'

export const STATUS_OPTIONS = [
  { val: 'todo', label: 'To Do', cls: 'bg-gray-100 text-gray-500' },
  { val: 'inprogress', label: 'In Progress', cls: 'bg-blue-50 text-blue-500' },
  { val: 'done', label: 'Done', cls: 'bg-green-50 text-green-600' },
  { val: 'blocked', label: 'Blocked', cls: 'bg-red-50 text-red-500' },
]
export const REPEAT_OPTIONS = ['never', 'daily', 'weekly', 'monthly', 'yearly']
export const REMINDER_OPTIONS = [
  { v: '', label: 'No alert' }, { v: '0', label: 'At start time' }, { v: '5', label: '5 min before' },
  { v: '15', label: '15 min before' }, { v: '30', label: '30 min before' }, { v: '60', label: '1 hour before' },
  { v: '1440', label: '1 day before' },
]
export const LOG_LABELS = ['General', 'Personal', 'Business', 'Finance', 'Project', 'Study', 'Content', 'Health', 'Travel', 'Other']

export const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
export const todayStr = () => ymd(new Date())
export const isDone = (t: any) => t?.status === 'done'

// ---------- change bus: any component can listen and reload ----------
export const PLANNER_EVENT = 'planner:changed'
export function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLANNER_EVENT))
}
export function onChange(fn: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(PLANNER_EVENT, fn)
  return () => window.removeEventListener(PLANNER_EVENT, fn)
}

async function uid() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id as string | undefined
}

// ---------- Daily Log helpers ----------
export async function addLog(entry: { date?: string; type: 'task_received' | 'accomplishment' | 'work_log'; category?: string; content: string; todo_id?: string | null; label?: string | null }) {
  const user_id = await uid()
  if (!user_id) return { error: new Error('Not signed in') }
  const { error } = await supabase.from('daily_logs').insert({
    user_id,
    date: entry.date || todayStr(),
    type: entry.type,
    category: entry.category || 'General',
    label: entry.label || entry.category || null,
    content: entry.content,
    time_logged: format(new Date(), 'HH:mm'),
    todo_id: entry.todo_id || null,
  })
  emitChange()
  return { error }
}

// ---------- Tasks (todos table) ----------
export type TaskInput = {
  title: string
  task_type?: 'task' | 'errand'
  category?: string          // main project / list
  tags?: string[]            // extra projects it also belongs to
  business_id?: string | null
  priority?: string
  status?: string
  scheduled_date?: string | null
  scheduled_time?: string | null
  end_time?: string | null
  start_date?: string | null
  deadline?: string | null
  repeat_type?: string
  location?: string | null
  reminder_minutes?: number | null
  notes?: string | null
  is_urgent?: boolean
  micro_list?: any[]
}

export async function createTask(input: TaskInput) {
  const user_id = await uid()
  if (!user_id) return { error: new Error('Not signed in'), data: null }
  const row = {
    user_id,
    title: input.title.trim(),
    task_type: input.task_type || 'task',
    category: input.category || 'Personal',
    tags: input.tags || [],
    business_id: input.business_id || null,
    priority: input.priority || 'medium',
    status: input.status || 'todo',
    scheduled_date: input.scheduled_date || null,
    scheduled_time: input.scheduled_time || null,
    end_time: input.end_time || null,
    start_date: input.start_date || null,
    deadline: input.deadline || null,
    repeat_type: input.repeat_type || 'never',
    location: input.location || null,
    reminder_minutes: input.reminder_minutes ?? null,
    notes: input.notes || null,
    is_urgent: !!input.is_urgent,
    micro_list: input.micro_list || [],
  }
  const { data, error } = await supabase.from('todos').insert(row).select().single()
  if (error || !data) return { error, data: null }
  // Task received -> Daily Log (also shows in Daily Work Log timeline)
  await addLog({ type: 'task_received', category: row.category, content: row.title, todo_id: data.id })
  emitChange()
  return { error: null, data }
}

export async function updateTask(id: string, patch: Record<string, any>) {
  const { error } = await supabase.from('todos').update(patch).eq('id', id)
  emitChange()
  return { error }
}

export function nextOccurrence(date: string | null, repeat: string): string | null {
  if (!date || !repeat || repeat === 'never' || repeat === 'none') return null
  const d = parseISO(date)
  if (repeat === 'daily') return ymd(addDays(d, 1))
  if (repeat === 'weekly') return ymd(addWeeks(d, 1))
  if (repeat === 'monthly') return ymd(addMonths(d, 1))
  if (repeat === 'yearly') return ymd(addYears(d, 1))
  return null
}

/** Change status. Handles Daily Log in BOTH directions and recurring tasks. */
export async function setTaskStatus(todo: any, status: string) {
  const wasDone = isDone(todo)
  const nowDone = status === 'done'
  const patch: any = { status, completed_at: nowDone ? new Date().toISOString() : null }
  const { error } = await supabase.from('todos').update(patch).eq('id', todo.id)
  if (error) return { error }

  if (nowDone && !wasDone) {
    await addLog({ type: 'accomplishment', category: todo.category, content: todo.title, todo_id: todo.id })
    // recurring: spawn next occurrence
    const rep = todo.repeat_type
    const base = todo.scheduled_date || todo.deadline
    const nextBase = nextOccurrence(base, rep)
    if (nextBase) {
      const shift = (d: string | null) => d && base ? ymd(addDays(parseISO(nextBase), Math.round((parseISO(d).getTime() - parseISO(base).getTime()) / 86400000))) : d
      await createTask({
        title: todo.title, task_type: todo.task_type, category: todo.category, tags: todo.tags || [],
        business_id: todo.business_id, priority: todo.priority, repeat_type: rep, location: todo.location,
        scheduled_time: todo.scheduled_time, end_time: todo.end_time, reminder_minutes: todo.reminder_minutes,
        notes: todo.notes, scheduled_date: todo.scheduled_date ? nextBase : null,
        deadline: todo.deadline ? shift(todo.deadline) : null, start_date: todo.start_date ? shift(todo.start_date) : null,
        micro_list: (todo.micro_list || []).map((m: any) => ({ ...m, done: false })),
      })
    }
  } else if (!nowDone && wasDone) {
    await supabase.from('daily_logs').delete().eq('todo_id', todo.id).eq('type', 'accomplishment')
  }
  emitChange()
  return { error: null }
}

export const toggleTask = (todo: any) => setTaskStatus(todo, isDone(todo) ? 'todo' : 'done')

export async function deleteTask(id: string) {
  const { error } = await supabase.from('todos').delete().eq('id', id)
  emitChange() // Daily Log history is intentionally kept
  return { error }
}

export async function loadBusinesses() {
  const user_id = await uid()
  if (!user_id) return []
  const { data } = await supabase.from('businesses').select('id,name,emoji,color').eq('user_id', user_id).order('sort_order')
  return data || []
}
