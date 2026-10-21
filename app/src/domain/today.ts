import type { Movement } from './types'

export interface Pace {
  daysInMonth: number
  /** Spending added up day by day, from the 1st to today. */
  actual: number[]
  /** How earlier months added up by each day of the month, on average. */
  typical: number[]
}

const round = (v: number) => Math.round(v * 100) / 100
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y!, m!, 0).getDate()
}

/** Cumulative expenses of `month` per day, for `days` days; shorter months carry their total. */
function cumulative(movements: Movement[], month: string, days: number): number[] {
  const perDay = new Array<number>(days).fill(0)
  for (const m of movements) {
    if (m.type !== 'expense' || m.isFuture || !m.date.startsWith(month)) continue
    const d = Math.min(Number(m.date.slice(8, 10)), days)
    perDay[d - 1]! += m.amount
  }
  let sum = 0
  return perDay.map((v) => round((sum += v)))
}

/** This month's spending pace against the typical pace of `pastMonths`. */
export function pace(movements: Movement[], today: string, pastMonths: string[]): Pace {
  const month = today.slice(0, 7)
  const daysInMonth = daysIn(month)
  const actual = cumulative(movements, month, daysInMonth).slice(0, Number(today.slice(8, 10)))
  const past = pastMonths.map((m) => cumulative(movements, m, daysInMonth))
  const typical = past.length ? past[0]!.map((_, i) => round(past.reduce((a, p) => a + p[i]!, 0) / past.length)) : []
  return { daysInMonth, actual, typical }
}

/** What is left of this month's income after spending and scheduled charges, per remaining day. */
export function safeToSpend(input: { income: number; spent: number; scheduled: number; daysLeft: number }) {
  const left = round(input.income - input.spent - input.scheduled)
  const perDay = input.daysLeft > 0 && left > 0 ? round(left / input.daysLeft) : 0
  return { left, perDay }
}
