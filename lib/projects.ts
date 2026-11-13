import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ymd } from './planner'

export const PROJECT_STATUS = [
  { v: 'idea', l: 'Idea', cls: 'bg-gray-100 text-gray-600' },
  { v: 'planning', l: 'Planning', cls: 'bg-blue-50 text-blue-600' },
  { v: 'active', l: 'Active', cls: 'bg-green-50 text-green-600' },
  { v: 'on_hold', l: 'On hold', cls: 'bg-amber-50 text-amber-600' },
  { v: 'done', l: 'Done', cls: 'bg-purple-50 text-purple-600' },
]
export const PROJECT_KINDS = [
  { v: 'content', l: '🎬 Content' }, { v: 'business', l: '🏢 Business' }, { v: 'study', l: '🎓 Study' },
  { v: 'travel', l: '✈️ Travel' }, { v: 'personal', l: '🌸 Personal' }, { v: 'other', l: '📁 Other' },
]
export const EXPENSE_CATEGORIES = ['Travel', 'Equipment', 'Advertising', 'Software', 'Production', 'Tuition', 'Transport', 'Food', 'Other']
export const TEMPLATES: Record<string, { milestones: string[]; goal: string }> = {
  content: { goal: 'Publish consistently and grow views/followers', milestones: ['Choose theme & platforms', 'Plan 10 content ideas', 'Film first batch', 'Edit & schedule posts', 'Review first 2 weeks of results'] },
  business: { goal: 'Launch and reach first sales target', milestones: ['Define product & price', 'Set up supplier / stock', 'Create listing & photos', 'Launch', 'Review first month'] },
  study: { goal: 'Reach the study goal by the target date', milestones: ['Choose programs / materials', 'Prepare documents', 'Study plan per week', 'Submit / take exam', 'Review result'] },
  travel: { goal: 'A well-planned trip with content captured', milestones: ['Pick dates & budget', 'Book transport', 'Book stay', 'Plan itinerary & shots', 'Trip & wrap-up'] },
  personal: { goal: '', milestones: [] }, other: { goal: '', milestones: [] },
}

export type Health = { level: 'good' | 'watch' | 'risk' | 'none'; label: string; reasons: string[] }

/** Rule-based health check (no AI): looks at schedule, budget, overdue/blocked tasks and milestones. */
export function projectHealth(p: any, tasks: any[], milestones: any[], spent: number, today = ymd(new Date())): Health & { progress: number; taskPct: number; msPct: number; budgetPct: number | null; timePct: number | null } {
  const open = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
  const doneN = tasks.filter(t => t.status === 'done').length
  const taskPct = tasks.length ? (doneN / tasks.length) * 100 : 0
  const msDone = milestones.filter(m => m.done).length
  const msPct = milestones.length ? (msDone / milestones.length) * 100 : 0
  const parts: number[] = []; if (tasks.length) parts.push(taskPct); if (milestones.length) parts.push(msPct)
  const progress = p.status === 'done' ? 100 : parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0
  const budgetPct = Number(p.budget) > 0 ? (spent / Number(p.budget)) * 100 : null
  let timePct: number | null = null
  if (p.start_date && p.target_date) {
    const total = Math.max(1, differenceInCalendarDays(parseISO(p.target_date), parseISO(p.start_date)))
    timePct = Math.max(0, Math.min(150, (differenceInCalendarDays(parseISO(today), parseISO(p.start_date)) / total) * 100))
  }
  const reasons: string[] = []; let score = 0
  const overdue = open.filter(t => t.deadline && t.deadline < today).length
  const blocked = tasks.filter(t => t.status === 'blocked').length
  const lateMs = milestones.filter(m => !m.done && m.due_date && m.due_date < today).length
  if (overdue) { reasons.push(`${overdue} task${overdue > 1 ? 's' : ''} past deadline`); score += overdue >= 3 ? 2 : 1 }
  if (blocked) { reasons.push(`${blocked} task${blocked > 1 ? 's' : ''} blocked`); score += 1 }
  if (lateMs) { reasons.push(`${lateMs} milestone${lateMs > 1 ? 's' : ''} overdue`); score += 2 }
  if (budgetPct !== null && budgetPct > 100) { reasons.push(`Over budget by ${Math.round(budgetPct - 100)}%`); score += 2 }
  else if (budgetPct !== null && budgetPct > 85 && progress < 85) { reasons.push(`${Math.round(budgetPct)}% of budget used but only ${Math.round(progress)}% done`); score += 1 }
  if (timePct !== null && p.status !== 'done') {
    if (timePct > 100) { reasons.push('Target date has passed'); score += 2 }
    else if (timePct - progress > 25) { reasons.push(`${Math.round(timePct)}% of the time has passed but only ${Math.round(progress)}% is done`); score += 1 }
  }
  if (p.status === 'done') return { level: 'good', label: 'Completed', reasons: [], progress, taskPct, msPct, budgetPct, timePct }
  if (p.status === 'idea' || (!tasks.length && !milestones.length)) return { level: 'none', label: 'Not started', reasons: reasons.length ? reasons : ['Add tasks or milestones to track progress'], progress, taskPct, msPct, budgetPct, timePct }
  const level = score >= 3 ? 'risk' : score >= 1 ? 'watch' : 'good'
  return { level, label: level === 'good' ? 'On track' : level === 'watch' ? 'Needs attention' : 'At risk', reasons: level === 'good' ? ['No overdue work, budget and schedule look fine'] : reasons, progress, taskPct, msPct, budgetPct, timePct }
}
export const HEALTH_STYLE = { good: 'bg-green-50 text-green-700', watch: 'bg-amber-50 text-amber-700', risk: 'bg-red-50 text-red-600', none: 'bg-gray-100 text-gray-500' }
export const HEALTH_DOT = { good: '#22C55E', watch: '#F59E0B', risk: '#EF4444', none: '#9CA3AF' }
export const money = (n: number, cur = 'IDR') => (cur === 'IDR' ? 'Rp ' : cur === 'CNY' ? '¥' : cur + ' ') + Math.round(n).toLocaleString('en-US')

/** Tasks that belong to a project: main list = project name, or listed under "also belongs to". */
export const tasksOfProject = (todos: any[], name: string) => todos.filter(t => t.category === name || (t.tags || []).includes(name))
export async function loadProjectData(supabase: any, userId: string) {
  const [pr, ms, ex, td, tx] = await Promise.all([
    supabase.from('projects').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('project_milestones').select('*').eq('user_id', userId).order('sort_order').order('due_date'),
    supabase.from('project_expenses').select('*').eq('user_id', userId).order('date', { ascending: false }),
    supabase.from('todos').select('*').eq('user_id', userId),
    supabase.from('transactions').select('id,date,description,debit,kredit,project_id').eq('user_id', userId).not('project_id', 'is', null),
  ])
  return { projects: pr.error ? null : pr.data || [], milestones: ms.data || [], expenses: ex.data || [], todos: td.data || [], txs: tx.error ? [] : tx.data || [], error: pr.error?.message }
}
export const spentOf = (id: string, expenses: any[], txs: any[]) =>
  expenses.filter(e => e.project_id === id && e.type !== 'income').reduce((s, e) => s + Number(e.amount), 0) + txs.filter(t => String(t.project_id) === id).reduce((s, t) => s + Number(t.debit || 0), 0)
export const incomeOf = (id: string, expenses: any[], txs: any[]) =>
  expenses.filter(e => e.project_id === id && e.type === 'income').reduce((s, e) => s + Number(e.amount), 0) + txs.filter(t => String(t.project_id) === id).reduce((s, t) => s + Number(t.kredit || 0), 0)
