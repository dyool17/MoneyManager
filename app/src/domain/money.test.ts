import { describe, expect, it } from 'vitest'
import { accountFlow, buildAccountRows, filterAccountRows, sliceHistory } from './money'
import type { AssetGroup, CardGroup, Movement } from './types'

const assets: AssetGroup[] = [
  { id: 'g1', name: 'Bank accounts', balance: 900, items: [
    { id: 'a1', name: 'Checking', balance: 600, color: '#111' },
    { id: 'a2', name: 'Savings', balance: 300 },
  ] },
  { id: 'g2', name: 'Loans', balance: -1000, items: [{ id: 'a3', name: 'Car loan', balance: -1000 }] },
]
const cards: CardGroup[] = [
  { id: 'c', name: 'Cards', balance: 0, outstanding: -200, items: [
    { id: 'k1', name: 'Visa', balance: 0, outstanding: -200, linkedAssetId: 'a1', closingDay: '5', paymentDay: '20' },
  ] },
]

describe('buildAccountRows', () => {
  const rows = buildAccountRows(assets, cards)
  it('merges bank accounts, cards and loans into one list', () => {
    expect(rows.map((r) => [r.id, r.kind, r.type, r.balance])).toEqual([
      ['a1', 'bank', 'Bank accounts', 600],
      ['a2', 'bank', 'Bank accounts', 300],
      ['a3', 'loan', 'Loans', -1000],
      ['k1', 'card', 'Credit card', -200],
    ])
  })
  it('computes shares within assets and within debts', () => {
    expect(rows.map((r) => Math.round(r.share))).toEqual([67, 33, 83, 17])
  })
  it('always counts what a card owes as debt, whatever sign the phone reports', () => {
    const positive: CardGroup[] = [{ ...cards[0]!, items: cards[0]!.items.map((c) => ({ ...c, outstanding: 1400 })) }]
    const row = buildAccountRows(assets, positive).find((r) => r.id === 'k1')!
    expect(row.balance).toBe(-1400)
    expect(row.kind).toBe('card')
  })

  it('keeps card details and colors', () => {
    expect(rows[3]).toMatchObject({ linkedAssetId: 'a1', closingDay: '5', paymentDay: '20' })
    expect(rows[0].color).toBe('#111')
  })
  it('gives a zero share when a side has no money', () => {
    expect(buildAccountRows([], []).length).toBe(0)
    expect(buildAccountRows([{ id: 'g', name: 'Cash', balance: 0, items: [{ id: 'z', name: 'Wallet', balance: 0 }] }], [])[0].share).toBe(0)
  })
})

describe('filterAccountRows', () => {
  const rows = buildAccountRows(assets, cards)
  it('filters by kind', () => {
    expect(filterAccountRows(rows, 'all').length).toBe(4)
    expect(filterAccountRows(rows, 'bank').map((r) => r.id)).toEqual(['a1', 'a2'])
    expect(filterAccountRows(rows, 'card').map((r) => r.id)).toEqual(['k1'])
    expect(filterAccountRows(rows, 'loan').map((r) => r.id)).toEqual(['a3'])
  })
})

describe('sliceHistory', () => {
  const pts = Array.from({ length: 20 }, (_, i) => ({ label: `m${i}`, value: i }))
  it('keeps the last N points or all', () => {
    expect(sliceHistory(pts, '6M').map((p) => p.value)).toEqual([14, 15, 16, 17, 18, 19])
    expect(sliceHistory(pts, '12M').length).toBe(12)
    expect(sliceHistory(pts, 'All').length).toBe(20)
    expect(sliceHistory(pts.slice(0, 3), '6M').length).toBe(3)
  })
})

describe('accountFlow', () => {
  const m = (id: string, type: Movement['type'], amount: number, assetId = 'a1'): Movement =>
    ({ id, date: '2026-10-01', assetId, accountName: 'x', amount, type, rawCode: '', isFuture: false })
  it('sums money in and out for one account only', () => {
    const flow = accountFlow([m('1', 'income', 100), m('2', 'transfer-in', 50), m('3', 'expense', 30), m('4', 'transfer-out', 20), m('5', 'income', 999, 'a2'), m('6', 'unknown', 7)], 'a1')
    expect(flow).toEqual({ in: 150, out: 50 })
  })
})
