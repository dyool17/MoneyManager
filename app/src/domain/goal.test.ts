import { describe, expect, it } from 'vitest'
import { goalPlan } from './goal'

describe('goalPlan', () => {
  it('splits the goal over the months left, counting the target month', () => {
    expect(goalPlan({ amount: 10000, by: '2027-09', today: '2026-10-21', leftOver: 600 })).toEqual({ months: 11, monthly: 909.09, gap: 309.09, coverage: 0.66 })
  })

  it('has no gap when what is left over already covers it', () => {
    expect(goalPlan({ amount: 1200, by: '2027-10', today: '2026-10-21', leftOver: 500 })).toEqual({ months: 12, monthly: 100, gap: 0, coverage: 1 })
  })

  it('needs a month after this one', () => {
    expect(goalPlan({ amount: 1000, by: '2026-10', today: '2026-10-21', leftOver: 0 }).months).toBe(0)
  })

  it('treats a negative leftover as nothing saved', () => {
    expect(goalPlan({ amount: 1000, by: '2027-02', today: '2026-10-21', leftOver: -50 })).toMatchObject({ monthly: 250, gap: 250, coverage: 0 })
  })
})
