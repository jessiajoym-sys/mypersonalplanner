'use client'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

const projects = [
  { href: '/projects/travel', icon: '📱', title: 'Travel Content', detail: 'Plan ideas, scripts, post dates, and performance.', color: '#14B8A6' },
  { href: '/projects/s2', icon: '🎓', title: "Master's Degree", detail: 'Keep application and study preparation together.', color: '#5B7FFF' },
  { href: '/projects/mandarin', icon: '📖', title: 'Mandarin Study', detail: 'Organize learning goals and study tasks.', color: '#F97316' },
]

export default function ProjectsDashboard() {
  return <div className="max-w-6xl mx-auto space-y-5"><header><h1 className="text-2xl font-bold">Projects Dashboard</h1><p className="text-sm text-gray-500 mt-1">A quick view of your ongoing projects.</p></header><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{projects.map(project => <Link key={project.href} href={project.href} className="card p-5 hover:shadow-md transition-shadow"><div className="flex justify-between"><span className="text-3xl">{project.icon}</span><ArrowUpRight size={18} className="text-gray-400" /></div><h2 className="font-bold text-lg mt-4">{project.title}</h2><p className="text-sm text-gray-500 mt-1">{project.detail}</p><div className="h-1 rounded-full mt-5" style={{ background: project.color }} /></Link>)}</div></div>
}
