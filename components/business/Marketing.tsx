'use client'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal, { Field } from '@/components/planner/Modal'
import { BP, Empty, Stat, db, num, run, today } from './ui'

const DEFAULT_STAGES = [{ key: 'idea', label: '💡 Idea' }, { key: 'creating', label: '🎬 Creating' }, { key: 'scheduled', label: '📅 Scheduled' }, { key: 'posted', label: '✅ Posted' }]

export default function Marketing(bp: BP) {
  const { d, userId } = bp
  const stages: { key: string; label: string }[] = Array.isArray(d.biz.content_stages) && d.biz.content_stages.length ? d.biz.content_stages : DEFAULT_STAGES
  const last = stages[stages.length - 1].key
  const [f, setF] = useState<any>(null), [editStages, setEditStages] = useState(false)
  const rows = d.content
  const posted = rows.filter(r => r.status === last)
  const eng = (r: any) => (+r.likes || 0) + (+r.comments || 0)
  const best = [...posted].sort((a, b) => (+b.views || 0) - (+a.views || 0))[0]
  const byPlat: Record<string, { n: number; views: number; orders: number }> = {}
  posted.forEach(r => { const k = r.platform || 'Other'; const x = (byPlat[k] ||= { n: 0, views: 0, orders: 0 }); x.n++; x.views += +r.views || 0; x.orders += +r.orders || 0 })
  const avgViews = posted.length ? Math.round(posted.reduce((s, r) => s + (+r.views || 0), 0) / posted.length) : 0

  async function save() {
    if (!f.title.trim()) return bp.toast('Give it a title.')
    const row = { title: f.title.trim(), platform: f.platform || null, status: f.status, scheduled_date: f.scheduled_date || null, notes: f.notes || null, link: f.link || null, post_type: f.post_type || null, views: num(f.views), likes: num(f.likes), comments: num(f.comments), orders: num(f.orders), done_date: f.status === last ? (f.done_date || today()) : null }
    const ok = await run(f.id ? db.from('content_ideas').update(row).eq('id', f.id).eq('user_id', userId) : db.from('content_ideas').insert({ ...row, user_id: userId, business_id: d.biz.id, idea_date: today() }), bp, 'Saved.')
    if (ok) setF(null)
  }
  async function move(r: any, status: string) { await run(db.from('content_ideas').update({ status, done_date: status === last ? today() : null }).eq('id', r.id).eq('user_id', userId), bp, '') }
  async function saveStages(next: any[]) { await run(db.from('businesses').update({ content_stages: next }).eq('id', d.biz.id).eq('user_id', userId), bp, '') }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><div><h2 className="font-bold">Marketing & Content</h2><p className="text-xs text-gray-500">Plan posts, move them along your pipeline, and log how each one performed.</p></div>
        <button className="btn-gray btn-sm ml-auto text-xs" onClick={() => setEditStages(true)}>Edit stages</button>
        <button className="btn-blue btn-sm" onClick={() => setF({ title: '', platform: 'TikTok', status: stages[0].key, scheduled_date: '', notes: '', link: '', post_type: '', views: '', likes: '', comments: '', orders: '' })}>+ Content</button></div>

      {posted.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Posted" value={String(posted.length)} /><Stat label="Avg views / post" value={avgViews.toLocaleString()} /><Stat label="Total orders from content" value={String(posted.reduce((s, r) => s + (+r.orders || 0), 0))} tone="green" /><Stat label="Best post" value={best ? (+best.views || 0).toLocaleString() + ' views' : '—'} sub={best?.title} /></div>}

      {rows.length === 0 ? <Empty icon="🎬" title="No content yet" text="Add your first idea — a TikTok, Reel, product photo set, or promo." /> : (
        <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(210px, 1fr))` }}>
          {stages.map(s => (
            <div key={s.key} className="rounded-2xl bg-gray-50 p-2 space-y-2 min-h-[120px]">
              <div className="px-2 pt-1 text-xs font-bold text-gray-500 flex justify-between"><span>{s.label}</span><span className="text-gray-300">{rows.filter(r => r.status === s.key).length}</span></div>
              {rows.filter(r => r.status === s.key).map(r => (
                <div key={r.id} className="card p-3 text-xs space-y-1 cursor-pointer" onClick={() => setF({ ...r, scheduled_date: r.scheduled_date || '', notes: r.notes || '', link: r.link || '', post_type: r.post_type || '' })}>
                  <div className="font-semibold text-sm leading-snug">{r.title}</div><div className="text-gray-400">{r.platform}{r.scheduled_date ? ` · ${r.scheduled_date}` : ''}</div>
                  {s.key === last && <div className="text-gray-500">👁 {(+r.views || 0).toLocaleString()} · ❤️ {eng(r)} · 🛒 {+r.orders || 0}</div>}
                  <select className="sel text-[11px] w-full" value={r.status} onClick={e => e.stopPropagation()} onChange={e => move(r, e.target.value)}>{stages.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
                </div>))}
            </div>))}
        </div>)}

      {Object.keys(byPlat).length > 0 && <div className="card p-4"><div className="font-bold text-sm mb-2">Performance by platform</div>{Object.entries(byPlat).map(([k, v]) => <div key={k} className="flex justify-between text-xs py-1.5 border-t border-gray-50 first:border-0"><b>{k}</b><span className="text-gray-500">{v.n} posts · {Math.round(v.views / v.n).toLocaleString()} avg views · {v.orders} orders</span></div>)}
        <p className="text-[11px] text-gray-400 mt-2">{best && +best.views > avgViews * 2 ? `“${best.title}” did ${Math.round(+best.views / Math.max(1, avgViews))}× your average — make more like it.` : 'Log views and orders on posted content to see what works.'}</p></div>}

      {f && <Modal title={f.id ? 'Edit content' : 'New content'} onClose={() => setF(null)} wide><div className="grid grid-cols-2 gap-3">
        <Field label="Title" className="col-span-2"><input className="inp w-full" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Platform"><input className="inp w-full" list="mk-plat" value={f.platform} onChange={e => setF({ ...f, platform: e.target.value })} /><datalist id="mk-plat">{['TikTok', 'Instagram', 'Shopee Live', 'YouTube', 'WhatsApp', 'Facebook'].map(x => <option key={x} />)}</datalist></Field>
        <Field label="Stage"><select className="sel w-full" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{stages.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
        <Field label="Post date"><input type="date" className="inp w-full" value={f.scheduled_date} onChange={e => setF({ ...f, scheduled_date: e.target.value })} /></Field>
        <Field label="Link"><input className="inp w-full" value={f.link} onChange={e => setF({ ...f, link: e.target.value })} /></Field>
        {([['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments'], ['orders', 'Orders it brought']] as const).map(([k, l]) => <Field key={k} label={l}><input type="number" className="inp w-full" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></Field>)}
        <Field label="Notes" className="col-span-2"><textarea rows={2} className="inp w-full" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      </div><div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={save}>Save</button>{f.id && <button className="btn-gray text-red-600" onClick={async () => { if (confirm('Delete?')) { await run(db.from('content_ideas').delete().eq('id', f.id).eq('user_id', userId), bp, 'Deleted.'); setF(null) } }}><Trash2 size={15} /></button>}<button className="btn-gray flex-1" onClick={() => setF(null)}>Cancel</button></div></Modal>}

      {editStages && <StageEditor stages={stages} onClose={() => setEditStages(false)} onSave={async n => { await saveStages(n); setEditStages(false) }} />}
    </div>
  )
}

function StageEditor({ stages, onSave, onClose }: { stages: { key: string; label: string }[]; onSave: (s: any[]) => void; onClose: () => void }) {
  const [list, setList] = useState(stages)
  return <Modal title="Pipeline stages" subtitle="Rename, add or remove columns. The last column means “posted / done”." onClose={onClose}>
    <div className="space-y-2">{list.map((s, i) => <div key={s.key} className="flex gap-2"><input className="inp flex-1" value={s.label} onChange={e => setList(list.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
      <button className="btn-gray btn-sm" disabled={i === 0} onClick={() => { const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setList(n) }}>↑</button>
      <button className="btn-gray btn-sm" disabled={list.length <= 2} onClick={() => setList(list.filter((_, j) => j !== i))}>✕</button></div>)}</div>
    <button className="text-xs text-teal-600 font-semibold mt-2" onClick={() => setList([...list.slice(0, -1), { key: 'st' + Date.now(), label: 'New stage' }, list[list.length - 1]])}>+ Add stage</button>
    <div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={() => onSave(list)}>Save</button><button className="btn-gray flex-1" onClick={onClose}>Cancel</button></div></Modal>
}
