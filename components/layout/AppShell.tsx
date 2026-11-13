'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar'
import AlertWatcher from '../planner/AlertWatcher'

const PUBLIC_ROUTES = ['/login', '/onboarding']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const isPublic = PUBLIC_ROUTES.includes(pathname)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session && !isPublic) {
        router.replace('/login')
      } else if (session) {
        setUser(session.user)
        // Load profile
        const { data: prof } = await supabase
          .from('profiles').select('*').eq('id', session.user.id).single()
        if (prof) {
          setProfile(prof)
          // Redirect to onboarding if not done
          if (!prof.onboarding_done && pathname !== '/onboarding') {
            router.replace('/onboarding')
          }
        }
      }
      setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { setUser(null); router.replace('/login') }
      if (event === 'SIGNED_IN' && session) setUser(session.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-5xl mb-3 animate-bounce">✨</div>
        <p className="text-gray-400 text-sm font-medium">Loading myPlanner...</p>
      </div>
    </div>
  )

  if (isPublic) return <>{children}</>

  return (
    <div className="flex min-h-screen">
      <button aria-label="Menu" onClick={() => setMenuOpen(o => !o)} className="md:hidden fixed top-3 left-3 z-[55] w-10 h-10 rounded-xl bg-white shadow border border-gray-100 text-lg" style={{ marginTop: 'env(safe-area-inset-top)' }}>{menuOpen ? '✕' : '☰'}</button>
      {menuOpen && <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMenuOpen(false)} />}
      <div onClick={() => setMenuOpen(false)}><Sidebar user={user} profile={profile} open={menuOpen} /></div>
      <AlertWatcher />
      <main className="md:ml-[210px] flex-1 min-w-0 p-3 pt-16 md:pt-5 md:p-5 pb-16 min-h-screen">
        {children}
      </main>
    </div>
  )
}
