import type { Movement, MovementType } from './types'
import type { WriteOp } from '../infrastructure/client'

/** Source-independent comparison data; names are display-only. */
export interface CanonicalMovement {
  id: string
  date: string
  type: MovementType
  amount: number
  assetId: string
  toAssetId?: string
  categoryId?: string
  subcategoryId?: string
  content?: string
  detail?: string
  accountName: string
  categoryName?: string
  subcategoryName?: string
}

/** The phone appends the installment counter to the note ("Motorbike ((5/18))"); backups keep it in a separate column. */
const INSTALLMENT = /\s*\(\(\d+\/\d+\)\)$/
const note = (s: string | undefined) => s?.trim().replace(INSTALLMENT, '').trim() || undefined

export function canonical(m: Movement): CanonicalMovement | null {
  if (m.type === 'transfer-in' && m.rawCode === '4') return null
  const subcategoryId = !m.subcategoryId || m.subcategoryId === 'null' || m.subcategoryId === m.categoryId
    ? undefined : m.subcategoryId
  return {
    id: m.id, date: m.date, type: m.type,
    amount: Math.round((Math.abs(m.amount) + Number.EPSILON) * 100) / 100,
    assetId: m.assetId, toAssetId: m.toAssetId,
    categoryId: m.categoryId, subcategoryId,
    content: note(m.content), detail: m.detail?.trim() || undefined,
    accountName: m.accountName, categoryName: m.categoryName, subcategoryName: m.subcategoryName,
  }
}

export type ComparedField = 'date' | 'type' | 'amount' | 'assetId' | 'toAssetId' | 'categoryId' | 'subcategoryId' | 'content' | 'detail'
export interface FieldChange {
  field: ComparedField
  from: string | number | undefined
  to: string | number | undefined
}
export interface IncomingChange {
  kind: 'new' | 'modified' | 'deleted'
  id: string
  month: string
  local?: CanonicalMovement
  remote?: CanonicalMovement
  changes: FieldChange[]
}

const comparedFields: ComparedField[] = ['date', 'type', 'amount', 'assetId', 'toAssetId', 'categoryId', 'subcategoryId', 'content', 'detail']
/** Stable content identity, excluding mutable display labels. */
export function fingerprint(rows: CanonicalMovement[]): string {
  const text = JSON.stringify([...rows].sort((a, b) => compareText(a.id, b.id))
    .map(row => [row.id, ...comparedFields.map(field => row[field])]))
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const kindOrder = { new: 0, modified: 1, deleted: 2 }
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

/** Local includes the read month's rows plus any local ids present remotely.
 * Cross-month deletion suppression across separate reads belongs to the engine.
 */
export function diffMonth(month: string, local: CanonicalMovement[], remote: CanonicalMovement[]): IncomingChange[] {
  const localById = new Map(local.map((m) => [m.id, m]))
  const remoteIds = new Set(remote.map((m) => m.id))
  const result: IncomingChange[] = []
  for (const next of remote) {
    const previous = localById.get(next.id)
    if (!previous) {
      result.push({ kind: 'new', id: next.id, month: next.date.slice(0, 7), remote: next, changes: [] })
      continue
    }
    const changes: FieldChange[] = comparedFields
      .filter((field) => previous[field] !== next[field])
      .map((field) => ({ field, from: previous[field], to: next[field] }))
    if (changes.length) result.push({ kind: 'modified', id: next.id, month: next.date.slice(0, 7), local: previous, remote: next, changes })
  }
  for (const previous of local) {
    if (previous.date.slice(0, 7) === month && !remoteIds.has(previous.id)) {
      result.push({ kind: 'deleted', id: previous.id, month: previous.date.slice(0, 7), local: previous, changes: [] })
    }
  }
  return result.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]
    || compareText((a.remote ?? a.local)!.date, (b.remote ?? b.local)!.date)
    || compareText(a.id, b.id))
}

export interface Conflict {
  change: IncomingChange
  pending: { id: string; label: string }
}

export function conflicts(changes: IncomingChange[], outbox: { id: string; label: string; op: WriteOp }[]): Conflict[] {
  const result: Conflict[] = []
  for (const change of changes) {
    for (const pending of outbox) {
      const op = pending.op
      const matches = op.op === 'delete-transactions' ? op.ids.includes(change.id)
        : (op.op === 'update-transaction' || op.op === 'update-transfer') && op.id === change.id
      if (matches) result.push({ change, pending: { id: pending.id, label: pending.label } })
    }
  }
  return result
}

export function summarize(changes: IncomingChange[]): { month: string; new: number; modified: number; deleted: number }[] {
  const months = new Map<string, { month: string; new: number; modified: number; deleted: number }>()
  for (const change of changes) {
    let counts = months.get(change.month)
    if (!counts) {
      counts = { month: change.month, new: 0, modified: 0, deleted: 0 }
      months.set(change.month, counts)
    }
    counts[change.kind]++
  }
  return [...months.values()].sort((a, b) => compareText(a.month, b.month))
}
