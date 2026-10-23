import { expect, it } from 'vitest'
import { forecast } from './forecast'
import { detectPatterns } from './patterns'
import type { Movement } from './types'
const mv = (date: string, amount: number, over: Partial<Movement> = {}): Movement => ({ id: date, date, amount, type: 'expense', assetId: 'a', accountName: '', rawCode: '1', isFuture: false, categoryId: 'c', categoryName: 'Food', content: 'Bill', ...over })
const history = Array.from({ length: 12 }, (_, i) => mv(`2025-${String(i + 1).padStart(2, '0')}-10`, i === 11 ? 200 : 100))
it('projects current rhythm, six whole months, income, net, cumulative and seasonal basis without leaking descriptions', () => {
  const movements = [...history, mv('2026-01-05', 40), ...history.map(m => ({ ...m, type: 'income' as const, amount: 500 }))]
  const patterns = detectPatterns(movements, '2025-01', '2025-12')
  const f = forecast({ patterns, movements, today: '2026-01-10' })
  expect(f.months).toHaveLength(7)
  expect(f.months[0]).toMatchObject({ month: '2026-01', expense: 40, income: 500, net: 460, lines: [{ key: 'c', name: 'Food', amount: 40, basis: ['typical'] }] })
  expect(f.months[1]!.expense).toBe(100)
  expect(f.cumulativeNet).toBe(2860)
  expect(forecast({ patterns, movements, today: '2026-11-30', horizon: 1 }).months[1]!.lines[0]).toMatchObject({ amount: 200, basis: ['typical', 'seasonal'] })
  expect(JSON.stringify(f)).not.toContain('Bill')
})
it('counts scheduled repeating charges once and adds genuinely additional commitments and new categories', () => {
  const movements = [...history.slice(0, 6), mv('2026-02-15', 100, { isFuture: true }), mv('2026-02-16', 30, { isFuture: true, content: 'Extra' }), mv('2026-02-17', 20, { categoryId: 'x', categoryName: 'Other', isFuture: true })]
  const f = forecast({ patterns: detectPatterns(movements, '2025-01', '2025-06'), movements, today: '2026-01-31', horizon: 1 })
  expect(f.months[1]!.expense).toBe(150)
  expect(f.months[1]!.lines[0]!.basis).toEqual(['typical', 'scheduled'])
})
it('uses clear trend only, and replaces baselines for temporary and new-normal events', () => {
  const movements = Array.from({ length: 6 }, (_, i) => mv(`2025-0${i + 1}-10`, 100 + 10 * i))
  const patterns = detectPatterns(movements, '2025-01', '2025-06')
  expect(forecast({ patterns, movements, today: '2025-07-31', horizon: 1 }).months[1]!.lines[0]).toMatchObject({ amount: 170, basis: ['typical', 'trend'] })
  for (const kind of ['temporary', 'new-normal'] as const) {
    const events = [{ id: 'e', label: 'secret', categoryIds: ['c'], start: '2025-05-01', end: kind === 'temporary' ? '2025-08-31' : undefined, kind }]
    const f = forecast({ patterns, movements, today: '2025-07-31', horizon: 2, events })
    expect(f.months[1]!.lines[0]).toMatchObject({ amount: 145, basis: ['typical', kind === 'temporary' ? 'event' : 'new-normal'] })
    if (kind === 'temporary') expect(f.months[2]!.lines[0]!.basis).not.toContain('event')
  }
})
it('rounds cents, uses rhythm interpolation and ignores future entries and transfers as actual', () => {
  const movements = [mv('2025-01-05', 20), mv('2025-01-15', 30), mv('2025-01-25', 50)]
  const patterns = detectPatterns(movements, '2025-01', '2025-01')
  const result = forecast({ patterns, movements: [...movements, mv('2026-01-03', 10.123), mv('2026-01-04', 999, { type: 'transfer-out' }), mv('2026-01-04', 999, { isFuture: true }), mv('2026-02-01', 5000, { isFuture: false, type: 'income' })], today: '2026-01-15', horizon: 1 })
  expect(result.months[0]!.expense).toBe(75.12)
  expect(result.months[1]!.income).toBe(5000)
  expect(result.cumulativeNet).toBe(4824.88)
})
it('keeps budgets as reference rather than a spending target', () => {
  const patterns = detectPatterns(history, '2025-01', '2025-12')
  const input = { patterns, movements: history, today: '2026-01-31', horizon: 1 }
  expect(forecast({ ...input, plan: { importedAt: '', budgets: [{ categoryId: 'c', name: 'Food', parent: '', amount: 999, overrides: {} }] } })).toEqual(forecast(input))
})
