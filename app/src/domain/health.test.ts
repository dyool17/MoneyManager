import { describe, expect, it } from 'vitest'
import {
  cushionMonths, futureCommitments, greenStreak, healthScore, isLikelyLiquid, mainGroupShares,
  outliers, projectMonth, simulateCut, volatility,
} from './health'
import type { Movement } from './types'
import type { MonthTotal } from './insights'

let n = 0
const mv = (date: string, amount: number, extra: Partial<Movement> = {}): Movement => ({
  id: String(++n), date, assetId: 'a', accountName: 'Cash', amount, type: 'expense', categoryName: 'Variable', rawCode: '1', isFuture: false, ...extra,
})
const month = (m: string, income: number, expense: number): MonthTotal => ({ month: m, income, expense, net: income - expense })

describe('health', () => {
  it('measures the cushion and treats investment groups as not spendable', () => {
    expect(cushionMonths(30000, 10000)).toBe(3)
    expect(cushionMonths(-5, 10000)).toBe(0)
    expect(cushionMonths(100, 0)).toBeNull()
    expect(isLikelyLiquid('Cash')).toBe(true)
    expect(isLikelyLiquid('Inversiones')).toBe(false)
    expect(isLikelyLiquid('CxC')).toBe(false)
  })

  it('sums scheduled expenses after today per month', () => {
    const r = futureCommitments([
      mv('2026-10-20', 999), mv('2026-10-25', 100, { isFuture: true }),
      mv('2026-12-01', 50, { isFuture: true }), mv('2026-12-02', 50, { isFuture: true, type: 'income' }),
      mv('2027-11-01', 70, { isFuture: true }),
    ], '2026-10-20', 3)
    expect(r).toEqual([
      { month: '2026-10', total: 100, count: 1 },
      { month: '2026-11', total: 0, count: 0 },
      { month: '2026-12', total: 50, count: 1 },
    ])
  })

  it('splits spending by main group with the share of the window before', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
    const r = mainGroupShares([
      mv('2026-01-01', 100, { categoryName: 'Fixed' }), mv('2026-02-01', 100),
      mv('2026-05-01', 300, { categoryName: 'Fixed' }), mv('2026-06-01', 100),
    ], months)
    expect(r).toEqual([
      { name: 'Fixed', total: 400, share: 4 / 6, previousShare: 0.5 },
      { name: 'Variable', total: 200, share: 2 / 6, previousShare: 0.5 },
    ])
  })

  it('projects the month end from what earlier months spent after this day', () => {
    const movements = [
      mv('2026-09-01', 1500), mv('2026-09-20', 500), mv('2026-10-01', 1500), mv('2026-10-10', 100),
      { ...mv('2026-10-25', 999), isFuture: true },
    ]
    const p = projectMonth(movements, '2026-10-10', [month('2026-09', 3000, 2000), month('2026-10', 0, 1600)])
    expect(p).toEqual({ spent: 1600, projected: 2100, average: 2000, income: 3000, elapsed: 10 / 31 })
    expect(projectMonth([], '2026-10-10', [month('2026-10', 0, 0)])).toBeNull()
  })

  it('flags expenses far above their category norm', () => {
    const list = [10, 11, 9, 10, 12, 10, 100].map((a) => mv('2026-01-01', a, { subcategoryName: 'Coffee' }))
    const r = outliers(list)
    expect(r).toHaveLength(1)
    expect(r[0]!.movement.amount).toBe(100)
    expect(r[0]!.typical).toBe(23.14)
    expect(outliers(list.slice(0, 4))).toEqual([])
    const bill = ['2026-01-01', '2026-02-01', '2026-03-01'].map((d) => mv(d, 100, { subcategoryName: 'Coffee', content: 'Rent' }))
    expect(outliers([...list.slice(0, 6), ...[10, 10, 10].map((a) => mv('2026-01-02', a, { subcategoryName: 'Coffee' })), ...bill])).toEqual([])
  })

  it('measures steadiness and the current streak of green months', () => {
    expect(volatility([month('a', 0, 100), month('b', 0, 100)])).toBe(0)
    expect(volatility([month('a', 0, 50), month('b', 0, 150)])).toBe(0.5)
    const months = [month('2026-07', 10, 20), month('2026-08', 20, 10), month('2026-09', 20, 10), month('2026-10', 0, 50)]
    expect(greenStreak(months, '2026-10-20')).toBe(2)
  })

  it('scores health with fixed weights', () => {
    const perfect = healthScore({ savingsRate: 0.25, cushion: 8, cardDebt: 0, averageIncome: 1000, volatility: 0.05, months: [month('a', 2, 1)] })
    expect(perfect.total).toBe(100)
    const weak = healthScore({ savingsRate: -0.1, cushion: 0, cardDebt: 2000, averageIncome: 1000, volatility: 0.9, months: [month('a', 1, 2)] })
    expect(weak.total).toBe(0)
    const mid = healthScore({ savingsRate: 0.1, cushion: 3, cardDebt: 500, averageIncome: 1000, volatility: 0.3, months: [month('a', 2, 1), month('b', 1, 2)] })
    expect(mid.parts.map((p) => p.points)).toEqual([13, 13, 10, 8, 8])
  })

  it('simulates a cut on chosen categories', () => {
    expect(simulateCut({ Food: 1000, Fun: 500, Rent: 3000 }, ['Food', 'Fun'], 20)).toEqual({ monthly: 300, yearly: 3600 })
  })
})
