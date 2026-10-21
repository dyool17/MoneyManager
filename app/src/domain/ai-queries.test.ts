import { describe, expect, it } from 'vitest'
import { extractQueries, runQuery, QUERY_GUIDE, MAX_ROWS } from './ai-queries'
import type { Movement } from './types'

let id = 0
const mv = (date: string, amount: number, over: Partial<Movement> = {}): Movement => ({
  id: String(++id), date, assetId: 'a', accountName: 'Cash', amount, type: 'expense', categoryName: 'Variable', subcategoryName: 'Food', content: 'Super Shop', rawCode: '1', isFuture: false, ...over,
})
const data = [
  mv('2026-09-02', 100),
  mv('2026-09-15', 40, { subcategoryName: 'Taxi', content: 'Uber ride', accountName: 'Card' }),
  mv('2026-10-01', 1000, { type: 'income', subcategoryName: 'Salary', content: 'Payroll' }),
  mv('2026-10-03', 60),
]
const opts = (includeDetails = false) => ({ movements: data, includeDetails, available: { first: '2026-09-01', last: '2026-10-20' } })

describe('extractQueries', () => {
  it('reads query blocks and ignores the rest of the text', () => {
    const text = 'Let me check.\n```query\n{"tool":"totals","groupBy":"month"}\n```'
    expect(extractQueries(text)).toEqual([{ tool: 'totals', groupBy: 'month' }])
    expect(extractQueries('No lookup needed.')).toEqual([])
  })

  it('also accepts a bare JSON query or a json block, as some models send', () => {
    expect(extractQueries('{"tool":"day","date":"2026-02-11"}')).toEqual([{ tool: 'day', date: '2026-02-11' }])
    expect(extractQueries('```json\n{"tool":"day","date":"2026-02-11"}\n```')).toEqual([{ tool: 'day', date: '2026-02-11' }])
    expect(extractQueries('{"note":"not a query"}')).toEqual([])
  })

  it('reports a block that is not valid JSON instead of dropping it', () => {
    expect(extractQueries('```query\n{tool: oops}\n```')).toEqual([{ error: 'Query is not valid JSON.' }])
  })
})

describe('runQuery', () => {
  it('lists movements filtered by category and dates, without descriptions by default', () => {
    const out = runQuery({ tool: 'movements', category: 'food', from: '2026-09-01', to: '2026-09-30' }, opts())
    expect(out).toContain('1 movement(s) totalling 100.00')
    expect(out).toContain('2026-09-02 | expense | Variable / Food | Cash | 100.00')
    expect(out).not.toContain('Super Shop')
  })

  it('includes descriptions and allows text search only when sharing is on', () => {
    expect(runQuery({ tool: 'movements', text: 'uber' }, opts())).toBe('Text search needs "Share transaction descriptions" turned on in Settings.')
    const out = runQuery({ tool: 'movements', text: 'uber' }, opts(true))
    expect(out).toContain('2026-09-15 | expense | Variable / Taxi | Card | 40.00 | "Uber ride"')
  })

  it('totals expenses by the requested grouping', () => {
    const out = runQuery({ tool: 'totals', groupBy: 'category', from: '2026-09-01', to: '2026-10-31' }, opts())
    expect(out).toContain('expense totals by category (2 group(s), overall 200.00):')
    expect(out).toContain('- Variable / Food: 160.00 in 2')
    expect(out).toContain('- Variable / Taxi: 40.00 in 1')
    expect(runQuery({ tool: 'totals', groupBy: 'month', type: 'income' }, opts())).toContain('- 2026-10: 1000.00 in 1')
  })

  it('shows every movement of one day', () => {
    expect(runQuery({ tool: 'day', date: '2026-10-03' }, opts())).toContain('2026-10-03 | expense | Variable / Food | Cash | 60.00')
  })

  it('caps rows and says how many were left out', () => {
    const many = Array.from({ length: 70 }, (_, i) => mv('2026-09-10', i + 1))
    const out = runQuery({ tool: 'movements', limit: 500 }, { ...opts(), movements: many })
    expect(out).toContain(`70 movement(s) totalling 2485.00, showing the ${MAX_ROWS} largest`)
    expect(out.split('\n').filter((l) => l.startsWith('2026-')).length).toBe(MAX_ROWS)
  })

  it('rejects unknown tools and bad dates with a message the assistant can act on', () => {
    expect(runQuery({ tool: 'delete' }, opts())).toBe('Unknown query "delete". Use movements, totals or day.')
    expect(runQuery({ tool: 'day', date: 'yesterday' }, opts())).toBe('Dates must be YYYY-MM-DD.')
  })

  it('says which dates are loaded when the request starts earlier', () => {
    expect(runQuery({ tool: 'totals', groupBy: 'month', from: '2025-01-01' }, opts())).toContain('Only 2026-09-01 to 2026-10-20 is loaded')
  })

  it('documents every tool for the assistant', () => {
    for (const t of ['movements', 'totals', 'day']) expect(QUERY_GUIDE).toContain(`"tool":"${t}"`)
  })
})
