import { expect, it } from 'vitest'
import { eventImpact, timeline } from './milestone-impact'
import type { LifeEvent } from './life-events'
import type { Movement } from './types'
const event: LifeEvent = { id: 'e', label: 'Change', start: '2026-07-01', end: '2026-07-31', categoryIds: ['a', 'missing'], relieved: ['r'], kind: 'temporary' }
const mv = (date: string, amount: number, categoryId = 'a'): Movement => ({ id: `${date}-${categoryId}`, date, amount, categoryId, categoryName: categoryId.toUpperCase(), type: 'expense', isFuture: false, assetId: 'a', accountName: '', rawCode: '1' })
const history = [100, 100, 100, 100, 100, 1000].flatMap((n, i) => [mv(`2026-0${i + 1}-10`, n), mv(`2026-0${i + 1}-10`, 100, 'r')])
const movements = [...history, mv('2025-12-10', 9999), mv('2026-07-10', 150), mv('2026-07-10', 40, 'r'), mv('2026-07-10', 9, 'missing'), mv('2026-08-01', 999), { ...mv('2026-07-11', 999), isFuture: true }, { ...mv('2026-07-11', 999), type: 'income' as const }]
it('estimates affected costs and relief from six whole median months, excluding insufficient history', () => {
  expect(eventImpact(event, movements, '2026-08-31')).toEqual({
    categories: [
      { id: 'a', name: 'A', direction: 'affected', actual: 150, baseline: 100, delta: 50 },
      { id: 'missing', name: 'MISSING', direction: 'affected', actual: 9, baseline: null, delta: null },
      { id: 'r', name: 'R', direction: 'relieved', actual: 40, baseline: 100, delta: 60 },
    ], extraCost: 50, relief: 60, net: -10, windowDays: 31, open: false,
  })
})
it('prorates inclusive calendar days, ends open windows today and clamps negative costs and relief', () => {
  const open = { ...event, end: undefined }
  const result = eventImpact(open, movements, '2026-07-15')
  expect(result.windowDays).toBe(15)
  expect(result.open).toBe(true)
  expect(result.categories[0]!.baseline).toBeCloseTo(100 * 15 / 31, 2)
  const reversed = eventImpact(event, [...history, mv('2026-07-01', 10), mv('2026-07-01', 120, 'r')], '2026-08-01')
  expect(reversed.extraCost).toBe(0)
  expect(reversed.relief).toBe(0)
  expect(eventImpact({ ...event, start: '2027-01-01', end: undefined }, movements, '2026-08-01').windowDays).toBe(0)
})
it('requires three historical months, includes zero-spend months after history begins and matches subcategories', () => {
  const sparse = [mv('2026-01-10', 60), mv('2026-05-10', 60), mv('2026-06-10', 60), { ...mv('2026-07-10', 20, 'parent'), subcategoryId: 'a', subcategoryName: 'Child' }]
  expect(eventImpact(event, sparse, '2026-07-31').categories[0]).toMatchObject({ actual: 20, baseline: 30, delta: -10 })
  expect(eventImpact(event, sparse.slice(1), '2026-07-31').categories[0]!.baseline).toBeNull()
})
it('combines milestones and snapshots newest first and attributes totals to the start year', () => {
  const confirmed = [{ id: 'd', date: '2027-01-01', amount: 25, categoryName: 'Food' }]
  const result = timeline({ events: [event], confirmed, movements, today: '2027-01-01' })
  expect(result.items.map(i => i.id)).toEqual(['d', 'e'])
  expect(result.items.map(i => i.type)).toEqual(['decision', 'event'])
  expect(result.totals).toEqual({ lostToDecisions: 25, milestoneNet: -10, byYear: [{ year: '2027', lostToDecisions: 25, milestoneNet: 0 }, { year: '2026', lostToDecisions: 0, milestoneNet: -10 }] })
  expect(timeline({ events: [], confirmed: [], movements: [], today: '2026-01-01' })).toEqual({ items: [], totals: { lostToDecisions: 0, milestoneNet: 0, byYear: [] } })
})
