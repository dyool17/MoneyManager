import { describe, expect, it } from 'vitest'
import type { Movement } from './types'
import { budgetAmount, evaluateBudgets, suggestsAnnual, validateBudgetState, type PlannedBudget } from './budget-plan'

const mv = (date: string, amount: number, extra: Partial<Movement> = {}): Movement => ({
  id: `${date}-${amount}-${Math.random()}`, date, assetId: 'cash', accountName: 'Cash', amount, type: 'expense', rawCode: '1', isFuture: false,
  categoryId: 'variable', categoryName: 'Variable', subcategoryId: 'gifts', subcategoryName: 'Gifts', ...extra,
})
const gifts: PlannedBudget = { categoryId: 'gifts', name: 'Gifts', parent: 'Variable', amount: 100, overrides: {} }
const plan = (budgets: PlannedBudget[]) => ({ importedAt: '2026-10-20T00:00:00.000Z', budgets })

describe('budget plan', () => {
  it('uses the month override and falls back to the default amount', () => {
    const b = { ...gifts, overrides: { '2026-12': 400 } }
    expect(budgetAmount(b, '2026-12')).toBe(400)
    expect(budgetAmount(b, '2026-11')).toBe(100)
  })

  it('judges a monthly budget on the month alone', () => {
    const [line] = evaluateBudgets(plan([gifts]), [mv('2026-03-10', 300), mv('2026-02-10', 20)], '2026-03', {}, null)
    expect(line).toMatchObject({ mode: 'monthly', spent: 300, budget: 100, judgedSpent: 300, judgedBudget: 100, state: 'over' })
  })

  it('judges an annual budget on January to this month, so a seasonal spike stays within budget', () => {
    // Gifts: 300 in March against 100 a month; January to March allows 300.
    const movements = [mv('2026-03-10', 300), mv('2025-12-20', 500)]
    const [line] = evaluateBudgets(plan([gifts]), movements, '2026-03', { gifts: 'annual' }, null)
    expect(line).toMatchObject({ mode: 'annual', spent: 300, budget: 100, judgedSpent: 300, judgedBudget: 300, yearBudget: 1200, state: 'ok' })
  })

  it('marks an annual budget over once January-to-date spending passes the prorated budget', () => {
    const [line] = evaluateBudgets(plan([gifts]), [mv('2026-01-05', 150), mv('2026-02-14', 200)], '2026-02', { gifts: 'annual' }, null)
    expect(line).toMatchObject({ judgedSpent: 350, judgedBudget: 200, state: 'over' })
  })

  it('marks a budget ahead when spending runs faster than the month elapsed', () => {
    const [monthly] = evaluateBudgets(plan([gifts]), [mv('2026-03-02', 60)], '2026-03', {}, 0.25)
    expect(monthly!.state).toBe('ahead')
    // Annual: January and February unused leave room, so 60 early in March is fine.
    const [annual] = evaluateBudgets(plan([gifts]), [mv('2026-03-02', 60)], '2026-03', { gifts: 'annual' }, 0.25)
    expect(annual!.state).toBe('ok')
  })

  it('matches subcategory budgets by id, so two subcategories with the same name stay apart', () => {
    const other = { ...gifts, categoryId: 'gifts-2', parent: 'Fixed' }
    const lines = evaluateBudgets(plan([gifts, other]), [mv('2026-03-10', 40), mv('2026-03-11', 70, { subcategoryId: 'gifts-2' })], '2026-03', {}, null)
    expect(lines.map((l) => [l.categoryId, l.spent])).toEqual([['gifts-2', 70], ['gifts', 40]])
  })

  it('counts every subcategory under a top-level budget and skips income, transfers and future entries', () => {
    const top: PlannedBudget = { categoryId: 'variable', name: 'Variable', parent: '', amount: 1000, overrides: {} }
    const movements = [
      mv('2026-03-01', 10), mv('2026-03-02', 20, { subcategoryId: 'food' }),
      mv('2026-03-03', 500, { type: 'income' }), mv('2026-03-04', 30, { type: 'transfer-out' }), mv('2026-03-28', 40, { isFuture: true }),
    ]
    const [line] = evaluateBudgets(plan([top]), movements, '2026-03', {}, null)
    expect(line!.spent).toBe(30)
  })

  it('suggests annual mode when spending comes in bursts that break the monthly budget', () => {
    const bursts = [mv('2025-12-15', 600), mv('2025-05-10', 250), mv('2025-09-01', 150), mv('2025-07-01', 20)]
    expect(suggestsAnnual(gifts, bursts, '2026-03')).toBe(true)
    const steady = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']
      .map((m) => mv(`${m}-10`, 90))
    expect(suggestsAnnual(gifts, steady, '2026-04')).toBe(false)
    expect(suggestsAnnual(gifts, [], '2026-04')).toBe(false)
  })

  it('validates saved state and rejects malformed entries', () => {
    const ok = { plan: plan([gifts]), modes: { gifts: 'annual' } }
    expect(validateBudgetState(ok)).toEqual(ok)
    expect(validateBudgetState({ plan: null, modes: {} })).toEqual({ plan: null, modes: {} })
    expect(() => validateBudgetState({ plan: plan([{ ...gifts, amount: -1 }]), modes: {} })).toThrow()
    expect(() => validateBudgetState({ plan: null, modes: { gifts: 'weekly' } })).toThrow()
    expect(() => validateBudgetState({ plan: plan([{ ...gifts, overrides: { '2026-13': 5 } }]), modes: {} })).toThrow()
  })
})
