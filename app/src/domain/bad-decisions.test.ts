import { beforeEach, describe, expect, it } from 'vitest'
import { findBadDecisions } from './bad-decisions'
import type { Movement } from './types'
import type { BudgetPlan } from './budget-plan'
import type { LifeEvent } from './life-events'

let id = 0
const mv = (over: Partial<Movement>): Movement => ({
  id: `m${++id}`, date: '2026-10-10', assetId: 'a', accountName: 'Cash', amount: 100, type: 'expense',
  categoryId: 'var', categoryName: 'Variable', subcategoryId: 'gifts', subcategoryName: 'Regalos',
  content: 'One gift', rawCode: '1', isFuture: false, ...over,
})
const plan: BudgetPlan = {
  importedAt: '2026-10-01T00:00:00.000Z',
  budgets: [
    { categoryId: 'gifts', name: 'Regalos', parent: 'Variable', amount: 200, overrides: {} },
    { categoryId: 'var', name: 'Variable', parent: '', amount: 5000, overrides: {} },
  ],
}

describe('bad-decision classifier', () => {
  beforeEach(() => { id = 0 })
  it('flags a big unexplained discretionary expense that takes half of its budget', () => {
    // 120 of a 200 budget is 60%.
    const decisions = findBadDecisions({ movements: [mv({ amount: 120 })], plan, modes: {}, events: [], month: '2026-10' })
    expect(decisions.map((d) => [d.movement.id, d.big])).toEqual([['m1', ['large-share']]])
  })

  it('does not flag small, recurring, event-explained or annual-covered spending', () => {
    const events: LifeEvent[] = [{ id: 'e1', label: 'Moving', start: '2026-10-01', categoryIds: ['gifts'], kind: 'temporary' }]
    const movements = [
      mv({ amount: 20 }),                                   // 10% of budget, nothing unusual
      mv({ amount: 120, content: 'Rent', date: '2026-10-10' }), // recurring below
      mv({ amount: 120, date: '2026-10-11' }),              // inside the event
    ]
    const recurring = [...Array(5).keys()].map((i) => mv({ amount: 120, content: 'Rent', date: `2026-0${i + 5}-01` }))
    const decisions = findBadDecisions({ movements: [...movements, ...recurring], plan, modes: {}, events, month: '2026-10' })
    expect(decisions).toEqual([])
  })

  it('flags an outlier even without budgets, and skips Fixed-group spending', () => {
    const history: Movement[] = [...Array(6).keys()].map((i) => mv({ id: `h${i}`, amount: [18, 21, 19, 22, 20, 20][i], content: `shop ${i}`, date: `2026-0${i + 1}-05` }))
    const spike = mv({ amount: 500, date: '2026-10-05' })
    const decisions = findBadDecisions({ movements: [...history, spike], plan: null, modes: {}, events: [], month: '2026-10' })
    expect(decisions.map((d) => [d.movement.id, d.big])).toEqual([['m7', ['outlier']]])
    const fixed = findBadDecisions({ movements: [...history, { ...spike, categoryName: 'Fijo' }], plan: null, modes: {}, events: [], month: '2026-10' })
    expect(fixed).toEqual([])
  })

  it('flags the expenses that are half the budget and the one that pushes it over', () => {
    const movements = [mv({ amount: 150 }), mv({ id: 'last', amount: 100 })]
    // 150 is already 75% of the 200 budget, and the month (150 + 100) ends over it, so both push it over.
    const decisions = findBadDecisions({ movements, plan, modes: {}, events: [], month: '2026-10' })
    expect(decisions.map((d) => [d.movement.id, d.big])).toEqual([
      ['m1', ['large-share', 'over-budget']], ['last', ['large-share', 'over-budget']],
    ])
  })

  it('an annual-mode category whose year stays inside the allowance is explained', () => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => mv({ id: `o${m}`, amount: 150, date: `2026-${String(m).padStart(2, '0')}-10`, content: `gift ${m}` }))
    const decisions = findBadDecisions({
      movements: [...months, mv({ id: 'now', amount: 150, date: '2026-10-10' })],
      plan, modes: { gifts: 'annual' }, events: [], month: '2026-10',
    })
    // Ten months at 150 = 1500 over an annual allowance of 2000: the spikes are covered, not bad decisions.
    expect(decisions).toEqual([])
    const over = findBadDecisions({
      movements: [...months, mv({ id: 'now', amount: 900, date: '2026-10-10' })],
      plan, modes: { gifts: 'annual' }, events: [], month: '2026-10',
    })
    expect(over.map((d) => [d.movement.id, d.big])).toEqual([['now', ['outlier', 'large-share', 'over-budget']]])
  })
})
