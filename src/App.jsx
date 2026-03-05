import React, { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import Parent from './pages/Parent.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true)
      try {
        if (!session?.user?.id) {
          setProfile(null)
          return
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('id, role, display_name, family_id')
          .eq('id', session.user.id)
          .single()

        if (error) throw error
        setProfile(data)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [session?.user?.id])

  const ctx = useMemo(() => ({ session, profile, loading, setProfile }), [session, profile, loading])

  return (
    <Routes>
      <Route path="/login" element={<Login ctx={ctx} />} />
      <Route
        path="/"
        element={
          <RequireAuth ctx={ctx}>
            <Home ctx={ctx} />
          </RequireAuth>
        }
      />
      <Route
        path="/parent"
        element={
          <RequireAuth ctx={ctx}>
            <RequireParent ctx={ctx}>
              <Parent ctx={ctx} />
            </RequireParent>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RequireAuth({ ctx, children }) {
  if (ctx.loading) return <Shell><div className="card">Loading…</div></Shell>
  if (!ctx.session) return <Navigate to="/login" replace />
  return children
}

function RequireParent({ ctx, children }) {
  if (!ctx.profile) return <Shell><div className="card">Loading…</div></Shell>
  if (ctx.profile.role !== 'parent') return <Navigate to="/" replace />
  return children
}

function Shell({ children }) {
  return (
    <div className="container">
      <div className="topbar">
        <div className="badge">Morning Quest</div>
        <Link className="badge" to="/login">Account</Link>
      </div>
      {children}
    </div>
  )
}
