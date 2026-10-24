import { resolveMetadata, type MetadataState } from './metadata'

export interface SavingsGoal { target: number; currency: string; accountIds: string[] }

/** Current whole balances only. Rates convert to the configured base, never an inferred cross-rate. */
export function savingsGoalProgress(goal: SavingsGoal, rows: { id: string; amount: number }[], metadata: MetadataState) {
  let amount = 0
  for (const id of new Set(goal.accountIds)) {
    const row = rows.find(r => r.id === id)
    const settings = resolveMetadata(metadata, id)
    if (!row || !settings || !Number.isFinite(row.amount)) return null
    const rate = settings.currency === goal.currency ? 1 : goal.currency === metadata.baseCurrency ? settings.rate : NaN
    if (!Number.isFinite(rate) || rate <= 0) return null
    amount += row.amount * rate
    if (!Number.isFinite(amount)) return null
  }
  const remaining = Math.max(0, goal.target - amount)
  if (!Number.isFinite(remaining)) return null
  return { amount, remaining, percent: Math.max(0, Math.min(100, amount / goal.target * 100)) }
}
