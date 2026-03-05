import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login({ ctx }) {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const signIn = async (e) => {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      nav('/')
    } catch (err) {
      setMsg(err.message ?? 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    nav('/login')
  }

  return (
    <div className="container">
      <div className="topbar">
        <div className="badge">Morning Quest</div>
        {ctx.session ? <button className="pillBtn danger" onClick={signOut}>Sign out</button> : <span className="badge">Sign in</span>}
      </div>

      <div className="card">
        <h1 className="h1">Account</h1>
        <p className="small">Use the email + password you created in Supabase Auth.</p>

        {!ctx.session && (
          <form onSubmit={signIn} style={{ display:'grid', gap:10, marginTop:10 }}>
            <input className="input" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
            <input className="input" placeholder="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
            <button className="pillBtn primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
            {msg && <div className="small" style={{ color:'var(--bad)' }}>{msg}</div>}
          </form>
        )}

        {ctx.session && (
          <div style={{ marginTop: 12 }}>
            <div className="small">Signed in as</div>
            <div style={{ fontWeight: 900 }}>{ctx.session.user.email}</div>
          </div>
        )}
      </div>
    </div>
  )
}
