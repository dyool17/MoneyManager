import { describe, expect, it } from 'vitest'
import { monthsBetween, fieldValue, scopeLabel } from './presentation'
import { formatDate, formatMoney } from '../../domain/format'

describe('sync presentation', () => {
  it('reads an inclusive chronological month range and rejects invalid or reversed ranges', () => {
    expect(monthsBetween('2025-12', '2026-02')).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(monthsBetween('2026-02', '2026-02')).toEqual(['2026-02'])
    for (const [a, b] of [['', '2026-01'], ['2026-13', '2027-01'], ['2026-03', '2026-02']]) expect(monthsBetween(a!, b!)).toEqual([])
  })
  it('formats money and dates but preserves user text verbatim', () => {
    expect(fieldValue('amount', 1200)).toBe(formatMoney(1200))
    expect(fieldValue('date', '2026-01-02')).toBe(formatDate('2026-01-02'))
    expect(fieldValue('content', 'Today')).toBe('Today')
    expect(fieldValue('categoryId', 'Help')).toBe('Help')
    expect(fieldValue('detail', undefined)).toBe('—')
  })
  it('splits the remembered phone and book without losing address characters', () => {
    expect(scopeLabel('http://phone:8080|book-2')).toEqual({ phone: 'http://phone:8080', book: 'book-2' })
    expect(scopeLabel(null)).toEqual({ phone: '—', book: '—' })
  })
})
