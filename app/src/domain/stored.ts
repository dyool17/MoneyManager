import type { CanonicalMovement } from './sync'
import type { Category, CategoryTotal, InitData, Period, Summary } from './types'
import { shiftMonth } from './format'

/** Local calendar date, not UTC: month boundaries follow the user's calendar. */
export const storedToday = (now = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

/** Only facts present in accepted movements become filters; no balance or account type is inferred. */
export function storedInit(scope: string, rows: CanonicalMovement[], now = new Date()): InitData {
  const id = scope.slice(scope.lastIndexOf('|') + 1)
  const book = { id, name: id }
  const categories = (type: 'expense' | 'income'): Category[] => {
    const result = new Map<string, Category>()
    for (const row of rows) {
      if (row.type !== type || !row.categoryId) continue
      let category = result.get(row.categoryId)
      if (!category) {
        category = { id: row.categoryId, name: row.categoryName || row.categoryId, subcategories: [] }
        result.set(row.categoryId, category)
      }
      if (row.subcategoryId && !category.subcategories.some(s => s.id === row.subcategoryId)) {
        category.subcategories.push({ id: row.subcategoryId, name: row.subcategoryName || row.subcategoryId })
      }
    }
    return [...result.values()]
  }
  const accounts = new Map<string, { id: string; name: string }>()
  for (const row of rows) {
    if (row.assetId) accounts.set(row.assetId, { id: row.assetId, name: row.accountName || row.assetId })
    if (row.toAssetId && !accounts.has(row.toAssetId)) accounts.set(row.toAssetId, { id: row.toAssetId, name: row.toAssetId })
  }
  return {
    currentBook: book, books: [book], defaultPeriod: shiftMonth(storedToday(now).slice(0, 8) + '01', 0),
    incomeCategories: categories('income'), expenseCategories: categories('expense'), accounts: [...accounts.values()], accountGroups: [],
  }
}

/** Integer-cent arithmetic; stored movements do not identify cash/card account types or budgets. */
export function storedSummary(period: Period, rows: CanonicalMovement[]): Summary {
  const totals = (type: 'income' | 'expense') => {
    const categories = new Map<string, { name: string; cents: number }>()
    let cents = 0
    for (const row of rows) {
      if (row.type !== type || row.date < period.startDate || row.date > period.endDate) continue
      const amount = Math.round(Math.abs(row.amount) * 100)
      cents += amount
      const key = row.categoryId || row.categoryName || ''
      const category = categories.get(key) ?? { name: row.categoryName || row.categoryId || '', cents: 0 }
      category.cents += amount; categories.set(key, category)
    }
    return { cents, categories: [...categories.values()].map((c): CategoryTotal => ({ name: c.name, total: c.cents / 100, budget: 0 })) }
  }
  const income = totals('income'); const expense = totals('expense')
  return { period: { startDate: period.startDate, endDate: period.endDate }, income: income.cents / 100, expense: expense.cents / 100, net: (income.cents - expense.cents) / 100,
    cashExpense: 0, cardExpense: 0, incomeByCategory: income.categories, expenseByCategory: expense.categories, source: 'Stored data' }
}
