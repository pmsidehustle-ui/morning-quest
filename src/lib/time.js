export const APP_TZ = 'Australia/Sydney'

export function nowInSydney() {
  return new Date()
}

export function fmtDateTime(dt) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: APP_TZ,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).formatToParts(dt)

  const get = (type) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')} • ${get('hour')}:${get('minute')} ${get('dayPeriod')}`
}

export function ymdInSydney(dt) {
  // YYYY-MM-DD in Australia/Sydney
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(dt)
  return parts // en-CA gives YYYY-MM-DD
}

export function dowInSydney(dt) {
  // 0 Sun .. 6 Sat
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: APP_TZ, weekday:'short' }).format(dt)
  const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }
  return map[parts] ?? dt.getDay()
}

export function nextDeadlineToday({ hour, minute }) {
  // returns a Date object representing today's deadline time in Sydney tz, but in JS Date (UTC-based)
  // We'll compute via formatting in tz and then reconstruct a local Date by using current date parts in tz.
  const dt = new Date()
  const ymd = ymdInSydney(dt) // YYYY-MM-DD
  const iso = `${ymd}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`
  // Interpret as Sydney time; JS Date parses as local time, so don't parse directly.
  // Instead: build using Intl to get offset is complex; for countdown we can do this simpler:
  // We will compute difference using "time in tz" trick: get now and deadline as timestamps by converting both to ms via format in tz.
  return iso
}

export function schoolDayMonThu(dow) {
  return dow >= 1 && dow <= 4 // Mon..Thu
}

export function secondsUntilSydneyTime(hhmm) {
  // hhmm like "07:25"
  const [hh, mm] = hhmm.split(':').map(Number)
  const now = new Date()

  // Get today's date in Sydney
  const ymd = ymdInSydney(now)
  const targetStr = `${ymd}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`

  // Convert both "Sydney clock times" to comparable timestamps by using Intl to get components then build a UTC timestamp.
  // We'll map Sydney date/time components to a UTC timestamp by creating a Date from those components in UTC.
  const toUtcTs = (dateObj) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TZ,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit',
      hour12:false
    }).formatToParts(dateObj)

    const get = (t) => parts.find(p => p.type === t)?.value
    const Y = Number(get('year'))
    const M = Number(get('month'))
    const D = Number(get('day'))
    const H = Number(get('hour'))
    const Min = Number(get('minute'))
    const S = Number(get('second'))
    return Date.UTC(Y, M-1, D, H, Min, S)
  }

  const nowUtc = toUtcTs(now)

  // Build a fake Date representing the target time by taking "Sydney today" YMD and HH:MM, and using UTC constructor.
  const [Y, M, D] = ymd.split('-').map(Number)
  const targetUtc = Date.UTC(Y, M-1, D, hh, mm, 0)

  return Math.max(0, Math.floor((targetUtc - nowUtc) / 1000))
}

export function hhmmss(sec) {
  const s = Math.max(0, sec)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
}
