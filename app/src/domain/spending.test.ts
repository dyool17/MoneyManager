import { describe, expect, it } from 'vitest'
import { categoryRows, filterMovements, spendingKpis, totalsFromMovements } from './spending'
import type { Movement } from './types'

const mv = (o: Partial<Movement>): Movement => ({
  id: 'x', date: '2026-08-02', assetId: 'a1', accountName: 'Cash', amount: 10, type: 'expense', rawCode: '1', isFuture: false, ...o,
})
const rows: Movement[] = [
  mv({ id: '1', categoryName: 'Food', amount: 40, content: 'Lunch at Bar' }),
  mv({ id: '2', categoryName: 'Food', amount: 60, assetId: 'a2' }),
  mv({ id: '3', categoryName: 'Rent', amount: 500, detail: 'August' }),
  mv({ id: '4', categoryName: 'Salary', amount: 2000, type: 'income' }),
  mv({ id: '5', type: 'transfer-out', assetId: 'a1', toAssetId: 'a2', amount: 100 }),
  mv({ id: '6', type: 'transfer-in', assetId: 'a2', toAssetId: 'a1', amount: 100 }),
  mv({ id: '7', categoryName: 'Food', amount: 25, isFuture: true }),
]
const none = { category: '', account: '', type: '' as const, text: '' }
const ids = (l: Movement[]) => l.map((m) => m.id)

describe('filterMovements', () => {
  it('returns everything without filters', () => {
    expect(ids(filterMovements(rows, none))).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })
  it('filters by category name', () => {
    expect(ids(filterMovements(rows, { ...none, category: 'Food' }))).toEqual(['1', '2', '7'])
  })
  it('matches an account as source or destination', () => {
    expect(ids(filterMovements(rows, { ...none, account: 'a2' }))).toEqual(['2', '5', '6'])
  })
  it('groups both transfer directions under transfer', () => {
    expect(ids(filterMovements(rows, { ...none, type: 'transfer' }))).toEqual(['5', '6'])
    expect(ids(filterMovements(rows, { ...none, type: 'income' }))).toEqual(['4'])
  })
  it('searches note and detail, case-insensitively', () => {
    expect(ids(filterMovements(rows, { ...none, text: 'lunch' }))).toEqual(['1'])
    expect(ids(filterMovements(rows, { ...none, text: 'AUGUST' }))).toEqual(['3'])
  })
})

describe('spendingKpis', () => {
  it('sums recorded income and expense and counts every filtered movement', () => {
    expect(spendingKpis(rows, none)).toEqual({ expense: 600, income: 2000, count: 7, share: null })
  })
  it('reports the category share of all spending', () => {
    const k = spendingKpis(rows, { ...none, category: 'Food' })
    expect(k).toEqual({ expense: 100, income: 0, count: 3, share: 100 / 600 })
  })
  it('keeps the share null when nothing was spent', () => {
    expect(spendingKpis([], { ...none, category: 'Food' }).share).toBeNull()
  })
})

describe('totalsFromMovements', () => {
  it('totals recorded movements of one type per category with budgets', () => {
    const t = totalsFromMovements(rows, 'expense', { Food: 80 })
    expect(t).toEqual([
      { name: 'Rent', total: 500, budget: 0 },
      { name: 'Food', total: 100, budget: 80 },
    ])
  })
})

describe('categoryRows', () => {
  const totals = [
    { name: 'Rent', total: 500, budget: 600 },
    { name: 'Food', total: 300, budget: 200 },
    { name: 'Gifts', total: 50, budget: 0 },
  ]
  const r = categoryRows(totals)
  it('sorts by amount and scales to the largest of spend and budget', () => {
    expect(r.map((x) => x.name)).toEqual(['Rent', 'Food', 'Gifts'])
    expect(r[0].width).toBeCloseTo(500 / 600)
    expect(r[0].tick).toBe(1)
    expect(r[1].width).toBeCloseTo(300 / 600)
    expect(r[1].tick).toBeCloseTo(200 / 600)
    expect(r[2].tick).toBeNull()
  })
  it('flags state and budget text values', () => {
    expect(r[0]).toMatchObject({ state: 'within', percent: 83, overBy: 0 })
    expect(r[1]).toMatchObject({ state: 'over', percent: 150, overBy: 100 })
    expect(r[2]).toMatchObject({ state: 'none', percent: null, overBy: 0 })
  })
  it('handles an empty list', () => {
    expect(categoryRows([])).toEqual([])
  })
})
