'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { exportAll, wipeAll } from '@/lib/reset'

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [result, setResult] = useState<any>(null)

  const [backup, setBackup] = useState<{ url: string; name: string; rows: number; tables: number } | null>(null)
  const [backupMsg, setBackupMsg] = useState('')

  async function downloadBackup() {
    setBackupMsg('Preparing your backup…'); setBackup(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setBackupMsg('Please sign in again.'); return }
      const data = await exportAll(user.id)
      const tables = Object.keys(data).length, rows = Object.values(data).reduce((n, r) => n + r.length, 0)
      const name = `myplanner-backup-${new Date().toISOString().slice(0, 10)}.json`
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      setBackup({ url, name, rows, tables })
      setBackupMsg(rows === 0 ? 'Nothing to back up yet — your planner has no data.' : `Backup ready: ${rows} rows from ${tables} tables.`)
      // 1) phones: open the share sheet so you can save to Files / send to yourself
      try {
        const file = new File([blob], name, { type: 'application/json' })
        const nav: any = navigator
        if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: name }); return }
      } catch { /* user cancelled or unsupported → fall through */ }
      // 2) computers: normal download (anchor must be in the page for some browsers)
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
    } catch (e: any) { setBackupMsg('Could not create the backup: ' + (e?.message || 'unknown error')) }
  }
  async function deleteEverything() {
    if (confirmText.trim() !== 'DELETE') return
    if (!confirm('Last check: this permanently deletes ALL your planner data. Continue?')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return alert('Please sign in again.')
    setBusy(true); setResult(null)
    const r = await wipeAll(user.id, setStep)
    setBusy(false); setStep(''); setConfirmText(''); setResult(r)
  }

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data)
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').upsert({ ...profile, id: user.id })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const tabs = [
    { id: 'profile', label: '👤 Profile' },
    { id: 'budget', label: '💰 Budget' },
    { id: 'notifications', label: '🔔 Notifications' },
    { id: 'data', label: '📤 Data & Export' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Settings ⚙️</h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage your profile and preferences</p>
        </div>
        {saved && <div className="bg-green-50 text-green-600 text-xs font-semibold px-3 py-1.5 rounded-full border border-green-200">✅ Saved!</div>}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${activeTab === t.id ? 'bg-blue-500 text-white' : 'bg-white border border-gray-100 text-gray-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="card p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Display Name</label>
              <input className="inp" value={profile.name || ''} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="Your name" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Timezone</label>
              <select className="sel w-full" value={profile.timezone || 'Asia/Jakarta'} onChange={e => setProfile({ ...profile, timezone: e.target.value })}>
                <option value="Asia/Jakarta">Jakarta (WIB, UTC+7)</option>
                <option value="Asia/Shanghai">Shanghai (CST, UTC+8)</option>
                <option value="Asia/Singapore">Singapore (SGT, UTC+8)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Main Currency</label>
              <select className="sel w-full" value={profile.currency || 'IDR'} onChange={e => setProfile({ ...profile, currency: e.target.value })}>
                <option value="IDR">IDR — Indonesian Rupiah</option>
                <option value="RMB">RMB — Chinese Yuan</option>
                <option value="USD">USD — US Dollar</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Language</label>
              <select className="sel w-full" value="English" disabled>
                <option>English</option>
              </select>
            </div>
          </div>
          <button className="btn-blue mt-4" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {activeTab === 'budget' && (
        <div className="card p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Monthly Budget (IDR)</label>
              <input className="inp" type="number" value={profile.monthly_budget || ''} onChange={e => setProfile({ ...profile, monthly_budget: e.target.value })} placeholder="e.g. 5000000" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Monthly RMB Budget</label>
              <input className="inp" type="number" value={profile.rmb_monthly_budget || ''} onChange={e => setProfile({ ...profile, rmb_monthly_budget: e.target.value })} placeholder="e.g. 3000" />
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 mt-4 text-xs text-blue-600">
            💡 Setting a budget enables daily budget tracking on your dashboard. You'll get alerts when approaching your limit.
          </div>
          <button className="btn-blue mt-4" onClick={save} disabled={saving}>Save Budget</button>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="card p-5">
          <div className="flex flex-col gap-4">
            {[
              { label: 'Deadline approaching (1 day before)', key: 'notif_deadline', default: true },
              { label: 'CC payment due (7 days before)', key: 'notif_cc', default: true },
              { label: 'Monthly review reminder', key: 'notif_monthly', default: true },
              { label: 'Content idea not executed (2 weeks)', key: 'notif_content', default: true },
              { label: 'Daily habit reminder', key: 'notif_habit', default: false },
              { label: 'Budget alert (over 80%)', key: 'notif_budget', default: true },
            ].map(n => (
              <div key={n.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm">{n.label}</span>
                <div className={`w-10 h-6 rounded-full cursor-pointer transition-all relative ${n.default ? 'bg-blue-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${n.default ? 'right-0.5' : 'left-0.5'}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'data' && (
        <div className="card p-5">
          <div className="text-sm font-semibold mb-4">Export & Backup</div>
          <div className="flex flex-col gap-3">
            {[
              { label: '📄 Download full backup (JSON)', desc: 'Everything you own: tasks, events, finance, businesses, habits… Keep this before deleting.', onClick: downloadBackup },
            ].map((e, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <div className="text-sm font-semibold">{e.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{e.desc}</div>
                </div>
                <button className="btn-gray btn-sm" onClick={e.onClick}>Download</button>
              </div>
            ))}
          </div>
          {backupMsg && (
            <div className="mt-3 text-xs rounded-xl bg-blue-50 text-blue-700 p-3 space-y-1">
              <div>{backupMsg}</div>
              {backup && backup.rows > 0 && <div>Didn’t download? <a href={backup.url} download={backup.name} className="underline font-semibold">Tap here to save the file</a> · <a href={backup.url} target="_blank" rel="noreferrer" className="underline font-semibold">open it in a new tab</a> (then copy/save the text).</div>}
            </div>
          )}
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl">
            <div className="text-sm font-bold text-red-500 mb-1">⚠️ Danger Zone</div>
            <div className="text-xs text-red-400 mb-3">Deletes ALL your planner data (tasks, events, logs, habits, projects, finance, businesses, uploaded receipts). Your login and settings stay. This cannot be undone — download a backup first.</div>
            <div className="flex flex-wrap gap-2 items-center">
              <input className="inp text-xs w-56" placeholder='Type DELETE to confirm' value={confirmText} onChange={e => setConfirmText(e.target.value)} disabled={busy} />
              <button className="btn-red btn-sm" disabled={busy || confirmText.trim() !== 'DELETE'} onClick={deleteEverything}>{busy ? `Deleting… ${step}` : 'Delete all data'}</button>
            </div>
            {result && (
              <div className="mt-3 text-xs space-y-1">
                <div className="text-green-700 font-semibold">✅ Done — {result.cleared.length} tables cleared, {result.files} uploaded files removed. Refresh the page to start fresh.</div>
                {result.failed.length > 0 && <div className="text-red-600">Could not clear: {result.failed.join(' · ')}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
