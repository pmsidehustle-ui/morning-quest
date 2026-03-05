import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { APP_TZ } from '../lib/time'

export default function Parent({ ctx }) {
  const profile = ctx.profile
  const familyId = profile.family_id

  const [child, setChild] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [runs, setRuns] = useState([])
  const [pending, setPending] = useState([])
  const [rewards, setRewards] = useState([])
  const [tasks, setTasks] = useState([])
  const [settings, setSettings] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!familyId) return
    const load = async () => {
      // find the child profile for this family (first one)
      const { data: kids } = await supabase.from('profiles').select('*').eq('family_id', familyId).eq('role', 'child').limit(1)
      const kid = kids?.[0] ?? null
      setChild(kid)

      const { data: s } = await supabase.from('settings').select('*').eq('family_id', familyId).single()
      setSettings(s)

      const { data: t } = await supabase.from('tasks').select('*').eq('family_id', familyId).order('sort_order', { ascending: true })
      setTasks(t ?? [])

      const { data: r } = await supabase.from('rewards').select('*').eq('family_id', familyId).order('coin_cost', { ascending: true })
      setRewards(r ?? [])

      const { data: p } = await supabase.from('reward_requests')
        .select('id, user_id, reward_id, status, requested_at')
        .eq('family_id', familyId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true })
      setPending(p ?? [])

      if (kid?.id) {
        const { data: w } = await supabase.from('wallet').select('*').eq('user_id', kid.id).single()
        setWallet(w)

        const { data: d } = await supabase.from('daily_runs')
          .select('date_ymd, is_school_day, completed_at, perfect_morning')
          .eq('family_id', familyId)
          .eq('user_id', kid.id)
          .order('date_ymd', { ascending:false })
          .limit(14)
        setRuns(d ?? [])
      }
    }
    load()
  }, [familyId])

  const approve = async (req) => {
    if (!child || !wallet) return

    const reward = rewards.find(r => r.id === req.reward_id)
    if (!reward) return

    if ((wallet.coin_balance ?? 0) < reward.coin_cost) {
      setToast('Child does not have enough coins')
      return
    }

    // Deduct coins + mark approved
    const newBal = wallet.coin_balance - reward.coin_cost

    const { error: wErr } = await supabase.from('wallet')
      .update({ coin_balance: newBal, updated_at: new Date().toISOString() })
      .eq('user_id', child.id)
    if (wErr) return setToast(wErr.message)

    const { error: rErr } = await supabase.from('reward_requests')
      .update({ status:'approved', decided_at: new Date().toISOString(), decided_by: profile.id })
      .eq('id', req.id)
    if (rErr) return setToast(rErr.message)

    setWallet(prev => ({ ...prev, coin_balance: newBal }))
    setPending(prev => prev.filter(x => x.id !== req.id))
    setToast('Approved ✅')
    setTimeout(() => setToast(null), 2000)
  }

  const deny = async (req) => {
    const { error } = await supabase.from('reward_requests')
      .update({ status:'denied', decided_at: new Date().toISOString(), decided_by: profile.id })
      .eq('id', req.id)
    if (error) return setToast(error.message)
    setPending(prev => prev.filter(x => x.id !== req.id))
    setToast('Denied')
    setTimeout(() => setToast(null), 2000)
  }

  const saveSettings = async () => {
    if (!settings) return
    const { error } = await supabase.from('settings')
      .update({
        leave_house_time: settings.leave_house_time,
        bus_time: settings.bus_time,
        updated_at: new Date().toISOString(),
      })
      .eq('family_id', familyId)
    if (error) return setToast(error.message)
    setToast('Saved ✅')
    setTimeout(() => setToast(null), 1800)
  }

  const addTask = async () => {
    const title = prompt('Task title?')
    if (!title) return
    const sort = (tasks?.[tasks.length-1]?.sort_order ?? 0) + 1
    const { data, error } = await supabase.from('tasks')
      .insert({ family_id: familyId, title, coin_value: 10, is_required: true, sort_order: sort })
      .select('*')
      .single()
    if (error) return setToast(error.message)
    setTasks(prev => [...prev, data])
  }

  const toggleTask = async (task, field) => {
    const next = { ...task, [field]: !task[field] }
    const { error } = await supabase.from('tasks')
      .update({ [field]: next[field] })
      .eq('id', task.id)
    if (error) return setToast(error.message)
    setTasks(prev => prev.map(t => t.id === task.id ? next : t))
  }

  const updateTaskCoins = async (task) => {
    const v = prompt('Coin value?', String(task.coin_value ?? 0))
    if (v == null) return
    const coin = Math.max(0, Number(v))
    const { error } = await supabase.from('tasks').update({ coin_value: coin }).eq('id', task.id)
    if (error) return setToast(error.message)
    setTasks(prev => prev.map(t => t.id === task.id ? ({ ...t, coin_value: coin }) : t))
  }

  const addReward = async () => {
    const title = prompt('Reward title? (e.g., 20 min PlayStation)')
    if (!title) return
    const cost = Number(prompt('Coin cost?', '50') ?? '50')
    const { data, error } = await supabase.from('rewards')
      .insert({ family_id: familyId, title, coin_cost: Math.max(0, cost), requires_parent_approval: true })
      .select('*')
      .single()
    if (error) return setToast(error.message)
    setRewards(prev => [...prev, data].sort((a,b)=>a.coin_cost-b.coin_cost))
  }

  return (
    <div className="container">
      <div className="topbar">
        <div className="badge">Parent dashboard</div>
        <div className="row">
          <Link className="badge" to="/">Home</Link>
          <Link className="badge" to="/login">Account</Link>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h1 className="h1">Overview</h1>
          <div className="small">Timezone: {APP_TZ}</div>

          <div style={{ marginTop: 12 }} className="kpis">
            <div className="kpi">
              <div className="label">Child</div>
              <div className="value">{child?.display_name ?? '—'}</div>
            </div>
            <div className="kpi">
              <div className="label">Coins</div>
              <div className="value">{wallet?.coin_balance ?? 0} 🪙</div>
            </div>
            <div className="kpi">
              <div className="label">Streak</div>
              <div className="value">{wallet?.streak_count ?? 0} 🔥</div>
            </div>
            <div className="kpi">
              <div className="label">Shield</div>
              <div className="value">{wallet?.shields_available ?? 0} 🛡️</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="h2">Last 14 days</div>
            <table className="table">
              <thead>
                <tr><th>Date</th><th>School day</th><th>Completed</th><th>Perfect</th></tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.date_ymd}>
                    <td>{r.date_ymd}</td>
                    <td>{r.is_school_day ? 'Yes' : 'No'}</td>
                    <td>{r.completed_at ? 'Yes' : 'No'}</td>
                    <td>{r.perfect_morning ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {toast && <div style={{ marginTop: 12 }} className="badge">{toast}</div>}
        </div>

        <div className="card">
          <div className="h2">Pending reward approvals</div>
          {pending.length === 0 ? (
            <div className="small">No pending requests.</div>
          ) : (
            <div style={{ display:'grid', gap:10 }}>
              {pending.map(req => {
                const reward = rewards.find(r => r.id === req.reward_id)
                return (
                  <div className="task" key={req.id}>
                    <div>
                      <div className="title">{reward?.title ?? '—'}</div>
                      <div className="sub">{reward?.coin_cost ?? 0} 🪙</div>
                    </div>
                    <div className="row">
                      <button className="pillBtn primary" onClick={() => approve(req)}>Approve</button>
                      <button className="pillBtn" onClick={() => deny(req)}>Deny</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: 16 }} className="h2">Settings</div>
          {settings && (
            <div style={{ display:'grid', gap:10 }}>
              <label className="small">Leave-house time (counts down to this)</label>
              <input className="input" value={settings.leave_house_time ?? '07:25'} onChange={(e)=>setSettings(s=>({ ...s, leave_house_time: e.target.value }))} />
              <label className="small">Bus departs</label>
              <input className="input" value={settings.bus_time ?? '07:35'} onChange={(e)=>setSettings(s=>({ ...s, bus_time: e.target.value }))} />
              <button className="pillBtn primary" onClick={saveSettings}>Save</button>
            </div>
          )}

          <div style={{ marginTop: 16 }} className="h2">Tasks</div>
          <div className="row">
            <button className="pillBtn" onClick={addTask}>Add task</button>
          </div>
          <div style={{ marginTop: 10, display:'grid', gap:10 }}>
            {tasks.map(t => (
              <div className="task" key={t.id}>
                <div>
                  <div className="title">{t.title}</div>
                  <div className="sub">{t.is_required ? 'Required' : 'Optional'} • +{t.coin_value} 🪙</div>
                </div>
                <div className="row">
                  <button className="pillBtn" onClick={() => toggleTask(t, 'is_required')}>{t.is_required ? 'Make optional' : 'Make required'}</button>
                  <button className="pillBtn" onClick={() => updateTaskCoins(t)}>Edit coins</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }} className="h2">Rewards</div>
          <div className="row">
            <button className="pillBtn" onClick={addReward}>Add reward</button>
          </div>
          <div style={{ marginTop: 10, display:'grid', gap:10 }}>
            {rewards.map(r => (
              <div className="task" key={r.id}>
                <div>
                  <div className="title">{r.title}</div>
                  <div className="sub">{r.coin_cost} 🪙</div>
                </div>
                <div className="small">Parent approval</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
