import type { CategoryTotal, Movement } from './types'

export type TypeFilter = '' | 'expense' | 'income' | 'transfer'

export interface SpendingFilters {
  /** Category name; summary totals are keyed by name. */
  category: string
  account: string
  type: TypeFilter
  text: string
}

const isTransfer = (m: Movement) => m.type === 'transfer-in' || m.type === 'transfer-out'

export function filterMovements(movements: Movement[], f: SpendingFilters): Movement[] {
  const q = f.text.trim().toLowerCase()
  return movements.filter(
    (m) =>
      (!f.type || (f.type === 'transfer' ? isTransfer(m) : m.type === f.type)) &&
      (!f.account || m.assetId === f.account || m.toAssetId === f.account) &&
      (!f.category || m.categoryName === f.category) &&
      (!q || `${m.content ?? ''} ${m.detail ?? ''}`.toLowerCase().includes(q)),
  )
}

const sum = (list: Movement[], type: Movement['type']) =>
  list.filter((m) => !m.isFuture && m.type === type).reduce((s, m) => s + m.amount, 0)

export interface SpendingKpis {
  expense: number
  income: number
  count: number
  /** Selected category's share of all spending under the other filters, or null. */
  share: number | null
}

export function spendingKpis(movements: Movement[], f: SpendingFilters): SpendingKpis {
  const list = filterMovements(movements, f)
  const expense = sum(list, 'expense')
  let share: number | null = null
  if (f.category) {
    const all = sum(filterMovements(movements, { ...f, category: '' }), 'expense')
    share = all > 0 ? expense / all : null
  }
  return { expense, income: sum(list, 'income'), count: list.length, share }
}

/** Category totals rebuilt from movements, for views the month summary cannot filter (account, type). */
export function totalsFromMovements(
  movements: Movement[],
  type: 'expense' | 'income',
  budgets: Record<string, number>,
): CategoryTotal[] {
  const byName = new Map<string, number>()
  for (const m of movements) {
    if (m.isFuture || m.type !== type) continue
    const name = m.categoryName ?? 'Uncategorized'
    byName.set(name, (byName.get(name) ?? 0) + m.amount)
  }
  return [...byName]
    .map(([name, total]) => ({ name, total, budget: budgets[name] ?? 0 }))
    .sort((a, b) => b.total - a.total)
}

export interface CategoryRow {
  name: string
  total: number
  budget: number
  /** Bar length, 0..1 of the largest value on screen. */
  width: number
  /** Budget mark position 0..1 on the same scale, null without a budget. */
  tick: number | null
  state: 'within' | 'over' | 'none'
  /** Percent of budget used, null without a budget. */
  percent: number | null
  overBy: number
}

export function categoryRows(totals: CategoryTotal[]): CategoryRow[] {
  const scale = Math.max(1, ...totals.map((c) => Math.max(c.total, c.budget)))
  return [...totals]
    .sort((a, b) => b.total - a.total)
    .map((c) => {
      const budgeted = c.budget > 0
      return {
        name: c.name,
        total: c.total,
        budget: c.budget,
        width: c.total / scale,
        tick: budgeted ? c.budget / scale : null,
        state: !budgeted ? 'none' : c.total > c.budget ? 'over' : 'within',
        percent: budgeted ? Math.round((c.total / c.budget) * 100) : null,
        overBy: budgeted && c.total > c.budget ? c.total - c.budget : 0,
      }
    })
}
