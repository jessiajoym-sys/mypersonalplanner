import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import { ymd } from './planner'

export type Cycle = { id: string; start_date: string; end_date?: string | null; notes?: string | null }
export type Insight = {
  count: number; avgCycle: number | null; avgPeriod: number; shortest: number | null; longest: number | null
  nextStart: string | null; lateDays: number; status: 'no-data' | 'need-more' | 'regular' | 'irregular' | 'late'
  findings: string[]
}

export const DEFAULT_PERIOD_DAYS = 5

export function analyze(cycles: Cycle[], today = ymd(new Date())): Insight {
  const sorted = [...cycles].sort((a, b) => a.start_date.localeCompare(b.start_date))
  if (!sorted.length) return { count: 0, avgCycle: null, avgPeriod: DEFAULT_PERIOD_DAYS, shortest: null, longest: null, nextStart: null, lateDays: 0, status: 'no-data', findings: [] }
  const lens: number[] = []
  for (let i = 1; i < sorted.length; i++) lens.push(differenceInCalendarDays(parseISO(sorted[i].start_date), parseISO(sorted[i - 1].start_date)))
  const recent = lens.slice(-6)
  const avg = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null
  const periodLens = sorted.filter(c => c.end_date).map(c => differenceInCalendarDays(parseISO(c.end_date!), parseISO(c.start_date)) + 1).slice(-6)
  const avgPeriod = periodLens.length ? Math.round(periodLens.reduce((a, b) => a + b, 0) / periodLens.length) : DEFAULT_PERIOD_DAYS
  const last = sorted[sorted.length - 1]
  const nextStart = avg ? ymd(addDays(parseISO(last.start_date), avg)) : null
  const sinceLast = differenceInCalendarDays(parseISO(today), parseISO(last.start_date))
  const lateDays = avg ? Math.max(0, sinceLast - avg) : 0
  const shortest = recent.length ? Math.min(...recent) : null, longest = recent.length ? Math.max(...recent) : null

  const findings: string[] = []
  if (shortest !== null && shortest < 21) findings.push(`A recent cycle was only ${shortest} days (typical range is about 21–35 days).`)
  if (longest !== null && longest > 35) findings.push(`A recent cycle was ${longest} days (typical range is about 21–35 days).`)
  if (shortest !== null && longest !== null && longest - shortest > 9) findings.push(`Your cycle length varies a lot (${shortest}–${longest} days).`)
  if (lateDays >= 7) findings.push(`Your period is ${lateDays} days later than your usual pattern (${sinceLast} days since the last start).`)
  else if (!avg && sinceLast > 45) findings.push(`It has been ${sinceLast} days since the last logged start.`)
  if (periodLens.some(n => n > 8)) findings.push('Some periods lasted longer than 8 days.')
  if (periodLens.some(n => n < 2)) findings.push('Some periods lasted only 1 day.')

  const status: Insight['status'] = lens.length < 2 ? 'need-more' : lateDays >= 7 ? 'late' : findings.length ? 'irregular' : 'regular'
  return { count: sorted.length, avgCycle: avg, avgPeriod, shortest, longest, nextStart, lateDays, status, findings }
}

/** Map of date -> 'logged' | 'predicted' for the calendar (icon only, no text). */
export function cycleDayMap(cycles: Cycle[], insight: Insight, today = ymd(new Date())): Record<string, 'logged' | 'predicted'> {
  const m: Record<string, 'logged' | 'predicted'> = {}
  for (const c of cycles) {
    const start = parseISO(c.start_date)
    const len = c.end_date ? differenceInCalendarDays(parseISO(c.end_date), start) + 1 : insight.avgPeriod
    for (let i = 0; i < Math.max(1, Math.min(len, 12)); i++) m[ymd(addDays(start, i))] = 'logged'
  }
  if (insight.avgCycle && cycles.length) {
    const last = [...cycles].sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(-1)[0]
    for (let k = 1; k <= 4; k++) {
      const s = addDays(parseISO(last.start_date), insight.avgCycle * k)
      for (let i = 0; i < insight.avgPeriod; i++) { const d = ymd(addDays(s, i)); if (d >= today && !m[d]) m[d] = 'predicted' }
    }
  }
  return m
}

export const POSSIBLE_REASONS = [
  'Stress or big life changes (moving, deadlines, emotional strain)',
  'Travel, time-zone changes or irregular sleep',
  'Sudden weight change, very intense exercise, or eating much less than usual',
  'Recent illness, new medication, or a change in birth control',
  'Hormone-related conditions such as PCOS or thyroid problems',
  'Pregnancy (if there is any chance, a home test is the quickest check)',
]
