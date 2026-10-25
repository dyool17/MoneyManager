import type { LifeEvent } from './life-events'

interface Snapshot { month: string; total: number }
const day = (date: string) => Date.parse(`${date}T00:00:00Z`)
const nextMonth = (month: string) => {
  const [year, index] = month.split('-').map(Number)
  return Date.UTC(year!, index!, 1)
}

/** Only the canonical form and the shipped PC Manager English labels are supported. */
function normalizeMonth(value: string): string | null {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000) return value
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([1-9]\d{3})$/.exec(value)
  if (!match) return null
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[1]!) + 1
  return `${match[2]}-${String(month).padStart(2, '0')}`
}

/** Monthly snapshots and daily event windows share a calendar axis. Never interpolate balances. */
export function netWorthTimeline(history: Snapshot[], events: LifeEvent[], today: string) {
  const sorted = history.flatMap(p => {
    const month = normalizeMonth(p.month)
    return month && Number.isFinite(p.total) ? [{ ...p, month }] : []
  }).sort((a, b) => a.month.localeCompare(b.month))
  const skipped = history.length - sorted.length
  const first = sorted.length ? `${sorted[0]!.month}-01` : today
  const last = sorted.length ? new Date(nextMonth(sorted[sorted.length - 1]!.month) - 86400000).toISOString().slice(0, 10) : today
  const visible = events.map(event => {
    const end = event.savingsGoal ? event.start : event.end ?? (event.kind === 'one-off' ? event.start : today)
    return { event, end: event.savingsGoal ? end : end < today ? end : today }
  }).filter(({ event, end }) => event.savingsGoal && event.start > today || event.start <= today && (!sorted.length || event.start <= last && end >= first))
    .sort((a, b) => a.event.start.localeCompare(b.event.start) || a.event.id.localeCompare(b.event.id))
  const axisFirst = visible.reduce((first, { event }) => !sorted.length && event.start < first ? event.start : first, first)
  const axisLast = visible.reduce((last, { event }) => event.savingsGoal && event.start > last ? event.start : last, last)
  const lo = day(axisFirst), hi = day(axisLast)
  const x = (date: number) => Math.max(0, Math.min(1, (date - lo) / (hi - lo || 1)))
  const points = sorted.map(p => ({ ...p, x: x((day(`${p.month}-01`) + nextMonth(p.month) - 86400000) / 2) }))
  const years = Array.from({ length: Number(axisLast.slice(0, 4)) - Number(axisFirst.slice(0, 4)) + 1 }, (_, i) => {
    const year = Number(axisFirst.slice(0, 4)) + i
    return { year, x: x(day(`${year}-01-01`)) }
  })
  return {
    points, skipped, years,
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
