import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { APP_TZ, fmtDateTime, ymdInSydney, dowInSydney, schoolDayMonThu, secondsUntilSydneyTime, hhmmss } from '../lib/time'

const DEFAULTS = {
  leave_house_time: '07:25',
  bus_time: '07:35',
  school_days_mon_thu: true,
}

export default function Home({ ctx }) {
  const profile = ctx.profile
  const [settings, setSettings] = useState(DEFAULTS)
  const [wallet, setWallet] = useState(null)
  const [tasks, setTasks] = useState([])
  const [completions, setCompletions] = useState({})
  const [dailyRun, setDailyRun] = useState(null)
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)

  const now = useMemo(() => new Date(), [tick])
  const ymd = useMemo(() => ymdInSydney(now), [now])
  const dow = useMemo(() => dowInSydney(now), [now])
  const isSchoolDay = useMemo(() => schoolDayMonThu(dow), [dow])

  const secondsToLeave = useMemo(() => isSchoolDay ? secondsUntilSydneyTime(settings.leave_house_time) : 0, [isSchoolDay, settings.leave_house_time, tick])
  const secondsToBus = useMemo(() => isSchoolDay ? secondsUntilSydneyTime(settings.bus_time) : 0, [isSchoolDay, settings.bus_time, tick])

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!profile?.family_id) return

    const load = async () => {
      // settings
      const { data: s } = await supabase.from('settings').select('*').eq('family_id', profile.family_id).single()
      if (s) setSettings({
        leave_house_time: s.leave_house_time ?? DEFAULTS.leave_house_time,
        bus_time: s.bus_time ?? DEFAULTS.bus_time,
        school_days_mon_thu: true,
      })

      // wallet
      const { data: w } = await supabase.from('wallet').select('*').eq('user_id', profile.id).single()
      if (w) setWallet(w)

      // tasks
      const { data: t } = await supabase.from('tasks').select('*').eq('family_id', profile.family_id).order('sort_order', { ascending: true })
      setTasks(t ?? [])

      // daily run (create if not exists)
      const { data: runExisting } = await supabase
        .from('daily_runs')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('user_id', profile.id)
        .eq('date_ymd', ymd)
        .maybeSingle()

      let run = runExisting
      if (!run) {
        const { data: inserted, error } = await supabase
          .from('daily_runs')
          .insert({
            family_id: profile.family_id,
            user_id: profile.id,
            date_ymd: ymd,
            is_school_day: isSchoolDay,
          })
          .select('*')
          .single()
        if (!error) run = inserted
      }
      setDailyRun(run)

      // completions for today
      if (run?.id) {
        const { data: c } = await supabase
          .from('task_completions')
          .select('task_id, completed_at')
          .eq('daily_run_id', run.id)

        const map = {}
        ;(c ?? []).forEach(row => { map[row.task_id] = row.completed_at })
        setCompletions(map)
      }
    }

    load()
  }, [profile?.family_id, profile?.id, ymd, isSchoolDay])

  const requiredTasks = useMemo(() => tasks.filter(t => t.is_required), [tasks])
  const completedRequiredCount = useMemo(() => requiredTasks.filter(t => completions[t.id]).length, [requiredTasks, completions])
  const progressPct = useMemo(() => requiredTasks.length ? Math.round((completedRequiredCount / requiredTasks.length) * 100) : 0, [completedRequiredCount, requiredTasks.length])

  const urgency = useMemo(() => {
    if (!isSchoolDay) return 'off'
    if (secondsToLeave <= 0) return 'late'
    if (secondsToLeave <= 5 * 60) return 'soon'
    if (secondsToLeave <= 15 * 60) return 'warning'
    return 'ok'
  }, [isSchoolDay, secondsToLeave])

  const completeTask = async (task) => {
    if (!dailyRun?.id) return
    if (completions[task.id]) return

    const { data: row, error } = await supabase
      .from('task_completions')
      .insert({
        daily_run_id: dailyRun.id,
        family_id: profile.family_id,
        user_id: profile.id,
        task_id: task.id,
      })
      .select('task_id, completed_at')
      .single()

    if (error) {
      setToast(error.message)
      return
    }

    setCompletions(prev => ({ ...prev, [row.task_id]: row.completed_at }))

    // award coins
    const coin = Number(task.coin_value ?? 0)
    if (coin > 0) {
      const newBal = (wallet?.coin_balance ?? 0) + coin
      setWallet(prev => prev ? ({ ...prev, coin_balance: newBal }) : prev)
      await supabase.from('wallet')
        .update({ coin_balance: newBal, updated_at: new Date().toISOString() })
        .eq('user_id', profile.id)
    }

    if (task.is_required) {
      await maybeTaskChest()
    }

    // if that finishes all required tasks, finalize
    const willCompletedRequired = completedRequiredCount + (task.is_required ? 1 : 0)
    if (willCompletedRequired === requiredTasks.length) {
      await finalizeDay()
    }
  }

