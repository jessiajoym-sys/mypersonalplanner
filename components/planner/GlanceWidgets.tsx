'use client'
import { useEffect, useState } from 'react'
import { CardHeader } from './Modal'

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
const save = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

const ZONES = [
  { l: 'Jakarta', z: 'Asia/Jakarta' }, { l: 'Shanghai', z: 'Asia/Shanghai' }, { l: 'Tokyo', z: 'Asia/Tokyo' }, { l: 'Singapore', z: 'Asia/Singapore' },
  { l: 'Dubai', z: 'Asia/Dubai' }, { l: 'London', z: 'Europe/London' }, { l: 'Amsterdam', z: 'Europe/Amsterdam' }, { l: 'New York', z: 'America/New_York' }, { l: 'Los Angeles', z: 'America/Los_Angeles' }, { l: 'Sydney', z: 'Australia/Sydney' },
]

export function WorldClocks() {
  const [sel, setSel] = useState<string[]>(['Asia/Jakarta', 'Asia/Shanghai'])
  const [now, setNow] = useState(new Date())
  const [edit, setEdit] = useState(false)
  useEffect(() => { setSel(load('clocks', ['Asia/Jakarta', 'Asia/Shanghai'])) }, [])
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t) }, [])
  const toggle = (z: string) => { const n = sel.includes(z) ? sel.filter(x => x !== z) : [...sel, z]; setSel(n); save('clocks', n) }
  const fmt = (z: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: z, ...o }).format(now)
  return (
    <div className="card">
      <CardHeader icon="🕐" title="World Clocks" hint="Local time in the places you work with." tone="gray" right={<button className="text-[11px] font-semibold text-blue-500" onClick={() => setEdit(e => !e)}>{edit ? 'Done' : 'Edit'}</button>} />
      <div className="p-3 flex flex-wrap gap-2">
        {edit ? ZONES.map(z => <button key={z.z} onClick={() => toggle(z.z)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${sel.includes(z.z) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200'}`}>{z.l}</button>)
          : sel.map(z => { const zone = ZONES.find(x => x.z === z); return (
            <div key={z} className="flex-1 min-w-[88px] bg-gray-50 rounded-xl px-3 py-2 text-center">
              <div className="text-[10px] font-bold uppercase text-gray-400">{zone?.l || z}</div>
              <div className="text-lg font-bold leading-tight">{fmt(z, { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
              <div className="text-[10px] text-gray-400">{fmt(z, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            </div>) })}
        {!edit && sel.length === 0 && <div className="text-xs text-gray-400">Tap Edit to add cities.</div>}
      </div>
    </div>
  )
}

const CITIES = [
  { l: 'Jakarta', lat: -6.21, lon: 106.85 }, { l: 'Shanghai', lat: 31.23, lon: 121.47 }, { l: 'Beijing', lat: 39.9, lon: 116.4 }, { l: 'Shenzhen', lat: 22.54, lon: 114.06 },
  { l: 'Guangzhou', lat: 23.13, lon: 113.26 }, { l: 'Tokyo', lat: 35.68, lon: 139.69 }, { l: 'Singapore', lat: 1.35, lon: 103.82 }, { l: 'Amsterdam', lat: 52.37, lon: 4.9 }, { l: 'Bali', lat: -8.65, lon: 115.22 },
]
const wIcon = (c: number) => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌧️' : '⛈️'

export function WeatherCard() {
  const [sel, setSel] = useState<string[]>(['Jakarta', 'Shanghai'])
  const [data, setData] = useState<Record<string, any>>({})
  const [edit, setEdit] = useState(false)
  useEffect(() => { setSel(load('weather-cities', ['Jakarta', 'Shanghai'])) }, [])
  useEffect(() => {
    sel.forEach(async name => {
      const c = CITIES.find(x => x.l === name); if (!c || data[name]) return
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`)
        const j = await r.json(); setData(p => ({ ...p, [name]: j }))
      } catch {}
    })
  }, [sel])  // eslint-disable-line
  const toggle = (n: string) => { const x = sel.includes(n) ? sel.filter(v => v !== n) : [...sel, n]; setSel(x); save('weather-cities', x) }
  return (
    <div className="card">
      <CardHeader icon="🌤️" title="Weather" hint="Today and the next 2 days for your chosen cities." tone="blue" right={<button className="text-[11px] font-semibold text-blue-500" onClick={() => setEdit(e => !e)}>{edit ? 'Done' : 'Edit'}</button>} />
      <div className="p-3 flex flex-wrap gap-2">
        {edit ? CITIES.map(c => <button key={c.l} onClick={() => toggle(c.l)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${sel.includes(c.l) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200'}`}>{c.l}</button>)
          : sel.map(n => { const d = data[n]; return (
            <div key={n} className="flex-1 min-w-[120px] bg-gray-50 rounded-xl px-3 py-2">
              <div className="text-[10px] font-bold uppercase text-gray-400">{n}</div>
              {d ? <>
                <div className="flex items-center gap-1.5"><span className="text-xl">{wIcon(d.current.weather_code)}</span><span className="text-lg font-bold">{Math.round(d.current.temperature_2m)}°</span></div>
                <div className="text-[10px] text-gray-400 mt-0.5">{d.daily.time.slice(1).map((_: string, i: number) => `${wIcon(d.daily.weather_code[i + 1])}${Math.round(d.daily.temperature_2m_max[i + 1])}°`).join('  ')}</div>
              </> : <div className="text-xs text-gray-300">loading…</div>}
            </div>) })}
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
