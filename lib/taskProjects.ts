// Task "lists" ARE projects now. One source of truth: the projects table. Everything here is name-based because tasks keep the project name in todos.category.
import { supabase } from './supabase'
import { emitChange, DEFAULT_PROJECTS, PROJECT_COLOR_CACHE } from './planner'

export type TProject = { id?: string; name: string; color: string; emoji?: string; legacy_route?: string | null; status?: string; fromDb: boolean }
export const INBOX = 'Inbox'   // where tasks go when their project is deleted (= "no project")

const SEED = [
  { name: 'School', emoji: '🏫', color: '#5B7FFF', kind: 'study' }, { name: 'Content', emoji: '🎬', color: '#22C55E', kind: 'content' },
  { name: 'Business', emoji: '🏢', color: '#F97316', kind: 'business' }, { name: 'Personal', emoji: '🌸', color: '#FF6B8A', kind: 'personal' },
  { name: 'Finance', emoji: '💰', color: '#14B8A6', kind: 'other' },
  { name: 'Travel Content', emoji: '📱', color: '#14B8A6', kind: 'content', legacy_route: '/projects/travel' },
  { name: "Master's Degree", emoji: '🎓', color: '#5B7FFF', kind: 'study', legacy_route: '/projects/s2' },
  { name: 'Mandarin Study', emoji: '📖', color: '#F97316', kind: 'study', legacy_route: '/projects/mandarin' },
]
const colors = PROJECT_COLOR_CACHE
export const projectColorOf = (name?: string | null) => (name && (colors.get(name) || DEFAULT_PROJECTS.find(p => p.name === name)?.color)) || '#8B5CF6'

/** Once per account: turn the built-in lists and old workspaces into normal projects so they can be edited or deleted. Never runs again, so deleting them sticks. */
export async function ensureSeed(userId: string): Promise<boolean> {
  const flag = await supabase.from('app_flags').select('id').eq('user_id', userId).eq('key', 'projects_seeded').maybeSingle()
  if (flag.error) return false                // upgrade-11 SQL not run yet → keep the old behaviour
  if (flag.data) return true
  const claim = await supabase.from('app_flags').insert({ user_id: userId, key: 'projects_seeded', value: new Date().toISOString() })
  if (claim.error) return true                // another tab claimed it
  const { data: have } = await supabase.from('projects').select('name,legacy_route').eq('user_id', userId)
  const names = new Set((have || []).map((p: any) => String(p.name).toLowerCase()))
  const rows = SEED.filter(s => !names.has(s.name.toLowerCase())).map(s => ({ user_id: userId, name: s.name, emoji: s.emoji, color: s.color, kind: s.kind, status: 'active', legacy_route: (s as any).legacy_route || null }))
  if (rows.length) {
    const { error } = await supabase.from('projects').insert(rows)
    if (error) { await supabase.from('app_flags').delete().eq('user_id', userId).eq('key', 'projects_seeded'); return false }   // try again next time
  }
  return true
}

export async function loadTaskProjects(userId: string): Promise<{ projects: TProject[]; seeded: boolean }> {
  const seeded = await ensureSeed(userId)
  const { data, error } = await supabase.from('projects').select('id,name,color,emoji,legacy_route,status').eq('user_id', userId).order('created_at')
  const rows: TProject[] = error ? [] : (data || []).map((p: any) => ({ id: p.id, name: p.name, color: p.color || '#8B5CF6', emoji: p.emoji, legacy_route: p.legacy_route, status: p.status, fromDb: true }))
  rows.forEach(p => colors.set(p.name, p.color))
  if (!seeded) DEFAULT_PROJECTS.forEach(d => { if (!rows.some(r => r.name === d.name)) rows.push({ name: d.name, color: d.color, fromDb: false }) })
  return { projects: rows, seeded }
}

export async function createProject(userId: string, name: string): Promise<string | null> {
  const n = name.trim(); if (!n) return 'Enter a name.'
  const { data: dup } = await supabase.from('projects').select('id').eq('user_id', userId).ilike('name', n)
  if (dup?.length) return `A project named "${n}" already exists.`
  const { error } = await supabase.from('projects').insert({ user_id: userId, name: n, emoji: '📁', color: '#8B5CF6', kind: 'other', status: 'active' })
  if (error) return error.message
  emitChange(); return null
}

/** Rename a list/project everywhere tasks refer to it. */
export async function renameList(userId: string, p: { id?: string; name: string }, next: string): Promise<string | null> {
  const n = next.trim(); if (!n) return 'Enter a name.'
  if (n === p.name) return null
  const { data: dup } = await supabase.from('projects').select('id,name').eq('user_id', userId).ilike('name', n)
  if (dup?.some((d: any) => d.id !== p.id)) return `A project named "${n}" already exists.`
  if (p.id) { const { error } = await supabase.from('projects').update({ name: n }).eq('id', p.id).eq('user_id', userId); if (error) return error.message }
  const t = await supabase.from('todos').update({ category: n }).eq('user_id', userId).eq('category', p.name)
  if (t.error) return t.error.message
  const withTag = await supabase.from('todos').select('id,tags').eq('user_id', userId).contains('tags', [p.name])
  for (const row of withTag.data || []) await supabase.from('todos').update({ tags: (row.tags || []).map((x: string) => (x === p.name ? n : x)) }).eq('id', row.id)
  await supabase.from('daily_logs').update({ category: n }).eq('user_id', userId).eq('category', p.name)
  emitChange(); return null
}

/** Delete a project / list. Its tasks are NOT deleted: they move to "Inbox" (no project). */
export async function deleteList(userId: string, p: { id?: string; name: string }): Promise<string | null> {
  if (p.id) { const { error } = await supabase.from('projects').delete().eq('id', p.id).eq('user_id', userId); if (error) return error.message }
  const t = await supabase.from('todos').update({ category: INBOX }).eq('user_id', userId).eq('category', p.name)
  if (t.error) return t.error.message
  const withTag = await supabase.from('todos').select('id,tags').eq('user_id', userId).contains('tags', [p.name])
  for (const row of withTag.data || []) await supabase.from('todos').update({ tags: (row.tags || []).filter((x: string) => x !== p.name) }).eq('id', row.id)
  emitChange(); return null
}
