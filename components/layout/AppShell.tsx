'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar'

const PUBLIC_ROUTES = ['/login', '/onboarding']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
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
      <Sidebar user={user} profile={profile} />
      <main className="ml-[210px] flex-1 p-5 pb-16 min-h-screen">
        {children}
      </main>
    </div>
  )
}
