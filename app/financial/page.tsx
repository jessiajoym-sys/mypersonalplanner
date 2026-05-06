'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function FinancialPage() {
  const [transactions, setTrans] = useState<any[]>([])
  const [activeMonth, setActiveMonth] = useState(new Date().getMonth())
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    date: format(new Date(),'yyyy-MM-dd'), type:'debit',
    description:'', name:'', account_name:'BCA 7003',
    status:'Pribadi', category:'Lainnya', debit:'', kredit:'',
  })

  useEffect(() => { load() }, [activeMonth])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const year = new Date().getFullYear()
    const m = String(activeMonth+1).padStart(2,'0')
    const { data } = await supabase.from('transactions').select('*')
      .eq('user_id', user.id)
      .gte('date', `${year}-${m}-01`)
      .lte('date', `${year}-${m}-31`)
      .order('date', {ascending:false})
    if (data) setTrans(data)
    setLoading(false)
  }

  async function addTrans() {
    if (!form.description) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('transactions').insert({
      ...form, user_id: user.id,
      debit: form.debit ? parseFloat(form.debit) : null,
      kredit: form.kredit ? parseFloat(form.kredit) : null,
    })
    setShowAdd(false)
    setForm({date:format(new Date(),'yyyy-MM-dd'),type:'debit',description:'',name:'',account_name:'BCA 7003',status:'Pribadi',category:'Lainnya',debit:'',kredit:''})
    load()
  }

  async function del(id: string) {
    if (!confirm('Delete transaction?')) return
    await supabase.from('transactions').delete().eq('id', id)
    load()
  }

  const totalIn = transactions.reduce((s,t)=>s+(t.kredit||0),0)
  const totalOut = transactions.reduce((s,t)=>s+(t.debit||0),0)
  const net = totalIn - totalOut

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Financial Planner 💰</h1>
          <p className="text-xs text-gray-400 mt-0.5">Track income & expenses · Add transactions</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {months.map((m,i)=>(
            <button key={m} onClick={()=>setActiveMonth(i)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${activeMonth===i?'bg-teal-500 text-white':'bg-white border border-gray-100 text-gray-400 hover:bg-gray-50'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">💰 Total Income</div>
          <div className="text-lg font-bold text-green-500">Rp {totalIn.toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">💸 Total Expenses</div>
          <div className="text-lg font-bold text-red-500">Rp {totalOut.toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">📊 Net Balance</div>
          <div className={`text-lg font-bold ${net>=0?'text-green-500':'text-red-500'}`}>{net>=0?'+':''}Rp {net.toLocaleString()}</div>
        </div>
      </div>

      {/* Transactions */}
      <div className="card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-xs font-bold text-teal-500 uppercase tracking-wide">Transaction History · {months[activeMonth]}</span>
          <div className="flex gap-2">
            <button onClick={()=>setShowAdd(!showAdd)} className="btn-blue text-xs flex items-center gap-1">
              <Plus size={13}/>Add Transaction
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <div className="grid grid-cols-4 gap-2 mb-2">
              <input type="date" className="inp text-xs" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
              <select className="sel text-xs" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                <option value="debit">Debit</option>
                <option value="kredit">Kredit/Income</option>
                <option value="kartu_kredit">Kartu Kredit</option>
              </select>
              <input className="inp text-xs" placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} />
              <input className="inp text-xs" placeholder="Name/Merchant" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <select className="sel text-xs" value={form.account_name} onChange={e=>setForm({...form,account_name:e.target.value})}>
                {['BCA 7003','CC BCA 9118','CC BNI 5133','Alipay'].map(a=><option key={a}>{a}</option>)}
              </select>
              <select className="sel text-xs" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                {['Pribadi','Bisnis','Bukan Pribadi'].map(s=><option key={s}>{s}</option>)}
              </select>
              <select className="sel text-xs" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                {['Makan','Belanja','Transport','Polar Bed','Homemate','Sambal','KPR','Family','Lainnya'].map(c=><option key={c}>{c}</option>)}
              </select>
              <input className="inp text-xs" placeholder="Amount (Debit)" type="number" value={form.debit} onChange={e=>setForm({...form,debit:e.target.value,kredit:''})} />
            </div>
            <div className="flex gap-2 items-center">
              <input className="inp text-xs flex-1" placeholder="Amount (Kredit/Income)" type="number" value={form.kredit} onChange={e=>setForm({...form,kredit:e.target.value,debit:''})} />
              <button onClick={addTrans} className="btn-blue text-xs">Save</button>
              <button onClick={()=>setShowAdd(false)} className="btn-gray text-xs">Cancel</button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? <div className="p-8 text-center text-gray-400">Loading...</div> :
         transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No transactions yet. Add one above!</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800 text-white">
                  {['Date','Type','Description','Name','Account','Status','Category','Debit','Kredit',''].map((h,i)=>(
                    <th key={i} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map(t=>(
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{t.date}</td>
                    <td className="px-3 py-2">
                      <span className={`tag text-[9px] ${t.type==='kredit'?'bg-green-50 text-green-500':t.type==='kartu_kredit'?'bg-orange-50 text-orange-500':'bg-blue-50 text-blue-500'}`}>
                        {t.type==='kartu_kredit'?'CC':t.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[140px] truncate">{t.description}</td>
                    <td className="px-3 py-2 max-w-[100px] truncate">{t.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.account_name}</td>
                    <td className="px-3 py-2"><span className="tag bg-gray-100 text-gray-500 text-[9px]">{t.status}</span></td>
                    <td className="px-3 py-2"><span className="tag bg-gray-100 text-gray-500 text-[9px]">{t.category}</span></td>
                    <td className="px-3 py-2 text-red-500 font-semibold">{t.debit?`Rp ${Number(t.debit).toLocaleString()}`:'—'}</td>
                    <td className="px-3 py-2 text-green-500 font-semibold">{t.kredit?`Rp ${Number(t.kredit).toLocaleString()}`:'—'}</td>
                    <td className="px-3 py-2">
                      <button onClick={()=>del(t.id)} className="text-gray-300 hover:text-red-500 transition-all"><Trash2 size={12}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
          <span>{transactions.length} transactions</span>
          <div className="flex gap-4">
            <span className="text-red-500 font-semibold">Out: Rp {totalOut.toLocaleString()}</span>
            <span className="text-green-500 font-semibold">In: Rp {totalIn.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
