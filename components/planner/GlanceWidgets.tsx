'use client'
import { useEffect, useMemo, useState } from 'react'
import { CardHeader } from './Modal'

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
const save = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// ---------- World clocks: every time zone in the world, searchable ----------
const FALLBACK_ZONES = ['Asia/Jakarta', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Dubai', 'Europe/London', 'Europe/Amsterdam', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney']
const allZones = (): string[] => { try { const z = (Intl as any).supportedValuesOf('timeZone') as string[]; return z.length ? z : FALLBACK_ZONES } catch { return FALLBACK_ZONES } }
const zoneName = (z: string) => z.split('/').slice(1).join(' / ').replace(/_/g, ' ') || z
const zoneRegion = (z: string) => z.split('/')[0]

export function WorldClocks() {
  const [sel, setSel] = useState<string[]>(['Asia/Jakarta', 'Asia/Shanghai'])
  const [now, setNow] = useState(new Date())
  const [edit, setEdit] = useState(false)
  const [q, setQ] = useState('')
  const zones = useMemo(allZones, [])
  useEffect(() => { setSel(load('clocks', ['Asia/Jakarta', 'Asia/Shanghai'])) }, [])
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t) }, [])
  const toggle = (z: string) => { const n = sel.includes(z) ? sel.filter(x => x !== z) : [...sel, z]; setSel(n); save('clocks', n) }
  const fmt = (z: string, o: Intl.DateTimeFormatOptions) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: z, ...o }).format(now) } catch { return '' } }
  const matches = q.trim() ? zones.filter(z => z.toLowerCase().replace(/_/g, ' ').includes(q.trim().toLowerCase())).slice(0, 24) : []
  return (
    <div className="card">
      <CardHeader icon="🕐" title="World Clocks" hint="Local time in any city in the world." tone="gray" right={<button className="text-[11px] font-semibold text-blue-500" onClick={() => setEdit(e => !e)}>{edit ? 'Done' : 'Edit'}</button>} />
      {edit && (
        <div className="p-3 border-b border-gray-100">
          <input className="inp text-xs mb-2" placeholder="Search a city, e.g. Tokyo, Dubai, Berlin, Bali…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="flex flex-wrap gap-1.5">
            {matches.map(z => <button key={z} onClick={() => toggle(z)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${sel.includes(z) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200'}`}>{zoneName(z)} <span className="opacity-60">· {zoneRegion(z)}</span></button>)}
            {q && matches.length === 0 && <span className="text-[11px] text-gray-400">No match. Try the nearest big city (e.g. “Jakarta” covers Indonesia west).</span>}
          </div>
          <div className="text-[10px] text-gray-400 mt-2">Tap × on a clock to remove it.</div>
        </div>
      )}
      <div className="p-3 flex flex-wrap gap-2">
        {sel.map(z => (
          <div key={z} className="relative flex-1 min-w-[88px] bg-gray-50 rounded-xl px-3 py-2 text-center">
            {edit && <button aria-label="Remove" onClick={() => toggle(z)} className="absolute top-1 right-1.5 text-gray-300 hover:text-red-500 text-xs">×</button>}
            <div className="text-[10px] font-bold uppercase text-gray-400 truncate">{zoneName(z)}</div>
            <div className="text-lg font-bold leading-tight">{fmt(z, { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
            <div className="text-[10px] text-gray-400">{fmt(z, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          </div>))}
        {sel.length === 0 && <div className="text-xs text-gray-400">Tap Edit to add cities.</div>}
      </div>
    </div>
  )
}

// ---------- Weather: search ANY city (Open-Meteo geocoding) ----------
type City = { l: string; sub?: string; lat: number; lon: number }
const DEFAULT_CITIES: City[] = [{ l: 'Jakarta', sub: 'Indonesia', lat: -6.21, lon: 106.85 }, { l: 'Shanghai', sub: 'China', lat: 31.23, lon: 121.47 }]
const wIcon = (c: number) => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌧️' : '⛈️'
const cityKey = (c: City) => `${c.l}|${c.lat.toFixed(2)}|${c.lon.toFixed(2)}`

export function WeatherCard() {
  const [cities, setCities] = useState<City[]>(DEFAULT_CITIES)
  const [data, setData] = useState<Record<string, any>>({})
  const [edit, setEdit] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<City[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const saved = load<any[]>('weather-cities-v2', [])
    if (saved.length) setCities(saved)
    else { // migrate the old name-only list if present
      const old = load<string[]>('weather-cities', [])
      if (old.length) setCities(old.map(n => DEFAULT_CITIES.find(c => c.l === n)).filter(Boolean) as City[])
    }
  }, [])
  useEffect(() => {
    cities.forEach(async c => {
      const k = cityKey(c); if (data[k]) return
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`)
        const j = await r.json(); setData(p => ({ ...p, [k]: j }))
      } catch {}
    })
  }, [cities])  // eslint-disable-line
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=8&language=en`)
        const j = await r.json()
        setFound((j.results || []).map((x: any) => ({ l: x.name, sub: [x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude })))
      } catch { setFound([]) }
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [q])
  const commit = (n: City[]) => { setCities(n); save('weather-cities-v2', n) }
  const add = (c: City) => { if (!cities.some(x => cityKey(x) === cityKey(c))) commit([...cities, c]); setQ(''); setFound([]) }

  return (
    <div className="card">
      <CardHeader icon="🌤️" title="Weather" hint="Today and the next 2 days. Add any city; change them whenever you travel." tone="blue" right={<button className="text-[11px] font-semibold text-blue-500" onClick={() => setEdit(e => !e)}>{edit ? 'Done' : 'Edit'}</button>} />
      {edit && (
        <div className="p-3 border-b border-gray-100">
          <input className="inp text-xs mb-2" placeholder="Search any city in the world…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="flex flex-col gap-1">
            {searching && <span className="text-[11px] text-gray-400">Searching…</span>}
            {found.map(c => <button key={cityKey(c)} onClick={() => add(c)} className="text-left text-xs px-3 py-1.5 rounded-lg hover:bg-blue-50 border border-gray-100"><b>{c.l}</b> <span className="text-gray-400">{c.sub}</span></button>)}
            {!searching && q.trim().length >= 2 && found.length === 0 && <span className="text-[11px] text-gray-400">No city found.</span>}
          </div>
        </div>
      )}
      <div className="p-3 flex flex-wrap gap-2">
        {cities.map(c => { const d = data[cityKey(c)]; return (
          <div key={cityKey(c)} className="relative flex-1 min-w-[120px] bg-gray-50 rounded-xl px-3 py-2">
            {edit && <button aria-label="Remove" onClick={() => commit(cities.filter(x => cityKey(x) !== cityKey(c)))} className="absolute top-1 right-1.5 text-gray-300 hover:text-red-500 text-xs">×</button>}
            <div className="text-[10px] font-bold uppercase text-gray-400 truncate">{c.l}</div>
            {d ? <>
              <div className="flex items-center gap-1.5"><span className="text-xl">{wIcon(d.current.weather_code)}</span><span className="text-lg font-bold">{Math.round(d.current.temperature_2m)}°</span></div>
              <div className="text-[10px] text-gray-400 mt-0.5">{d.daily.time.slice(1).map((_: string, i: number) => `${wIcon(d.daily.weather_code[i + 1])}${Math.round(d.daily.temperature_2m_max[i + 1])}°`).join('  ')}</div>
            </> : <div className="text-xs text-gray-300">loading…</div>}
          </div>) })}
        {cities.length === 0 && <div className="text-xs text-gray-400">Tap Edit to add a city.</div>}
      </div>
    </div>
  )
}

const CURR = ['CNY', 'USD', 'EUR', 'SGD', 'JPY', 'AUD']
export function RatesCard() {
  const [sel, setSel] = useState<string[]>(['CNY', 'USD'])
  const [rates, setRates] = useState<Record<string, number>>({})
  const [edit, setEdit] = useState(false)
  const [asOf, setAsOf] = useState('')
  useEffect(() => { setSel(load('rate-currencies', ['CNY', 'USD'])) }, [])
  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/IDR').then(r => r.json()).then(j => { if (j.rates) { setRates(j.rates); setAsOf(j.time_last_update_utc?.slice(5, 16) || '') } }).catch(() => {})
  }, [])
  const toggle = (c: string) => { const x = sel.includes(c) ? sel.filter(v => v !== c) : [...sel, c]; setSel(x); save('rate-currencies', x) }
  return (
    <div className="card">
      <CardHeader icon="💱" title="Exchange Rates" hint={`What 1 unit costs in Rupiah${asOf ? ' · ' + asOf : ''}.`} tone="teal" right={<button className="text-[11px] font-semibold text-blue-500" onClick={() => setEdit(e => !e)}>{edit ? 'Done' : 'Edit'}</button>} />
      <div className="p-3 flex flex-wrap gap-2">
        {edit ? CURR.map(c => <button key={c} onClick={() => toggle(c)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${sel.includes(c) ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-gray-500 border-gray-200'}`}>{c}</button>)
          : sel.map(c => (
            <div key={c} className="flex-1 min-w-[100px] bg-gray-50 rounded-xl px-3 py-2 text-center">
              <div className="text-[10px] font-bold uppercase text-gray-400">1 {c}</div>
              <div className="text-base font-bold">{rates[c] ? 'Rp ' + Math.round(1 / rates[c]).toLocaleString('en-US') : '…'}</div>
            </div>))}
      </div>
    </div>
  )
}
