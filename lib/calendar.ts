import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarWeeks, differenceInCalendarYears, parseISO, isAfter, isBefore } from 'date-fns'
import { ymd, isDone } from './planner'

export type CalKind = 'event' | 'task' | 'errand' | 'deadline' | 'holiday'
export type CalItem = {
  key: string
  id: string            // id of the source row (event/todo)
  kind: CalKind
  title: string
  date: string
  startTime?: string | null
  endTime?: string | null
  allDay: boolean
  color: string
  category: string
  businessId?: string | null
  done?: boolean
  recurring?: boolean
  reminder?: number | null
  location?: string | null
  raw?: any
}

export const KIND_LABEL: Record<CalKind, string> = { event: 'Events', task: 'Tasks', errand: 'Errands', deadline: 'Deadlines', holiday: 'Holidays' }
export const KIND_ICON: Record<CalKind, string> = { event: '📅', task: '✓', errand: '🛒', deadline: '⏰', holiday: '🎌' }
export const KIND_COLOR: Record<CalKind, string> = { event: '#5B7FFF', task: '#8B5CF6', errand: '#F59E0B', deadline: '#EF4444', holiday: '#EC4899' }

const MAX_SPAN_DAYS = 62

/** Expand one event (with optional repeat + multi-day span) into concrete items inside [from, to]. */
export function expandEvent(ev: any, from: string, to: string): CalItem[] {
  if (!ev?.date || ev.status === 'cancelled') return []
  const anchor = parseISO(ev.date)
  const f = parseISO(from), t = parseISO(to)
  const spanDays = ev.end_date && ev.end_date > ev.date ? Math.min(differenceInCalendarDays(parseISO(ev.end_date), anchor), MAX_SPAN_DAYS) : 0
  const rep = (ev.repeat_type || 'none').toLowerCase()
  const until = ev.repeat_until ? parseISO(ev.repeat_until) : null
  const out: CalItem[] = []

  const push = (start: Date) => {
    for (let s = 0; s <= spanDays; s++) {
      const d = addDays(start, s)
      if (isBefore(d, f) || isAfter(d, t)) continue
      out.push({
        key: `ev-${ev.id}-${ymd(d)}`, id: ev.id, kind: 'event', title: ev.title, date: ymd(d),
        startTime: s === 0 ? ev.start_time : null, endTime: s === spanDays ? ev.end_time : null,
        allDay: !!ev.all_day || !ev.start_time, color: ev.alert_color || ev.category_color || KIND_COLOR.event,
        category: ev.category || 'Event', businessId: ev.business_id, recurring: rep !== 'none' && rep !== 'never',
        reminder: ev.reminder_minutes ?? null, location: ev.location, raw: ev,
      })
    }
  }

  if (rep === 'none' || rep === 'never' || !rep) { push(anchor); return out }

  const step = (k: number): Date =>
    rep === 'daily' ? addDays(anchor, k) :
    rep === 'weekly' ? addWeeks(anchor, k) :
    rep === 'biweekly' ? addWeeks(anchor, 2 * k) :
    rep === 'monthly' ? addMonths(anchor, k) :
    rep === 'yearly' ? addYears(anchor, k) : addDays(anchor, 99999)

  let k = 0
  const back = spanDays + 1
  if (isAfter(f, anchor)) {
    k = rep === 'daily' ? differenceInCalendarDays(f, anchor) - back
      : rep === 'weekly' ? differenceInCalendarWeeks(f, anchor) - 1 - Math.ceil(back / 7)
      : rep === 'biweekly' ? Math.floor(differenceInCalendarWeeks(f, anchor) / 2) - 1 - Math.ceil(back / 14)
      : rep === 'monthly' ? differenceInCalendarMonths(f, anchor) - 1 - Math.ceil(back / 28)
      : differenceInCalendarYears(f, anchor) - 1 - Math.ceil(back / 365)
  }
  k = Math.max(0, k)
  for (let guard = 0; guard < 800; guard++, k++) {
    const s = step(k)
    if (isAfter(s, t)) break
    if (until && isAfter(s, until)) break
    push(s)
  }
  return out
}

/** Turn todos into calendar items: one on its scheduled day, one on its deadline day. */
export function taskItems(todos: any[], from: string, to: string): CalItem[] {
  const out: CalItem[] = []
  for (const t of todos) {
    if (t.status === 'cancelled') continue
    const done = isDone(t)
    const kind: CalKind = t.task_type === 'errand' ? 'errand' : 'task'
    const cat = t.category || 'Personal'
    if (t.scheduled_date && t.scheduled_date >= from && t.scheduled_date <= to) {
      out.push({ key: `t-${t.id}`, id: t.id, kind, title: t.title, date: t.scheduled_date, startTime: t.scheduled_time, endTime: t.end_time,
        allDay: !t.scheduled_time, color: KIND_COLOR[kind], category: cat, businessId: t.business_id, done, recurring: !!t.repeat_type && t.repeat_type !== 'never',
        reminder: t.reminder_minutes ?? null, location: t.location, raw: t })
    }
    if (t.deadline && t.deadline !== t.scheduled_date && t.deadline >= from && t.deadline <= to) {
      out.push({ key: `d-${t.id}`, id: t.id, kind: 'deadline', title: t.title, date: t.deadline, allDay: true, color: KIND_COLOR.deadline,
        category: cat, businessId: t.business_id, done, raw: t })
    }
  }
  return out
}

export function holidayItems(holidays: { date: string; name: string; country: string }[], from: string, to: string): CalItem[] {
  return holidays.filter(h => h.date >= from && h.date <= to).map(h => ({
    key: `h-${h.country}-${h.date}-${h.name}`, id: `${h.country}-${h.date}`, kind: 'holiday' as CalKind, title: h.name, date: h.date, allDay: true,
    color: KIND_COLOR.holiday, category: `Holiday ${h.country}`,
  }))
}

export function sortItems(items: CalItem[]) {
  return [...items].sort((a, b) => {
    if (a.kind === 'holiday' !== (b.kind === 'holiday')) return a.kind === 'holiday' ? -1 : 1
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return (a.startTime || '').localeCompare(b.startTime || '') || a.title.localeCompare(b.title)
  })
}

// ----- public holidays (free API, cached in the browser) -----
export type Holiday = { date: string; name: string; country: string }
export async function fetchHolidays(year: number, countries: string[]): Promise<Holiday[]> {
  const out: Holiday[] = []
  await Promise.all(countries.map(async c => {
    const key = `holidays-${c}-${year}`
    try {
      const cached = localStorage.getItem(key)
      if (cached) { out.push(...JSON.parse(cached)); return }
    } catch {}
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${c}`)
      if (!res.ok) return
      const json = await res.json()
      const list: Holiday[] = json.map((h: any) => ({ date: h.date, name: h.localName === h.name ? h.name : `${h.name}`, country: c }))
      try { localStorage.setItem(key, JSON.stringify(list)) } catch {}
      out.push(...list)
    } catch {}
  }))
  return out
}
