const round = (v: number) => Math.round(v * 100) / 100

/**
 * What a savings goal takes: months from next month through `by` (YYYY-MM),
 * the monthly amount, and how far today's monthly leftover is from it.
 */
export function goalPlan(input: { amount: number; by: string; today: string; leftOver: number }) {
  const [ty, tm] = input.today.split('-').map(Number)
  const [gy, gm] = input.by.split('-').map(Number)
  const months = Math.max(0, (gy! - ty!) * 12 + (gm! - tm!))
  if (!months) return { months: 0, monthly: 0, gap: 0, coverage: 0 }
  const monthly = round(input.amount / months)
  const saved = Math.max(0, input.leftOver)
  return { months, monthly, gap: round(Math.max(0, monthly - saved)), coverage: round(Math.min(1, saved / monthly)) }
}
