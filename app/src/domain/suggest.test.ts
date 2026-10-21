import { describe, expect, it } from 'vitest'
import { suggestCategory } from './suggest'
import type { Movement } from './types'

let id = 0
const mv = (content: string, categoryId: string, subcategoryId?: string, type: Movement['type'] = 'expense', assetId = 'cash'): Movement => ({
  id: String(++id), date: '2026-09-01', assetId, accountName: assetId, amount: 10, type, rawCode: '1', isFuture: false,
  content, categoryId, categoryName: categoryId.toUpperCase(), subcategoryId, subcategoryName: subcategoryId?.toUpperCase(),
})

const history = [
  mv('Uber', 'fixed', 'transport', 'expense', 'card'),
  mv('uber ', 'fixed', 'transport', 'expense', 'card'),
  mv('Uber', 'variable', 'misc'),
  mv('Uber Eats pizza', 'variable', 'food'),
  mv('Salary', 'work', undefined, 'income', 'bank'),
]

describe('suggestCategory', () => {
  it('picks the category used most often for the same note, ignoring case and spaces', () => {
    expect(suggestCategory('UBER', 'expense', history)).toEqual({ categoryId: 'fixed', subcategoryId: 'transport', assetId: 'card', label: 'FIXED › TRANSPORT', count: 2 })
  })

  it('falls back to notes that start with the same words', () => {
    expect(suggestCategory('Uber Eats', 'expense', history)?.subcategoryId).toBe('food')
  })

  it('only looks at movements of the same kind', () => {
    expect(suggestCategory('Salary', 'expense', history)).toBeNull()
    expect(suggestCategory('Salary', 'income', history)?.categoryId).toBe('work')
  })

  it('needs at least three letters and a known note', () => {
    expect(suggestCategory('Ub', 'expense', history)).toBeNull()
    expect(suggestCategory('Groceries', 'expense', history)).toBeNull()
  })
})
