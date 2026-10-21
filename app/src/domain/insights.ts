import type { Movement } from './types'

/** Spending analysis over a span of months. Pure: works the same for phone or backup data. */

export interface MonthTotal { month: string; income: number; expense: number; net: number }
export interface CategoryShare { name: string; group?: string; total: number; share: number; count: number }
export interface WeekdayTotal { weekday: number; total: number; average: number }
export interface DayTotal { date: string; total: number; count: number }
export interface CategoryChange { name: string; recent: number; previous: number; change: number }
export interface Recurring { label: string; amount: number; months: number; category: string }
export interface Opportunity {
  kind: 'rising' | 'recurring' | 'small-purchases' | 'overspent-month'
  title: string
  detail: string
  month?: string
  /** Money per month at stake, used to rank opportunities. */
  monthly: number
}

export interface Insights {
  months: MonthTotal[]
  categories: CategoryShare[]
  weekdays: WeekdayTotal[]
  days: DayTotal[]
  topDays: DayTotal[]
  changes: CategoryChange[]
  recurring: Recurring[]
  opportunities: Opportunity[]
  averageExpense: number
  savingsRate: number | null
}

const month = (date: string) => date.slice(0, 7)
const round = (n: number) => Math.round(n * 100) / 100
/** Subcategory when there is one: people often keep broad parents (Fixed, Variable) and track detail below. */
const label = (m: Movement) => m.subcategoryName || m.categoryName || 'Uncategorized'

/** Every month from the first to the last, so a month with no spending still shows as zero. */
export function monthRange(first: string, last: string): string[] {
  const out: string[] = []
  let [y, m] = first.split('-').map(Number)
  const [ly, lm] = last.split('-').map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

/** Only real income and expenses up to today; transfers and future entries are not spending. */
export function countable(movements: Movement[]): Movement[] {
  return movements.filter((m) => !m.isFuture && (m.type === 'income' || m.type === 'expense'))
}

export function monthlyTotals(movements: Movement[], first: string, last: string): MonthTotal[] {
  const map = new Map(monthRange(first, last).map((k) => [k, { month: k, income: 0, expense: 0, net: 0 }]))
  for (const m of countable(movements)) {
    const row = map.get(month(m.date))
    if (!row) continue
    row[m.type === 'income' ? 'income' : 'expense'] += m.amount
  }
  return [...map.values()].map((r) => ({ month: r.month, income: round(r.income), expense: round(r.expense), net: round(r.income - r.expense) }))
}

export function categoryShares(movements: Movement[]): CategoryShare[] {
  const map = new Map<string, { total: number; count: number; group?: string }>()
  for (const m of countable(movements)) {
    if (m.type !== 'expense') continue
    const row = map.get(label(m)) ?? { total: 0, count: 0, group: m.subcategoryName ? m.categoryName : undefined }
    row.total += m.amount
    row.count++
    map.set(label(m), row)
  }
  const sum = [...map.values()].reduce((a, r) => a + r.total, 0) || 1
  return [...map.entries()]
    .map(([name, r]) => ({ name, ...(r.group ? { group: r.group } : {}), total: round(r.total), share: r.total / sum, count: r.count }))
    .sort((a, b) => b.total - a.total)
}

export function dailyTotals(movements: Movement[]): DayTotal[] {
  const map = new Map<string, DayTotal>()
  for (const m of countable(movements)) {
    if (m.type !== 'expense') continue
    const row = map.get(m.date) ?? { date: m.date, total: 0, count: 0 }
    row.total += m.amount
    row.count++
    map.set(m.date, row)
  }
  return [...map.values()].map((d) => ({ ...d, total: round(d.total) })).sort((a, b) => a.date.localeCompare(b.date))
}

/** Weekday 0 is Monday. The average divides by how many of that weekday the span holds. */
export function weekdayTotals(days: DayTotal[], first: string, last: string): WeekdayTotal[] {
  const totals = Array(7).fill(0)
  const occurrences = Array(7).fill(0)
  for (const d of days) totals[weekday(d.date)] += d.total
  for (let t = Date.UTC(...ymd(first)); t <= Date.UTC(...ymd(last)); t += 86_400_000) {
    occurrences[(new Date(t).getUTCDay() + 6) % 7]++
  }
  return totals.map((total, i) => ({ weekday: i, total: round(total), average: round(occurrences[i] ? total / occurrences[i] : 0) }))
}

function ymd(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m - 1, d]
}
export const weekday = (date: string) => (new Date(Date.UTC(...ymd(date))).getUTCDay() + 6) % 7

