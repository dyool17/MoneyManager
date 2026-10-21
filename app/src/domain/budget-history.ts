import type { CategoryTotal } from './types'

/** How each budgeted category did month after month. Pure and deterministic. */

export interface MonthBudget { month: string; expenseByCategory: CategoryTotal[] }

export interface BudgetRecord {
  name: string
  months: number
  over: number
  /** Average amount above budget in the months it went over. */
  averageOver: number
  worst: { month: string; total: number; budget: number } | null
}

export interface BudgetHistory { records: BudgetRecord[]; months: number; overallHitRate: number | null }

const round = (n: number) => Math.round(n * 100) / 100

export function budgetHistory(summaries: MonthBudget[]): BudgetHistory {
  const map = new Map<string, { months: number; over: number; excess: number; worst: BudgetRecord['worst'] }>()
  let checks = 0
  let hits = 0
  for (const s of summaries) {
    for (const c of s.expenseByCategory) {
      if (!(c.budget > 0)) continue
      const row = map.get(c.name) ?? { months: 0, over: 0, excess: 0, worst: null }
      row.months++
      checks++
      if (c.total > c.budget) {
        row.over++
        row.excess += c.total - c.budget
        if (!row.worst || c.total - c.budget > row.worst.total - row.worst.budget) row.worst = { month: s.month, total: c.total, budget: c.budget }
      } else {
        hits++
      }
      map.set(c.name, row)
    }
  }
  const records = [...map.entries()]
    .map(([name, r]) => ({ name, months: r.months, over: r.over, averageOver: round(r.over ? r.excess / r.over : 0), worst: r.worst }))
    .sort((a, b) => b.over / b.months - a.over / a.months || b.averageOver - a.averageOver)
  return { records, months: summaries.length, overallHitRate: checks ? hits / checks : null }
}
