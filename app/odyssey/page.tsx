'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const PLAN_TYPES = [
  { type: 'A', label: 'Plan A', sublabel: 'Primary Path', emoji: '🎯', color: '#5B7FFF', bg: 'bg-blue-50', border: 'border-blue-300' },
  { type: 'B', label: 'Plan B', sublabel: 'Alternative', emoji: '🌿', color: '#22C55E', bg: 'bg-green-50', border: 'border-green-300' },
  { type: 'C', label: 'Plan C', sublabel: 'Bold Path', emoji: '🔥', color: '#F97316', bg: 'bg-orange-50', border: 'border-orange-300' },
]

export default function OdysseyPage() {
  const [plans, setPlans] = useState<Record<string, any>>({})
  const [activePlan, setActivePlan] = useState('A')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({ title: '', description: '', confidence: 7, excitement: 8, resources: 6, notes: '', timeline: [], pros: [], cons: [] })
  const [newPro, setNewPro] = useState('')
  const [newCon, setNewCon] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('odyssey_plans').select('*').eq('user_id', user.id)
    const map: Record<string, any> = {}
    data?.forEach(p => { map[p.plan_type] = p })
    setPlans(map)
  }

  async function savePlan() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('odyssey_plans').upsert({ ...form, plan_type: activePlan, user_id: user.id })
    load()
    setEditing(false)
  }

  function startEdit() {
    const plan = plans[activePlan]
    if (plan) setForm({ ...plan })
    else setForm({ title: '', description: '', confidence: 7, excitement: 8, resources: 6, notes: '', timeline: Array.from({ length: 6 }, (_, i) => ({ year: 2026 + i, milestone: '' })), pros: [], cons: [] })
    setEditing(true)
  }

  const pt = PLAN_TYPES.find(p => p.type === activePlan)!
  const currentPlan = plans[activePlan]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Odyssey Plan ✨</h1>
          <p className="text-xs text-gray-400 mt-0.5">3 possible life paths · 5-year horizon (2026–2031)</p>
        </div>
      </div>

      {/* Plan selector */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {PLAN_TYPES.map(p => (
          <div key={p.type} onClick={() => { setActivePlan(p.type); setEditing(false) }}
            className={`card p-4 cursor-pointer transition-all hover:-translate-y-0.5 ${activePlan === p.type ? `border-2 ${p.border}` : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-xl ${p.bg} flex items-center justify-center text-lg`}>{p.emoji}</div>
              <div>
                <div className="text-xs font-bold text-gray-400">{p.label}</div>
                <div className="text-sm font-bold" style={{ color: p.color }}>{p.sublabel}</div>
              </div>
            </div>
            {plans[p.type] ? (
              <div className="text-xs font-semibold text-gray-700 truncate">{plans[p.type].title}</div>
            ) : (
              <div className="text-xs text-gray-400 italic">Not filled yet</div>
            )}
          </div>
        ))}
      </div>

      {/* Plan content or empty state */}
      {!editing && !currentPlan && (
        <div className="card p-10 text-center">
          <div className="text-5xl mb-4">{pt.emoji}</div>
          <div className="text-lg font-bold mb-2">{pt.label} — {pt.sublabel}</div>
          <div className="text-sm text-gray-400 mb-5">You haven't filled this life path yet. Click below to start!</div>
          <button className="btn-blue" onClick={startEdit}>✏️ Fill Plan {pt.type}</button>
        </div>
      )}

      {!editing && currentPlan && (
        <div className="fade-in">
          {/* Hero */}
          <div className="rounded-2xl p-6 text-white mb-4 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${pt.color}CC, ${pt.color})` }}>
            <div className="absolute right-4 top-4 text-6xl opacity-20">{form.emoji || pt.emoji}</div>
            <div className="text-xs font-bold opacity-70 mb-1">{pt.label} · {pt.sublabel}</div>
            <div className="text-2xl font-bold mb-2">{currentPlan.title}</div>
            <div className="text-sm opacity-85 mb-4">{currentPlan.description}</div>
            <div className="flex gap-3">
              {[
                { label: 'Confidence', val: currentPlan.confidence },
                { label: 'Excitement', val: currentPlan.excitement },
                { label: 'Resources', val: currentPlan.resources },
              ].map(r => (
                <div key={r.label} className="bg-white/20 rounded-xl px-3 py-2 text-center backdrop-blur-sm">
                  <div className="text-lg font-bold">{r.val}/10</div>
                  <div className="text-xs opacity-70">{r.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Timeline */}
            <div className="card">
              <div className="card-h"><div className="text-xs font-bold text-gray-400 uppercase">📅 5-Year Timeline</div></div>
              <div className="p-4">
                {(currentPlan.timeline || []).map((t: any, i: number) => (
                  <div key={i} className="flex gap-3 mb-3 last:mb-0">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: pt.color }}>{t.year}</div>
                      {i < (currentPlan.timeline?.length || 0) - 1 && <div className="w-0.5 flex-1 bg-gray-100 my-1" />}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="text-xs font-bold text-gray-400">{t.year}</div>
                      <div className="text-sm mt-0.5">{t.milestone || <span className="italic text-gray-300">No milestone set</span>}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pros & Cons */}
            <div className="card">
              <div className="card-h"><div className="text-xs font-bold text-gray-400 uppercase">⚖️ Pros & Cons</div></div>
              <div className="p-4">
                <div className="text-xs font-bold text-green-500 uppercase mb-2">✅ Pros</div>
                {(currentPlan.pros || []).map((p: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    {p}
                  </div>
                ))}
                <div className="text-xs font-bold text-red-400 uppercase mb-2 mt-3">⚠️ Cons</div>
                {(currentPlan.cons || []).map((c: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    {c}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {currentPlan.notes && (
            <div className="card p-4 mb-4">
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">💭 My Reflection</div>
              <div className="text-sm text-gray-600 leading-relaxed">{currentPlan.notes}</div>
            </div>
          )}
          <button className="btn-blue" onClick={startEdit}>✏️ Edit Plan {pt.type}</button>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="card p-5 fade-in">
          <div className="text-sm font-bold mb-4">✏️ Editing {pt.label}</div>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">Plan Title</label>
            <input className="inp" placeholder="e.g. Scholar & Entrepreneur in China" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">Description</label>
            <textarea className="inp resize-none" rows={2} placeholder="Describe this life path..." value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="mb-4">
            <label className="text-xs font-bold text-gray-400 uppercase block mb-2">5-Year Timeline</label>
            {(form.timeline || []).map((t: any, i: number) => (
              <div key={i} className="flex gap-2 mb-2">
                <div className="w-14 px-2 py-2 bg-gray-100 rounded-lg text-xs font-bold text-center flex-shrink-0">{t.year}</div>
                <input className="inp flex-1 text-xs" placeholder={`What happens in ${t.year}?`} value={t.milestone || ''} onChange={e => {
                  const tl = [...(form.timeline || [])]
                  tl[i] = { ...tl[i], milestone: e.target.value }
                  setForm({ ...form, timeline: tl })
                }} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-2">✅ Pros</label>
              <div className="flex gap-1 mb-2">
                <input className="inp text-xs flex-1" placeholder="Add pro..." value={newPro} onChange={e => setNewPro(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newPro) { setForm({ ...form, pros: [...(form.pros || []), newPro] }); setNewPro('') } }} />
              </div>
              {(form.pros || []).map((p: string, i: number) => (
                <div key={i} className="flex items-center gap-1.5 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-xs flex-1">{p}</span>
                  <button className="text-gray-300 hover:text-red-500 text-xs" onClick={() => setForm({ ...form, pros: form.pros.filter((_: any, j: number) => j !== i) })}>✕</button>
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-2">⚠️ Cons</label>
              <div className="flex gap-1 mb-2">
                <input className="inp text-xs flex-1" placeholder="Add con..." value={newCon} onChange={e => setNewCon(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newCon) { setForm({ ...form, cons: [...(form.cons || []), newCon] }); setNewCon('') } }} />
              </div>
              {(form.cons || []).map((c: string, i: number) => (
                <div key={i} className="flex items-center gap-1.5 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                  <span className="text-xs flex-1">{c}</span>
                  <button className="text-gray-300 hover:text-red-500 text-xs" onClick={() => setForm({ ...form, cons: form.cons.filter((_: any, j: number) => j !== i) })}>✕</button>
                </div>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Ratings (1-10)</label>
            <div className="grid grid-cols-3 gap-3">
              {[{ key: 'confidence', label: '🎯 Confidence' }, { key: 'excitement', label: '🔥 Excitement' }, { key: 'resources', label: '🛠️ Resources' }].map(r => (
                <div key={r.key}>
                  <div className="text-xs text-gray-400 mb-1">{r.label}: <span className="font-bold" style={{ color: pt.color }}>{form[r.key]}</span></div>
                  <input type="range" min={1} max={10} value={form[r.key] || 7} onChange={e => setForm({ ...form, [r.key]: Number(e.target.value) })} className="w-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">💭 Personal Reflection</label>
            <textarea className="inp resize-none" rows={3} placeholder="Write your honest thoughts about this life path..." value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button className="btn-gray flex-1" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-blue flex-1" onClick={savePlan}>Save Plan {pt.type}</button>
          </div>
        </div>
      )}
    </div>
  )
}
