import type { Movement } from './types'
import type { Patterns } from './patterns'
import { countable, monthRange, recurringCharges } from './insights'
import { futureCommitments } from './health'
import { involves, type LifeEvent } from './life-events'
import type { BudgetPlan } from './budget-plan'

export type ForecastBasis = 'typical' | 'seasonal' | 'trend' | 'scheduled' | 'event' | 'new-normal'
export interface ForecastLine { key: string; name: string; amount: number; basis: ForecastBasis[] }
export interface ForecastMonth { month: string; expense: number; income: number; net: number; lines: ForecastLine[] }
export interface Forecast { months: ForecastMonth[]; cumulativeNet: number }
const round = (n: number) => Math.round(n * 100) / 100
const key = (m: Movement) => m.subcategoryId ?? m.categoryId ?? m.subcategoryName ?? m.categoryName ?? 'Uncategorized'
const average = (a: number[]) => a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0
const serial = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7))

/** Projections are estimates, not budget targets. No private transaction or event labels leave this module. */
export function forecast(input: { patterns: Patterns; movements: Movement[]; today: string; horizon?: number; events?: LifeEvent[]; plan?: BudgetPlan | null }): Forecast {
  const { patterns, movements, today, events = [] } = input
  const current = today.slice(0, 7)
  const horizon = Math.max(0, Math.floor(input.horizon ?? 6))
  const endIndex = serial(current) - 1 + horizon
  const end = `${Math.floor(endIndex / 12)}-${String(endIndex % 12 + 1).padStart(2, '0')}`
  const months = monthRange(current, end)
  const history = countable(movements).filter(m => m.date <= today && m.date.slice(0, 7) < current)
  const actual = countable(movements).filter(m => m.date <= today && m.date.startsWith(current))
  const scheduled = movements.filter(m => m.date > today && m.type === 'expense')
  const recurring = recurringCharges(history)
  const day = Number(today.slice(8))
  const days = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate()
  // Piecewise-linear rhythm anchors, with calendar pace when history has no spending.
  const ten = patterns.rhythm.byDay10 ?? 10 / days
  const twenty = patterns.rhythm.byDay20 ?? 20 / days
  const share = day <= 10 ? ten * day / 10 : day <= 20 ? ten + (twenty - ten) * (day - 10) / 10 : twenty + (1 - twenty) * (day - 20) / (days - 20)
  const categories = new Map(patterns.categories.map(c => [c.key, { key: c.key, name: c.name }]))
  for (const m of [...actual, ...scheduled]) if (m.type === 'expense' && !categories.has(key(m))) categories.set(key(m), { key: key(m), name: m.subcategoryName || m.categoryName || 'Uncategorized' })
  const result = months.map((month, offset): ForecastMonth => {
    const lines = [...categories.values()].map(({ key: id, name }): ForecastLine => {
      const c = patterns.categories.find(c => c.key === id)
      const basis: ForecastBasis[] = c ? ['typical'] : []
      let amount = c?.typical ?? 0
      // Budgets remain external references: the contracted output has no budget field.
      const matching = history.filter(m => m.type === 'expense' && key(m) === id)
      const event = [...events].filter(e => e.kind !== 'one-off' && e.start <= `${month}-31` && (e.kind === 'new-normal' || !e.end || e.end >= `${month}-01`) && matching.some(m => involves(e, m))).sort((a, b) => b.start.localeCompare(a.start))[0]
      if (event) {
        const eventMonths = patterns.months.filter(k => k >= event.start.slice(0, 7) && (!event.end || k <= event.end.slice(0, 7)))
        if (eventMonths.length) amount = average(eventMonths.map(k => matching.filter(m => m.date.startsWith(k) && involves(event, m)).reduce((s, m) => s + m.amount, 0)))
        basis.push(event.kind === 'new-normal' ? 'new-normal' : 'event')
      } else if (c) {
        if (c.seasonal.includes(month.slice(5))) {
          amount = average(c.monthly.filter((_, i) => patterns.months[i]!.slice(5) === month.slice(5)))
          basis.push('seasonal')
        }
        const values = c.monthly.slice(-12)
        const mean = average(values)
        const variance = values.reduce((s, n) => s + (n - mean) ** 2, 0)
        const center = (values.length - 1) / 2
        const explained = (c.trend ?? 0) ** 2 * values.reduce((s, _, i) => s + (i - center) ** 2, 0)
        // Clear means a linear fit explains at least 60% of variation.
        if (c.trend && variance > 0 && explained / variance >= 0.6) {
          const last = patterns.months[patterns.months.length - 1]!
          amount = mean + c.trend * (serial(month) - serial(last) + center)
          basis.push('trend')
        }
      }
      amount = Math.max(0, amount) * (offset === 0 ? 1 - share : 1)
      const due = scheduled.filter(m => key(m) === id && m.date.startsWith(month))
      if (due.length) {
        const total = futureCommitments(due, today, horizon + 1).find(r => r.month === month)?.total ?? 0
        const replaced = due.reduce((s, m) => {
          const repeat = recurring.find(r => r.category === name && r.label.toLowerCase() === (m.content || m.subcategoryName || '').trim().toLowerCase() && r.amount === m.amount)
          return s + (repeat ? repeat.amount : 0)
        }, 0)
        amount = Math.max(0, amount - replaced) + total
        basis.push('scheduled')
      }
      if (offset === 0) amount += actual.filter(m => m.type === 'expense' && key(m) === id).reduce((s, m) => s + m.amount, 0)
      return { key: id, name, amount: round(amount), basis }
    })
    const expense = round(lines.reduce((s, l) => s + l.amount, 0))
    const actualIncome = actual.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const scheduledIncome = movements.filter(m => m.type === 'income' && m.date > today && m.date.startsWith(month)).reduce((s, m) => s + m.amount, 0)
    const income = round(Math.max(patterns.income.typical, scheduledIncome + (offset === 0 ? actualIncome : 0)))
    return { month, expense, income, net: round(income - expense), lines }
  })
  return { months: result, cumulativeNet: round(result.reduce((s, m) => s + m.net, 0)) }
}
