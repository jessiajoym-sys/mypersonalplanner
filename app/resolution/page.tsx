'use client'
import { useState } from 'react'

const resolutions = [
  {num:1,title:'Chinese Language School in China',target:'HSK 5 + fluent Mandarin',cat:'Study',q:'Q2',color:'blue',pct:35},
  {num:2,title:'Improve English',target:'IELTS 7.5 + fluent English',cat:'Study',q:'Q2',color:'purple',pct:40},
  {num:3,title:"Prepare Master's Degree in China",target:'Full scholarship',cat:'Study',q:'Q3',color:'pink',pct:20},
  {num:4,title:'Build Many Friendships',target:'Close friends, grow together',cat:'Social',q:'Q2',color:'green',pct:50},
  {num:5,title:'Start Travel Content',target:'1-2 content/week, 500K followers',cat:'Content',q:'Q2',color:'orange',pct:25},
  {num:6,title:'Sambal Mak Tak Profit 100jt/month',target:'Revenue Rp 100jt/month',cat:'Business',q:'Q2',color:'red',pct:15},
  {num:7,title:'Polar Bed & Chishee 100jt/month',target:'Revenue Rp 100jt/month',cat:'Business',q:'Q3',color:'teal',pct:30},
  {num:8,title:'Fully Financially Independent',target:'Clear CC, savings, help parents',cat:'Finance',q:'Q4',color:'yellow',pct:20},
  {num:9,title:'Reduce Social Media',target:'< 30 min/day',cat:'Lifestyle',q:'Q1',color:'gray',pct:45},
  {num:10,title:'Build Meaningful Relationship',target:'Find life partner',cat:'Personal',q:'Q4',color:'pink',pct:10},
  {num:11,title:'Deepen Relationship with God',target:'Read Bible daily, serve in church',cat:'Spiritual',q:'Q1',color:'purple',pct:60},
  {num:12,title:'More Discipline & Efficient',target:'Daily schedule, vision board',cat:'Lifestyle',q:'Q1',color:'blue',pct:55},
]

const colors: Record<string,{bg:string,text:string,bar:string}> = {
  blue:{bg:'bg-blue-50',text:'text-blue-500',bar:'bg-blue-500'},
  purple:{bg:'bg-purple-50',text:'text-purple-500',bar:'bg-purple-500'},
  pink:{bg:'bg-pink-50',text:'text-pink-500',bar:'bg-pink-500'},
  green:{bg:'bg-green-50',text:'text-green-600',bar:'bg-green-500'},
  orange:{bg:'bg-orange-50',text:'text-orange-500',bar:'bg-orange-500'},
  red:{bg:'bg-red-50',text:'text-red-500',bar:'bg-red-500'},
  teal:{bg:'bg-teal-50',text:'text-teal-600',bar:'bg-teal-500'},
  yellow:{bg:'bg-yellow-50',text:'text-yellow-600',bar:'bg-yellow-400'},
  gray:{bg:'bg-gray-50',text:'text-gray-500',bar:'bg-gray-400'},
}

export default function ResolutionPage() {
  const [pcts, setPcts] = useState<Record<number,number>>(Object.fromEntries(resolutions.map(r=>[r.num,r.pct])))
  const [exp, setExp] = useState<number|null>(null)
  const overall = Math.round(Object.values(pcts).reduce((s,v)=>s+v,0)/resolutions.length)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Resolution 2026 🗺️</h1>
          <p className="text-xs text-gray-400 mt-0.5">12 goals · click to update progress</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center">
          <div className="text-xl font-bold text-blue-500">{overall}%</div>
          <div className="text-[10px] text-blue-400">Overall</div>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5"><span className="font-semibold">2026 Overall Progress</span><span className="font-bold text-blue-500">{overall}%</span></div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all" style={{width:`${overall}%`}}/>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {resolutions.map(r=>{
          const c = colors[r.color]||colors.blue
          const p = pcts[r.num]
          return (
            <div key={r.num} className={`card transition-all ${exp===r.num?'ring-2 ring-blue-400':''}`}>
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={()=>setExp(exp===r.num?null:r.num)}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${c.bg} ${c.text}`}>{r.num}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{r.title}</span>
                    <span className={`tag text-[10px] ${c.bg} ${c.text}`}>{r.q}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${c.bar} transition-all`} style={{width:`${p}%`}}/>
                    </div>
                    <span className={`text-xs font-bold ${c.text}`}>{p}%</span>
                  </div>
                </div>
                <span className="text-gray-400 text-sm">{exp===r.num?'▲':'▾'}</span>
              </div>
              {exp===r.num&&(
                <div className="border-t border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs text-gray-400 mb-2">🎯 Target: {r.target}</div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">Update progress:</span>
                    <input type="range" min="0" max="100" value={p} className="flex-1"
                      onChange={e=>setPcts(prev=>({...prev,[r.num]:Number(e.target.value)}))}/>
                    <span className={`text-sm font-bold ${c.text} w-10 text-right`}>{p}%</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
