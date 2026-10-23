import type { Movement } from './types'
import type { LifeEvent } from './life-events'
import type { DecisionSnapshot } from './bad-decisions'

export interface CategoryImpact {
  id: string
  name: string
  direction: 'affected' | 'relieved'
  actual: number
  baseline: number | null
  delta: number | null
}
export interface EventImpact {
  categories: CategoryImpact[]
  extraCost: number
  relief: number
  net: number
  windowDays: number
  open: boolean
}
const round = (n: number) => Math.round(n * 100) / 100
const matches = (m: Movement, id: string) => m.categoryId === id || m.subcategoryId === id
const day = (date: string) => Date.parse(`${date}T00:00:00Z`)
const dateString = (date: Date) => date.toISOString().slice(0, 10)

/** Estimated impact, not causal attribution. Calendar-month fractions prorate the median. */
export function eventImpact(event: LifeEvent, movements: Movement[], today: string): EventImpact {
  const end = event.end ?? today
  const windowDays = Math.max(0, (day(end) - day(event.start)) / 86400000 + 1)
  const startMonth = new Date(`${event.start.slice(0, 7)}-01T00:00:00Z`)
  const months = Array.from({ length: 6 }, (_, i) => dateString(new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() - 6 + i, 1))).slice(0, 7))
  // A full calendar month contributes one median month, including leap February.
  let fraction = 0
  for (let cursor = day(event.start); cursor <= day(end);) {
    const d = new Date(cursor)
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    const daysInMonth = new Date(next - 86400000).getUTCDate()
    const stop = Math.min(next, day(end) + 86400000)
    fraction += (stop - cursor) / 86400000 / daysInMonth
    cursor = stop
  }
  const expenses = movements.filter(m => m.type === 'expense' && !m.isFuture && m.date <= today)
  const categories: CategoryImpact[] = [...new Set([...event.categoryIds, ...(event.relieved ?? [])])].map(id => {
    const matching = expenses.filter(m => matches(m, id))
    const named = matching.find(m => m.subcategoryId === id && m.subcategoryName || m.categoryId === id && m.categoryName)
    const name = named ? (named.subcategoryId === id ? named.subcategoryName : named.categoryName) ?? id : id
    const history = matching.filter(m => months.includes(m.date.slice(0, 7)))
    const knownMonths = new Set(history.map(m => m.date.slice(0, 7)))
    const values = months.map(month => history.filter(m => m.date.startsWith(month)).reduce((s, m) => s + m.amount, 0)).sort((a, b) => a - b)
    const baseline = knownMonths.size < 3 ? null : round((values[2]! + values[3]!) / 2 * fraction)
    const actual = round(matching.filter(m => m.date >= event.start && m.date <= end).reduce((s, m) => s + m.amount, 0))
    const direction = event.categoryIds.includes(id) ? 'affected' : 'relieved'
    const delta = baseline === null ? null : round(direction === 'affected' ? actual - baseline : baseline - actual)
    return { id, name, direction, actual, baseline, delta }
  })
  const sum = (direction: CategoryImpact['direction']) => round(categories.filter(c => c.direction === direction).reduce((s, c) => s + Math.max(0, c.delta ?? 0), 0))
  const extraCost = sum('affected')
  const relief = sum('relieved')
  return { categories, extraCost, relief, net: round(extraCost - relief), windowDays, open: event.end === undefined }
}

export type TimelineItem =
  | { type: 'event'; id: string; date: string; event: LifeEvent; impact: EventImpact }
  | { type: 'decision'; id: string; date: string; decision: DecisionSnapshot }
export interface YearTotals { year: string; lostToDecisions: number; milestoneNet: number }

export function timeline(input: { events: LifeEvent[]; confirmed: DecisionSnapshot[]; movements: Movement[]; today: string }) {
  const items: TimelineItem[] = [
    ...input.events.map(event => ({ type: 'event' as const, id: event.id, date: event.start, event, impact: eventImpact(event, input.movements, input.today) })),
    ...input.confirmed.map(decision => ({ type: 'decision' as const, id: decision.id, date: decision.date, decision })),
  ]
  items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
  const years = new Map<string, YearTotals>()
  for (const item of items) {
    const year = item.date.slice(0, 4)
    const totals = years.get(year) ?? { year, lostToDecisions: 0, milestoneNet: 0 }
    if (item.type === 'event') totals.milestoneNet = round(totals.milestoneNet + item.impact.net)
    else totals.lostToDecisions = round(totals.lostToDecisions + item.decision.amount)
    years.set(year, totals)
  }
  const byYear = [...years.values()].sort((a, b) => b.year.localeCompare(a.year))
  return { items, totals: { lostToDecisions: round(byYear.reduce((s, y) => s + y.lostToDecisions, 0)), milestoneNet: round(byYear.reduce((s, y) => s + y.milestoneNet, 0)), byYear } }
}