/** Average monthly spend per category over the last `window` months against the window before it. */
export function categoryChanges(movements: Movement[], months: string[], window = 3): CategoryChange[] {
  if (months.length < window * 2) return []
  const recent = new Set(months.slice(-window))
  const previous = new Set(months.slice(-window * 2, -window))
  const map = new Map<string, { recent: number; previous: number }>()
  for (const m of countable(movements)) {
    if (m.type !== 'expense') continue
    const k = month(m.date)
    const slot = recent.has(k) ? 'recent' : previous.has(k) ? 'previous' : null
    if (!slot) continue
    const row = map.get(label(m)) ?? { recent: 0, previous: 0 }
    row[slot] += m.amount
    map.set(label(m), row)
  }
  return [...map.entries()]
    .map(([name, r]) => ({ name, recent: round(r.recent / window), previous: round(r.previous / window), change: round((r.recent - r.previous) / window) }))
    .sort((a, b) => b.change - a.change)
}

/** Same description and amount in at least `minMonths` different months: likely a subscription or fixed bill. */
export function recurringCharges(movements: Movement[], minMonths = 3): Recurring[] {
  const map = new Map<string, { label: string; amount: number; category: string; months: Set<string> }>()
  for (const m of countable(movements)) {
    const text = (m.content || m.subcategoryName || '').trim()
    if (m.type !== 'expense' || !text) continue
    const key = `${text.toLowerCase()}|${m.amount.toFixed(2)}`
    const row = map.get(key) ?? { label: text, amount: m.amount, category: label(m), months: new Set() }
    row.months.add(month(m.date))
    map.set(key, row)
  }
  return [...map.values()]
    .filter((r) => r.months.size >= minMonths)
    .map((r) => ({ label: r.label, amount: round(r.amount), months: r.months.size, category: r.category }))
    .sort((a, b) => b.amount - a.amount)
}

export function analyze(movements: Movement[], first: string, last: string): Insights {
  const inRange = movements.filter((m) => m.date >= first && m.date <= last)
  const months = monthlyTotals(inRange, first, last)
  const days = dailyTotals(inRange)
  const categories = categoryShares(inRange)
  const keys = months.map((m) => m.month)
  const changes = categoryChanges(inRange, keys)
  const recurring = recurringCharges(inRange)
  const income = months.reduce((a, m) => a + m.income, 0)
  const expense = months.reduce((a, m) => a + m.expense, 0)
  return {
    months,
    categories,
    weekdays: weekdayTotals(days, first, last),
    days,
    topDays: [...days].sort((a, b) => b.total - a.total).slice(0, 5),
    changes,
    recurring,
    opportunities: opportunities({ months, changes, recurring, movements: inRange }),
    averageExpense: round(months.length ? expense / months.length : 0),
    savingsRate: income > 0 ? (income - expense) / income : null,
  }
}

const SMALL = 50
const RISE = 0.2

/** Concrete places to save, ranked by money per month. */
export function opportunities(input: { months: MonthTotal[]; changes: CategoryChange[]; recurring: Recurring[]; movements: Movement[] }): Opportunity[] {
  const out: Opportunity[] = []
  for (const c of input.changes) {
    if (c.previous > 0 && c.change > 0 && c.change / c.previous >= RISE) {
      out.push({ kind: 'rising', title: `${c.name} is growing`, detail: `${Math.round((c.change / c.previous) * 100)}% more per month than the three months before.`, monthly: c.change })
    }
  }
  const span = input.months.length || 1
  const fixed = input.recurring.reduce((a, r) => a + r.amount * r.months, 0) / span
  if (input.recurring.length) {
    out.push({ kind: 'recurring', title: `${input.recurring.length} repeating charges`, detail: `Subscriptions and fixed bills average this much per month. Cancelling one you no longer use saves every month.`, monthly: round(fixed) })
  }
  const recent = new Set(input.months.slice(-3).map((m) => m.month))
  const small = countable(input.movements).filter((m) => m.type === 'expense' && m.amount < SMALL && recent.has(month(m.date)))
  if (small.length >= 10 && recent.size) {
    const total = small.reduce((a, m) => a + m.amount, 0)
    out.push({ kind: 'small-purchases', title: `${small.length} small purchases`, detail: `Purchases under ${SMALL} in the last ${recent.size} months add up quickly.`, monthly: round(total / recent.size) })
  }
  for (const m of input.months) {
    if (m.income > 0 && m.expense > m.income) {
      out.push({ kind: 'overspent-month', month: m.month, title: `Spent more than earned in ${m.month}`, detail: `Expenses passed income for that month.`, monthly: round(m.expense - m.income) })
    }
  }
  return out.sort((a, b) => b.monthly - a.monthly)
}
