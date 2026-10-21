import type { Movement } from './types'
import type { BudgetState } from './budget'
import { countable, monthRange } from './insights'

/**
 * Budgets imported from a native phone backup, per category or subcategory, judged either
 * month by month or on the year so far. Pure and deterministic.
 */

export type BudgetMode = 'monthly' | 'annual'

/** One monthly budget set on the phone. */
export interface PlannedBudget {
  /** Category id; matches `Movement.subcategoryId`, or `Movement.categoryId` for a top-level budget. */
  categoryId: string
  name: string
  /** Parent category name; empty for a top-level category. */
  parent: string
  /** Monthly amount for months without an override. */
  amount: number
  /** Amount set for one month only, keyed 'YYYY-MM'. */
  overrides: Record<string, number>
}

export interface BudgetPlan { importedAt: string; budgets: PlannedBudget[] }

/** What is saved locally: the imported plan and the mode chosen per category id. */
export interface BudgetPlanState { plan: BudgetPlan | null; modes: Record<string, BudgetMode> }

export interface BudgetStatus {
  categoryId: string
  name: string
  parent: string
  mode: BudgetMode
  /** This month alone. */
  spent: number
  budget: number
  /** What the state is judged on: this month (monthly) or January to this month (annual). */
  judgedSpent: number
  judgedBudget: number
  /** Sum of the twelve monthly amounts of this calendar year. */
  yearBudget: number
  /** judgedSpent / judgedBudget, uncapped. */
  ratio: number
  state: BudgetState
}

const round = (n: number) => Math.round(n * 100) / 100
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export const budgetAmount = (b: PlannedBudget, month: string) => b.overrides[month] ?? b.amount

const matches = (b: PlannedBudget, m: Movement) => (b.parent ? m.subcategoryId === b.categoryId : m.categoryId === b.categoryId)

/** Spending per month ('YYYY-MM') for one budget. */
function monthlySpend(b: PlannedBudget, movements: Movement[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of countable(movements)) {
    if (m.type !== 'expense' || !matches(b, m)) continue
    const k = m.date.slice(0, 7)
    out.set(k, (out.get(k) ?? 0) + m.amount)
  }
  return out
}

/**
 * Judges every budget for `month`. Annual budgets compare January-to-date spending with the
 * monthly amounts of the same months, so a seasonal spike inside the year's allowance is fine.
 * `pace` is the share of `month` elapsed when it is the current month, else null.
 */
export function evaluateBudgets(plan: BudgetPlan, movements: Movement[], month: string, modes: Record<string, BudgetMode>, pace: number | null): BudgetStatus[] {
  const year = month.slice(0, 4)
  const soFar = monthRange(`${year}-01`, month)
  const whole = monthRange(`${year}-01`, `${year}-12`)
  return plan.budgets
    .map((b) => {
      const spend = monthlySpend(b, movements)
      const mode = modes[b.categoryId] ?? 'monthly'
      const spent = round(spend.get(month) ?? 0)
      const budget = budgetAmount(b, month)
      const months = mode === 'annual' ? soFar : [month]
      const judgedSpent = round(months.reduce((a, k) => a + (spend.get(k) ?? 0), 0))
      const judgedBudget = round(months.reduce((a, k) => a + budgetAmount(b, k), 0))
      // Allowance reached by today: the earlier months in full plus the elapsed share of this one.
      const allowance = pace === null ? judgedBudget : judgedBudget - budget * (1 - pace)
      const state: BudgetState = judgedSpent > judgedBudget ? 'over' : judgedSpent > allowance ? 'ahead' : 'ok'
      const ratio = judgedBudget > 0 ? judgedSpent / judgedBudget : judgedSpent > 0 ? Infinity : 0
      const yearBudget = round(whole.reduce((a, k) => a + budgetAmount(b, k), 0))
      return { categoryId: b.categoryId, name: b.name, parent: b.parent, mode, spent, budget, judgedSpent, judgedBudget, yearBudget, ratio, state }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

/**
 * Spending that comes in bursts: in the twelve months before `month`, the three biggest months
 * hold at least 60% of the total and at least one of them broke its monthly budget.
 */
export function suggestsAnnual(b: PlannedBudget, movements: Movement[], month: string): boolean {
  const [y, m] = month.split('-').map(Number)
  const first = `${y - 1}-${String(m).padStart(2, '0')}`
  const last = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  const spend = monthlySpend(b, movements)
  const months = monthRange(first, last).map((k) => ({ k, total: spend.get(k) ?? 0 }))
  const total = months.reduce((a, x) => a + x.total, 0)
  if (total <= 0) return false
  const top = [...months].sort((a, x) => x.total - a.total).slice(0, 3)
  return top.reduce((a, x) => a + x.total, 0) / total >= 0.6 && top.some((x) => x.total > budgetAmount(b, x.k))
}

const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Checks state read back from storage; throws on anything unexpected. */
export function validateBudgetState(raw: unknown): BudgetPlanState {
  const fail = () => { throw new Error('Invalid saved budgets.') }
  if (!raw || typeof raw !== 'object') fail()
  const { plan, modes } = raw as Record<string, unknown>
  if (!modes || typeof modes !== 'object' || Array.isArray(modes)) fail()
  for (const v of Object.values(modes as object)) if (v !== 'monthly' && v !== 'annual') fail()
  if (plan !== null) {
    const p = plan as Record<string, unknown>
    if (!p || typeof p.importedAt !== 'string' || !Array.isArray(p.budgets)) fail()
    for (const b of p.budgets as Record<string, unknown>[]) {
      if (!b || typeof b.categoryId !== 'string' || !b.categoryId || typeof b.name !== 'string' || typeof b.parent !== 'string' || !isAmount(b.amount)) fail()
      const o = b.overrides
      if (!o || typeof o !== 'object' || Array.isArray(o)) fail()
      for (const [k, v] of Object.entries(o as object)) if (!MONTH.test(k) || !isAmount(v)) fail()
    }
  }
  return raw as BudgetPlanState
}
