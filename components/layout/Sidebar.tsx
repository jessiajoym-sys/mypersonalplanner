'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function Sidebar({ user, profile }: { user: any, profile: any }) {
  const path = usePathname()
  const [businesses, setBusinesses] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [showNotif, setShowNotif] = useState(false)

  useEffect(() => {
    if (!user) return
    loadBusinesses()
    loadNotifications()
  }, [user])

  async function loadBusinesses() {
    const { data } = await supabase.from('businesses')
      .select('*').eq('user_id', user.id).eq('status', 'active').order('sort_order')
    if (data) setBusinesses(data)
    else {
      // Default businesses
      setBusinesses([
        { id: 'sambal', name: 'Sambal Mak Tak', emoji: '🌶️', color: '#EF4444' },
        { id: 'polar', name: 'Polar Bed', emoji: '🛏️', color: '#5B7FFF' },
        { id: 'chishee', name: 'Chishee Blanket', emoji: '🧣', color: '#8B5CF6' },
        { id: 'homemate', name: 'Homemate', emoji: '🏠', color: '#22C55E' },
        { id: 'jastip', name: 'Jastip China', emoji: '✈️', color: '#14B8A6' },
      ])
    }
  }

  async function loadNotifications() {
    const { data } = await supabase.from('notifications')
      .select('*').eq('user_id', user.id).eq('is_read', false).order('created_at', { ascending: false }).limit(10)
    if (data) setNotifications(data)
  }

  const isActive = (href: string) => path === href

  const navItem = (href: string, icon: string, label: string, badge?: number) => (
    <Link key={href} href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-medium mb-0.5 transition-all
        ${isActive(href) ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'}`}>
      <span className="text-sm">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge ? <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span> : null}
    </Link>
  )

  const unreadCount = notifications.length
  const name = profile?.name || user?.email?.split('@')[0] || 'User'

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[210px] bg-white border-r border-gray-100 flex flex-col py-4 px-2.5 overflow-y-auto z-50">
      {/* Logo */}
      <div className="flex items-center justify-between px-2 pb-4">
        <div className="flex items-center gap-2 font-bold text-[15px]">
          <span>✨</span><span>myPlanner</span>
        </div>
        {/* Notification bell */}
        <div className="relative">
          <button onClick={() => setShowNotif(!showNotif)}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400 relative">
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center">
                {unreadCount}
              </span>
            )}
          </button>
          {showNotif && (
            <div className="absolute right-0 top-10 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 font-bold text-sm">Notifications</div>
              {notifications.length === 0 ? (
                <div className="p-4 text-xs text-gray-400 text-center">No new notifications</div>
              ) : notifications.map(n => (
                <div key={n.id} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <div className="text-xs font-semibold">{n.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{n.message}</div>
                </div>
              ))}
              {/* Sample notifications */}
              {notifications.length === 0 && [
                { title: '⏰ CC BNI due in 10 days', msg: 'Bayar sebelum Jun 15' },
                { title: '🎯 Monthly review belum diisi', msg: 'Sudah akhir bulan — isi review Mei' },
                { title: '💡 Konten idea belum dieksekusi 2 minggu', msg: 'Review bank ide kontenmu' },
              ].map((n, i) => (
                <div key={i} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <div className="text-xs font-semibold">{n.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{n.msg}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Planner */}
      <div className="section-title">Planner</div>
      {navItem('/', '🏠', 'Dashboard')}
      {navItem('/dashboard/business', '💼', 'Business Dashboard')}
      {navItem('/todo', '✅', 'To Do List')}
      {navItem('/habit', '💧', 'Daily Habit')}
      {navItem('/weekly', '📆', 'Weekly Schedule')}
      {navItem('/daily-log', '📝', 'Daily Log')}
      {navItem('/resolution', '🗺️', 'Resolution')}
      {navItem('/odyssey', '✨', 'Odyssey Plan')}
      {navItem('/years-in-pixels', '🌈', 'Years in Pixels')}

      {/* Business */}
      <div className="section-title mt-1">Business</div>
      {businesses.map(biz => (
        <Link key={biz.id} href={`/business/${biz.id}`}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-medium mb-0.5 transition-all
            ${path === `/business/${biz.id}` ? 'bg-orange-50 text-orange-500' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'}`}>
          <span className="text-sm">{biz.emoji}</span>
          <span className="flex-1 truncate">{biz.name}</span>
        </Link>
      ))}
      <Link href="/business/new"
        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all mb-0.5">
        <span>+</span><span>Add Business</span>
      </Link>

      {/* Projects */}
      <div className="section-title mt-1">Projects</div>
      {navItem('/projects/travel', '📱', 'Travel Content')}
      {navItem('/projects/s2', '🎓', 'Persiapan S2')}
      {navItem('/projects/mandarin', '📖', 'Belajar Mandarin')}

      {/* Finance */}
      <div className="section-title mt-1">Finance</div>
      {navItem('/financial', '💰', 'Financial Planner')}

      {/* User */}
      <div className="mt-auto pt-3 border-t border-gray-100">
        <Link href="/settings" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-all">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate">{name}</div>
            <div className="text-[10px] text-gray-400">Settings ⚙️</div>
          </div>
        </Link>
        <button onClick={() => supabase.auth.signOut()}
          className="w-full text-left text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-all mt-0.5">
          🚪 Log out
        </button>
      </div>
    </aside>
  )
}
