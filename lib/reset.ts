import { supabase } from '@/lib/supabase'

// Child tables first, so foreign keys never block a delete. Settings (profiles, calendar_categories) are KEPT.
export const DATA_TABLES = [
  'biz_stock_moves', 'biz_inventory', 'biz_invoices', 'biz_items', 'biz_ads', 'biz_budgets', 'biz_plans', 'biz_platforms',
  'content_ideas', 'project_expenses', 'project_milestones', 'progress_goal_logs', 'progress_goals', 'intake_logs', 'habit_logs', 'habits',
  'cycle_logs', 'daily_logs', 'todos', 'tasks', 'events', 'notifications',
  'transactions', 'budget_plans', 'budgets', 'financial_fixed_expenses', 'fixed_expenses', 'financial_goals', 'financial_investments', 'financial_loans', 'rmb_purchases',
  'dream_goals', 'resolutions', 'odyssey_plans', 'pixel_days', 'journal_entries', 'diary_entries',
  'projects', 'accounts', 'businesses',
]

/** Download everything you own as one JSON file. */
export async function exportAll(userId: string) {
  const out: Record<string, any[]> = {}
  for (const t of [...DATA_TABLES].reverse()) {
    const { data, error } = await supabase.from(t).select('*').eq('user_id', userId)
    if (!error && data?.length) out[t] = data
  }
  return out
}

async function listFiles(prefix: string): Promise<string[]> {
  const { data } = await supabase.storage.from('receipts').list(prefix, { limit: 1000 })
  const files: string[] = []
  for (const f of data || []) {
    if (f.id) files.push(`${prefix}/${f.name}`)
    else files.push(...(await listFiles(`${prefix}/${f.name}`)))
  }
  return files
}

/** Delete every row you own (not your login or settings) and the uploaded receipts/statements. */
export async function wipeAll(userId: string, onStep?: (t: string) => void) {
  const cleared: string[] = [], skipped: string[] = [], failed: string[] = []
  for (const t of DATA_TABLES) {
    onStep?.(t)
    const { error } = await supabase.from(t).delete().eq('user_id', userId)
    if (!error) cleared.push(t)
    else if (/does not exist|schema cache|Could not find/i.test(error.message)) skipped.push(t)
    else failed.push(`${t}: ${error.message}`)
  }
  let files = 0
  try { const paths = await listFiles(userId); for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('receipts').remove(paths.slice(i, i + 100)); files = paths.length } catch {}
  return { cleared, skipped, failed, files }
}
