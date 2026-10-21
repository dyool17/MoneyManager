import type { Movement } from './types'
import { countable, monthRange, recurringCharges, type MonthTotal } from './insights'

/** Risk, strength and projection figures. Pure and deterministic: same input, same answer. */

const round = (n: number) => Math.round(n * 100) / 100
const month = (date: string) => date.slice(0, 7)

/** Groups whose names suggest money you cannot spend tomorrow. */
const ILLIQUID = /invest|inversi|cxc|receiv|por cobrar|prest|loan|ahorro a plazo|plazo fijo|crypto|cripto|property|propiedad/i
export const isLikelyLiquid = (groupName: string) => !ILLIQUID.test(groupName)

/** Months your spendable money lasts at the current average spend. */
export function cushionMonths(liquid: number, averageExpense: number): number | null {
  if (averageExpense <= 0) return null
  return round(Math.max(0, liquid) / averageExpense)
}

export interface Commitment { month: string; total: number; count: number }

/** Expenses already scheduled after today, per month, for the next `months` months. */
export function futureCommitments(movements: Movement[], today: string, months = 12): Commitment[] {
  const start = today.slice(0, 7)
  const [y, m] = start.split('-').map(Number)
  const end = new Date(y, m - 1 + months - 1, 1)
  const keys = monthRange(start, `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`)
  const map = new Map(keys.map((k) => [k, { month: k, total: 0, count: 0 }]))
  for (const mv of movements) {
    if (mv.type !== 'expense' || mv.date <= today) continue
    const row = map.get(month(mv.date))
    if (!row) continue
    row.total += mv.amount
    row.count++
  }
  return [...map.values()].map((r) => ({ ...r, total: round(r.total) }))
}

export interface GroupShare { name: string; total: number; share: number; previousShare: number | null }

/** Share of spending per main category (for example Fixed vs Variable), now and in the window before. */
export function mainGroupShares(movements: Movement[], months: string[], window = 3): GroupShare[] {
  const recent = new Set(months.slice(-window))
  const previous = new Set(months.slice(-window * 2, -window))
  const totals = new Map<string, { recent: number; previous: number; all: number }>()
  for (const mv of countable(movements)) {
    if (mv.type !== 'expense') continue
    const name = mv.categoryName || 'Uncategorized'
    const row = totals.get(name) ?? { recent: 0, previous: 0, all: 0 }
    row.all += mv.amount
    if (recent.has(month(mv.date))) row.recent += mv.amount
    if (previous.has(month(mv.date))) row.previous += mv.amount
    totals.set(name, row)
  }
  const sum = (k: 'all' | 'previous') => [...totals.values()].reduce((a, r) => a + r[k], 0)
  const all = sum('all') || 1
  const prev = sum('previous')
  return [...totals.entries()]
    .map(([name, r]) => ({ name, total: round(r.all), share: r.all / all, previousShare: prev > 0 ? r.previous / prev : null }))
    .sort((a, b) => b.total - a.total)
}

export interface Projection { spent: number; projected: number; average: number; income: number; elapsed: number }

/**
 * Where this month ends: spent so far plus what earlier months usually spent after this same day.
 * Using the history instead of a straight daily pace keeps bills paid on the 1st from inflating the estimate.
 */
export function projectMonth(movements: Movement[], today: string, months: MonthTotal[]): Projection | null {
  const key = today.slice(0, 7)
  const [y, m, d] = today.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const past = months.filter((x) => x.month < key)
  if (!past.length) return null
  const pastKeys = new Set(past.map((x) => x.month))
  let spent = 0
  let income = 0
  let rest = 0
  for (const mv of countable(movements)) {
    const k = month(mv.date)
    if (k === key && mv.date <= today) {
      if (mv.type === 'expense') spent += mv.amount
      else income += mv.amount
    } else if (mv.type === 'expense' && pastKeys.has(k) && Number(mv.date.slice(8)) > d) {
      rest += mv.amount
    }
  }
  const average = past.reduce((a, x) => a + x.expense, 0) / past.length
  const averageIncome = past.reduce((a, x) => a + x.income, 0) / past.length
  return { spent: round(spent), projected: round(spent + rest / past.length), average: round(average), income: round(Math.max(income, averageIncome)), elapsed: d / days }
}

export interface Outlier { movement: Movement; typical: number; times: number }

