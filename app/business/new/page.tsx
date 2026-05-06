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
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    await supabase.from('businesses').insert({
      name, description: desc, emoji, color,
      monthly_target: parseFloat(target) || 0,
      user_id: user.id, status: 'active', id: slug
    })
    router.push(`/business/${slug}`)
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
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Monthly Revenue Target (IDR)</label>
          <input className="inp" type="number" placeholder="e.g. 100000000" value={target} onChange={e => setTarget(e.target.value)} />
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
