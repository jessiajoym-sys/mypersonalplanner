'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { addMinutes, format, parseISO } from 'date-fns'
import { expandEvent } from '@/lib/calendar'
import { todayStr } from '@/lib/planner'

/** Checks every 30s for events/tasks with an alert and shows a pop-up (+ browser notification if allowed). Works while the planner is open. */
export default function AlertWatcher() {
  const [toasts, setToasts] = useState<{ id: string; title: string; when: string; color: string }[]>([])
  useEffect(() => {
    let stop = false
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || stop) return
      const today = todayStr(); const now = new Date()
      const [ev, td] = await Promise.all([
        supabase.from('events').select('*').eq('user_id', user.id).not('reminder_minutes', 'is', null).lte('date', today),
        supabase.from('todos').select('*').eq('user_id', user.id).eq('scheduled_date', today).not('reminder_minutes', 'is', null).not('scheduled_time', 'is', null).neq('status', 'done'),
      ])
      const cands: any[] = [
        ...(ev.data || []).flatMap((e: any) => expandEvent(e, today, today)).filter(i => i.startTime).map(i => ({ key: i.key, title: i.title, time: i.startTime!, mins: i.reminder ?? 0, color: i.color })),
        ...(td.data || []).map((t: any) => ({ key: `t-${t.id}-${today}`, title: t.title, time: t.scheduled_time, mins: t.reminder_minutes ?? 0, color: '#8B5CF6' })),
      ]
      for (const c of cands) {
        const start = parseISO(`${today}T${c.time}`)
        const fireAt = addMinutes(start, -c.mins)
        if (now >= fireAt && now <= addMinutes(start, 5)) {
          const fk = `alert-fired-${c.key}`
          let fired = false
          try { fired = !!localStorage.getItem(fk); if (!fired) localStorage.setItem(fk, '1') } catch {}
          if (fired) continue
          const when = format(start, 'HH:mm')
          setToasts(p => [...p, { id: c.key, title: c.title, when, color: c.color }])
          try { if ('Notification' in window && Notification.permission === 'granted') new Notification(c.title, { body: `Starts at ${when}` }) } catch {}
        }
      }
    }
    check(); const t = setInterval(check, 30000)
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch {}
    return () => { stop = true; clearInterval(t) }
  }, [])
  if (!toasts.length) return null
  return (
    <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className="bg-white rounded-xl shadow-xl border-l-4 px-4 py-3 w-72 fade-in" style={{ borderColor: t.color }}>
          <div className="flex justify-between gap-2"><div className="text-xs font-bold">🔔 {t.title}</div><button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} className="text-gray-300 hover:text-gray-500 text-xs">✕</button></div>
          <div className="text-[11px] text-gray-400 mt-0.5">Starts at {t.when}</div>
        </div>
      ))}
    </div>
  )
}
