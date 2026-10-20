import { describe, expect, it } from 'vitest'
import { mergeMovements, splitByMonth } from '../domain/period'
import { InvalidResponseError } from '../domain/types'
import { PcManagerClient, type Endpoint, type ReadParams, type Transport } from './client'
import { parseInitData, parseMovements, parseSummary } from './parse'

import initText from '../../../fixtures/moneymanager/init-data.json5?raw'
import summaryText from '../../../fixtures/moneymanager/summary.json5?raw'
import movementsText from '../../../fixtures/moneymanager/movements.xml?raw'

const FIXTURES: Record<string, string> = {
  'init-data.json5': initText,
  'summary.json5': summaryText,
  'movements.xml': movementsText,
}
const fixture = (name: string) => FIXTURES[name]

describe('parseInitData', () => {
  it('reads book, period, categories and accounts from the fixture', () => {
    const init = parseInitData(fixture('init-data.json5'))
    expect(init.currentBook).toEqual({ id: '1', name: 'Demo Book' })
    expect(init.defaultPeriod).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' })
    expect(init.expenseCategories[1].subcategories.map((s) => s.id)).toEqual(['food', 'transport'])
    expect(init.accounts.map((a) => a.id)).toEqual(['cash', 'checking', 'credit'])
  })

  it('never evaluates code', () => {
    expect(() => parseInitData('(() => { globalThis.pwned = 1; return {} })()')).toThrow(
      InvalidResponseError,
    )
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })

  it('rejects malformed and empty bodies', () => {
    expect(() => parseInitData('{ initData: ')).toThrow(InvalidResponseError)
    expect(() => parseInitData('')).toThrow(InvalidResponseError)
    expect(() => parseInitData('{}')).toThrow(/initData/)
  })
})

describe('parseSummary', () => {
  it('converts string amounts to numbers and keeps the source', () => {
    const s = parseSummary(fixture('summary.json5'))
    expect(s).toMatchObject({ income: 5000, expense: 1780.5, net: 3219.5, source: 'getSummaryDataByPeriod' })
    expect(s.expenseByCategory[0]).toEqual({ name: 'Fixed', total: 980.5, budget: 1000 })
  })

  it('rejects non-numeric amounts', () => {
    expect(() =>
      parseSummary("{summary:{startDate:'a',endDate:'b',income:'x',outcome:0,cash:0,card:0,sum:0},income:[],outcome:[]}"),
    ).toThrow(/summary.income/)
  })
})

describe('parseMovements', () => {
  it('maps the four movement types and flags future charges', () => {
    const rows = parseMovements(fixture('movements.xml'), '2026-08-02')
    expect(rows.map((m) => [m.id, m.type, m.isFuture])).toEqual([
      ['fixture-income-1', 'income', false],
      ['fixture-expense-1', 'expense', false],
      ['fixture-transfer-out-1', 'transfer-out', true],
      ['fixture-transfer-in-1', 'transfer-in', true],
    ])
    expect(rows[2]).toMatchObject({ toAssetId: 'cash', categoryId: undefined, amount: -200 })
  })

  it('keeps unmapped codes visible as unknown', () => {
    const xml = fixture('movements.xml').replace('<inOutCode>0</inOutCode>', '<inOutCode>7</inOutCode>')
    expect(parseMovements(xml, '2026-01-01')[0]).toMatchObject({ type: 'unknown', rawCode: '7' })
  })

  it('handles an empty dataset and rejects malformed XML', () => {
    expect(parseMovements('<dataset></dataset>', '2026-01-01')).toEqual([])
    expect(parseMovements('<dataset><results>0</results></dataset>', '2026-01-01')).toEqual([])
    expect(() => parseMovements('<html>error</html>', '2026-01-01')).toThrow(/dataset/)
    expect(() => parseMovements('<dataset><row><id>1</id></row></dataset>', '2026-01-01')).toThrow(
      InvalidResponseError,
    )
  })
})

describe('splitByMonth', () => {
  it('splits across months and years, inclusive', () => {
    expect(splitByMonth({ startDate: '2025-12-15', endDate: '2026-02-10' })).toEqual([
      { startDate: '2025-12-15', endDate: '2025-12-31' },
      { startDate: '2026-01-01', endDate: '2026-01-31' },
      { startDate: '2026-02-01', endDate: '2026-02-10' },
    ])
    expect(splitByMonth({ startDate: '2024-02-01', endDate: '2024-02-29' })).toHaveLength(1)
  })

  it('rejects bad ranges', () => {
    expect(() => splitByMonth({ startDate: '2026-02-01', endDate: '2026-01-01' })).toThrow(RangeError)
    expect(() => splitByMonth({ startDate: '2026/01/01', endDate: '2026-01-02' })).toThrow(RangeError)
  })
})

describe('PcManagerClient.getMovements', () => {
  it('queries month by month without losing or duplicating ids', async () => {
    const calls: ReadParams[] = []
    const transport: Transport = {
      async get(endpoint: Endpoint, params: ReadParams = {}) {
        expect(endpoint).toBe('getDataByPeriod')
        calls.push(params)
        // Server ignores the range and always returns the same rows.
        return fixture('movements.xml').replace(/2026-08-03/g, '2026-09-03')
      },
    }
    const client = new PcManagerClient(transport, () => '2026-08-15')
    const rows = await client.getMovements({ startDate: '2026-08-01', endDate: '2026-09-30', mbid: '1' })
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31', mbid: '1', assetId: '' })
    expect(rows.map((r) => r.id)).toEqual([
      'fixture-income-1',
      'fixture-expense-1',
      'fixture-transfer-out-1',
      'fixture-transfer-in-1',
    ])
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it('dedupes ids repeated across chunks', () => {
    const [m] = parseMovements(fixture('movements.xml'), '2026-01-01')
    expect(mergeMovements([[m], [m]])).toHaveLength(1)
  })
})
