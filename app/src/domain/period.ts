import type { Movement, Period } from './types'

const DATE = /^\d{4}-\d{2}-\d{2}$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Splits an inclusive date range into calendar-month chunks. */
export function splitByMonth({ startDate, endDate }: Period): Period[] {
  if (!DATE.test(startDate) || !DATE.test(endDate)) {
    throw new RangeError('Dates must use YYYY-MM-DD')
  }
  if (startDate > endDate) throw new RangeError('startDate must be <= endDate')

  const chunks: Period[] = []
  let [year, month] = startDate.split('-').map(Number)
  let chunkStart = startDate
  for (;;) {
    const monthEnd = `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`
    if (monthEnd >= endDate) {
      chunks.push({ startDate: chunkStart, endDate })
      return chunks
    }
    chunks.push({ startDate: chunkStart, endDate: monthEnd })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    chunkStart = `${year}-${pad(month)}-01`
  }
}

/** Merges chunk results keeping the first occurrence of each id, sorted by date. */
export function mergeMovements(chunks: Movement[][]): Movement[] {
  const byId = new Map<string, Movement>()
  for (const chunk of chunks) {
    for (const m of chunk) if (!byId.has(m.id)) byId.set(m.id, m)
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
