import { expect, it } from 'vitest'
import { savingsGoalProgress } from './savings-goal'
import { emptyMetadata } from './metadata'
import { validateLifeEvents, describeEvents, excludeOneOffFromBaseline } from './life-events'
const goal = { target: 100, currency: 'USD', accountIds: ['a', 'b', 'a'] }
const metadata = { ...emptyMetadata(), baseCurrency: 'USD', overrides: { a: { currency: 'USD', rate: 1, includeInTotals: true }, b: { currency: 'EUR', rate: 2, includeInTotals: true } } }
const event = { id: 'g', label: 'Private trip', start: '2027-01-01', kind: 'one-off' as const, categoryIds: [], savingsGoal: goal }
it('accepts goal-only milestones and rejects malformed goals', () => {
  expect(validateLifeEvents({ events: [event] }).events).toEqual([event])
  for (const savingsGoal of [null, { ...goal, target: 0 }, { ...goal, target: -1 }, { ...goal, target: Infinity }, { ...goal, target: NaN }, { ...goal, currency: '' }, { ...goal, accountIds: [] }, { ...goal, accountIds: [''] }, { ...goal, accountIds: [1] }]) {
    expect(() => validateLifeEvents({ events: [{ ...event, savingsGoal }] })).toThrow('Invalid saved life events.')
  }
})
it('sums unique accounts using explicit FX and retains actual balances above target', () => {
  const rows = [{ id: 'a', amount: 40 }, { id: 'b', amount: 40 }]
  expect(savingsGoalProgress(goal, rows, metadata)).toEqual({ amount: 120, remaining: 0, percent: 100 })
  expect(savingsGoalProgress({ ...goal, target: 120 }, rows, metadata)?.percent).toBe(100)
  expect(savingsGoalProgress({ ...goal, target: 240 }, rows, metadata)?.percent).toBe(50)
  expect(savingsGoalProgress({ ...goal, currency: 'EUR' }, rows, metadata)).toBeNull()
})
it('never substitutes zero for missing balances, conversion, or debt accounts', () => {
  expect(savingsGoalProgress(goal, [], metadata)).toBeNull()
  expect(savingsGoalProgress(goal, [{ id: 'a', amount: 1 }, { id: 'b', amount: 2 }], emptyMetadata())).toBeNull()
  expect(savingsGoalProgress(goal, [{ id: 'a', amount: -10 }, { id: 'b', amount: 40 }], metadata)?.amount).toBe(70)
  expect(savingsGoalProgress(goal, [{ id: 'a', amount: Infinity }, { id: 'b', amount: 40 }], metadata)).toBeNull()
  expect(savingsGoalProgress({ ...goal, accountIds: ['a'] }, [{ id: 'a', amount: -10 }], metadata)).toEqual({ amount: -10, remaining: 110, percent: 0 })
})
it('does not send private goals to AI or alter spending baselines', () => {
  expect(describeEvents([event], '2026-01-01', '2028-01-01', true)).toEqual([])
  const months = [{ month: '2027-01', expense: 10, income: 0, net: -10 }]
  expect(excludeOneOffFromBaseline(months, [event], [])).toEqual(months)
})
