import type { Movement } from './types'
import { countable, monthRange } from './insights'
import { coversMovement, type LifeEvent } from './life-events'

export interface CategoryPattern {
  key: string; name: string; group: string; monthly: number[]; total: number; typical: number
  trend: number | null; volatility: number | null; seasonal: string[]; recentVsTypical: number | null
}
export interface IncomeSource { label: string; typical: number; months: number; day: number }
export interface IncomePattern { monthly: number[]; typical: number; volatility: number | null; sources: IncomeSource[] }
export interface Patterns {
  months: string[]; categories: CategoryPattern[]; income: IncomePattern
  rhythm: { byDay10: number | null; byDay20: number | null }
}
const round = (n: number) => Math.round(n * 100) / 100
const mean = (a: number[]) => a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0
const median = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y)
  return b.length ? (b[Math.floor((b.length - 1) / 2)]! + b[Math.floor(b.length / 2)]!) / 2 : 0
}
const variation = (a: number[], typical: number) => typical === 0 ? null : Math.sqrt(mean(a.map(n => (n - mean(a)) ** 2))) / mean(a)

/** Whole-month history only. `last` is supplied by the caller, never the system clock. */
export function detectPatterns(movements: Movement[], first: string, last: string, events: LifeEvent[] = []): Patterns {
  const months = monthRange(first, last)
  const rows = countable(movements).filter(m => months.includes(m.date.slice(0, 7)))
  const expenses = rows.filter(m => m.type === 'expense')
  const groups = new Map<string, Movement[]>()
  for (const m of expenses) {
    const key = m.subcategoryId ?? m.categoryId ?? m.subcategoryName ?? m.categoryName ?? 'Uncategorized'
    groups.set(key, [...(groups.get(key) ?? []), m])
  }
  const monthly = (rows: Movement[]) => months.map(k => round(rows.filter(m => m.date.startsWith(k)).reduce((s, m) => s + m.amount, 0)))
  const categories = [...groups].map(([key, list]): CategoryPattern => {
    const m = list[0]!
    const values = monthly(list)
    const baseline = monthly(list.filter(m => !events.some(e => e.kind === 'one-off' && coversMovement(e, m))))
    const typical = median(baseline)
    const recent = baseline.slice(-12)
    const center = (recent.length - 1) / 2
    const denominator = recent.reduce((s, _, i) => s + (i - center) ** 2, 0)
    const trend = recent.length < 6 ? null : round(recent.reduce((s, n, i) => s + (i - center) * (n - mean(recent)), 0) / denominator)
    const seasonal = [...new Set(months.map(k => k.slice(5)))].sort().filter(mm => {
      const samples = months.flatMap((k, i) => k.slice(5) === mm ? [baseline[i]!] : [])
      return typical > 0 && samples.every(n => n >= 1.6 * typical)
    })
    return { key, name: m.subcategoryName || m.categoryName || 'Uncategorized', group: m.categoryName || '', monthly: values, total: round(values.reduce((s, n) => s + n, 0)), typical: round(typical), trend, volatility: variation(baseline, typical), seasonal, recentVsTypical: typical ? mean(baseline.slice(-3)) / typical : null }
  }).sort((a, b) => b.total - a.total)
  const incomeRows = rows.filter(m => m.type === 'income')
  const sourceGroups = new Map<string, Movement[]>()
  for (const m of incomeRows) {
    const label = m.content || m.subcategoryName || m.categoryName || 'Income'
    sourceGroups.set(label, [...(sourceGroups.get(label) ?? []), m])
  }
  const sources = [...sourceGroups].flatMap(([label, list]) => {
    const typical = median(list.map(m => m.amount))
    const similar = list.filter(m => Math.abs(m.amount - typical) <= typical * 0.1)
    const months = new Set(similar.map(m => m.date.slice(0, 7))).size
    return months >= 3 ? [{ label, typical: round(median(similar.map(m => m.amount))), months, day: Math.round(median(similar.map(m => Number(m.date.slice(8))))) }] : []
  })
  const income = monthly(incomeRows)
  const shares = (day: number) => {
    const active = months.filter(k => expenses.some(m => m.date.startsWith(k) && m.amount > 0))
    return active.length ? mean(active.map(k => {
      const list = expenses.filter(m => m.date.startsWith(k))
      return list.filter(m => Number(m.date.slice(8)) <= day).reduce((s, m) => s + m.amount, 0) / list.reduce((s, m) => s + m.amount, 0)
    })) : null
  }
  return { months, categories, income: { monthly: income, typical: round(median(income)), volatility: variation(income, median(income)), sources }, rhythm: { byDay10: shares(10), byDay20: shares(20) } }
}
