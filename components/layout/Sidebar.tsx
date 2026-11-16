'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ensureSeed } from '@/lib/taskProjects'
import { supabase } from '@/lib/supabase'

type SidebarProps = { user: any; profile: any; open?: boolean }
type NavEntry = { href: string; icon: string; label: string }

const groups: { key: string; title: string; entries: NavEntry[] }[] = [
  { key: 'planner', title: 'Planner', entries: [
    { href: '/', icon: '🏠', label: 'Main Dashboard' },
    { href: '/todo', icon: '✅', label: 'Tasks & To-Do' },
    { href: '/habit', icon: '💧', label: 'Daily Habits' },
    { href: '/weekly', icon: '📆', label: 'Schedule & Calendar' },
    { href: '/daily-log', icon: '📝', label: 'Daily Log' },
  ] },
  { key: 'growth', title: 'Growth & Reflection', entries: [
    { href: '/resolution', icon: '🗺️', label: 'Resolutions' },
    { href: '/odyssey', icon: '✨', label: 'Odyssey Plan' },
    { href: '/years-in-pixels', icon: '🌈', label: 'Mood in Pixels' },
    { href: '/journal', icon: '📔', label: 'Journal' },
    { href: '/diary', icon: '🔒', label: 'Diary' },
  ] },
  { key: 'projects', title: 'Projects', entries: [
    { href: '/projects', icon: '📊', label: 'Projects Dashboard' },
  ] },
  { key: 'finance', title: 'Finance', entries: [
    { href: '/financial', icon: '💰', label: 'Financial Planner' },
    { href: '/financial/investments', icon: '📈', label: 'Investments' },
    { href: '/financial/loans', icon: '🏠', label: 'Loans & Installments' },
  ] },
]

export default function Sidebar({ user, profile, open }: SidebarProps) {
  const path = usePathname()
  const [businesses, setBusinesses] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ planner: true, growth: true, projects: true, business: true, finance: true })

  useEffect(() => {
    if (!user) return
    void loadBusinesses()
    void loadNotifications()
    void loadProjects()
    const h = () => void loadProjects()
    window.addEventListener('planner:changed', h)
    return () => window.removeEventListener('planner:changed', h)
  }, [user])

  async function loadBusinesses() {
    const { data } = await supabase.from('businesses').select('*').eq('user_id', user.id).eq('status', 'active').order('sort_order')
    setBusinesses(data || [])
  }

  async function loadProjects() {
    await ensureSeed(user.id)   // first time only: turns the old lists/workspaces into editable projects
    const { data } = await supabase.from('projects').select('id,name,emoji,status,legacy_route').eq('user_id', user.id).neq('status', 'done').order('created_at')
    setProjects(data || [])
  }

  async function loadNotifications() {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).eq('is_read', false).order('created_at', { ascending: false }).limit(10)
    if (data) setNotifications(data)
  }

  const active = (href: string) => href === '/' ? path === '/' : path === href || path.startsWith(href + '/')
  const navItem = (entry: NavEntry) => (
    <Link key={entry.href} href={entry.href} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-medium mb-0.5 transition-all ${active(entry.href) ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
      <span className="text-sm">{entry.icon}</span><span className="flex-1">{entry.label}</span>
    </Link>
  )
  const section = (key: string, title: string, content: React.ReactNode) => (
    <section className="mt-1" key={key}>
      <button type="button" aria-expanded={!!openGroups[key]} onClick={() => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))} className="w-full flex items-center justify-between px-2 py-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-700">
        <span>{title}</span><span className={`transition-transform ${openGroups[key] ? 'rotate-90' : ''}`}>›</span>
      </button>
      {openGroups[key] && <div className="pb-1">{content}</div>}
    </section>
  )
  const name = profile?.name || user?.email?.split('@')[0] || 'User'

  return (
    <aside className={`fixed left-0 top-0 bottom-0 w-[210px] bg-white border-r border-gray-100 flex flex-col py-4 px-2.5 overflow-y-auto z-50 transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`} style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center justify-between px-2 pb-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-[15px]"><span>✨</span><span>myPlanner</span></Link>
        <div className="relative">
          <button aria-label="Notifications" onClick={() => setShowNotif(!showNotif)} className="w-8 h-8 rounded-xl hover:bg-gray-100 text-gray-500 relative">🔔{notifications.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full min-w-[14px]">{notifications.length}</span>}</button>
          {showNotif && <div className="absolute right-0 top-10 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden"><div className="px-4 py-3 border-b border-gray-100 font-bold text-sm">Notifications</div>{notifications.length === 0 ? <div className="p-4 text-xs text-gray-400 text-center">You’re all caught up.</div> : notifications.map(n => <div key={n.id} className="px-4 py-3 border-b border-gray-50"><div className="text-xs font-semibold">{n.title}</div><div className="text-xs text-gray-400 mt-0.5">{n.message}</div></div>)}</div>}
        </div>
      </div>

      {groups.slice(0, 2).map(group => section(group.key, group.title, group.entries.map(navItem)))}
      {section('business', 'Business', <>
        {navItem({ href: '/dashboard/business', icon: '📊', label: 'Business Dashboard' })}
        {businesses.map(biz => navItem({ href: `/business/${biz.id}`, icon: biz.emoji || '💼', label: biz.name }))}
        {navItem({ href: '/business/new', icon: '＋', label: 'Add Business' })}
      </>)}
      {section('projects', groups[2].title, <>{groups[2].entries.map(navItem)}{projects.map(pr => navItem({ href: pr.legacy_route || `/projects/${pr.id}`, icon: pr.emoji || '📁', label: pr.name }))}</>)}
      {section('finance', groups[3].title, groups[3].entries.map(navItem))}

      <div className="mt-auto pt-3 border-t border-gray-100">
        <Link href="/settings" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-50"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">{name[0]?.toUpperCase()}</div><div className="min-w-0"><div className="text-xs font-semibold truncate">{name}</div><div className="text-[10px] text-gray-400">Settings</div></div></Link>
        <button onClick={() => supabase.auth.signOut()} className="w-full text-left text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-xl hover:bg-red-50 mt-0.5">🚪 Log out</button>
      </div>
    </aside>
  )
}
