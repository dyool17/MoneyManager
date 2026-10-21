import { describe, expect, it } from 'vitest'
import {
  covers, coversMovement, describeEvents, excludeOneOffFromBaseline, validateLifeEvents,
  type LifeEvent,
} from './life-events'
import type { Movement } from './types'
import type { MonthTotal } from './insights'

const ev = (over: Partial<LifeEvent>): LifeEvent => ({
  id: 'e1', label: 'Moving', start: '2026-03-01', end: '2026-03-31', categoryIds: ['gifts'], kind: 'one-off', ...over,
})
const mv = (over: Partial<Movement>): Movement => ({
  id: 'm1', date: '2026-03-10', assetId: 'a', accountName: 'Cash', amount: 100, type: 'expense', rawCode: '1', isFuture: false, ...over,
})

describe('life events', () => {
  it('covers dates inside the window and events affect listed category or subcategory ids', () => {
    expect(covers(ev({}), '2026-02-28')).toBe(false)
    expect(covers(ev({}), '2026-03-01')).toBe(true)
    expect(covers(ev({}), '2026-03-31')).toBe(true)
    expect(covers(ev({}), '2026-04-01')).toBe(false)
    expect(covers(ev({ end: undefined }), '2027-01-01')).toBe(true)
    expect(coversMovement(ev({}), mv({ categoryId: 'var', subcategoryId: 'gifts' }))).toBe(true)
    expect(coversMovement(ev({}), mv({ categoryId: 'var', subcategoryId: 'food' }))).toBe(false)
    expect(coversMovement(ev({ categoryIds: ['var'] }), mv({ categoryId: 'var', subcategoryId: 'food' }))).toBe(true)
  })

  it('removes one-off spending inside the event window from the projection baseline months', () => {
    const events = [ev({}), ev({ id: 'e2', kind: 'temporary', categoryIds: ['food'] })]
    const movements = [
      mv({ id: 'm1', date: '2026-03-10', amount: 400, categoryId: 'var', subcategoryId: 'gifts' }), // inside one-off
      mv({ id: 'm2', date: '2026-03-11', amount: 50, categoryId: 'var', subcategoryId: 'food' }), // temporary, not removed
      mv({ id: 'm3', date: '2026-04-10', amount: 70, categoryId: 'var', subcategoryId: 'gifts' }), // after window
      mv({ id: 'm4', date: '2026-02-10', amount: 30, categoryId: 'var', subcategoryId: 'gifts' }),
    ]
    const months: MonthTotal[] = [
      { month: '2026-02', income: 1000, expense: 30, net: 970 },
      { month: '2026-03', income: 1000, expense: 520, net: 480 },
      { month: '2026-04', income: 1000, expense: 70, net: 930 },
    ]
    expect(excludeOneOffFromBaseline(months, events, movements)).toEqual([
      { month: '2026-02', income: 1000, expense: 30, net: 970 },
      { month: '2026-03', income: 1000, expense: 120, net: 880 },
      { month: '2026-04', income: 1000, expense: 70, net: 930 },
    ])
  })

  it('describes events for the AI, hiding labels unless details are shared', () => {
    const events = [ev({}), ev({ id: 'e2', label: 'Baby arrived', start: '2026-01-15', end: undefined, kind: 'new-normal', categoryIds: ['gifts', 'food'] })]
    const names = new Map([['gifts', 'Gifts'], ['food', 'Food']])
    const text = describeEvents(events, '2026-01-01', '2026-06-30', false, names)
    expect(text).toEqual([
      '## Life events (dates affect how spending should be read)',
      '- 2026-01-15 onwards: New normal in Gifts, Food; the monthly baseline of these categories restarts there.',
      '- 2026-03-01 to 2026-03-31: One-off in Gifts; exclude these days from the projection baseline.',
    ])
    const shared = describeEvents(events, '2026-01-01', '2026-06-30', true, names)
    expect(shared[1]).toBe('- "Baby arrived" 2026-01-15 onwards: New normal in Gifts, Food; the monthly baseline of these categories restarts there.')
    expect(shared[2]).toBe('- "Moving" 2026-03-01 to 2026-03-31: One-off in Gifts; exclude these days from the projection baseline.')
  })

  it('validates state read back from storage and throws on anything unexpected', () => {
    expect(() => validateLifeEvents({ events: [ev({ id: '' })] })).toThrow('Invalid saved life events.')
    expect(() => validateLifeEvents({ events: [ev({ kind: 'someday' as never })] })).toThrow('Invalid saved life events.')
    expect(() => validateLifeEvents({ events: [ev({ start: '2026-3-1' })] })).toThrow('Invalid saved life events.')
    expect(() => validateLifeEvents({ events: [ev({ end: '2026-02-01' })] })).toThrow('Invalid saved life events.')
    expect(() => validateLifeEvents({ events: [ev({ categoryIds: [] })] })).toThrow('Invalid saved life events.')
    expect(validateLifeEvents({ events: [ev({ end: undefined })] })).toEqual({ events: [ev({ end: undefined })] })
    expect(() => validateLifeEvents({ other: true })).toThrow('Invalid saved life events.')
  })
})
