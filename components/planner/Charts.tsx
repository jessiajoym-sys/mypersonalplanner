'use client'

/** Line chart of 0–max values with labelled x ticks. */
export function LineChart({ points, max = 100, color = '#22C55E', height = 150, unit = '%' }: { points: { label: string; value: number }[]; max?: number; color?: string; height?: number; unit?: string }) {
  const W = 600, H = height, pl = 30, pr = 8, pt = 8, pb = 22
  if (!points.length) return <div className="text-xs text-gray-400 py-8 text-center">No data yet.</div>
  const x = (i: number) => pl + (points.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (points.length - 1))
  const y = (v: number) => pt + (1 - Math.min(v, max) / max) * (H - pt - pb)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - pb} L${x(0).toFixed(1)},${H - pb} Z`
  const tickEvery = Math.max(1, Math.ceil(points.length / 7))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trend chart">
      {[0, 50, 100].map(g => { const v = (g / 100) * max; return <g key={g}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="#EEF0F5" /><text x={pl - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#9CA3AF">{Math.round(v)}{unit}</text></g> })}
      <path d={area} fill={color} opacity="0.12" /><path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <g key={i}>{points.length <= 40 && <circle cx={x(i)} cy={y(p.value)} r="2.6" fill={color}><title>{`${p.label}: ${Math.round(p.value)}${unit}`}</title></circle>}{i % tickEvery === 0 && <text x={x(i)} y={H - 6} fontSize="9" textAnchor="middle" fill="#9CA3AF">{p.label}</text>}</g>)}
    </svg>
  )
}

/** Donut: done vs missed (or any 2-3 slices). */
export function Donut({ slices, center, size = 130 }: { slices: { value: number; color: string; label: string }[]; center: string; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1, r = 46, c = 2 * Math.PI * r
  let off = 0
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Completion donut">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EEF0F5" strokeWidth="14" />
        {slices.map((s, i) => { const len = (s.value / total) * c; const el = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />; off += len; return el })}
        <text x="60" y="65" textAnchor="middle" fontSize="20" fontWeight="700" fill="#374151">{center}</text>
      </svg>
      <div className="space-y-1">{slices.map(s => <div key={s.label} className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /><span className="text-gray-500">{s.label}</span><b>{s.value}</b></div>)}</div>
    </div>
  )
}

export function BarsLabeled({ items, max, color = '#5B7FFF', unit = '%' }: { items: { label: string; value: number }[]; max?: number; color?: string; unit?: string }) {
  const m = max || Math.max(1, ...items.map(i => i.value))
  return (
    <div className="flex items-end gap-2 h-28">
      {items.map(i => <div key={i.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${i.label}: ${Math.round(i.value)}${unit}`}>
        <div className="text-[9px] text-gray-400">{Math.round(i.value)}</div>
        <div className="w-full rounded-t-md" style={{ height: `${Math.max(3, (i.value / m) * 78)}%`, background: i.value ? color : '#EEF0F5' }} />
        <div className="text-[10px] text-gray-500">{i.label}</div>
      </div>)}
    </div>
  )
}

export function ProgressBar({ pct, color = '#5B7FFF', height = 8 }: { pct: number; color?: string; height?: number }) {
  return <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></div>
}
