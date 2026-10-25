import { expect, it } from 'vitest'
import { distributeAccounts } from './account-distribution'
import { emptyMetadata, type MetadataState } from './metadata'

it('partitions signed converted balances disjointly, including zeros and mixed limbo', () => {
  const state: MetadataState = { ...emptyMetadata(), baseCurrency: 'USD', overrides: {} }
  const amounts = [100, -20, 30, -40, 0, 0]
  amounts.forEach((_, i) => { state.overrides[String(i)] = { includeInTotals: i < 2 || i === 4, currency: i === 0 ? 'EUR' : 'USD', rate: i === 0 ? 2 : 1 } })
  const result = distributeAccounts(amounts.map((amount, i) => ({ id: String(i), name: `Account ${i}`, amount })), state)
  expect(result.positive.map(r => r.amount)).toEqual([200])
  expect(result.negative.map(r => r.amount)).toEqual([-20])
  expect(result.limbo.map(r => r.amount)).toEqual([30, -40, 0])
  expect(result.zero.map(r => r.amount)).toEqual([0])
  expect(result.limboNet).toBe(-10)
  expect(result.unresolved).toEqual([])
})

it('exposes missing metadata, invalid FX, nonfinite amounts and duplicate IDs as unresolved', () => {
  const state: MetadataState = { ...emptyMetadata(), baseCurrency: 'USD', overrides: {
    bad: { includeInTotals: false, currency: 'EUR', rate: NaN },
    infinite: { includeInTotals: true, currency: 'USD', rate: 1 },
    dup: { includeInTotals: true, currency: 'USD', rate: 1 },
  } }
  const rows = [{ id: 'missing', name: 'Missing', amount: 5 }, { id: 'bad', name: 'Bad', amount: 5 }, { id: 'infinite', name: 'Infinite', amount: Infinity }, { id: 'dup', name: 'Duplicate', amount: 3 }, { id: 'dup', name: 'Duplicate', amount: 7 }]
  const result = distributeAccounts(rows, state)
  expect(result.unresolved.map(r => r.id)).toEqual(['missing', 'bad', 'infinite', 'dup', 'dup'])
  expect([...result.positive, ...result.negative, ...result.limbo, ...result.zero]).toEqual([])
  expect(distributeAccounts([{ id: 'dup', name: 'x', amount: 1 }], emptyMetadata()).unresolved).toHaveLength(1)
})
