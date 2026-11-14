import { supabase } from '@/lib/supabase'

// ---------- images (private "receipts" bucket, folder per user) ----------
export async function uploadImage(userId: string, file: File, folder: string, maxPx = 1400): Promise<string> {
  const blob = await shrink(file, maxPx)
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`
  const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}
/** Resize big phone photos before upload so the free storage lasts. */
async function shrink(file: File, maxPx: number): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const out: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82))
    return out || file
  } catch { return file }
}
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const uniq = Array.from(new Set(paths.filter(Boolean)))
  if (!uniq.length) return {}
  const { data } = await supabase.storage.from('receipts').createSignedUrls(uniq, 3600)
  const m: Record<string, string> = {}
  ;(data || []).forEach(x => { if (x.path && x.signedUrl) m[x.path] = x.signedUrl })
  return m
}
export const removeImage = (path: string) => supabase.storage.from('receipts').remove([path])

// ---------- resolutions ----------
export const RES_CATEGORIES = ['Study', 'Career', 'Business', 'Finance', 'Health', 'Spiritual', 'Relationships', 'Social', 'Content', 'Lifestyle', 'Personal']
export const RES_COLORS = ['#5B7FFF', '#8B5CF6', '#FF6B8A', '#22C55E', '#F97316', '#EF4444', '#14B8A6', '#EAB308', '#6B7280']
export const STARTER_RESOLUTIONS = [
  { title: 'Chinese Language School in China', target: 'HSK 5 + fluent Mandarin', category: 'Study', quarter: 'Q2', emoji: '🇨🇳' },
  { title: 'Improve English', target: 'IELTS 7.5 + fluent English', category: 'Study', quarter: 'Q2', emoji: '🗣️' },
  { title: "Prepare Master's Degree in China", target: 'Full scholarship', category: 'Study', quarter: 'Q3', emoji: '🎓' },
  { title: 'Build Many Friendships', target: 'Close friends, grow together', category: 'Social', quarter: 'Q2', emoji: '🤝' },
  { title: 'Start Travel Content', target: '1–2 content/week, 500K followers', category: 'Content', quarter: 'Q2', emoji: '🎬' },
  { title: 'Sambal Mak Tak profit 100jt/month', target: 'Revenue Rp 100jt/month', category: 'Business', quarter: 'Q2', emoji: '🌶️' },
  { title: 'Polar Bed & Chishee 100jt/month', target: 'Revenue Rp 100jt/month', category: 'Business', quarter: 'Q3', emoji: '🛏️' },
  { title: 'Fully Financially Independent', target: 'Clear credit card, savings, help parents', category: 'Finance', quarter: 'Q4', emoji: '💰' },
  { title: 'Reduce Social Media', target: 'Under 30 min/day', category: 'Lifestyle', quarter: 'Q1', emoji: '📵' },
  { title: 'Build a Meaningful Relationship', target: 'Find a life partner', category: 'Relationships', quarter: 'Q4', emoji: '💞' },
  { title: 'Deepen Relationship with God', target: 'Read the Bible daily, serve in church', category: 'Spiritual', quarter: 'Q1', emoji: '🙏' },
  { title: 'More Discipline & Efficiency', target: 'Daily schedule, vision board', category: 'Lifestyle', quarter: 'Q1', emoji: '⏱️' },
]
export const quarterEnd = (year: number, q: string) => { const n = Number(q.replace('Q', '')) || 4; const d = new Date(year, n * 3, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Progress 0-100 for one resolution, from whichever source it is linked to. */
export function resolutionProgress(r: any, ctx: { projectPct: Record<string, number>; bizRevenue: Record<string, { actual: number; target: number }> }): number {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  if (r.progress_mode === 'metric' && Number(r.target_value) !== Number(r.start_value || 0)) return clamp((Number(r.current_value || 0) - Number(r.start_value || 0)) / (Number(r.target_value) - Number(r.start_value || 0)) * 100)
  if (r.progress_mode === 'project' && r.link_project_id && ctx.projectPct[r.link_project_id] !== undefined) return clamp(ctx.projectPct[r.link_project_id])
  if (r.progress_mode === 'business' && r.link_business_id && ctx.bizRevenue[r.link_business_id]?.target) { const b = ctx.bizRevenue[r.link_business_id]; return clamp(b.actual / b.target * 100) }
  return clamp(Number(r.progress || 0))
}

/** Plain rule-based pace check (not AI): progress vs. the share of time already used. */
export function resolutionPace(r: any, progress: number, todayStr: string) {
  const year = Number(r.year) || new Date().getFullYear()
  const due = r.due_date || quarterEnd(year, r.quarter || 'Q4')
  const jan1 = `${year}-01-01`
  const made = r.created_at ? String(r.created_at).slice(0, 10) : jan1
  const start = made > jan1 && made < due ? made : jan1   // the clock starts when you created the goal
  const total = Math.max(1, (new Date(due).getTime() - new Date(start).getTime()) / 86400000)
  const used = Math.min(1, Math.max(0, (new Date(todayStr).getTime() - new Date(start).getTime()) / 86400000 / total))
  const daysLeft = Math.ceil((new Date(due).getTime() - new Date(todayStr).getTime()) / 86400000)
  const expected = Math.round(used * 100)
  const gap = progress - expected
  const state = progress >= 100 ? 'done' : daysLeft < 0 ? 'overdue' : gap >= 8 ? 'ahead' : gap >= -8 ? 'on-track' : gap >= -25 ? 'behind' : 'at-risk'
  const weeksLeft = Math.max(1, daysLeft / 7)
  const perWeek = daysLeft > 0 ? (100 - progress) / weeksLeft : 100 - progress
  return { due, daysLeft, expected, gap, state, perWeek }
}
export const PACE_STYLE: Record<string, { label: string; cls: string }> = {
  done: { label: 'Done 🎉', cls: 'bg-green-100 text-green-700' }, ahead: { label: 'Ahead 🚀', cls: 'bg-green-100 text-green-700' }, 'on-track': { label: 'On track ✅', cls: 'bg-emerald-100 text-emerald-700' },
  behind: { label: 'Behind ⚠️', cls: 'bg-amber-100 text-amber-700' }, 'at-risk': { label: 'At risk 🔴', cls: 'bg-red-100 text-red-600' }, overdue: { label: 'Past due', cls: 'bg-red-100 text-red-600' },
}
/** What to change when a goal slips. Concrete, rule-based suggestions. */
export function adjustmentAdvice(r: any, progress: number, pace: ReturnType<typeof resolutionPace>) {
  const out: { key: string; text: string }[] = []
  if (pace.state === 'ahead' || pace.state === 'on-track' || pace.state === 'done') { out.push({ key: 'keep', text: 'You are on pace. Keep your current weekly rhythm.' }); return out }
  out.push({ key: 'weekly', text: `To finish by ${pace.due} you need about ${Math.max(1, Math.round(pace.perWeek))}% progress per week from now. Add a weekly check-in task so it stays visible.` })
  if (pace.state === 'at-risk' || pace.state === 'overdue') {
    out.push({ key: 'extend', text: 'Move the deadline one quarter later so the target is realistic.' })
    out.push({ key: 'shrink', text: 'Or shrink the target to the part that matters most, and finish that first.' })
  } else out.push({ key: 'steps', text: 'Break the next step into 2–3 small tasks you can do this week.' })
  return out
}
export const nextQuarter = (q: string, year: number) => { const n = (Number(q.replace('Q', '')) || 4) + 1; return n > 4 ? { q: 'Q1', year: year + 1 } : { q: `Q${n}`, year } }
