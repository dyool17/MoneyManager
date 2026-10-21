import { describe, expect, it } from 'vitest'
import { analyze, categoryChanges, monthRange, recurringCharges, weekday, weekdayTotals } from './insights'
import type { Movement } from './types'

let n = 0
const mv = (date: string, amount: number, type: Movement['type'] = 'expense', categoryName = 'Food', content = ''): Movement => ({
  id: String(++n), date, assetId: 'a', accountName: 'Cash', amount, type, categoryName, content, rawCode: '1', isFuture: false,
})

describe('insights', () => {
  it('fills empty months and ignores transfers and future entries', () => {
    const r = analyze([
      mv('2026-01-05', 100), mv('2026-01-06', 1000, 'income'),
      mv('2026-03-02', 40), mv('2026-03-03', 500, 'transfer-out'),
      { ...mv('2026-03-04', 999), isFuture: true },
    ], '2026-01-01', '2026-03-31')
    expect(r.months).toEqual([
      { month: '2026-01', income: 1000, expense: 100, net: 900 },
      { month: '2026-02', income: 0, expense: 0, net: 0 },
      { month: '2026-03', income: 0, expense: 40, net: -40 },
    ])
    expect(r.averageExpense).toBeCloseTo(46.67)
    expect(r.savingsRate).toBeCloseTo(0.86)
  })

  it('ranks categories by spend with their share', () => {
    const r = analyze([mv('2026-01-01', 300, 'expense', 'Rent'), mv('2026-01-02', 100), mv('2026-01-03', 100)], '2026-01-01', '2026-01-31')
    expect(r.categories).toEqual([
      { name: 'Rent', total: 300, share: 0.6, count: 1 },
      { name: 'Food', total: 200, share: 0.4, count: 2 },
    ])
  })

  it('finds the days with most spending and averages each weekday by its occurrences', () => {
    const r = analyze([mv('2026-10-19', 10), mv('2026-10-19', 30), mv('2026-10-20', 5)], '2026-10-19', '2026-10-25')
    expect(weekday('2026-10-19')).toBe(0)
    expect(r.topDays[0]).toEqual({ date: '2026-10-19', total: 40, count: 2 })
    expect(r.weekdays[0]).toEqual({ weekday: 0, total: 40, average: 40 })
    expect(weekdayTotals(r.days, '2026-10-19', '2026-11-01')[0]!.average).toBe(20)
  })

  it('compares the last three months against the three before', () => {
    const months = monthRange('2026-01', '2026-06')
    const changes = categoryChanges([mv('2026-02-01', 300), mv('2026-05-01', 600)], months)
    expect(changes).toEqual([{ name: 'Food', recent: 200, previous: 100, change: 100 }])
    expect(categoryChanges([], months.slice(0, 5))).toEqual([])
  })

  it('detects repeating charges and turns findings into ranked opportunities', () => {
    const subs = ['2026-01-03', '2026-02-03', '2026-03-03'].map((d) => mv(d, 99, 'expense', 'Fun', 'Netflix'))
    expect(recurringCharges(subs)).toEqual([{ label: 'Netflix', amount: 99, months: 3, category: 'Fun' }])
    expect(recurringCharges(subs.slice(0, 2))).toEqual([])
    const r = analyze([...subs, mv('2026-02-10', 2000), mv('2026-02-11', 100, 'income')], '2026-01-01', '2026-03-31')
    expect(r.opportunities.map((o) => o.kind)).toEqual(['overspent-month', 'recurring'])
    expect(r.opportunities[0]!.monthly).toBe(1999)
    expect(r.opportunities[1]!.monthly).toBe(99)
  })

  it('ranks by subcategory and keeps its parent as the group', () => {
    const r = analyze([{ ...mv('2026-01-01', 50, 'expense', 'Fixed'), subcategoryName: 'Rent' }], '2026-01-01', '2026-01-31')
    expect(r.categories).toEqual([{ name: 'Rent', group: 'Fixed', total: 50, share: 1, count: 1 }])
  })
})
