import { describe, expect, it } from 'vitest'
import { emptyMetadata, importMetadata, overrideMetadata, resolveMetadata, calculateTotals, validateState } from './metadata'

const settings = { includeInTotals: true, currency: 'GTQ', rate: 1 }
const snapshot = { baseCurrency: 'GTQ', importedAt: '2026-10-20T12:00:00Z', accounts: {
  cash: { name: 'Cash', ...settings }, cxc: { name: 'CxC', ...settings, includeInTotals: false },
} }

describe('account metadata', () => {
  it('excludes CxC 550, converts currency and reproduces net 44513.75', () => {
    let state = importMetadata(emptyMetadata(), snapshot, ['cash', 'cxc'])
    state = overrideMetadata(state, 'usd', { ...settings, currency: 'USD', rate: 7.78 }, 'GTQ')
    state = overrideMetadata(state, 'card', settings, 'GTQ')
    const totals = calculateTotals([
      { id: 'cash', name: 'Cash', amount: 48813.91 },
      { id: 'usd', name: 'USD', amount: 43.64 },
      { id: 'cxc', name: 'CxC', amount: 550 },
      { id: 'card', name: 'Card', amount: -4639.68 },
    ], state)
    expect(totals.missing).toEqual([])
    expect(totals.netWorth).toBeCloseTo(44513.7492, 6)
    expect(totals.netWorth?.toFixed(2)).toBe('44513.75')
    expect(totals.debts).toBe(-4639.68)
    expect(totals.assetShares.map(s => s.name)).not.toContain('CxC')
  })

  it('preserves explicit overrides on import and reset restores imported values', () => {
    let state = overrideMetadata(emptyMetadata(), 'cxc', settings, 'GTQ')
    state = importMetadata(state, snapshot, ['cxc'])
    expect(resolveMetadata(state, 'cxc')).toEqual(settings)
    expect(resolveMetadata(state, 'cash')?.includeInTotals).toBe(true)
    state = overrideMetadata(state, 'cxc', null, 'GTQ')
    expect(resolveMetadata(state, 'cxc')?.includeInTotals).toBe(false)
    expect(resolveMetadata(state, 'missing')).toBeUndefined()
  })

  it('keeps incomplete totals unavailable, including newly discovered accounts', () => {
    const state = importMetadata(emptyMetadata(), snapshot, ['cash'])
    expect(calculateTotals([{ id: 'new', name: 'New', amount: 1 }], state)).toMatchObject({ missing: ['new'], netWorth: null })
    expect(calculateTotals([], emptyMetadata()).netWorth).toBeNull()
  })

  it('rejects invalid settings, unrelated backups and base-currency changes without mutating state', () => {
    const state = overrideMetadata(emptyMetadata(), 'cash', settings, 'GTQ')
    const before = JSON.stringify(state)
    for (const rate of [0, -1, NaN, Infinity]) {
      expect(() => overrideMetadata(state, 'usd', { ...settings, currency: 'USD', rate }, 'GTQ')).toThrow()
    }
    expect(() => overrideMetadata(state, 'cash', { ...settings, rate: 2 }, 'GTQ')).toThrow()
    expect(() => importMetadata(state, snapshot, ['unrelated'])).toThrow(/match/)
    expect(() => importMetadata(state, { ...snapshot, baseCurrency: 'USD' }, ['cash'])).toThrow()
    expect(JSON.stringify(state)).toBe(before)
  })

  it('round trips validated local metadata and rejects malformed saved data', () => {
    const state = importMetadata(emptyMetadata(), snapshot, ['cash'])
    expect(validateState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(() => validateState({ ...state, overrides: { cash: { ...settings, includeInTotals: 'false' } } })).toThrow()
    expect(() => validateState({ ...state, version: 9 })).toThrow()
  })
})
