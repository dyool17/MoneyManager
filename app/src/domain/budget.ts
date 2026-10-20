import type { CategoryTotal, Period } from './types'

export type BudgetState = 'ok' | 'ahead' | 'over'

export interface BudgetLine {
  name: string
  spent: number
  budget: number
  remaining: number
  /** spent / budget, uncapped. */
  ratio: number
  state: BudgetState
}

export interface BudgetReport {
  lines: BudgetLine[]
  unbudgeted: CategoryTotal[]
  totalBudget: number
  totalSpent: number
  /** Share of the period already elapsed (0..1), or null when the period is not current. */
  pace: number | null
}

/** Fraction of the period elapsed on `today`, or null when today is outside it. */
export function elapsedShare({ startDate, endDate }: Period, today: string): number | null {
  if (today < startDate || today > endDate) return null
  const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
  const total = (day(endDate) - day(startDate)) / 86_400_000 + 1
  const done = (day(today) - day(startDate)) / 86_400_000 + 1
  return done / total
}

/**
 * Over budget when spent > budget. "Ahead" when, in the current period,
 * spending runs faster than the days elapsed.
 */
export function buildBudgetReport(expenses: CategoryTotal[], period: Period, today: string): BudgetReport {
  const pace = elapsedShare(period, today)
  const lines = expenses
    .filter((c) => c.budget > 0)
    .map((c) => {
      const ratio = c.total / c.budget
      const state: BudgetState = ratio > 1 ? 'over' : pace !== null && ratio > pace ? 'ahead' : 'ok'
      return { name: c.name, spent: c.total, budget: c.budget, remaining: c.budget - c.total, ratio, state }
    })
    .sort((a, b) => b.ratio - a.ratio)
  return {
    lines,
    unbudgeted: expenses.filter((c) => c.budget <= 0),
    totalBudget: lines.reduce((s, l) => s + l.budget, 0),
    totalSpent: lines.reduce((s, l) => s + l.spent, 0),
    pace,
  }
}
