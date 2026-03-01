// localStorage-based schedule storage + browser-side cron execution
// Replaces SQLite schedules table + server-side cron runner

export type ScheduleItem = {
  id: string
  cronExpr: string
  sessionKey: string
  prompt: string
  createdAt: number
  lastRunAt: number | null
}

const SCHEDULES_KEY = 'openclaw_schedules'

function read(): ScheduleItem[] {
  try {
    if (typeof window === 'undefined') return []
    return JSON.parse(localStorage.getItem(SCHEDULES_KEY) ?? '[]') as ScheduleItem[]
  } catch { return [] }
}

function write(schedules: ScheduleItem[]): void {
  try { localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules)) } catch { }
}

export function loadSchedules(): ScheduleItem[] { return read() }

export function createSchedule(
  fields: Omit<ScheduleItem, 'id' | 'createdAt' | 'lastRunAt'>,
): ScheduleItem {
  const schedules = read()
  const item: ScheduleItem = {
    ...fields,
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    lastRunAt: null,
  }
  write([...schedules, item])
  return item
}

export function deleteSchedule(id: string): boolean {
  const schedules = read()
  const filtered = schedules.filter(s => s.id !== id)
  if (filtered.length === schedules.length) return false
  write(filtered)
  return true
}

export function markScheduleRun(id: string): void {
  const schedules = read()
  const idx = schedules.findIndex(s => s.id === id)
  if (idx === -1) return
  schedules[idx] = { ...schedules[idx]!, lastRunAt: Date.now() }
  write(schedules)
}

// Simple cron-expression next-run calculator
// Supports: "* * * * *" (minute hour dom month dow)
// Returns ms until next fire, or null if can't parse
export function msUntilNextRun(cronExpr: string): number | null {
  try {
    const parts = cronExpr.trim().split(/\s+/)
    if (parts.length !== 5) return null
    const [minPart, hourPart] = parts

    const now = new Date()
    let best: Date | null = null

    // Try next 60 minutes
    for (let offset = 1; offset <= 60 * 24; offset++) {
      const candidate = new Date(now.getTime() + offset * 60_000)
      const min = candidate.getMinutes()
      const hour = candidate.getHours()
      if (!matches(minPart!, min, 0, 59)) continue
      if (!matches(hourPart!, hour, 0, 23)) continue
      best = candidate
      break
    }

    if (!best) return null
    return best.getTime() - Date.now()
  } catch { return null }
}

function matches(expr: string, value: number, _min: number, _max: number): boolean {
  if (expr === '*') return true
  const n = parseInt(expr, 10)
  if (!isNaN(n)) return n === value
  // step: */5
  if (expr.startsWith('*/')) {
    const step = parseInt(expr.slice(2), 10)
    return !isNaN(step) && value % step === 0
  }
  // list: 0,15,30,45
  if (expr.includes(',')) {
    return expr.split(',').map(Number).includes(value)
  }
  return false
}
