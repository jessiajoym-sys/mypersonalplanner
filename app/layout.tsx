import type { Metadata, Viewport } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'
import RegisterSW from '@/components/layout/RegisterSW'

export const metadata: Metadata = {
  title: 'myPlanner ✨',
  description: 'Your personal life planner',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'myPlanner', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
}
export const viewport: Viewport = { themeColor: '#5B7FFF', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterSW />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
