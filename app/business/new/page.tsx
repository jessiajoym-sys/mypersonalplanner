'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const EMOJIS = ['💼','🌶️','🛏️','🧣','🏠','✈️','🍔','👗','💄','📱','🎨','🌱','☕','🎯','🚀']
const COLORS = ['#EF4444','#F97316','#EAB308','#22C55E','#14B8A6','#5B7FFF','#8B5CF6','#FF6B8A','#1A1A2E','#9090A8']

export default function NewBusinessPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [emoji, setEmoji] = useState('💼')
  const [color, setColor] = useState('#F97316')
  const [target, setTarget] = useState('')
  const [currency, setCurrency] = useState('IDR')
  const [opening, setOpening] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'business-' + Date.now()
    const row: any = { name: name.trim(), description: desc, emoji, color, monthly_target: parseFloat(target) || 0, user_id: user.id, status: 'active', currency, opening_cash: parseFloat(opening) || 0 }
    // try a readable id first (works when businesses.id is text), fall back to an auto id
    let res = await supabase.from('businesses').insert({ ...row, id: slug }).select('id').single()
    if (res.error) res = await supabase.from('businesses').insert(row).select('id').single()
    if (res.error) { setErr(res.error.message + (/currency|opening_cash/.test(res.error.message) ? ' — run lib/planner-upgrade-6.sql in Supabase first.' : '')); setSaving(false); return }
    router.push(`/business/${res.data.id}`)
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-1">Add New Business 💼</h1>
      <p className="text-xs text-gray-400 mb-5">Create a new business planner</p>
      <div className="card p-5">
        <div className="mb-4">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Business Name</label>
          <input className="inp" placeholder="e.g. Sambal Mak Tak" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Description</label>
          <input className="inp" placeholder="Short description..." value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Emoji</label>
          <div className="flex gap-2 flex-wrap">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-xl text-xl transition-all ${emoji === e ? 'bg-blue-100 ring-2 ring-blue-400 scale-110' : 'bg-gray-100 hover:bg-gray-200'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Color</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="mb-5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Currency of the books</label>
          <select className="sel w-full mb-4" value={currency} onChange={e => setCurrency(e.target.value)}>{['IDR', 'CNY', 'USD', 'EUR', 'SGD'].map(c => <option key={c}>{c}</option>)}</select>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Monthly Revenue Target ({currency})</label>
          <input className="inp mb-4" type="number" placeholder="e.g. 100000000" value={target} onChange={e => setTarget(e.target.value)} />
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Opening cash ({currency})</label>
          <input className="inp" type="number" placeholder="Money the business already has today (optional)" value={opening} onChange={e => setOpening(e.target.value)} />
          {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn-gray flex-1" onClick={() => router.back()}>Cancel</button>
          <button className="btn-blue flex-1" onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Creating...' : 'Create Business →'}
          </button>
        </div>
      </div>
    </div>
  )
}
