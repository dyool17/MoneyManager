import { describe, expect, it } from 'vitest'
import { storedInit, storedSummary } from './stored'
import type { CanonicalMovement } from './sync'
const period = { startDate: '2026-02-01', endDate: '2026-02-28' }
const row: CanonicalMovement = { id: '1', date: '2026-02-01', type: 'expense', amount: 0.1, assetId: 'a', accountName: 'Bank', categoryId: 'c', categoryName: 'Food', subcategoryId: 's', subcategoryName: 'Lunch' }
describe('stored builders', () => {
  it('derives one book, unique filters and the current local calendar month', () => {
    expect(storedInit('http://phone|book', [row, { ...row, id: '2' }, { ...row, type: 'income', categoryId: 'i', categoryName: 'Salary', subcategoryId: undefined }], new Date(2026, 1, 15))).toEqual({
      currentBook: { id: 'book', name: 'book' }, books: [{ id: 'book', name: 'book' }], defaultPeriod: period,
      expenseCategories: [{ id: 'c', name: 'Food', subcategories: [{ id: 's', name: 'Lunch' }] }],
      incomeCategories: [{ id: 'i', name: 'Salary', subcategories: [] }], accounts: [{ id: 'a', name: 'Bank' }], accountGroups: [],
    })
  })
  it('computes inclusive period totals in cents, excluding transfers and unknown types; does not guess cash or card', () => {
    const rows: CanonicalMovement[] = [row, { ...row, id: '2', date: period.endDate, amount: 0.2 }, { ...row, id: '3', type: 'income', amount: 10, categoryName: 'Salary' }, ...(['transfer-out', 'transfer-in', 'unknown'] as const).map(type => ({ ...row, type, amount: 100 })), { ...row, date: '2026-03-01', amount: 100 }]
    expect(storedSummary(period, rows)).toEqual({ period, income: 10, expense: 0.3, net: 9.7, cashExpense: 0, cardExpense: 0, incomeByCategory: [{ name: 'Salary', total: 10, budget: 0 }], expenseByCategory: [{ name: 'Food', total: 0.3, budget: 0 }], source: 'Stored data' })
    expect(storedSummary(period, []).net).toBe(0)
  })
})
