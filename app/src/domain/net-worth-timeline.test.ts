import { expect, it } from 'vitest'
import { netWorthTimeline } from './net-worth-timeline'
import type { LifeEvent } from './life-events'
import { parseDashboard } from '../infrastructure/parse'
import dashboardText from '../../../fixtures/moneymanager/dashboard.json5?raw'
const event: LifeEvent = { id: 'move', label: 'Move', start: '2026-02-10', end: '2026-03-20', kind: 'temporary', categoryIds: ['home'] }
const history = ['01', '02', '03', '05'].map((month, i) => ({ month: `2026-${month}`, total: [100, 80, 120, 150][i]! }))

it('uses calendar time for monthly points and clips overlapping milestone windows to the range', () => {
  const result = netWorthTimeline(history, [event, { ...event, id: 'older', start: '2025-12-01', end: '2026-01-15' }, { ...event, id: 'outside', start: '2025-01-01', end: '2025-02-01' }], '2026-05-31')
  expect(result.points.map(p => p.month)).toEqual(history.map(p => p.month))
  expect(result.points[3]!.x - result.points[2]!.x).toBeGreaterThan(result.points[2]!.x - result.points[1]!.x)
  expect(result.events.map(e => e.event.id)).toEqual(['older', 'move'])
  expect(result.events[0]!.startX).toBe(0)
  expect(result.events[1]!.endX).toBeGreaterThan(result.events[1]!.startX)
})

it('compares actual monthly snapshots without treating the estimate as a balance change', () => {
  const result = netWorthTimeline(history, [event], '2026-05-31').events[0]!
  expect(result.comparison).toEqual({ before: history[0], after: history[2], change: 20 })
  expect(netWorthTimeline(history.slice(1), [event], '2026-05-31').events[0]!.comparison).toBeNull()
})

it('keeps open periods through today, one-off markers on their date, and excludes future events', () => {
  const events = [{ ...event, end: undefined }, { ...event, id: 'point', kind: 'one-off' as const, end: undefined }, { ...event, id: 'future', start: '2026-06-01', end: undefined }]
  const result = netWorthTimeline(history, events, '2026-04-15')
  expect(result.events).toHaveLength(2)
  expect(result.events[0]!.end).toBe('2026-04-15')
  expect(result.events[1]!.endX).toBe(result.events[1]!.startX)
  expect(result.events[1]!.comparison?.change).toBe(-20)
})

it('extends the calendar to future goals without inventing observations, even without history', () => {
  const goal = { ...event, id: 'goal', start: '2027-06-01', end: undefined, categoryIds: [], savingsGoal: { target: 100, currency: 'USD', accountIds: ['a'] } }
  const result = netWorthTimeline(history, [goal], '2026-05-31')
  expect(result.points).toHaveLength(history.length)
  expect(result.points[result.points.length - 1]!.x).toBeLessThan(1)
  expect(result.events[0]!.startX).toBe(1)
  expect(result.events[0]!.comparison).toBeNull()
  const empty = netWorthTimeline([], [goal], '2026-05-31')
  expect(empty.points).toEqual([])
  expect(empty.events[0]!.event.id).toBe('goal')
  expect(Number.isFinite(empty.events[0]!.startX)).toBe(true)
})

it('normalizes shipped dashboard months locally and skips unsupported observations', () => {
  const dashboard = parseDashboard(dashboardText)
  const original = JSON.stringify(dashboard.history)
  expect(dashboard.history.some(p => p.month === 'Jun 2026')).toBe(true)
  const result = netWorthTimeline(dashboard.history, [], '2026-06-30')
  expect(JSON.stringify(dashboard.history)).toBe(original)
  expect(result.points.length).toBe(dashboard.history.length)
  expect(result.points.every(p => /^\d{4}-\d{2}$/.test(p.month) && Number.isFinite(p.x))).toBe(true)
  expect(result.points.map(p => p.total).sort((a, b) => a - b)).toEqual(dashboard.history.map(p => p.total).sort((a, b) => a - b))
  const skipped = netWorthTimeline([{ month: 'unknown', total: 12 }, { month: '2026-13', total: 10 }], [event], '2026-05-31')
  expect(skipped.points).toEqual([])
  expect(skipped.skipped).toBe(2)
  expect(skipped.events[0]!.event.id).toBe(event.id)
  expect(skipped.events.every(e => Number.isFinite(e.startX) && Number.isFinite(e.endX))).toBe(true)
  expect(netWorthTimeline([{ month: 'Jan 2026', total: -123.45 }], [], '2026-05-31').points[0]!.total).toBe(-123.45)
})

it('handles no history, one month, and no milestones without non-finite geometry', () => {
  expect(netWorthTimeline([], [event], '2026-05-31').events[0]!.event.id).toBe(event.id)
  const single = netWorthTimeline(history.slice(1, 2), [event], '2026-05-31')
  expect(single.points[0]!.x).toBeGreaterThan(0)
  expect(single.points[0]!.x).toBeLessThan(1)
  expect(single.events[0]!.comparison).toBeNull()
  expect(netWorthTimeline(history, [], '2026-05-31').events).toEqual([])
})
