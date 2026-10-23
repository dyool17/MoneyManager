import type { Movement } from './types'
import type { MonthTotal } from './insights'

/**
 * Life events the user records to explain unusual spending: a move, an illness, a new baby,
 * more office days. Stored only on this computer; labels reach the assistant only when the
 * user shares details. Pure and deterministic.
 */

export type EventKind = 'one-off' | 'new-normal' | 'temporary'

export interface LifeEvent {
  id: string
  /** A short private note, for example "Moving" or "Baby arrived". */
  label: string
  start: string
  /** Open event when absent. */
  end?: string
  /** Category or subcategory ids the event explains, matched like budgets do. */
  categoryIds: string[]
  relieved?: string[]
  expected?: Record<string, number>
  kind: EventKind
}

export interface LifeEventState { events: LifeEvent[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const KINDS: EventKind[] = ['one-off', 'new-normal', 'temporary']
/** Whether `date` falls inside the event window. */
export const covers = (e: LifeEvent, date: string): boolean => date >= e.start && (!e.end || date <= e.end)

/** Whether the event explains spending on this movement: the date falls inside and the category is listed. */
export const coversMovement = (e: LifeEvent, m: Movement): boolean =>
  covers(e, m.date) && (m.categoryId !== undefined && e.categoryIds.includes(m.categoryId) || m.subcategoryId !== undefined && e.categoryIds.includes(m.subcategoryId))

/** Whether an affected or relieved category participates in the event window. */
export const involves = (e: LifeEvent, m: Movement): boolean =>
  coversMovement(e, m) || covers(e, m.date) && [m.categoryId, m.subcategoryId].some(id => id !== undefined && e.relieved?.includes(id))

/**
 * One-off spikes do not describe the normal month, so their spending inside the event window is
 * removed from the projection baseline months. Other kinds stay: temporary is expected spend,
 * and a new normal is by definition the new baseline.
 */
export function excludeOneOffFromBaseline(months: MonthTotal[], events: LifeEvent[], movements: Movement[]): MonthTotal[] {
  const oneOff = events.filter((e) => e.kind === 'one-off')
  if (!oneOff.length) return months
  const perMonth = new Map<string, number>()
  for (const m of movements) {
    if (m.type !== 'expense' || m.isFuture || !oneOff.some((e) => coversMovement(e, m))) continue
    const k = m.date.slice(0, 7)
    perMonth.set(k, (perMonth.get(k) ?? 0) + m.amount)
  }
  if (!perMonth.size) return months
  return months.map((t) => {
    const cut = perMonth.get(t.month)
    if (cut === undefined) return t
    const expense = Math.round((t.expense - cut) * 100) / 100
    return { ...t, expense, net: Math.round((t.net + cut) * 100) / 100 }
  })
}

const KIND_TEXT: Record<EventKind, string> = {
  'one-off': 'one-off; exclude these days from the projection baseline.',
  'new-normal': 'new normal; the monthly baseline of these categories restarts there.',
  temporary: 'temporary; expect higher spending in these categories while it lasts.',
}

/** Lines for the assistant's context. Labels appear only when the user shares details. */
export function describeEvents(events: LifeEvent[], first: string, last: string, includeDetails: boolean, names: Map<string, string> = new Map()): string[] {
  const active = events.filter((e) => e.start <= last && (!e.end || e.end >= first))
  if (!active.length) return []
  const lines = ['## Life events (dates affect how spending should be read)']
  for (const e of [...active].sort((a, b) => a.start.localeCompare(b.start))) {
    const cats = e.categoryIds.map((id) => names.get(id) ?? id).join(', ')
    const range = e.end ? `${e.start} to ${e.end}` : `${e.start} onwards`
    const label = includeDetails && e.label ? `"${e.label}" ` : ''
    const relieved = e.relieved?.length ? `; relieves ${e.relieved.map(id => names.get(id) ?? id).join(', ')}` : ''
    lines.push(`- ${label}${range}: ${KIND_TEXT[e.kind].replace('one-off', `One-off in ${cats}`).replace('new normal', `New normal in ${cats}`).replace('temporary', `Temporary in ${cats}`)}${relieved}`)
  }
  return lines
}

/** Checks state read back from storage; throws on anything unexpected. */
function fail(): never { throw new Error('Invalid saved life events.') }
export function validateLifeEvents(raw: unknown): LifeEventState {
  if (!raw || typeof raw !== 'object' || !('events' in raw) || !Array.isArray((raw as LifeEventState).events)) fail()
  for (const e of (raw as LifeEventState).events) {
    if (!e || typeof e !== 'object') fail()
    const { id, label, start, end, categoryIds, relieved, expected, kind } = e as unknown as Record<string, unknown> & Partial<LifeEvent>
    if (typeof id !== 'string' || !id || typeof label !== 'string' || typeof start !== 'string' || !DATE.test(start)) fail()
    if (end !== undefined && (typeof end !== 'string' || !DATE.test(end))) fail()
    if (typeof end === 'string' && end < start) fail()
    if (!Array.isArray(categoryIds) || !categoryIds.every((c) => typeof c === 'string' && c)) fail()
    if (relieved !== undefined && (!Array.isArray(relieved) || !relieved.every(c => typeof c === 'string' && c))) fail()
    const involved = [...categoryIds, ...(relieved ?? [])]
    if (!involved.length) fail()
    if (expected !== undefined && (!expected || typeof expected !== 'object' || Array.isArray(expected) || !Object.entries(expected).every(([id, amount]) => involved.includes(id) && typeof amount === 'number' && Number.isFinite(amount) && amount > 0))) fail()
    if (typeof kind !== 'string' || !KINDS.includes(kind as EventKind)) fail()
  }
  return raw as LifeEventState
}
