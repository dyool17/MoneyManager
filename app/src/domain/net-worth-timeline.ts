import type { LifeEvent } from './life-events'

interface Snapshot { month: string; total: number }
const day = (date: string) => Date.parse(`${date}T00:00:00Z`)
const nextMonth = (month: string) => {
  const [year, index] = month.split('-').map(Number)
  return Date.UTC(year!, index!, 1)
}

/** Monthly snapshots and daily event windows share a calendar axis. Never interpolate balances. */
export function netWorthTimeline(history: Snapshot[], events: LifeEvent[], today: string) {
  const sorted = [...history].sort((a, b) => a.month.localeCompare(b.month))
  const goals = events.filter(e => e.savingsGoal && e.start > today)
  if (!sorted.length && !goals.length) return { points: [], events: [] }
  const first = sorted.length ? `${sorted[0]!.month}-01` : today
  const last = sorted.length ? new Date(nextMonth(sorted[sorted.length - 1]!.month) - 86400000).toISOString().slice(0, 10) : today
  const axisLast = goals.reduce((last, e) => e.start > last ? e.start : last, last)
  const lo = day(first), hi = day(axisLast)
  const x = (date: number) => Math.max(0, Math.min(1, (date - lo) / (hi - lo || 1)))
  const points = sorted.map(p => ({ ...p, x: x((day(`${p.month}-01`) + nextMonth(p.month) - 86400000) / 2) }))
  const visible = events.map(event => {
    const end = event.savingsGoal ? event.start : event.end ?? (event.kind === 'one-off' ? event.start : today)
    return { event, end: event.savingsGoal ? end : end < today ? end : today }
  }).filter(({ event, end }) => event.savingsGoal && event.start > today || event.start <= today && event.start <= last && end >= first)
    .sort((a, b) => a.event.start.localeCompare(b.event.start) || a.event.id.localeCompare(b.event.id))
  return {
    points,
    events: visible.map(({ event, end }) => {
      // Whole monthly observations, not invented balances on the exact event dates.
      const before = [...sorted].reverse().find(p => p.month < event.start.slice(0, 7))
      const after = [...sorted].reverse().find(p => p.month >= event.start.slice(0, 7) && p.month <= end.slice(0, 7) && p.month <= today.slice(0, 7))
      return {
        event, end, startX: x(day(event.start)), endX: x(day(end)),
        comparison: !event.savingsGoal && before && after ? { before, after, change: Math.round((after.total - before.total) * 100) / 100 } : null,
      }
    }),
  }
}
