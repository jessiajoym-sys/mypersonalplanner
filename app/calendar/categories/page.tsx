'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2 } from 'lucide-react'

const PRESET_COLORS = [
  '#5B7FFF','#22C55E','#EF4444','#F97316','#8B5CF6',
  '#FF6B8A','#14B8A6','#EAB308','#1A1A2E','#9090A8'
]

const PRESET_ICONS = ['📅','📝','⏰','🎂','📿','✈️','💳','🏠','💼','🎯','🏥','🎓','💰','🤝','⚡']

const DEFAULT_CATEGORIES = [
  { name: 'Meeting', color: '#22C55E', icon: '🤝', is_important: true },
  { name: 'Exam', color: '#5B7FFF', icon: '📝', is_important: true },
  { name: 'Deadline', color: '#EF4444', icon: '⏰', is_important: true },
  { name: 'Birthday', color: '#FF6B8A', icon: '🎂', is_important: true },
  { name: 'Church', color: '#8B5CF6', icon: '📿', is_important: true },
  { name: 'Travel', color: '#14B8A6', icon: '✈️', is_important: false },
  { name: 'Payment Due', color: '#F97316', icon: '💳', is_important: true },
  { name: 'Personal', color: '#9090A8', icon: '🌸', is_important: false },
]

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    name: '', color: '#5B7FFF', icon: '📅', is_important: false
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('calendar_categories')
      .select('*').eq('user_id', user.id).order('created_at')
    if (data && data.length > 0) {
      setCategories(data)
    } else {
      // First time — insert defaults
      await supabase.from('calendar_categories').insert(
        DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: user.id }))
      )
      const { data: fresh } = await supabase.from('calendar_categories')
        .select('*').eq('user_id', user.id).order('created_at')
      if (fresh) setCategories(fresh)
    }
    setLoading(false)
  }

  async function addCategory() {
    if (!form.name.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('calendar_categories').insert({ ...form, user_id: user.id })
    setForm({ name: '', color: '#5B7FFF', icon: '📅', is_important: false })
    setShowAdd(false)
    load()
  }

  async function updateCategory(id: string, field: string, value: any) {
    await supabase.from('calendar_categories').update({ [field]: value }).eq('id', id)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    load()
  }

  async function deleteCategory(id: string) {
    if (!confirm('Delete this category? Events using it will keep the category name but lose the color.')) return
    await supabase.from('calendar_categories').delete().eq('id', id)
    load()
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Calendar Categories 📅</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Manage event categories · set colors · mark as Important
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <div className="text-xs text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
              ✅ Saved!
            </div>
          )}
          <button className="btn-blue flex items-center gap-1.5 text-xs"
            onClick={() => setShowAdd(!showAdd)}>
            <Plus size={13} /> Add Category
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 text-xs text-blue-600">
        💡 Categories marked as <b>Important ⚡</b> will appear in the <b>Important</b> section on your Dashboard.
        Colors show up directly on your calendar.
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card p-4 mb-4">
          <div className="text-xs font-bold text-gray-400 uppercase mb-3">+ New Category</div>
          <div className="flex gap-2 mb-3">
            <input className="inp flex-1" placeholder="Category name (e.g. Doctor, Client Meeting)"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addCategory()} autoFocus />
          </div>

          {/* Icon picker */}
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-400 uppercase mb-1.5">Icon</div>
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_ICONS.map(ic => (
                <button key={ic} onClick={() => setForm({ ...form, icon: ic })}
                  className={`w-8 h-8 rounded-lg text-base transition-all
                    ${form.icon === ic ? 'bg-blue-100 ring-2 ring-blue-400 scale-110' : 'bg-gray-100 hover:bg-gray-200'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-400 uppercase mb-1.5">Color</div>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }} />
              ))}
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                className="w-7 h-7 rounded-full cursor-pointer border-none" title="Custom color" />
            </div>
          </div>

          {/* Important toggle */}
          <div className="flex items-center gap-2 mb-3">
            <div onClick={() => setForm({ ...form, is_important: !form.is_important })}
              className={`w-10 h-6 rounded-full cursor-pointer transition-all relative ${form.is_important ? 'bg-blue-500' : 'bg-gray-200'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.is_important ? 'right-0.5' : 'left-0.5'}`} />
            </div>
            <span className="text-sm">Show in <b>Important ⚡</b> on Dashboard</span>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-400">Preview:</div>
            <div className="text-sm font-semibold px-2.5 py-1 rounded-full text-white"
              style={{ background: form.color }}>
              {form.icon} {form.name || 'Category name'}
            </div>
            {form.is_important && <span className="text-xs text-orange-500 font-semibold">⚡ Important</span>}
          </div>

          <div className="flex gap-2">
            <button className="btn-blue btn-sm" onClick={addCategory}>Save Category</button>
            <button className="btn-gray btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Categories list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : (
        <div className="card">
          <div className="card-h">
            <div className="text-xs font-bold text-gray-400 uppercase">
              {categories.length} Categories
            </div>
            <div className="text-xs text-gray-400">Click to edit color or icon</div>
          </div>
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 group">

              {/* Color dot — click to change */}
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full cursor-pointer hover:scale-110 transition-all flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: cat.color }}>
                  {cat.icon}
                </div>
                <input type="color" value={cat.color}
                  onChange={e => updateCategory(cat.id, 'color', e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-full"
                  title="Click to change color" />
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{cat.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                    style={{ background: cat.color }}>
                    {cat.icon} {cat.name}
                  </div>
                  {cat.is_important && (
                    <span className="text-[10px] text-orange-500 font-semibold">⚡ Important</span>
                  )}
                </div>
              </div>

              {/* Icon picker inline */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                {PRESET_ICONS.slice(0, 8).map(ic => (
                  <button key={ic} onClick={() => updateCategory(cat.id, 'icon', ic)}
                    className={`w-6 h-6 rounded text-xs transition-all hover:scale-110
                      ${cat.icon === ic ? 'bg-blue-100' : 'hover:bg-gray-100'}`}>
                    {ic}
                  </button>
                ))}
              </div>

              {/* Important toggle */}
              <div onClick={() => updateCategory(cat.id, 'is_important', !cat.is_important)}
                className={`w-9 h-5 rounded-full cursor-pointer transition-all relative flex-shrink-0
                  ${cat.is_important ? 'bg-blue-500' : 'bg-gray-200'}`}
                title={cat.is_important ? 'Remove from Important' : 'Add to Important'}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
                  ${cat.is_important ? 'right-0.5' : 'left-0.5'}`} />
              </div>

              {/* Delete */}
              <button onClick={() => deleteCategory(cat.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Color guide */}
      <div className="mt-4 bg-gray-50 border border-gray-100 rounded-xl p-4">
        <div className="text-xs font-bold text-gray-400 uppercase mb-2">How it works</div>
        <div className="flex flex-col gap-1.5 text-xs text-gray-500">
          <div>🎨 <b>Color</b> — shown on calendar. Click the colored circle to change.</div>
          <div>⚡ <b>Important</b> — toggle on to show in Dashboard Important section.</div>
          <div>✏️ <b>Icon</b> — hover over a category to see icon options.</div>
          <div>🗑️ <b>Delete</b> — hover to see delete button. Existing events keep category name.</div>
        </div>
      </div>
    </div>
  )
}
