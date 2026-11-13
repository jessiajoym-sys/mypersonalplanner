'use client'
import { BizData, money } from '@/lib/business'
import { emitChange } from '@/lib/planner'
import { supabase } from '@/lib/supabase'

export type BP = { d: BizData; userId: string; accounts: any[]; reload: () => Promise<void>; toast: (m: string) => void }
export const cur = (d: BizData) => d.biz.currency || 'IDR'
export const m$ = (d: BizData, n: number) => money(n, cur(d))
export const today = () => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }

/** Run a Supabase call, toast the result, refresh the page data. Returns true on success. */
export async function run(p: PromiseLike<{ error: any }>, bp: BP, ok = 'Saved.') {
  const { error } = await p
  if (error) { bp.toast('Could not save: ' + error.message + (/biz_|bk_class|platform|relation|column/.test(error.message) ? ' — run lib/planner-upgrade-6.sql in Supabase first.' : '')); return false }
  await bp.reload(); emitChange(); if (ok) bp.toast(ok); return true
}
export const db = supabase

export function Stat({ label, value, sub, tone = 'gray', big }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'blue' | 'gray' | 'amber'; big?: boolean }) {
  const c = { green: 'text-green-600', red: 'text-red-500', blue: 'text-blue-600', gray: 'text-gray-900', amber: 'text-amber-600' }[tone]
  return <div className="card p-4"><div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div><div className={`font-bold mt-1 ${big ? 'text-2xl' : 'text-xl'} ${c}`}>{value}</div>{sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}</div>
}
export const Empty = ({ icon, title, text }: { icon: string; title: string; text: string }) => <div className="card p-8 text-center"><div className="text-3xl">{icon}</div><div className="font-bold mt-2">{title}</div><p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{text}</p></div>
export const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
export const acctOptions = (accounts: any[], currency: string) => accounts.filter(a => a.currency === currency && a.type !== 'credit_card')
