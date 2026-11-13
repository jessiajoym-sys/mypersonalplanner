import { addDays, differenceInCalendarDays, format, getISODay, parseISO, startOfQuarter, startOfYear, subDays } from 'date-fns'
import { ymd } from './planner'

export type RangeKey = '7d' | '30d' | '90d' | 'quarter' | 'year'
export const RANGE_LABEL: Record<RangeKey, string> = { '7d': 'Last 7 days', '30d': 'Last month', '90d': 'Last 3 months', quarter: 'This quarter', year: 'This year' }
export type Kind = 'habit' | 'vitamin' | 'medicine'
export const KIND_META: Record<Kind, { label: string; icon: string; color: string }> = {
  habit: { label: 'Habits', icon: '✅', color: '#22C55E' },
  medicine: { label: 'Medicine', icon: '💊', color: '#EF4444' },
  vitamin: { label: 'Vitamins & supplements', icon: '🌿', color: '#F59E0B' },
}
export const SLOT_PRESETS = [{ label: 'Morning', time: '08:00' }, { label: 'Noon', time: '12:00' }, { label: 'Evening', time: '18:00' }, { label: 'Bedtime', time: '21:30' }]
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function rangeDays(key: RangeKey, today = new Date()): string[] {
  const from = key === '7d' ? subDays(today, 6) : key === '30d' ? subDays(today, 29) : key === '90d' ? subDays(today, 89) : key === 'quarter' ? startOfQuarter(today) : startOfYear(today)
  const n = differenceInCalendarDays(today, from) + 1
  return Array.from({ length: n }, (_, i) => ymd(addDays(from, i)))
}

export const kindOf = (h: any): Kind => (h.kind === 'vitamin' || h.kind === 'medicine' ? h.kind : 'habit')
export const slotsOf = (h: any): { label: string; time?: string }[] => (Array.isArray(h.slots) ? h.slots : [])
/** Is this habit expected on this date? (weekday schedule + not before it was created) */
export function scheduledOn(h: any, date: string): boolean {
  const days: number[] = Array.isArray(h.days) && h.days.length ? h.days : [1, 2, 3, 4, 5, 6, 7]
  if (!days.includes(getISODay(parseISO(date)))) return false
  const created = h.created_at ? ymd(new Date(h.created_at)) : '0000-00-00'
  return date >= created
}

export type DayStat = { date: string; expected: number; done: number; pct: number }
export type HabitStat = { id: string; rate: number; done: number; expected: number; streak: number; best: number }

export function computeStats(habits: any[], logs: any[], days: string[], today = ymd(new Date())) {
  const doneSet = new Set(logs.filter(l => l.completed).map(l => `${l.habit_id}|${l.date}`))
  const daily: DayStat[] = days.map(date => {
    const sched = habits.filter(h => scheduledOn(h, date))
    const done = sched.filter(h => doneSet.has(`${h.id}|${date}`)).length
    return { date, expected: sched.length, done, pct: sched.length ? (done / sched.length) * 100 : 0 }
  })
  const expected = daily.reduce((s, d) => s + d.expected, 0), done = daily.reduce((s, d) => s + d.done, 0)
  const withExp = daily.filter(d => d.expected > 0)
  const perfectDays = withExp.filter(d => d.done === d.expected).length

  // streak of perfect days counting back from today (today only counts once complete, but an unfinished today doesn't break it)
  const streakOf = (flags: (boolean | null)[]) => { let cur = 0, best = 0, run = 0; flags.forEach(f => { if (f === null) return; if (f) { run++; best = Math.max(best, run) } else run = 0 })
    for (let i = flags.length - 1; i >= 0; i--) { const f = flags[i]; if (f === null) continue; if (f) cur++; else { if (i === flags.length - 1) continue; break } } return { cur, best } }
  const dayFlags = daily.map(d => d.expected === 0 ? null : d.done === d.expected)
  const overall = streakOf(dayFlags)

  const perHabit: HabitStat[] = habits.map(h => {
    const flags = days.map(d => scheduledOn(h, d) ? doneSet.has(`${h.id}|${d}`) : null)
    const exp = flags.filter(f => f !== null).length, dn = flags.filter(f => f === true).length
    const s = streakOf(flags)
    return { id: h.id, rate: exp ? (dn / exp) * 100 : 0, done: dn, expected: exp, streak: s.cur, best: s.best }
  })

  const weekday = WEEKDAYS.map((label, i) => {
    const ds = daily.filter(d => getISODay(parseISO(d.date)) === i + 1 && d.expected > 0)
    const e = ds.reduce((s, d) => s + d.expected, 0), dn = ds.reduce((s, d) => s + d.done, 0)
    return { label, value: e ? (dn / e) * 100 : 0 }
  })
  return { daily, expected, done, rate: expected ? (done / expected) * 100 : 0, perfectDays, activeDays: withExp.length, streak: overall.cur, bestStreak: overall.best, perHabit, weekday }
}

/** Reduce daily points to ≤ ~30 chart points: daily for ≤30 days, weekly for ≤120, monthly beyond. */
export function bucketize(daily: DayStat[]) {
  const mode = daily.length <= 31 ? 'day' : daily.length <= 130 ? 'week' : 'month'
  const groups = new Map<string, DayStat[]>()
  daily.forEach(d => {
    const dt = parseISO(d.date)
    const key = mode === 'day' ? d.date : mode === 'week' ? ymd(subDays(dt, getISODay(dt) - 1)) : format(dt, 'yyyy-MM')
    groups.set(key, [...(groups.get(key) || []), d])
  })
  return Array.from(groups.entries()).map(([key, ds]) => {
    const e = ds.reduce((s, d) => s + d.expected, 0), dn = ds.reduce((s, d) => s + d.done, 0)
    const label = mode === 'day' ? format(parseISO(key), daily.length <= 8 ? 'EEE' : 'd MMM') : mode === 'week' ? format(parseISO(key), 'd MMM') : format(parseISO(key + '-01'), 'MMM')
    return { label, value: e ? (dn / e) * 100 : 0 }
  })
}

/** Pace for a progress goal (e.g. 200 pericopes by a deadline). */
export function pace(goal: any, today = ymd(new Date())) {
  const total = Math.max(1, differenceInCalendarDays(parseISO(goal.end_date), parseISO(goal.start_date)) + 1)
  const elapsed = Math.min(total, Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(goal.start_date)) + 1))
  const left = Math.max(0, differenceInCalendarDays(parseISO(goal.end_date), parseISO(today)) + 1)
  const expected = (Number(goal.target_total) * elapsed) / total
  const current = Number(goal.current_count)
  const remaining = Math.max(0, Number(goal.target_total) - current)
  const perDay = left ? remaining / left : remaining
  return { total, elapsed, left, expected, diff: current - expected, remaining, perDay, perWeek: perDay * 7, pct: (current / Number(goal.target_total)) * 100, done: current >= Number(goal.target_total) }
}
