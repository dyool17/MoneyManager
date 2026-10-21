import { describe, expect, it } from 'vitest'
import { budgetHistory } from './budget-history'

describe('budget history', () => {
  it('counts the months each category went over and by how much', () => {
    const r = budgetHistory([
      { month: '2026-08', expenseByCategory: [{ name: 'Food', total: 120, budget: 100 }, { name: 'Rent', total: 500, budget: 500 }, { name: 'Fun', total: 80, budget: 0 }] },
      { month: '2026-09', expenseByCategory: [{ name: 'Food', total: 150, budget: 100 }, { name: 'Rent', total: 450, budget: 500 }] },
      { month: '2026-10', expenseByCategory: [{ name: 'Food', total: 90, budget: 100 }] },
    ])
    expect(r.months).toBe(3)
    expect(r.overallHitRate).toBeCloseTo(3 / 5)
    expect(r.records).toEqual([
      { name: 'Food', months: 3, over: 2, averageOver: 35, worst: { month: '2026-09', total: 150, budget: 100 } },
      { name: 'Rent', months: 2, over: 0, averageOver: 0, worst: null },
    ])
  })

  it('has no hit rate without budgets', () => {
    expect(budgetHistory([{ month: '2026-10', expenseByCategory: [{ name: 'Food', total: 5, budget: 0 }] }]).overallHitRate).toBeNull()
  })
})
