'use client'
import { usePathname } from 'next/navigation'

const INFO: Record<string, any> = {
  travel: { title: 'Travel Content', emoji: '📱', desc: 'Content creator journey · 10K followers goal', color: '#22C55E' },
  s2: { title: 'Persiapan S2', emoji: '🎓', desc: 'Master\'s degree preparation · China scholarship', color: '#5B7FFF' },
  mandarin: { title: 'Belajar Mandarin', emoji: '📖', desc: 'Chinese language progress · HSK tracker', color: '#F97316' },
}

export default function ProjectPage() {
  const path = usePathname()
  const slug = path.split('/').pop() || 'travel'
  const info = INFO[slug] || INFO.travel
  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: info.color + '20' }}>{info.emoji}</div>
        <div>
          <h1 className="text-xl font-bold">{info.title}</h1>
          <p className="text-xs text-gray-400">{info.desc}</p>
        </div>
      </div>
      <div className="card p-10 text-center text-gray-400">
        <div className="text-5xl mb-3">{info.emoji}</div>
        <div className="font-semibold mb-1">Coming soon!</div>
        <div className="text-sm">This project tracker is being built.</div>
      </div>
    </div>
  )
}
