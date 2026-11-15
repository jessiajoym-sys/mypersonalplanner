'use client'
import { useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, X } from 'lucide-react'
import type { FCat, FinanceLists } from '@/lib/financeLists'

const KINDS: { k: FCat['kind']; label: string; hint: string }[] = [
  { k: 'category', label: 'Categories', hint: 'Food, Shopping, Marketing… (also used by Budget)' },
  { k: 'subcategory', label: 'Subcategories', hint: 'Each one belongs to a category' },
  { k: 'purpose', label: 'Purposes', hint: 'Personal, Business, Travel…' },
]

/** Add / rename / archive categories, subcategories and purposes in one place. */
export default function CategoryManager({ lists, onToast, onClose }: { lists: FinanceLists; onToast: (m: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState<FCat['kind']>('category')
  const [name, setName] = useState(''), [scope, setScope] = useState<FCat['scope']>('both'), [parent, setParent] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const parentName = (id: string | null) => lists.rows.find(r => r.id === id)?.name || ''
  const list = lists.rows.filter(r => r.kind === kind && (showArchived || !r.is_archived))
  const say = (e: string | null, ok: string) => onToast(e ? 'Could not save: ' + e : ok)

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[88vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3"><div><h2 className="font-bold text-lg">Manage categories</h2><p className="text-xs text-gray-500">Shared by Transactions, Budget and imports. Archiving hides a name from new choices but keeps old transactions and budgets intact.</p></div><button onClick={onClose} className="text-gray-400" aria-label="Close"><X size={18} /></button></div>
        {lists.missing && <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-3 mb-3">Run <b>lib/planner-upgrade-8.sql</b> in Supabase (SQL Editor) to unlock adding, renaming and archiving. Until then the default lists are used.</div>}
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs mb-1">{KINDS.map(x => <button key={x.k} onClick={() => setKind(x.k)} className={`flex-1 px-3 py-1.5 rounded-md font-semibold ${kind === x.k ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{x.label}</button>)}</div>
        <p className="text-[11px] text-gray-400 mb-3">{KINDS.find(x => x.k === kind)?.hint}</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <input className="inp text-xs flex-1 min-w-[140px]" placeholder={`New ${kind}…`} value={name} onChange={e => setName(e.target.value)}
            onKeyDown={async e => { if (e.key === 'Enter') { const r = await lists.add(kind, name, scope, parent); say(r, 'Added.'); if (!r) setName('') } }} />
          {kind === 'category' && <select className="sel text-xs" value={scope} onChange={e => setScope(e.target.value as any)}><option value="both">Personal + Business</option><option value="personal">Personal</option><option value="business">Business</option></select>}
          {kind === 'subcategory' && <select className="sel text-xs" value={parent} onChange={e => setParent(e.target.value)}><option value="">Under category…</option>{lists.categories.map(c => <option key={c}>{c}</option>)}</select>}
          <button className="btn-blue btn-sm text-xs flex items-center gap-1" onClick={async () => { const r = await lists.add(kind, name, scope, parent); say(r, 'Added.'); if (!r) setName('') }}><Plus size={13} /> Add</button>
        </div>
        <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl">
          {list.length === 0 && <div className="p-4 text-center text-xs text-gray-400">Nothing here yet.</div>}
          {list.map(c => (
            <div key={c.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${c.is_archived ? 'opacity-50' : ''}`}>
              <span className="flex-1 truncate">{c.name}{c.kind === 'subcategory' && <span className="text-[11px] text-gray-400"> · {parentName(c.parent_id)}</span>}{c.kind === 'category' && c.scope !== 'both' && <span className="text-[11px] text-gray-400"> · {c.scope}</span>}</span>
              <button className="text-gray-400 hover:text-teal-600" title="Rename" onClick={async () => { const v = prompt('Rename to:', c.name); if (v) say(await lists.rename(c, v), 'Renamed (existing transactions updated).') }}><Pencil size={14} /></button>
              {c.is_archived
                ? <button className="text-gray-400 hover:text-teal-600" title="Restore" onClick={async () => say(await lists.setArchived(c, false), 'Restored.')}><ArchiveRestore size={14} /></button>
                : <button className="text-gray-400 hover:text-red-500" title="Archive" onClick={async () => say(await lists.setArchived(c, true), 'Archived. Old data keeps the name.')}><Archive size={14} /></button>}
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 mt-3"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>
    </div>
  )
}
