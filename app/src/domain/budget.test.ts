import { describe, expect, it } from 'vitest'
import { buildBudgetReport, elapsedShare } from './budget'

const aug = { startDate: '2026-08-01', endDate: '2026-08-31' }

describe('elapsedShare', () => {
  it('is the fraction of days elapsed, inclusive', () => {
    expect(elapsedShare(aug, '2026-08-31')).toBe(1)
    expect(elapsedShare(aug, '2026-08-01')).toBeCloseTo(1 / 31)
  })
  it('is null outside the period', () => {
    expect(elapsedShare(aug, '2026-09-01')).toBeNull()
  })
})

describe('buildBudgetReport', () => {
  const expenses = [
    { name: 'Fixed', total: 980.5, budget: 1000 },
    { name: 'Variable', total: 800, budget: 600 },
    { name: 'Gifts', total: 50, budget: 0 },
  ]

  it('flags over-budget categories and keeps unbudgeted ones apart', () => {
    const r = buildBudgetReport(expenses, aug, '2026-09-10')
    expect(r.lines.map((l) => [l.name, l.state])).toEqual([
      ['Variable', 'over'],
      ['Fixed', 'ok'],
    ])
    expect(r.unbudgeted.map((c) => c.name)).toEqual(['Gifts'])
    expect(r).toMatchObject({ totalBudget: 1600, totalSpent: 1780.5, pace: null })
    expect(r.lines[0].remaining).toBe(-200)
  })

  it('marks spending ahead of the calendar in the current month', () => {
    const r = buildBudgetReport(expenses, aug, '2026-08-10')
    expect(r.lines.find((l) => l.name === 'Fixed')?.state).toBe('ahead')
  })
})
