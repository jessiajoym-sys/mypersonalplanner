'use client'
import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal, { Field } from '@/components/planner/Modal'
import { periodRange, platformStats } from '@/lib/business'
import { BP, Empty, Stat, acctOptions, cur, db, m$, num, run, today } from './ui'

const PRESETS = [{ name: 'Shopee', emoji: '🟠', fee_pct: 8 }, { name: 'Tokopedia', emoji: '🟢', fee_pct: 6 }, { name: 'TikTok Shop', emoji: '🎵', fee_pct: 6 }, { name: 'WhatsApp / Direct', emoji: '💬', fee_pct: 0 }]

export default function Platforms(bp: BP) {
  const { d, userId } = bp
  const [range, setRange] = useState<'month' | 'quarter' | 'year'>('month')
  const [pf, setPf] = useState<any>(null), [adForm, setAdForm] = useState<any>(null)
  const p = periodRange(range, new Date())
  const stats = useMemo(() => platformStats(d, p.from, p.to), [d, p.from, p.to])
  const totalRev = stats.reduce((s, x) => s + x.revenue, 0)

  async function savePlatform() {
    if (!pf.name.trim()) return bp.toast('Give the platform a name.')
    const row = { name: pf.name.trim(), emoji: pf.emoji || '🛒', fee_pct: num(pf.fee_pct), fixed_fee: num(pf.fixed_fee) }
    const ok = await run(pf.id ? db.from('biz_platforms').update(row).eq('id', pf.id).eq('user_id', userId) : db.from('biz_platforms').insert({ ...row, user_id: userId, business_id: d.biz.id }), bp, 'Platform saved.')
    if (ok) setPf(null)
  }
  async function saveAd() {
    if (!adForm.platform || num(adForm.spend) <= 0) return bp.toast('Choose a platform and enter the ad spend.')
    const row = { user_id: userId, business_id: d.biz.id, platform: adForm.platform, campaign: adForm.campaign || null, period_start: adForm.start, period_end: adForm.end, spend: num(adForm.spend), impressions: num(adForm.impressions), clicks: num(adForm.clicks), orders: num(adForm.orders), ad_sales: num(adForm.ad_sales) }
    if (!(await run(db.from('biz_ads').insert(row), bp, ''))) return
    if (adForm.record) await db.from('transactions').insert({ user_id: userId, business_id: d.biz.id, type: 'expense', amount: num(adForm.spend), currency: cur(d), category: 'Advertising', merchant: adForm.platform, description: adForm.campaign || 'Ad spend', bk_class: 'opex', platform: adForm.platform, transaction_date: adForm.end, from_account_id: adForm.account || null, source: 'manual' })
    await bp.reload(); bp.toast('Ad performance saved.'); setAdForm(null)
  }
  const accts = acctOptions(bp.accounts, cur(d))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">{(['month', 'quarter', 'year'] as const).map(r => <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-md font-semibold capitalize ${range === r ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{r === 'month' ? 'This month' : r === 'quarter' ? 'This quarter' : 'This year'}</button>)}</div>
        <button className="btn-blue btn-sm ml-auto" onClick={() => setPf({ name: '', emoji: '🛒', fee_pct: 0, fixed_fee: 0 })}>+ Platform</button>
        <button className="btn-gray btn-sm" disabled={!d.platforms.length} onClick={() => setAdForm({ platform: d.platforms[0]?.name, campaign: '', start: p.from, end: today(), spend: '', impressions: '', clicks: '', orders: '', ad_sales: '', record: true, account: accts[0]?.id || '' })}>+ Ad results</button>
      </div>

      {d.platforms.length === 0 && (
        <div className="card p-6 space-y-3"><div className="font-bold">Add the places you sell</div><p className="text-sm text-gray-500">Each platform has its own fee. When you record a sale on it, the fee is calculated and booked automatically.</p>
          <div className="flex flex-wrap gap-2">{PRESETS.map(x => <button key={x.name} className="btn-gray btn-sm" onClick={() => setPf({ ...x, fixed_fee: 0 })}>{x.emoji} {x.name}</button>)}</div>
          <p className="text-[11px] text-gray-400">Fee percentages are just starting points — check your seller dashboard and edit them.</p></div>
      )}

      {d.platforms.length > 0 && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{d.platforms.map(x => (
        <div key={x.id} className="card p-4 flex items-center gap-3"><div className="text-2xl">{x.emoji}</div><div className="flex-1 min-w-0"><b>{x.name}</b><div className="text-xs text-gray-500">{x.fee_pct}% fee{num(x.fixed_fee) ? ` + ${m$(d, +x.fixed_fee)}/order` : ''}</div></div>
          <button className="text-xs text-teal-600 font-semibold" onClick={() => setPf(x)}>Edit</button>
          <button aria-label="Delete" className="text-gray-300 hover:text-red-500" onClick={async () => { if (confirm(`Remove ${x.name}? Past sales stay in your books.`)) await run(db.from('biz_platforms').delete().eq('id', x.id).eq('user_id', userId), bp, 'Removed.') }}><Trash2 size={14} /></button></div>))}</div>}

      {stats.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Sales (all platforms)" value={m$(d, totalRev)} />
            <Stat label="Platform fees" value={m$(d, stats.reduce((s, x) => s + x.fees, 0))} tone="amber" />
            <Stat label="Ad spend" value={m$(d, stats.reduce((s, x) => s + x.adSpend, 0))} tone="amber" />
            <Stat label="Left after fees & ads" value={m$(d, stats.reduce((s, x) => s + x.afterCosts, 0))} tone="green" />
          </div>
          <div className="card overflow-x-auto"><table className="w-full text-xs min-w-[640px]">
            <thead className="bg-gray-50 text-gray-500"><tr className="text-left"><th className="p-2">Platform</th><th className="p-2 text-right">Sales</th><th className="p-2 text-right">Share</th><th className="p-2 text-right">Fees</th><th className="p-2 text-right">Ads</th><th className="p-2 text-right">After costs</th><th className="p-2 text-right">ROAS</th></tr></thead>
            <tbody>{stats.map(s => <tr key={s.name} className="border-t border-gray-50"><td className="p-2 font-semibold">{s.name}</td><td className="p-2 text-right">{m$(d, s.revenue)}</td><td className="p-2 text-right text-gray-400">{totalRev ? Math.round(s.revenue / totalRev * 100) : 0}%</td><td className="p-2 text-right">{m$(d, s.fees)} <span className="text-gray-400">({s.feePct.toFixed(1)}%)</span></td><td className="p-2 text-right">{m$(d, s.adSpend)}</td><td className={`p-2 text-right font-semibold ${s.afterCosts < 0 ? 'text-red-500' : 'text-green-600'}`}>{m$(d, s.afterCosts)} <span className="text-gray-400 font-normal">({s.afterPct.toFixed(0)}%)</span></td><td className="p-2 text-right">{s.roas ? s.roas.toFixed(1) + '×' : '—'}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {stats.some(s => s.verdict) && (
        <div className="card p-4 space-y-3"><div className="font-bold text-sm">📣 Ad performance check</div>
          {stats.filter(s => s.verdict).map(s => (
            <div key={s.name} className="text-sm border-t border-gray-50 pt-3 first:border-0 first:pt-0"><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-1"><b className="text-gray-900 text-sm">{s.name}</b><span>Spend {m$(d, s.adSpend)}</span><span>Ad sales {m$(d, s.adSales)}</span>{s.clicks > 0 && <span>CTR {s.ctr.toFixed(1)}% · CPC {m$(d, s.cpc)}</span>}{s.orders > 0 && <span>Cost/order {m$(d, s.cpa)}</span>}<span>Break-even ROAS ≈ {s.breakEven.toFixed(1)}×</span></div><p>{s.verdict}</p></div>))}
          <p className="text-[11px] text-gray-400">This is a rule-based check using your own margins and fees, not a prediction.</p></div>
      )}

      {d.ads.length > 0 && <div className="card"><div className="px-4 py-3 text-sm font-bold border-b border-gray-100">Ad records</div>{d.ads.slice(0, 15).map(a => (
        <div key={a.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 text-xs"><span className="w-36 text-gray-400">{a.period_start} → {a.period_end}</span><span className="flex-1 truncate"><b>{a.platform}</b>{a.campaign && ` · ${a.campaign}`}</span><span>{m$(d, +a.spend)} → {m$(d, +a.ad_sales)}</span><b className={+a.spend && +a.ad_sales / +a.spend < 1 ? 'text-red-500' : 'text-green-600'}>{+a.spend ? (+a.ad_sales / +a.spend).toFixed(1) : '—'}×</b>
          <button aria-label="Delete" className="text-gray-300 hover:text-red-500" onClick={async () => { if (confirm('Delete this ad record?')) await run(db.from('biz_ads').delete().eq('id', a.id).eq('user_id', userId), bp, 'Deleted.') }}><Trash2 size={13} /></button></div>))}</div>}

      {stats.length === 0 && d.platforms.length > 0 && <Empty icon="🛒" title="No platform sales yet" text="Record a sale and pick a platform — it will show up here." />}

      {pf && <Modal title={pf.id ? 'Edit platform' : 'Add platform'} onClose={() => setPf(null)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input className="inp w-full" value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} /></Field>
          <Field label="Emoji"><input className="inp w-full" value={pf.emoji} onChange={e => setPf({ ...pf, emoji: e.target.value })} /></Field>
          <Field label="Fee (% of sale)" hint="Commission + payment + service fees"><input type="number" className="inp w-full" value={pf.fee_pct} onChange={e => setPf({ ...pf, fee_pct: e.target.value })} /></Field>
          <Field label={`Fixed fee per order (${cur(d)})`}><input type="number" className="inp w-full" value={pf.fixed_fee} onChange={e => setPf({ ...pf, fixed_fee: e.target.value })} /></Field>
        </div><div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={savePlatform}>Save</button><button className="btn-gray flex-1" onClick={() => setPf(null)}>Cancel</button></div></Modal>}

      {adForm && <Modal title="Ad results" subtitle="Copy the numbers from the platform's ads dashboard." onClose={() => setAdForm(null)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform"><select className="sel w-full" value={adForm.platform} onChange={e => setAdForm({ ...adForm, platform: e.target.value })}>{d.platforms.map(x => <option key={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Campaign (optional)"><input className="inp w-full" value={adForm.campaign} onChange={e => setAdForm({ ...adForm, campaign: e.target.value })} /></Field>
          <Field label="From"><input type="date" className="inp w-full" value={adForm.start} onChange={e => setAdForm({ ...adForm, start: e.target.value })} /></Field>
          <Field label="To"><input type="date" className="inp w-full" value={adForm.end} onChange={e => setAdForm({ ...adForm, end: e.target.value })} /></Field>
          {([['spend', 'Ad spend'], ['ad_sales', 'Sales from ads'], ['impressions', 'Impressions'], ['clicks', 'Clicks'], ['orders', 'Orders from ads']] as const).map(([k, l]) => <Field key={k} label={l}><input type="number" className="inp w-full" value={adForm[k]} onChange={e => setAdForm({ ...adForm, [k]: e.target.value })} /></Field>)}
          <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={adForm.record} onChange={e => setAdForm({ ...adForm, record: e.target.checked })} /> Also record the spend as an expense in my books</label>
        </div><div className="flex gap-2 mt-4"><button className="btn-blue flex-1" onClick={saveAd}>Save</button><button className="btn-gray flex-1" onClick={() => setAdForm(null)}>Cancel</button></div></Modal>}
    </div>
  )
}
