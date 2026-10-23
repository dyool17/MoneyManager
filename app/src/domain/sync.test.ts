import { describe, expect, it } from 'vitest'
import { canonical, conflicts, diffMonth, fingerprint, fromCanonical, summarize } from './sync'
import type { CanonicalMovement, IncomingChange } from './sync'
import type { Movement } from './types'
import type { WriteOp } from '../infrastructure/client'

const movement = (overrides: Partial<Movement> = {}): Movement => ({
  id: '1', date: '2026-10-01', type: 'expense', amount: 12,
  assetId: 'cash', accountName: 'Cash', rawCode: '2', isFuture: false, ...overrides,
})
const row = (overrides: Partial<CanonicalMovement> = {}): CanonicalMovement => ({
  id: '1', date: '2026-10-01', type: 'expense', amount: 12,
  assetId: 'cash', accountName: 'Cash', ...overrides,
})

describe('fingerprint', () => {
  it('is order independent, compares every compared field, and ignores display names', () => {
    const rows = [row(), row({ id: '2' })]
    expect(fingerprint(rows)).toBe(fingerprint([...rows].reverse()))
    expect(fingerprint(rows)).toBe(fingerprint(rows.map(m => ({ ...m, accountName: 'Renamed', categoryName: 'New', subcategoryName: 'New' }))))
    for (const change of [{ date: '2026-09-01' }, { type: 'income' as const }, { amount: 13 }, { assetId: 'bank' }, { toAssetId: 'bank' }, { categoryId: 'c' }, { subcategoryId: 's' }, { content: 'note' }, { detail: 'detail' }]) {
      expect(fingerprint(rows)).not.toBe(fingerprint([row(change), rows[1]!]))
    }
  })
})

describe('canonical', () => {
  it.each([-12.345, 12.345])('normalizes transfer amount %s to absolute cents and carries display names', (amount) => {
    expect(canonical(movement({ type: 'transfer-out', amount, toAssetId: 'bank', categoryId: 'c', categoryName: 'Food', subcategoryId: 's', subcategoryName: 'Lunch', content: ' note ', detail: ' detail ' }))).toEqual({
      id: '1', date: '2026-10-01', type: 'transfer-out', amount: 12.35, assetId: 'cash', toAssetId: 'bank', accountName: 'Cash', categoryId: 'c', categoryName: 'Food', subcategoryId: 's', subcategoryName: 'Lunch', content: 'note', detail: 'detail',
    })
  })
  it.each(['c', '', 'null'])('normalizes top-level subcategory %s and blank text', (subcategoryId) => {
    expect(canonical(movement({ categoryId: 'c', subcategoryId, content: '  ', detail: '\n' }))).toEqual({ ...row(), categoryId: 'c', subcategoryId: undefined, content: undefined, detail: undefined })
  })
  it('omits only backup transfer-in legs and keeps scheduled rows', () => {
    expect(canonical(movement({ type: 'transfer-in', rawCode: '4' }))).toBeNull()
    expect(canonical(movement({ type: 'transfer-in', rawCode: 'other' }))?.type).toBe('transfer-in')
    expect(canonical(movement({ date: '2099-01-01', isFuture: true }))).toEqual(row({ date: '2099-01-01' }))
  })
})

describe('installment notes', () => {
  it('drops the installment counter the phone appends to notes, so the backup note matches', () => {
    // Phone: "Motorbike ((5/18))"; backup: "Motorbike" with CARD_DIVIDE_MONTH_STR "(5/18)" kept apart.
    expect(canonical(movement({ content: 'Motorbike ((5/18))' }))?.content).toBe('Motorbike')
    expect(canonical(movement({ content: '  Furniture ((7/10)) ' }))?.content).toBe('Furniture')
    expect(canonical(movement({ content: '((1/3))' }))?.content).toBeUndefined()
    // Only a trailing double-parenthesis counter is removed; other notes stay as written.
    expect(canonical(movement({ content: 'Rent (1/2)' }))?.content).toBe('Rent (1/2)')
    expect(canonical(movement({ content: 'a ((5/18)) b' }))?.content).toBe('a ((5/18)) b')
    expect(diffMonth('2026-10', [row({ content: 'Motorbike' })], [canonical(movement({ content: 'Motorbike ((5/18))' }))!])).toEqual([])
  })
})

