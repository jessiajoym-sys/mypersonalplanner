'use client'
import { X } from 'lucide-react'

export default function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/30 z-[60] flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className={`bg-white rounded-2xl p-5 w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} shadow-xl my-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h2 className="font-bold text-base">{title}</h2>
            {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const Field = ({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <label className={`block ${className}`}>
    <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[10px] text-gray-400 mt-0.5">{hint}</span>}
  </label>
)

/** Section header used on every dashboard card: title + one-line "what is this for". */
export function CardHeader({ icon, title, hint, right, tone = 'gray' }: { icon: string; title: string; hint: string; right?: React.ReactNode; tone?: 'blue' | 'amber' | 'green' | 'purple' | 'red' | 'teal' | 'gray' }) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600', red: 'bg-red-50 text-red-500', teal: 'bg-teal-50 text-teal-600', gray: 'bg-gray-50 text-gray-600',
  }
  return (
    <div className={`flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100 ${tones[tone]}`}>
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-wide">{icon} {title}</div>
        <div className="text-[11px] font-normal normal-case tracking-normal text-gray-500 mt-0.5 leading-snug">{hint}</div>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  )
}
