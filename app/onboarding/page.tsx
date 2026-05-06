'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const defaultHabits = [
  { name: 'Drink water 1-2L', icon: '💧' },
  { name: 'Study Mandarin', icon: '📖' },
  { name: 'Exercise 30 min', icon: '🏃' },
  { name: 'Social media < 30 min', icon: '📱' },
  { name: 'Daily devotion', icon: '📿' },
  { name: 'Healthy food', icon: '🥗' },
]

const defaultBusinesses = [
  { name: 'Sambal Mak Tak', emoji: '🌶️', color: '#EF4444' },
  { name: 'Polar Bed', emoji: '🛏️', color: '#5B7FFF' },
  { name: 'Chishee Blanket', emoji: '🧣', color: '#8B5CF6' },
  { name: 'Homemate', emoji: '🏠', color: '#22C55E' },
  { name: 'Jastip China', emoji: '✈️', color: '#14B8A6' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('Asia/Jakarta')
  const [selectedHabits, setSelectedHabits] = useState<string[]>(['Drink water 1-2L', 'Daily devotion'])
  const [selectedBiz, setSelectedBiz] = useState<string[]>(['Sambal Mak Tak', 'Polar Bed'])
  const [loading, setLoading] = useState(false)

  async function finish() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Update profile
    await supabase.from('profiles').upsert({
      id: user.id, name: name || user.email?.split('@')[0] || 'User',
      timezone, onboarding_done: true
    })

    // Insert habits
    const habits = defaultHabits.filter(h => selectedHabits.includes(h.name))
    if (habits.length > 0) {
      await supabase.from('habits').insert(habits.map((h, i) => ({
        name: h.name, icon: h.icon, user_id: user.id, sort_order: i
      })))
    }

    // Insert businesses
    const bizList = defaultBusinesses.filter(b => selectedBiz.includes(b.name))
    if (bizList.length > 0) {
      await supabase.from('businesses').insert(bizList.map((b, i) => ({
        name: b.name, emoji: b.emoji, color: b.color, user_id: user.id, sort_order: i, status: 'active'
      })))
    }

    // Insert default calendar categories
    await supabase.from('calendar_categories').insert([
      { name: 'Meeting', color: '#22C55E', icon: '📅', is_important: true, user_id: user.id },
      { name: 'Exam', color: '#5B7FFF', icon: '📝', is_important: true, user_id: user.id },
      { name: 'Deadline', color: '#EF4444', icon: '⏰', is_important: true, user_id: user.id },
      { name: 'Birthday', color: '#FF6B8A', icon: '🎂', is_important: true, user_id: user.id },
      { name: 'Church', color: '#8B5CF6', icon: '📿', is_important: true, user_id: user.id },
      { name: 'Travel', color: '#14B8A6', icon: '✈️', is_important: false, user_id: user.id },
      { name: 'Payment Due', color: '#F97316', icon: '💳', is_important: true, user_id: user.id },
      { name: 'Personal', color: '#9090A8', icon: '🌸', is_important: false, user_id: user.id },
    ])

    router.push('/')
  }

  const steps = [
    { num: 1, label: 'Welcome' },
    { num: 2, label: 'About You' },
    { num: 3, label: 'Habits' },
    { num: 4, label: 'Business' },
    { num: 5, label: 'Done!' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Progress */}
        <div className="flex items-center gap-0 px-8 pt-6 pb-0">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all
                ${step > s.num ? 'bg-green-500 text-white' : step === s.num ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {step > s.num ? '✓' : s.num}
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${step > s.num ? 'bg-green-500' : 'bg-gray-100'}`} />}
            </div>
          ))}
        </div>

        <div className="p-8">
          {/* STEP 1: Welcome */}
          {step === 1 && (
            <div className="fade-in">
              <div className="text-5xl text-center mb-4">✨</div>
              <h2 className="text-2xl font-bold text-center mb-2">Welcome to myPlanner!</h2>
              <p className="text-gray-400 text-sm text-center mb-6 leading-relaxed">
                Your all-in-one life planner for goals, habits, business, and finances. Let's set up your account in 2 minutes!
              </p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { icon: '📅', label: 'Calendar & Events' },
                  { icon: '✅', label: 'To Do List' },
                  { icon: '💧', label: 'Daily Habits' },
                  { icon: '💰', label: 'Financial Tracker' },
                  { icon: '💼', label: 'Business Planner' },
                  { icon: '🗺️', label: 'Life Goals' },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                    <span>{f.icon}</span>
                    <span className="text-xs font-semibold">{f.label}</span>
                  </div>
                ))}
              </div>
              <button className="btn-blue w-full py-3" onClick={() => setStep(2)}>Let's go! →</button>
            </div>
          )}

          {/* STEP 2: About You */}
          {step === 2 && (
            <div className="fade-in">
              <h2 className="text-xl font-bold mb-1">About you 👋</h2>
              <p className="text-gray-400 text-sm mb-6">Tell us a bit about yourself</p>
              <div className="mb-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Your name</label>
                <input className="inp" placeholder="e.g. Jessie" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="mb-6">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">Your timezone</label>
                <select className="sel w-full" value={timezone} onChange={e => setTimezone(e.target.value)}>
                  <option value="Asia/Jakarta">Jakarta (WIB, UTC+7)</option>
                  <option value="Asia/Shanghai">Shanghai (CST, UTC+8)</option>
                  <option value="Asia/Singapore">Singapore (SGT, UTC+8)</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button className="btn-gray flex-1" onClick={() => setStep(1)}>← Back</button>
                <button className="btn-blue flex-1" onClick={() => setStep(3)}>Next →</button>
              </div>
            </div>
          )}

          {/* STEP 3: Habits */}
          {step === 3 && (
            <div className="fade-in">
              <h2 className="text-xl font-bold mb-1">Daily habits 💧</h2>
              <p className="text-gray-400 text-sm mb-4">Which habits do you want to track? (you can change this later)</p>
              <div className="flex flex-col gap-2 mb-6">
                {defaultHabits.map(h => (
                  <div key={h.name} onClick={() => setSelectedHabits(prev =>
                    prev.includes(h.name) ? prev.filter(x => x !== h.name) : [...prev, h.name])}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all
                      ${selectedHabits.includes(h.name) ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <span className="text-xl">{h.icon}</span>
                    <span className="flex-1 text-sm font-medium">{h.name}</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs
                      ${selectedHabits.includes(h.name) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200'}`}>
                      {selectedHabits.includes(h.name) && '✓'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn-gray flex-1" onClick={() => setStep(2)}>← Back</button>
                <button className="btn-blue flex-1" onClick={() => setStep(4)}>Next →</button>
              </div>
            </div>
          )}

          {/* STEP 4: Business */}
          {step === 4 && (
            <div className="fade-in">
              <h2 className="text-xl font-bold mb-1">Your businesses 💼</h2>
              <p className="text-gray-400 text-sm mb-4">Which businesses do you want to track?</p>
              <div className="flex flex-col gap-2 mb-6">
                {defaultBusinesses.map(b => (
                  <div key={b.name} onClick={() => setSelectedBiz(prev =>
                    prev.includes(b.name) ? prev.filter(x => x !== b.name) : [...prev, b.name])}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all
                      ${selectedBiz.includes(b.name) ? 'border-orange-400 bg-orange-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <span className="text-xl">{b.emoji}</span>
                    <span className="flex-1 text-sm font-medium">{b.name}</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs
                      ${selectedBiz.includes(b.name) ? 'bg-orange-400 border-orange-400 text-white' : 'border-gray-200'}`}>
                      {selectedBiz.includes(b.name) && '✓'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn-gray flex-1" onClick={() => setStep(3)}>← Back</button>
                <button className="btn-blue flex-1" onClick={() => setStep(5)}>Next →</button>
              </div>
            </div>
          )}

          {/* STEP 5: Done */}
          {step === 5 && (
            <div className="fade-in text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold mb-2">You're all set, {name || 'there'}!</h2>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                Your planner is ready. Start by adding your first event, task, or habit!
              </p>
              <div className="bg-blue-50 rounded-2xl p-4 mb-6 text-left">
                <div className="text-xs font-bold text-blue-500 uppercase mb-2">Quick tips:</div>
                <div className="flex flex-col gap-1.5 text-xs text-gray-600">
                  <div>✅ Add tasks in <strong>To Do List</strong> and they'll sync everywhere</div>
                  <div>📅 Set deadlines to see them in your <strong>Calendar</strong></div>
                  <div>💧 Check off habits daily from the <strong>Dashboard</strong></div>
                  <div>💰 Input transactions in <strong>Financial</strong> to track spending</div>
                </div>
              </div>
              <button className="btn-blue w-full py-3 text-base" onClick={finish} disabled={loading}>
                {loading ? 'Setting up...' : 'Go to my planner! ✨'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
