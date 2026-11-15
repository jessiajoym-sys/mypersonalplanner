'use client'
// ONE shared list of categories / subcategories / purposes, used by Transactions, Budget, imports.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_BUSINESS_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES, DEFAULT_PURPOSES } from '@/lib/ledger'

export type FCat = { id: string; kind: 'category' | 'subcategory' | 'purpose'; scope: 'personal' | 'business' | 'both'; name: string; parent_id: string | null; is_archived: boolean; sort_order: number }

export type FinanceLists = {
  rows: FCat[]; ready: boolean; missing: boolean
  categories: string[]                 // active category names (personal + business, unique)
  purposes: string[]
  subcategoriesOf: (category: string) => string[]
  reload: () => Promise<void>
  add: (kind: FCat['kind'], name: string, scope?: FCat['scope'], parentName?: string) => Promise<string | null>   // returns error text or null
  rename: (c: FCat, name: string) => Promise<string | null>
  setArchived: (c: FCat, archived: boolean) => Promise<string | null>
}

const uniq = (a: string[]) => Array.from(new Set(a.map(x => x.trim()).filter(Boolean)))

export function useFinanceLists(userId?: string): FinanceLists {
  const [rows, setRows] = useState<FCat[]>([])
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState(false)
  const seeding = useRef(false)

  const reload = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('finance_categories').select('*').eq('user_id', userId).order('sort_order').order('name')
    if (error) { setMissing(true); setReady(true); return }   // upgrade-8 SQL not run yet
    setMissing(false)
    if ((data || []).length === 0 && !seeding.current) {
      seeding.current = true
      const seed = [
        ...DEFAULT_PURPOSES.map((name, i) => ({ kind: 'purpose', scope: 'both', name, sort_order: i })),
        ...DEFAULT_PERSONAL_CATEGORIES.map((name, i) => ({ kind: 'category', scope: 'personal', name, sort_order: i })),
        ...DEFAULT_BUSINESS_CATEGORIES.filter(n => n !== 'Other').map((name, i) => ({ kind: 'category', scope: 'business', name, sort_order: 100 + i })),
      ].map(r => ({ ...r, user_id: userId }))
      await supabase.from('finance_categories').insert(seed)
      const again = await supabase.from('finance_categories').select('*').eq('user_id', userId).order('sort_order').order('name')
      setRows((again.data as FCat[]) || [])
    } else setRows((data as FCat[]) || [])
    setReady(true)
  }, [userId])
  useEffect(() => { void reload() }, [reload])

  // Before upgrade 8 is run, fall back to the defaults so pages still work.
  const active = rows.filter(r => !r.is_archived)
  const categories = missing ? uniq([...DEFAULT_PERSONAL_CATEGORIES, ...DEFAULT_BUSINESS_CATEGORIES]) : uniq(active.filter(r => r.kind === 'category').map(r => r.name)).sort((a, b) => a.localeCompare(b))
  const purposes = missing ? DEFAULT_PURPOSES : uniq(active.filter(r => r.kind === 'purpose').map(r => r.name))
  const subcategoriesOf = (category: string) => {
    const parents = rows.filter(r => r.kind === 'category' && r.name.toLowerCase() === category.toLowerCase()).map(r => r.id)
    return uniq(active.filter(r => r.kind === 'subcategory' && r.parent_id && parents.includes(r.parent_id)).map(r => r.name))
  }

  async function add(kind: FCat['kind'], name: string, scope: FCat['scope'] = 'both', parentName?: string) {
    const n = name.trim(); if (!n || !userId) return 'Enter a name.'
    if (missing) return 'Run lib/planner-upgrade-8.sql in Supabase first, then reload.'
    let parent_id: string | null = null
    if (kind === 'subcategory') {
      parent_id = rows.find(r => r.kind === 'category' && r.name.toLowerCase() === (parentName || '').toLowerCase())?.id || null
      if (!parent_id) return 'Choose which category this subcategory belongs to.'
    }
    const clash = rows.find(r => r.kind === kind && r.name.toLowerCase() === n.toLowerCase() && r.parent_id === parent_id && (kind !== 'category' || r.scope === scope))
    if (clash) {
      if (!clash.is_archived) return `"${n}" already exists.`
      const { error } = await supabase.from('finance_categories').update({ is_archived: false }).eq('id', clash.id).eq('user_id', userId)
      if (!error) await reload(); return error?.message || null   // restore the archived one instead of duplicating
    }
    const { error } = await supabase.from('finance_categories').insert({ user_id: userId, kind, scope, name: n, parent_id, sort_order: 500 })
    if (error) return error.message
    await reload(); return null
  }
  async function rename(c: FCat, name: string) {
    const n = name.trim(); if (!n || n === c.name || !userId) return null
    const { error } = await supabase.from('finance_categories').update({ name: n }).eq('id', c.id).eq('user_id', userId)
    if (error) return error.message
    // keep old transactions / budgets in step with the new name
    const col = c.kind === 'purpose' ? 'purpose' : c.kind === 'subcategory' ? 'subcategory' : 'category'
    await supabase.from('transactions').update({ [col]: n }).eq('user_id', userId).eq(col, c.name)
    if (c.kind === 'category') await supabase.from('budgets').update({ category: n }).eq('user_id', userId).eq('category', c.name)
    await reload(); return null
  }
  async function setArchived(c: FCat, archived: boolean) {
    if (!userId) return null
    const { error } = await supabase.from('finance_categories').update({ is_archived: archived }).eq('id', c.id).eq('user_id', userId)
    if (error) return error.message
    await reload(); return null   // transactions & budgets keep the name, so history is untouched
  }
  return { rows, ready, missing, categories, purposes, subcategoriesOf, reload, add, rename, setArchived }
}
