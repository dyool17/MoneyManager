import type { Movement } from './types'
import { countable, recurringCharges } from './insights'
import { outliers } from './health'
import { budgetAmount, type BudgetMode, type BudgetPlan, type PlannedBudget } from './budget-plan'
import { coversMovement, type LifeEvent } from './life-events'

/**
 * Deterministic classifier for expenses that look like bad decisions: big, unexplained and
 * discretionary. The assistant only explains and suggests; the user dismisses the flag or turns
 * the expense into a life event.
 */

export type BigReason = 'outlier' | 'large-share' | 'over-budget'

export interface BadDecision {
  movement: Movement
  /** Why the expense looks big. */
  big: BigReason[]
  /** The budget the expense is judged against, when there is one. */
  budget: PlannedBudget | null
}

export interface BadDecisionInput {
  movements: Movement[]
  plan: BudgetPlan | null
  modes: Record<string, BudgetMode>
  events: LifeEvent[]
  /** The month the classifier judges, 'YYYY-MM'. */
  month: string
}

const DISCRETIONARY = /variable/i
const LARGE_SHARE = 0.5

const round = (n: number) => Math.round(n * 100) / 100

/** The budget this movement is judged against: the subcategory's, else the top-level one. */
function budgetFor(plan: BudgetPlan | null, m: Movement): PlannedBudget | null {
  if (!plan) return null
  return plan.budgets.find((b) => (b.parent ? m.subcategoryId === b.categoryId : m.categoryId === b.categoryId)) ?? null
}

export function findBadDecisions(input: BadDecisionInput): BadDecision[] {
  const { movements, plan, modes, events, month } = input
  const repeating = new Set(recurringCharges(movements).map((r) => `${r.label.toLowerCase()}|${r.amount.toFixed(2)}`))
  const odd = new Set(outliers(movements, 20).map((o) => o.movement.id))
  const inMonth = countable(movements).filter((m) => m.type === 'expense' && !m.isFuture && m.date.slice(0, 7) === month)

  // Spending per budget and month over the whole loaded history, so annual modes can be judged.
  const spend = new Map<PlannedBudget, Map<string, number>>()
  if (plan) {
    const expenses = countable(movements).filter((m) => m.type === 'expense' && !m.isFuture)
    for (const b of plan.budgets) {
      const perMonth = new Map<string, number>()
      for (const m of expenses) {
        if (budgetFor(plan, m) === b) {
          const k = m.date.slice(0, 7)
          perMonth.set(k, (perMonth.get(k) ?? 0) + m.amount)
        }
      }
      spend.set(b, perMonth)
    }
  }

  const judged = (b: PlannedBudget, expense: Movement | null): { spent: number; budget: number } => {
    const mode = modes[b.categoryId] ?? 'monthly'
    if (mode === 'monthly') {
      const total = (spend.get(b)?.get(month) ?? 0) - (expense ? expense.amount : 0)
      return { spent: total, budget: budgetAmount(b, month) }
    }
    const year = month.slice(0, 4)
    const perMonth = spend.get(b) ?? new Map()
    let spent = 0
    let budget = 0
    for (let m = 1; m <= Number(month.slice(5, 7)); m++) {
      const k = `${year}-${String(m).padStart(2, '0')}`
      const inMonthAmount = k === month && expense ? expense.amount : 0
      spent += (perMonth.get(k) ?? 0) - inMonthAmount
      budget += budgetAmount(b, k)
    }
    return { spent, budget }
  }

  const decisions: BadDecision[] = []
  for (const m of inMonth) {
    if (m.categoryName && !DISCRETIONARY.test(m.categoryName)) continue // Fixed bills are deliberate.
    const key = `${(m.content || m.subcategoryName || '').trim().toLowerCase()}|${m.amount.toFixed(2)}`
    if (repeating.has(key)) continue // A repeating charge is expected, however large.
    if (events.some((e) => coversMovement(e, m))) continue // A recorded life event explains it.
    const b = budgetFor(plan, m)
    if (b) {
      const { spent, budget } = judged(b, m)
      // Covered by its annual allowance: judged spending stays inside what the year allows.
      if ((modes[b.categoryId] ?? 'monthly') === 'annual' && spent + m.amount <= budget) continue
    }
    const big: BigReason[] = []
    if (odd.has(m.id)) big.push('outlier')
    if (b && m.amount >= LARGE_SHARE * budgetAmount(b, month)) big.push('large-share')
    if (b) {
      const { spent, budget } = judged(b, m)
      if (budget > 0 && spent + m.amount > budget) big.push('over-budget')
    }
    if (!big.length) continue
    decisions.push({ movement: m, big, budget: b })
  }
  return decisions.sort((a, x) => x.movement.amount - a.movement.amount || x.movement.date.localeCompare(a.movement.date))
}

const REASON_TEXT: Record<BigReason, string> = {
  outlier: 'far above its usual cost',
  'large-share': 'a large share of the budget',
  'over-budget': 'pushes the budget over the line',
}

/** One human-readable line per decision, for screens and the assistant. */
export const describeBadDecision = (d: BadDecision, nameOf: (id: string) => string): string => {
  const m = d.movement
  const cat = nameOf(m.subcategoryId ?? m.categoryId ?? '')
  return `${m.date} ${cat}: ${m.amount.toFixed(2)} — ${d.big.map((r) => REASON_TEXT[r]).join(', ')}`
}

export const roundShare = round
