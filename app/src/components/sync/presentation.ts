import type { ComparedField } from '../../domain/sync'
import { formatDate, formatMoney } from '../../domain/format'

/** Inclusive whole months; invalid input never starts a phone read. */
export function monthsBetween(from: string, to: string): string[] {
  const valid = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
  if (!valid(from) || !valid(to) || from > to) return []
  const index = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5)) - 1
  return Array.from({ length: index(to) - index(from) + 1 }, (_, i) => {
    const n = index(from) + i
    return `${String(Math.floor(n / 12)).padStart(4, '0')}-${String(n % 12 + 1).padStart(2, '0')}`
  })
}

export function fieldValue(field: ComparedField, value: string | number | undefined): string {
  if (value === undefined) return '—'
  if (field === 'amount') return formatMoney(Number(value))
  if (field === 'date') return formatDate(String(value))
  return String(value)
}

export function scopeLabel(scope: string | null): { phone: string; book: string } {
  const split = scope?.lastIndexOf('|') ?? -1
  return split < 0 ? { phone: '—', book: '—' } : { phone: scope!.slice(0, split), book: scope!.slice(split + 1) }
}
