'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { emitChange, todayStr } from '@/lib/planner'
import { POSSIBLE_REASONS, analyze, Cycle } from '@/lib/cycle'
import Modal, { Field } from './Modal'

export default function CycleModal({ onClose }: { onClose: () => void }) {
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [start, setStart] = useState(todayStr())
  const [end, setEnd] = useState('')
  const [err, setErr] = useState('')
  const [hide, setHide] = useState(false)
  useEffect(() => { try { setHide(localStorage.getItem('cycle-hide') === '1') } catch {} }, [])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const { data, error } = await supabase.from('cycle_logs').select('*').eq('user_id', user.id).order('start_date', { ascending: false })
    if (error) setErr('Cycle tracker is not set up yet. Run lib/planner-upgrade-3.sql in Supabase first.')
    setCycles(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  const insight = useMemo(() => analyze(cycles), [cycles])

  async function add() {
    setErr('')
    if (end && end < start) { setErr('End date is before the start date.'); return }
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const { error } = await supabase.from('cycle_logs').insert({ user_id: user.id, start_date: start, end_date: end || null })
    if (error) { setErr(error.message); return }
    setEnd(''); await load(); emitChange()
  }
  async function setEndDate(c: Cycle, d: string) { await supabase.from('cycle_logs').update({ end_date: d || null }).eq('id', c.id); await load(); emitChange() }
  async function del(id: string) { if (!confirm('Delete this entry?')) return; await supabase.from('cycle_logs').delete().eq('id', id); await load(); emitChange() }
  const toggleHide = (v: boolean) => { setHide(v); try { localStorage.setItem('cycle-hide', v ? '1' : '0') } catch {}; emitChange() }

  const tone = insight.status === 'regular' ? 'bg-green-50 text-green-700' : insight.status === 'late' || insight.status === 'irregular' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'
  const headline = { 'no-data': 'Log your first period start to begin.', 'need-more': 'Log at least 3 periods to see your pattern.', regular: 'Your recent cycles look regular.', irregular: 'Some recent cycles look different from the usual range.', late: 'Your period is later than your usual pattern.' }[insight.status]

  return (
    <Modal title="🌸 Private cycle tracker" onClose={onClose} wide subtitle="Only you can see this. The calendar shows just a small flower, never any text.">
      {err && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{err}</div>}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end mb-4">
        <Field label="Period started"><input type="date" className="sel w-full" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Ended (optional)"><input type="date" className="sel w-full" value={end} min={start} onChange={e => setEnd(e.target.value)} /></Field>
        <button className="btn-blue" onClick={add}>Add</button>
      </div>

      <div className={`rounded-xl px-4 py-3 mb-4 ${tone}`}>
        <div className="text-sm font-bold">{headline}</div>
        {insight.avgCycle && <div className="text-xs mt-1">Average cycle: <b>{insight.avgCycle} days</b> · average period: <b>{insight.avgPeriod} days</b>{insight.nextStart && <> · next expected around <b>{format(parseISO(insight.nextStart), 'MMM d')}</b></>}</div>}
        {insight.findings.length > 0 && <ul className="text-xs mt-2 list-disc pl-4 space-y-0.5">{insight.findings.map(f => <li key={f}>{f}</li>)}</ul>}
      </div>

      {(insight.status === 'late' || insight.status === 'irregular') && (
        <div className="rounded-xl border border-gray-100 px-4 py-3 mb-4">
          <div className="text-xs font-bold mb-1.5">Common reasons a cycle shifts</div>
          <ul className="text-xs text-gray-600 list-disc pl-4 space-y-0.5">{POSSIBLE_REASONS.map(r => <li key={r}>{r}</li>)}</ul>
          <div className="text-[11px] text-gray-500 mt-2">This is general information, not a diagnosis. Consider seeing a doctor if you miss 3 periods in a row, your cycles are often shorter than 21 or longer than 35 days, bleeding is very heavy or painful, or you have any chance of pregnancy.</div>
        </div>
      )}

      <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">History</div>
      <div className="max-h-48 overflow-y-auto mb-3">
        {cycles.length === 0 ? <div className="text-xs text-gray-400 py-2">Nothing logged yet.</div> : cycles.map(c => (
          <div key={c.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 text-xs">
            <span className="flex-1 font-semibold">{format(parseISO(c.start_date), 'MMM d, yyyy')}</span>
            <span className="text-gray-400">ended</span>
            <input type="date" className="sel text-[11px] py-1" value={c.end_date || ''} min={c.start_date} onChange={e => setEndDate(c, e.target.value)} />
            <button onClick={() => del(c.id)} aria-label="Delete" className="text-gray-300 hover:text-red-500">✕</button>
          </div>))}
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer"><input type="checkbox" checked={hide} onChange={e => toggleHide(e.target.checked)} /> Hide the flower on the calendar (e.g. when someone is looking at your screen)</label>
    </Modal>
  )
}