describe('diffMonth', () => {
  it('emits exact new, modified and deleted records in kind/date/id order without mutating inputs', () => {
    const before = row({ id: 'edit' })
    const after = row({ id: 'edit', date: '2026-10-02', type: 'income', amount: 20, assetId: 'bank', toAssetId: 'other', categoryId: 'c', subcategoryId: 's', content: 'note', detail: 'detail' })
    const gone = row({ id: 'gone' })
    const a = row({ id: 'a' }); const b = row({ id: 'b' }); const later = row({ id: 'later', date: '2026-10-03' })
    const local = [gone, before]; const remote = [later, b, after, a]
    expect(diffMonth('2026-10', local, remote)).toEqual([
      ...[a, b, later].map((remote) => ({ kind: 'new', id: remote.id, month: '2026-10', remote, changes: [] })),
      { kind: 'modified', id: 'edit', month: '2026-10', local: before, remote: after, changes: [
        { field: 'date', from: '2026-10-01', to: '2026-10-02' },
        { field: 'type', from: 'expense', to: 'income' },
        { field: 'amount', from: 12, to: 20 },
        { field: 'assetId', from: 'cash', to: 'bank' },
        { field: 'toAssetId', from: undefined, to: 'other' },
        { field: 'categoryId', from: undefined, to: 'c' },
        { field: 'subcategoryId', from: undefined, to: 's' },
        { field: 'content', from: undefined, to: 'note' },
        { field: 'detail', from: undefined, to: 'detail' },
      ] },
      { kind: 'deleted', id: 'gone', month: '2026-10', local: gone, changes: [] },
    ])
    expect(local).toEqual([gone, before]); expect(remote).toEqual([later, b, after, a])
  })
  it('compares normalized sources, ignoring all display names', () => {
    const backup = [movement({ type: 'transfer-out', amount: 12.344 }), movement({ id: '2', categoryId: 'c', subcategoryId: 'c', content: ' note ' })].map((m) => canonical(m)!)
    const phone = [movement({ type: 'transfer-out', amount: -12.34 }), movement({ id: '2', categoryId: 'c', content: 'note' })].map((m) => canonical({ ...m, accountName: 'Renamed', categoryName: 'Renamed', subcategoryName: 'Renamed' })!)
    expect(diffMonth('2026-10', backup, phone)).toEqual([])
  })
  it('reports a moved date once in the remote month and ignores unmatched local rows outside the read month', () => {
    const local = row({ date: '2026-09-30' }); const remote = row()
    expect(diffMonth('2026-10', [local, row({ id: 'elsewhere', date: '2026-09-01' })], [remote])).toEqual([
      { kind: 'modified', id: '1', month: '2026-10', local, remote, changes: [{ field: 'date', from: '2026-09-30', to: '2026-10-01' }] },
    ])
    // T3 must provide the known remote row when reconciling its old month.
    expect(diffMonth('2026-09', [local], [remote]).filter((c) => c.kind === 'deleted')).toEqual([])
  })
  it('records removal of optional fields and orders modified/deleted ties by id', () => {
    const local = ['b', 'a'].map((id) => row({ id, content: 'old' }))
    expect(diffMonth('2026-10', local, local.map((m) => ({ ...m, content: undefined }))).map((c) => [c.id, c.changes])).toEqual([
      ['a', [{ field: 'content', from: 'old', to: undefined }]], ['b', [{ field: 'content', from: 'old', to: undefined }]],
    ])
    expect(diffMonth('2026-10', local, []).map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('conflicts and summarize', () => {
  const changes: IncomingChange[] = [
    { kind: 'new', id: '1', month: '2026-10', remote: row(), changes: [] },
    { kind: 'modified', id: '2', month: '2026-09', local: row({ id: '2' }), remote: row({ id: '2' }), changes: [] },
    { kind: 'deleted', id: '3', month: '2026-10', local: row({ id: '3' }), changes: [] },
    { kind: 'new', id: 'no-op', month: '2026-09', remote: row({ id: 'no-op' }), changes: [] },
  ]
  it('matches only movement updates/deletes and preserves every pending match', () => {
    const transaction = { date: '2026-10-01', assetId: 'cash', payType: '0', categoryId: 'c', categoryName: 'Food', amount: 1, kind: 'expense' as const }
    const transfer = { date: '2026-10-01', fromAssetId: 'cash', fromAssetName: 'Cash', toAssetId: 'bank', toAssetName: 'Bank', amount: 1 }
    const asset = { groupId: 'g', groupName: 'Group', name: 'Asset', balance: 0 }
    const card = { name: 'Card', linkAssetId: 'cash', linkAssetName: 'Cash', closingDay: 1, paymentDay: 2 }
    const ops: WriteOp[] = [
      { op: 'update-transaction', id: '1', fields: transaction }, { op: 'update-transfer', id: '2', fields: transfer },
      { op: 'delete-transactions', ids: ['3', '1'] }, { op: 'update-transaction', id: 'absent', fields: transaction },
      { op: 'create-transaction', fields: transaction }, { op: 'create-transfer', fields: transfer },
      { op: 'create-asset', fields: asset }, { op: 'update-asset', assetId: '1', fields: asset }, { op: 'delete-asset', assetId: '1' },
      { op: 'create-card', fields: card, outstanding: 0 }, { op: 'update-card', assetId: '1', fields: card },
    ]
    const outbox = ops.map((op, i) => ({ id: `pending-${i}`, label: `Operation ${i}`, op }))
    expect(conflicts(changes, outbox)).toEqual([[0, 0], [0, 2], [1, 1], [2, 2]].map(([c, p]) => ({ change: changes[c!], pending: { id: outbox[p!]!.id, label: outbox[p!]!.label } })))
    expect(conflicts(changes, [])).toEqual([])
  })
  it('counts every kind per month in chronological order', () => {
    expect(summarize(changes)).toEqual([
      { month: '2026-09', new: 1, modified: 1, deleted: 0 },
      { month: '2026-10', new: 1, modified: 0, deleted: 1 },
    ])
    expect(summarize([])).toEqual([])
  })
})

describe('fromCanonical', () => {
  it('turns a stored row back into a movement for reports, with the phone codes and the future flag', () => {
    const stored = canonical(movement({ id: 'x', date: '2026-11-02', type: 'transfer-out', rawCode: '3', amount: -50, toAssetId: 'bank' }))!
    expect(fromCanonical(stored, '2026-10-21')).toEqual({
      id: 'x', date: '2026-11-02', type: 'transfer-out', rawCode: '3', amount: 50, isFuture: true,
      assetId: 'cash', toAssetId: 'bank', accountName: 'Cash',
      categoryId: undefined, categoryName: undefined, subcategoryId: undefined, subcategoryName: undefined,
      content: undefined, detail: undefined,
    })
    expect(fromCanonical(canonical(movement({ type: 'income', rawCode: '0' }))!, '2026-10-21')).toMatchObject({ rawCode: '0', isFuture: false })
    expect(fromCanonical(canonical(movement({ type: 'expense', rawCode: '1' }))!, '2026-10-21').rawCode).toBe('1')
  })
})