/**
 * Expenses far above what their category usually costs: over mean plus two standard deviations and
 * at least 1.5 times the mean, with five samples minimum. Repeating charges are skipped.
 */
export function outliers(movements: Movement[], limit = 8): Outlier[] {
  // Repeating charges are expected, however large; they are reported separately.
  const repeating = new Set(recurringCharges(movements).map((r) => `${r.label.toLowerCase()}|${r.amount.toFixed(2)}`))
  const byCat = new Map<string, Movement[]>()
  for (const mv of countable(movements)) {
    if (mv.type !== 'expense') continue
    if (repeating.has(`${(mv.content || mv.subcategoryName || '').trim().toLowerCase()}|${mv.amount.toFixed(2)}`)) continue
    const k = mv.subcategoryName || mv.categoryName || 'Uncategorized'
    byCat.set(k, [...(byCat.get(k) ?? []), mv])
  }
  const out: Outlier[] = []
  for (const list of byCat.values()) {
    if (list.length < 5) continue
    const mean = list.reduce((a, x) => a + x.amount, 0) / list.length
    const sd = Math.sqrt(list.reduce((a, x) => a + (x.amount - mean) ** 2, 0) / list.length)
    if (sd === 0) continue
    for (const mv of list) if (mv.amount > mean + 2 * sd && mv.amount >= mean * 1.5) out.push({ movement: mv, typical: round(mean), times: round(mv.amount / mean) })
  }
  return out.sort((a, b) => b.movement.amount - a.movement.amount).slice(0, limit)
}

/** Coefficient of variation of monthly spend: 0 is perfectly steady. */
export function volatility(months: MonthTotal[]): number | null {
  const values = months.map((m) => m.expense)
  if (values.length < 2) return null
  const mean = values.reduce((a, v) => a + v, 0) / values.length
  if (mean === 0) return null
  return round(Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length) / mean)
}

/** Consecutive months with income above spending, counting back from the most recent full month. */
export function greenStreak(months: MonthTotal[], today: string): number {
  let n = 0
  for (const m of [...months].reverse()) {
    if (m.month >= today.slice(0, 7)) continue
    if (m.net > 0) n++
    else break
  }
  return n
}

export interface ScorePart { key: string; label: string; points: number; max: number; detail: string }

const scale = (value: number, worst: number, best: number) => Math.max(0, Math.min(1, (value - worst) / (best - worst)))

/** A 0-100 health score with fixed, visible weights; each part says what it costs you. */
export function healthScore(input: { savingsRate: number | null; cushion: number | null; cardDebt: number; averageIncome: number; volatility: number | null; months: MonthTotal[] }): { total: number; parts: ScorePart[] } {
  const green = input.months.filter((m) => m.net > 0).length
  const load = input.averageIncome > 0 ? input.cardDebt / input.averageIncome : null
  const parts: ScorePart[] = [
    { key: 'savings', label: 'Savings rate', max: 25, points: 25 * scale(input.savingsRate ?? 0, 0, 0.2), detail: 'Full points at 20% of income saved.' },
    { key: 'cushion', label: 'Emergency cushion', max: 25, points: 25 * scale(input.cushion ?? 0, 0, 6), detail: 'Full points at 6 months of spending covered.' },
    { key: 'debt', label: 'Debt load', max: 20, points: load === null ? 0 : 20 * scale(-load, -1, 0), detail: 'Full points with no debt; none at one month of income.' },
    { key: 'steady', label: 'Steady spending', max: 15, points: input.volatility === null ? 0 : 15 * scale(-input.volatility, -0.5, -0.1), detail: 'Full points when monthly spend varies 10% or less.' },
    { key: 'green', label: 'Months in the green', max: 15, points: input.months.length ? (15 * green) / input.months.length : 0, detail: `${green} of ${input.months.length} months ended with money left over.` },
  ].map((p) => ({ ...p, points: Math.round(p.points) }))
  return { total: parts.reduce((a, p) => a + p.points, 0), parts }
}

/** Monthly and yearly saving from cutting the chosen categories by `percent`. */
export function simulateCut(monthlyByCategory: Record<string, number>, chosen: string[], percent: number) {
  const monthly = chosen.reduce((a, c) => a + (monthlyByCategory[c] ?? 0), 0) * (percent / 100)
  return { monthly: round(monthly), yearly: round(monthly * 12) }
}
