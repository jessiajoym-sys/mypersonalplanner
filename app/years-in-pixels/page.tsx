'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, eachDayOfInterval, startOfYear, endOfYear, isToday, isFuture, differenceInDays } from 'date-fns'

const MOODS = [
  { val: 5, label: 'Amazing', color: '#22C55E', emoji: '🌟' },
  { val: 4, label: 'Good', color: '#86EFAC', emoji: '😊' },
  { val: 3, label: 'Okay', color: '#FDE68A', emoji: '😐' },
  { val: 2, label: 'Bad', color: '#FCA5A5', emoji: '😔' },
  { val: 1, label: 'Terrible', color: '#EF4444', emoji: '😢' },
]

export default function YearsInPixelsPage() {
  const [pixels, setPixels] = useState<Record<string, any>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [selectedMood, setSelectedMood] = useState(3)
  const [loading, setLoading] = useState(true)
  const year = new Date().getFullYear()
  const days = eachDayOfInterval({ start: startOfYear(new Date(year, 0, 1)), end: endOfYear(new Date(year, 0, 1)) })
  const today = format(new Date(), 'yyyy-MM-dd')
  const dayOfYear = differenceInDays(new Date(), startOfYear(new Date())) + 1
  const daysLeft = 365 - dayOfYear

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('pixel_days').select('*')
      .eq('user_id', user.id)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
    const map: Record<string, any> = {}
    data?.forEach(p => { map[p.date] = p })
    setPixels(map)
    setLoading(false)
  }

  async function savePixel() {
    if (!selected) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const mood = MOODS.find(m => m.val === selectedMood)
    await supabase.from('pixel_days').upsert({
      user_id: user.id, date: selected,
      mood: selectedMood, color: mood?.color, note
    })
    load()
    setSelected(null)
  }

  const getColor = (dateStr: string) => {
    if (pixels[dateStr]) return pixels[dateStr].color
    if (isFuture(new Date(dateStr + 'T00:00:00'))) return '#F3F4F6'
    return '#E5E7EB'
  }

  // Stats
  const filledDays = Object.keys(pixels).length
  const avgMood = filledDays > 0
    ? (Object.values(pixels).reduce((s: number, p: any) => s + p.mood, 0) / filledDays).toFixed(1)
    : '—'
  const moodCounts = MOODS.map(m => ({
    ...m, count: Object.values(pixels).filter((p: any) => p.mood === m.val).length
  }))

  const months = Array.from({ length: 12 }, (_, i) => {
    const monthDays = days.filter(d => d.getMonth() === i)
    return { month: format(new Date(year, i, 1), 'MMM'), days: monthDays }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Years in Pixels 🌈</h1>
          <p className="text-xs text-gray-400 mt-0.5">Color each day by how you feel · {year}</p>
        </div>
      </div>

      {/* Countdown */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-blue-500">{dayOfYear}</div>
          <div className="text-xs text-gray-400">Day of year</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-orange-500">{daysLeft}</div>
          <div className="text-xs text-gray-400">Days remaining</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-green-500">{filledDays}</div>
          <div className="text-xs text-gray-400">Days logged</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-purple-500">{avgMood}</div>
          <div className="text-xs text-gray-400">Avg mood</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between text-xs text-gray-400 mb-2">
          <span className="font-semibold">Year progress</span>
          <span className="font-bold text-blue-500">{Math.round((dayOfYear / 365) * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all"
            style={{ width: `${(dayOfYear / 365) * 100}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1.5">
          <span>Jan 1</span>
          <span>Today: {format(new Date(), 'MMM d')}</span>
          <span>Dec 31</span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_220px] gap-4">
        {/* Pixel grid */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col gap-1">
            {months.map(({ month, days: mDays }) => (
              <div key={month} className="flex items-center gap-1.5">
                <div className="text-[10px] font-bold text-gray-400 w-7 flex-shrink-0">{month}</div>
                <div className="flex gap-0.5 flex-wrap">
                  {mDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd')
                    const isT = dateStr === today
                    const color = getColor(dateStr)
                    return (
                      <div key={dateStr}
                        onClick={() => {
                          if (!isFuture(new Date(dateStr + 'T00:00:00'))) {
                            setSelected(dateStr)
                            setNote(pixels[dateStr]?.note || '')
                            setSelectedMood(pixels[dateStr]?.mood || 3)
                          }
                        }}
                        title={`${dateStr}${pixels[dateStr] ? ` · ${MOODS.find(m => m.val === pixels[dateStr].mood)?.label}` : ''}`}
                        className={`w-5 h-5 rounded cursor-pointer transition-all hover:scale-110 hover:shadow
                          ${isT ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                        style={{ background: color }} />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-3">
          {/* Legend */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Mood Legend</div>
            {MOODS.map(m => (
              <div key={m.val} className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded flex-shrink-0" style={{ background: m.color }} />
                <span className="text-sm">{m.emoji}</span>
                <span className="text-xs text-gray-600 flex-1">{m.label}</span>
                <span className="text-xs font-bold text-gray-400">{moodCounts.find(mc => mc.val === m.val)?.count || 0}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-5 h-5 rounded bg-gray-100 flex-shrink-0" />
              <span className="text-xs text-gray-400 flex-1">Future / not logged</span>
            </div>
          </div>

          {/* Day editor */}
          {selected && (
            <div className="bg-white border-2 border-blue-400 rounded-2xl p-4 shadow-sm fade-in">
              <div className="text-xs font-bold text-blue-500 uppercase mb-3">
                {format(new Date(selected + 'T00:00:00'), 'EEEE, MMMM d')}
              </div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">How was this day?</div>
              <div className="flex gap-1.5 mb-3 flex-wrap">
                {MOODS.map(m => (
                  <button key={m.val} onClick={() => setSelectedMood(m.val)}
                    className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border-2 transition-all flex-1 min-w-[40px]
                      ${selectedMood === m.val ? 'border-blue-500 bg-blue-50 scale-105' : 'border-gray-100'}`}
                    style={selectedMood === m.val ? { borderColor: m.color, background: m.color + '20' } : {}}>
                    <span className="text-base">{m.emoji}</span>
                    <span className="text-[9px] text-gray-400">{m.label}</span>
                  </button>
                ))}
              </div>
              <textarea className="inp text-xs resize-none mb-3" rows={2}
                placeholder="Add a note for this day..." value={note} onChange={e => setNote(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn-blue btn-sm flex-1" onClick={savePixel}>Save</button>
                <button className="btn-gray btn-sm" onClick={() => setSelected(null)}>Cancel</button>
              </div>
            </div>
          )}

          {!selected && (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center text-xs text-gray-400">
              <div className="text-3xl mb-2">👆</div>
              Click any past day to color it with your mood
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
