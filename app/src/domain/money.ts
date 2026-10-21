import type { AssetGroup, CardGroup, Movement } from './types'

export type AccountKind = 'bank' | 'card' | 'loan'
export type AccountFilter = 'all' | AccountKind
export type HistoryRange = '6M' | '12M' | 'All'

export interface AccountRow {
  id: string
  name: string
  kind: AccountKind
  /** Group name for bank accounts and loans, "Credit card" for cards. */
  type: string
  /** Negative when it is a debt. */
  balance: number
  /** Percent within assets (balance >= 0) or within debts (balance < 0). */
  share: number
  color?: string
  linkedAssetId?: string
  closingDay?: string
  paymentDay?: string
}

const LOAN_GROUP = /loan|debt|mortgage/i

/**
 * One list for every account. What a card owes is always shown as debt: the
 * demo data reports it positive while the dashboard counts it against you.
 */
export function buildAccountRows(assets: AssetGroup[], cards: CardGroup[]): AccountRow[] {
  const cardIds = new Set(cards.flatMap((g) => g.items.map((c) => c.id)))
  const rows: Omit<AccountRow, 'share'>[] = [
    ...assets.flatMap((g) => g.items.filter((a) => !cardIds.has(a.id)).map((a) => ({
      id: a.id, name: a.name, color: a.color, type: g.name, balance: a.balance,
      kind: (a.balance < 0 || LOAN_GROUP.test(g.name) ? 'loan' : 'bank') as AccountKind,
    }))),
    ...cards.flatMap((g) => g.items.map((c) => ({
      id: c.id, name: c.name, color: c.color, type: 'Credit card', balance: -Math.abs(c.outstanding), kind: 'card' as const,
      linkedAssetId: c.linkedAssetId, closingDay: c.closingDay, paymentDay: c.paymentDay,
    }))),
  ]
  const owned = rows.filter((r) => r.balance >= 0).reduce((s, r) => s + r.balance, 0)
  const owed = rows.filter((r) => r.balance < 0).reduce((s, r) => s - r.balance, 0)
  return rows.map((r) => {
    const side = r.balance < 0 ? owed : owned
    return { ...r, share: side ? (Math.abs(r.balance) / side) * 100 : 0 }
  })
}

export const filterAccountRows = (rows: AccountRow[], filter: AccountFilter) =>
  filter === 'all' ? rows : rows.filter((r) => r.kind === filter)

export function sliceHistory<T>(points: T[], range: HistoryRange): T[] {
  if (range === 'All') return points
  return points.slice(-(range === '6M' ? 6 : 12))
}

/** Money in and out of one account across the given movements. */
export function accountFlow(movements: Movement[], assetId: string) {
  const flow = { in: 0, out: 0 }
  for (const m of movements) {
    if (m.assetId !== assetId) continue
    if (m.type === 'income' || m.type === 'transfer-in') flow.in += Math.abs(m.amount)
    else if (m.type === 'expense' || m.type === 'transfer-out') flow.out += Math.abs(m.amount)
  }
  return flow
}
