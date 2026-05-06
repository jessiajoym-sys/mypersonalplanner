'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')

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
              <select className="sel w-full">
                <option>English</option>
                <option>Bahasa Indonesia</option>
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
              { label: '📊 Export all transactions (Excel)', desc: 'All financial data as .xlsx' },
              { label: '📋 Export To Do List (Excel)', desc: 'All tasks and their status' },
              { label: '📅 Export Calendar events (CSV)', desc: 'All events as .csv' },
              { label: '📄 Export full backup (JSON)', desc: 'Complete data backup' },
            ].map((e, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <div className="text-sm font-semibold">{e.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{e.desc}</div>
                </div>
                <button className="btn-gray btn-sm">Download</button>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl">
            <div className="text-sm font-bold text-red-500 mb-1">⚠️ Danger Zone</div>
            <div className="text-xs text-red-400 mb-3">These actions cannot be undone</div>
            <button className="btn-red btn-sm">Delete all data</button>
          </div>
        </div>
      )}
    </div>
  )
}