const maybeTaskChest = async () => {
  if (!wallet) return
  if (!isSchoolDay) return
  if (secondsToLeave <= 0) return
  // At most 1 chest per day (prevents spam)
  if ((wallet.last_chest_ymd ?? null) === ymd) return

  // 12% chance on completing a required task
  const roll = Math.random()
  if (roll >= 0.12) return

  const awards = [5, 10, 15, 25]
  const award = awards[Math.floor(Math.random() * awards.length)]
  const newBal = (wallet.coin_balance ?? 0) + award
  const newTokens = (wallet.chest_tokens ?? 0) + 1

  const { data: w2, error } = await supabase.from('wallet')
    .update({
      coin_balance: newBal,
      chest_tokens: newTokens,
      last_chest_ymd: ymd,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', profile.id)
    .select('*')
    .single()

  if (!error && w2) {
    setWallet(w2)
    setToast(`Treasure found! +${award} 🪙 and +1 💎`)
    setTimeout(() => setToast(null), 2800)
  }
}

const finalizeDay = async () => {

    if (!dailyRun?.id || !wallet) return

    // Determine perfect morning: all required done and before leave_house_time (07:25)
    const perfect = isSchoolDay && (secondsToLeave > 0) // if we finalize before deadline

    // Update daily_runs
    await supabase.from('daily_runs')
      .update({
        completed_at: new Date().toISOString(),
        perfect_morning: perfect,
      })
      .eq('id', dailyRun.id)

    // Streak + shield logic
    let streak = wallet.streak_count ?? 0
    let shields = wallet.shields_available ?? 0

    // Determine previous school day outcome: if last_school_ymd exists and is not yesterday school day,
    // we handle missed day when starting new day instead. Here we only increment on perfect.
    if (perfect) {
      streak = streak + 1
      // earn shield every 3 perfect mornings; cap at 1 by default
      if (streak % 3 === 0) {
        shields = Math.min(1, (shields ?? 0) + 1)
      }
    } else {
      // non-perfect on a school day: try use shield to protect
      if (isSchoolDay && shields > 0) {
        shields = shields - 1
        // streak unchanged
      } else if (isSchoolDay) {
        streak = 0
      }
    }

    // Daily bonus coins for finishing required tasks + boss-battle timing bonuses
let bonus = 0
let bossBonus = 0

if (isSchoolDay) {
  // Baseline completion bonus (keeps it rewarding even without speed)
  bonus += 10

  // Boss battle tiers (based on leave-house deadline 07:25)
  // secondsToLeave is time remaining until 07:25 at the moment of completion
  if (secondsToLeave >= 20 * 60) bossBonus = 40   // by 07:05
  else if (secondsToLeave >= 10 * 60) bossBonus = 25 // by 07:15
  else if (secondsToLeave > 0) bossBonus = 15     // by 07:25

  bonus += bossBonus
}

// Pet evolution: upgrade at streak milestones (7/14/28 perfect mornings)
let petStage = wallet.pet_stage ?? 1
if (perfect) {
  if (streak >= 28) petStage = Math.max(petStage, 4)
  else if (streak >= 14) petStage = Math.max(petStage, 3)
  else if (streak >= 7) petStage = Math.max(petStage, 2)
}

// Treasure chest: at most 1 chest per day; only on perfect mornings
let chestTokens = wallet.chest_tokens ?? 0
let chestAward = 0
const alreadyChestedToday = (wallet.last_chest_ymd ?? null) === ymd
if (perfect && !alreadyChestedToday) {
  // 25% chance of a chest on perfect morning
  const roll = Math.random()
  if (roll < 0.25) {
    const r = Math.random()
    if (r < 0.45) chestAward = 10
    else if (r < 0.80) chestAward = 20
    else if (r < 0.95) chestAward = 35
    else chestAward = 60

    chestTokens += 1
  }
}

const newBal = (wallet.coin_balance ?? 0) + bonus + chestAward

    const { data: w2 } = await supabase.from('wallet')
      .update({
        coin_balance: newBal,
        streak_count: streak,
        shields_available: shields,
        last_run_ymd: ymd,
        last_perfect_ymd: perfect ? ymd : wallet.last_perfect_ymd,
        pet_stage: petStage,
        chest_tokens: chestTokens,
        last_chest_ymd: (chestAward > 0) ? ymd : wallet.last_chest_ymd,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profile.id)
      .select('*')
      .single()

    if (w2) setWallet(w2)

    if (chestAward > 0) {
      setToast(`Perfect morning! +${bonus} coins + Treasure +${chestAward} 🪙 and +1 💎 🎉`)
    } else {
      setToast(perfect ? `Perfect morning! +${bonus} coins 🎉` : `Done! +${bonus} coins`)
    }
    setTimeout(() => setToast(null), 3200)
  }

  const feedPet = async (cost, hungerGain, happinessGain) => {
    if (!wallet) return
    if ((wallet.coin_balance ?? 0) < cost) return setToast("Not enough coins")

    const newBal = wallet.coin_balance - cost
    const newHunger = Math.min(100, (wallet.pet_hunger ?? 60) + hungerGain)
    const newHappy = Math.min(100, (wallet.pet_happiness ?? 60) + happinessGain)

    const { data: w2, error } = await supabase.from('wallet')
      .update({
        coin_balance: newBal,
        pet_hunger: newHunger,
        pet_happiness: newHappy,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profile.id)
      .select('*')
      .single()

    if (error) return setToast(error.message)
    setWallet(w2)
    setToast('Nom nom 🐾')
    setTimeout(() => setToast(null), 2000)
  }

  const schoolBadge = isSchoolDay ? 'School day ✅' : 'No school today 🎉'
  const name = profile?.display_name || 'Morning Quest'

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <div className="badge">{name}</div>
        </div>
        <div className="row">
          {profile?.role === 'parent' && <Link className="badge" to="/parent">Parent</Link>}
          <Link className="badge" to="/login">Account</Link>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h1 className="h1">{fmtDateTime(now)}</h1>
          <div style={{ marginTop: 8 }} className="badge">{schoolBadge}</div>

          {isSchoolDay ? (
            <>
              <div style={{ marginTop: 12 }}>
                <div className="h2">Leave-house countdown</div>
                <div className="mono" style={{ fontSize: 34, fontWeight: 900 }}>
                  {hhmmss(secondsToLeave)}
                </div>
                <div className="small">
                  Leave by <b>{settings.leave_house_time}</b> (bus departs <b>{settings.bus_time}</b>)
                </div>

                <div className="progressWrap" aria-label="countdown progress">
                  <div
                    className="progressBar"
                    style={{
                      width: `${Math.max(0, Math.min(100, Math.round((secondsToLeave / (60*60)) * 100)))}%`
                    }}
                  />
                </div>

                <div className="small" style={{ marginTop: 8 }}>
                  {urgency === 'ok' && 'Plenty of time.'}
                  {urgency === 'warning' && '15 minutes or less — keep moving.'}
                  {urgency === 'soon' && '5 minutes or less — finish the last steps.'}
                  {urgency === 'late' && 'Time’s up — do the essentials and head out.'}
                </div>
              </div>

<div style={{ marginTop: 10 }} className="card">
  <div className="h2">Boss battle</div>
  <div className="small">
    Beat the clock for bonus coins:
    <ul style={{ margin: '8px 0 0 16px', padding: 0, color: 'var(--muted)' }}>
      <li><b>+40</b> if finished by <b>07:05</b></li>
      <li><b>+25</b> if finished by <b>07:15</b></li>
      <li><b>+15</b> if finished by <b>07:25</b> (on time)</li>
    </ul>
  </div>
</div>

              <div style={{ marginTop: 14 }} className="kpis">
                <div className="kpi">
                  <div className="label">Progress</div>
                  <div className="value">{progressPct}%</div>
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
            </>
          ) : (
            <div style={{ marginTop: 12 }} className="small">
              No school today. Streaks don’t change on Fridays or weekends.
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <div className="h2">Morning tasks</div>
            <div style={{ display:'grid', gap:10 }}>
              {tasks.map(task => {
                const doneAt = completions[task.id]
                return (
                  <div className="task" key={task.id}>
                    <div className="left">
                      <div style={{
                        width: 34, height: 34, borderRadius: 12,
                        background: doneAt ? 'rgba(78,240,180,0.20)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        display:'grid', placeItems:'center', fontWeight: 900
                      }}>
                        {doneAt ? '✓' : '•'}
                      </div>
                      <div>
                        <div className="title">{task.title}</div>
                        <div className="sub">
                          {task.is_required ? 'Required' : 'Optional'} • +{task.coin_value} 🪙
                        </div>
                      </div>
                    </div>
                    <button disabled={!!doneAt} onClick={() => completeTask(task)}>
                      {doneAt ? 'Done' : 'Complete'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {toast && (
            <div style={{ marginTop: 12 }} className="badge">
              {toast}
            </div>
          )}
        </div>

        <div className="card">
          <div className="h2">Pet</div>
          <div style={{ display:'grid', gap:10 }}>
            <div className="card" style={{ background:'rgba(0,0,0,0.10)' }}>
              <div style={{ fontSize: 44 }}>{petEmoji(wallet?.pet_stage ?? 1)}</div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Buddy</div>
              <div className="small">Stage: {wallet?.pet_stage ?? 1}</div>
              <div className="small">Treasure tokens: {wallet?.chest_tokens ?? 0} 💎</div>
              <div className="small">Hunger: {wallet?.pet_hunger ?? 60}/100</div>
              <div className="small">Happiness: {wallet?.pet_happiness ?? 60}/100</div>
            </div>

            <div className="row">
              <button className="pillBtn" onClick={() => feedPet(5, 10, 2)}>Snack (5 🪙)</button>
              <button className="pillBtn" onClick={() => feedPet(15, 30, 6)}>Meal (15 🪙)</button>
              <button className="pillBtn" onClick={() => feedPet(40, 80, 14)}>Feast (40 🪙)</button>
            </div>

            <RewardsPanel familyId={profile?.family_id} userId={profile?.id} wallet={wallet} onToast={setToast} />

            <div className="small">
              Rewards require parent approval. Coins are only deducted when approved.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function petEmoji(stage) {
  const s = Number(stage ?? 1)
  if (s >= 4) return '🦊'
  if (s === 3) return '🐺'
  if (s === 2) return '🐶'
  return '🐾'
}

function RewardsPanel({ familyId, userId, wallet, onToast }) {
  const [rewards, setRewards] = useState([])
  const [requests, setRequests] = useState([])

  useEffect(() => {
    if (!familyId || !userId) return
    const load = async () => {
      const { data: r } = await supabase.from('rewards').select('*').eq('family_id', familyId).order('coin_cost', { ascending:true })
      setRewards(r ?? [])
      const { data: q } = await supabase.from('reward_requests')
        .select('id, status, requested_at, reward_id')
        .eq('family_id', familyId)
        .eq('user_id', userId)
        .order('requested_at', { ascending:false })
        .limit(5)
      setRequests(q ?? [])
    }
    load()
  }, [familyId, userId])

  const requestReward = async (reward) => {
    if (!wallet) return
    if ((wallet.coin_balance ?? 0) < reward.coin_cost) {
      onToast?.('Not enough coins')
      return
    }
    const { error } = await supabase.from('reward_requests').insert({
      family_id: familyId,
      user_id: userId,
      reward_id: reward.id,
      status: 'pending',
    })
    if (error) return onToast?.(error.message)
    onToast?.('Requested ✅ (waiting for parent)')
    // refresh
    const { data: q } = await supabase.from('reward_requests')
      .select('id, status, requested_at, reward_id')
      .eq('family_id', familyId)
      .eq('user_id', userId)
      .order('requested_at', { ascending:false })
      .limit(5)
    setRequests(q ?? [])
  }

  return (
    <div className="card" style={{ background:'rgba(0,0,0,0.10)' }}>
      <div className="h2">Rewards</div>
      <div style={{ display:'grid', gap:10 }}>
        {rewards.map(r => (
          <div key={r.id} className="task" style={{ margin:0 }}>
            <div>
              <div className="title">{r.title}</div>
              <div className="sub">{r.coin_cost} 🪙</div>
            </div>
            <button onClick={() => requestReward(r)}>Request</button>
          </div>
        ))}
      </div>

      {requests.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="h2">Recent requests</div>
          <table className="table">
            <thead>
              <tr><th>Status</th><th>Reward</th></tr>
            </thead>
            <tbody>
              {requests.map(req => {
                const rewardTitle = rewards.find(r => r.id === req.reward_id)?.title ?? '—'
                return (
                  <tr key={req.id}>
                    <td>{req.status}</td>
                    <td>{rewardTitle}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
