import { describe, expect, it } from 'vitest'
import { pace, safeToSpend } from './today'
import type { Movement } from './types'

let id = 0
const mv = (date: string, amount: number, type: Movement['type'] = 'expense', isFuture = false): Movement => ({
  id: String(++id), date, assetId: 'a', accountName: 'Cash', amount, type, rawCode: '1', isFuture,
})

describe('pace', () => {
  const data = [
    mv('2026-08-01', 100), mv('2026-08-20', 50),
    mv('2026-09-01', 300), mv('2026-09-30', 10),
    mv('2026-10-01', 200), mv('2026-10-03', 40), mv('2026-10-03', 500, 'income'),
    mv('2026-10-25', 999, 'expense', true),
  ]

  it('adds up this month day by day, expenses only, up to today', () => {
    const p = pace(data, '2026-10-04', ['2026-08', '2026-09'])
    expect(p.daysInMonth).toBe(31)
    expect(p.actual).toEqual([200, 200, 240, 240])
  })

  it('averages how earlier months added up by the same day', () => {
    const p = pace(data, '2026-10-04', ['2026-08', '2026-09'])
    expect(p.typical[0]).toBe(200)
    expect(p.typical[19]).toBe(225)
    // September has 30 days, so on day 31 it counts its whole month.
    expect(p.typical[30]).toBe(230)
  })

  it('has no typical line without earlier months', () => {
    expect(pace(data, '2026-10-04', []).typical).toEqual([])
  })
})

describe('safeToSpend', () => {
  it('splits what is left of the income over the remaining days', () => {
    expect(safeToSpend({ income: 1000, spent: 400, scheduled: 100, daysLeft: 10 })).toEqual({ left: 500, perDay: 50 })
  })

  it('never suggests spending when nothing is left', () => {
    expect(safeToSpend({ income: 1000, spent: 1200, scheduled: 0, daysLeft: 5 })).toEqual({ left: -200, perDay: 0 })
    expect(safeToSpend({ income: 1000, spent: 0, scheduled: 0, daysLeft: 0 })).toEqual({ left: 1000, perDay: 0 })
  })
})
