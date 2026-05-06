'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [mode, setMode] = useState<'login'|'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function submit() {
    if (!email || !pw) { setErr('Please fill in email and password'); return }
    setLoading(true); setErr(''); setMsg('')
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password: pw })
      if (error) setErr(error.message)
      else setMsg('✅ Check your email to confirm, then log in!')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
      if (error) setErr(error.message)
      else window.location.href = '/'
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">✨</div>
          <h1 className="text-2xl font-bold">myPlanner</h1>
          <p className="text-sm text-gray-400 mt-1">Your personal life planner</p>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {(['login','signup'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${mode === m ? 'bg-white shadow text-gray-800' : 'text-gray-400'}`}>
              {m === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <input className="inp" type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          <input className="inp" type="password" placeholder="Password (min 6 chars)" value={pw}
            onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          {err && <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">❌ {err}</div>}
          {msg && <div className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-xl">{msg}</div>}
          <button onClick={submit} disabled={loading}
            className={`py-3 rounded-xl font-bold text-sm text-white mt-1 transition-all ${loading ? 'bg-gray-300' : 'bg-blue-500 hover:bg-blue-600 active:scale-98'}`}>
            {loading ? 'Loading...' : mode === 'login' ? 'Log In →' : 'Create Account →'}
          </button>
        </div>
        <p className="text-xs text-center text-gray-400 mt-5">
          {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button className="text-blue-500 font-semibold" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'signup' ? 'Log in' : 'Sign up free'}
          </button>
        </p>
      </div>
    </div>
  )
}
