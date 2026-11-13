'use client'
import { useRef, useState } from 'react'
import { FileText, Paperclip, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Props = { table: 'financial_loans' | 'financial_investments'; row: { id: string; statement_paths?: string[] | null }; userId: string; onChanged: () => void }

/** Attach e-statements (PDF / image) to a loan or investment. Files go to your private "receipts" storage. */
export default function StatementFiles({ table, row, userId, onChanged }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const paths = Array.isArray(row.statement_paths) ? row.statement_paths : []

  async function save(next: string[]) {
    const { error } = await supabase.from(table).update({ statement_paths: next }).eq('id', row.id).eq('user_id', userId)
    if (error) throw error
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true); setMsg('')
    try {
      const added: string[] = []
      for (const f of Array.from(files)) {
        if (f.size > 25 * 1024 * 1024) { setMsg(`${f.name} is over 25 MB.`); continue }
        const path = `${userId}/statements/${table}/${row.id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`
        const { error } = await supabase.storage.from('receipts').upload(path, f, { contentType: f.type || undefined })
        if (error) throw error
        added.push(path)
      }
      if (added.length) { await save([...paths, ...added]); onChanged() }
    } catch (e: any) {
      setMsg('Could not attach: ' + (e?.message || 'unknown error') + (/statement_paths/.test(e?.message || '') ? ' — run lib/planner-upgrade-5.sql in Supabase first.' : ''))
    } finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }
  async function open(path: string) {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
    if (error || !data?.signedUrl) return setMsg('Could not open file: ' + (error?.message || ''))
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  async function remove(path: string) {
    if (!confirm('Remove this statement?')) return
    try { await supabase.storage.from('receipts').remove([path]); await save(paths.filter(p => p !== path)); onChanged() } catch (e: any) { setMsg(e?.message || 'Could not remove.') }
  }
  const label = (p: string) => p.split('/').pop()!.replace(/^\d+-/, '')

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-gray-500">E-statements</span>
        {paths.map(p => (
          <span key={p} className="inline-flex items-center gap-1 rounded-full bg-gray-100 pl-2 pr-1 py-0.5">
            <button onClick={() => open(p)} className="inline-flex items-center gap-1 hover:text-blue-600"><FileText size={12} />{label(p)}</button>
            <button onClick={() => remove(p)} aria-label="Remove" className="text-gray-400 hover:text-red-500"><X size={12} /></button>
          </span>
        ))}
        <button onClick={() => ref.current?.click()} disabled={busy} className="inline-flex items-center gap-1 text-teal-600 font-semibold"><Paperclip size={13} />{busy ? 'Uploading…' : 'Attach'}</button>
        <input ref={ref} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={e => upload(e.target.files)} />
      </div>
      {msg && <p className="text-xs text-red-600 mt-1">{msg}</p>}
    </div>
  )
}
