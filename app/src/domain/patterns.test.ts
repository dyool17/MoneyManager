import { expect, it } from 'vitest'
import { detectPatterns } from './patterns'
import type { Movement } from './types'
const mv = (date: string, amount: number, over: Partial<Movement> = {}): Movement => ({ id: date, date, amount, type: 'expense', assetId: 'a', accountName: '', rawCode: '1', isFuture: false, categoryId: 'c', categoryName: 'Food', ...over })
it('zero fills, excludes transfers/future and one-offs from typical, and keeps stable keys', () => {
  const p = detectPatterns([mv('2025-01-05', 100), mv('2025-03-05', 300), mv('2025-02-05', 999, { isFuture: true }), mv('2025-02-05', 999, { type: 'transfer-out' })], '2025-01', '2025-03', [{ id: 'e', label: 'private', start: '2025-03-01', categoryIds: ['c'], kind: 'one-off' }])
  expect(p.months).toEqual(['2025-01', '2025-02', '2025-03'])
  expect(p.categories[0]).toMatchObject({ key: 'c', name: 'Food', group: 'Food', monthly: [100, 0, 300], total: 400, typical: 0, trend: null, volatility: null, recentVsTypical: null })
  expect(JSON.stringify(p)).not.toContain('private')
})
it('measures regression, variation, recent ratio, income sources and rhythm', () => {
  const rows = Array.from({ length: 6 }, (_, i) => mv(`2025-0${i + 1}-10`, 100 + i * 10))
  const p = detectPatterns([...rows, ...rows.map(m => ({ ...m, type: 'income' as const, amount: 1000, content: 'Salary', date: m.date.slice(0, 8) + '25' }))], '2025-01', '2025-06')
  expect(p.categories[0]).toMatchObject({ typical: 125, trend: 10 })
  expect(p.categories[0]!.volatility).toBeCloseTo(0.136626, 5)
  expect(p.categories[0]!.recentVsTypical).toBe(1.12)
  expect(p.rhythm).toEqual({ byDay10: 1, byDay20: 1 })
  expect(p.income).toEqual({ monthly: [1000, 1000, 1000, 1000, 1000, 1000], typical: 1000, volatility: 0, sources: [{ label: 'Salary', typical: 1000, months: 6, day: 25 }] })
  expect(detectPatterns(rows.map(m => ({ ...m, amount: 250 - m.amount })), '2025-01', '2025-06').categories[0]!.trend).toBe(-10)
})
it('uses subcategory ids, sorts totals, and averages rhythm over nonempty months', () => {
  const p = detectPatterns([
    mv('2025-01-05', 20, { subcategoryId: 's', subcategoryName: 'Snacks' }),
    mv('2025-01-15', 30, { subcategoryId: 's', subcategoryName: 'Snacks' }),
    mv('2025-01-25', 50, { subcategoryId: 's', subcategoryName: 'Snacks' }),
    mv('2025-03-10', 200), mv('2025-04-01', 999),
  ], '2025-01', '2025-03')
  expect(p.categories.map(c => c.key)).toEqual(['c', 's'])
  expect(p.categories[1]).toMatchObject({ name: 'Snacks', group: 'Food', monthly: [100, 0, 0] })
  expect(p.rhythm).toEqual({ byDay10: 0.6, byDay20: 0.75 })
  expect(detectPatterns([], '2025-01', '2025-03')).toEqual({ months: ['2025-01', '2025-02', '2025-03'], categories: [], income: { monthly: [0, 0, 0], typical: 0, volatility: null, sources: [] }, rhythm: { byDay10: null, byDay20: null } })
})
it('uses the last twelve months for trend and a ten percent income similarity window', () => {
  const rows = Array.from({ length: 13 }, (_, i) => mv(`${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-05`, i === 0 ? 9999 : i * 10))
  expect(detectPatterns(rows, '2024-01', '2025-01').categories[0]!.trend).toBe(10)
  const income = [1000, 1050, 950, 2000].map((amount, i) => mv(`2025-0${i + 1}-25`, amount, { type: 'income', categoryName: 'Pay' }))
  const p = detectPatterns(income, '2025-01', '2025-04')
  expect(p.income.typical).toBe(1025)
  expect(p.income.volatility).toBeGreaterThan(0)
  expect(p.income.sources).toEqual([{ label: 'Pay', typical: 1000, months: 3, day: 25 }])
  expect(detectPatterns(income.slice(0, 2), '2025-01', '2025-02').income.sources).toEqual([])
})
it('requires calendar spikes to repeat in every observed year, but allows one-year evidence', () => {
  const rows = Array.from({ length: 24 }, (_, i) => mv(`${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-05`, i % 12 === 11 ? 200 : i === 5 ? 200 : 100))
  expect(detectPatterns(rows, '2024-01', '2025-12').categories[0]!.seasonal).toEqual(['12'])
  expect(detectPatterns(rows, '2024-01', '2024-12').categories[0]!.seasonal).toEqual(['06', '12'])
})
