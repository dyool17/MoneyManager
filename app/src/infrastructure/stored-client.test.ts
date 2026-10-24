import { beforeEach, expect, it, vi } from 'vitest'
import { StoredClient, startupSource } from './stored-client'
import { dbMovements, dbStatus } from './local-db'
vi.mock('./local-db', () => ({ dbMovements: vi.fn(), dbStatus: vi.fn() }))
const row = { id: 'x', date: '2026-02-03', type: 'expense' as const, amount: 4, assetId: 'a', accountName: 'Bank' }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(dbMovements).mockResolvedValue([row]); vi.mocked(dbStatus).mockResolvedValue({ movements: 1, months: [], lastSync: '2026-02-04' }) })
it('selects stored only for a remembered scope with rows, falling back safely', async () => {
  expect(await startupSource(null)).toBe('demo')
  expect(await startupSource('http://phone|b')).toBe('stored')
  vi.mocked(dbStatus).mockResolvedValue({ movements: 0, months: [], lastSync: null })
  expect(await startupSource('http://phone|b')).toBe('demo')
  vi.mocked(dbStatus).mockRejectedValue(new Error('unavailable'))
  expect(await startupSource('http://phone|b')).toBe('demo')
})
it('reads all filters, period movements and summary without fabricated balances', async () => {
  const client = new StoredClient('http://phone|b')
  expect((await client.getInitData()).currentBook.id).toBe('b')
  expect(dbMovements).toHaveBeenCalledWith('http://phone|b', '0000-01-01', '9999-12-31')
  const query = { startDate: '2026-02-01', endDate: '2026-02-28', mbid: 'b' }
  expect((await client.getMovements(query))[0]).toMatchObject({ ...row, rawCode: '1', isFuture: false })
  expect(await client.getMovements({ ...query, assetId: 'other' })).toEqual([])
  const summary = await client.getSummary(query)
  expect(summary.expense).toBe(4)
  expect(summary.period).toEqual({ startDate: query.startDate, endDate: query.endDate })
  expect(dbMovements).toHaveBeenCalledWith('http://phone|b', query.startDate, query.endDate)
  expect(await client.getDashboard()).toEqual({ netWorth: 0, assets: 0, debts: 0, history: [], assetShares: [], debtShares: [], source: 'Stored data' })
  expect(await client.getAssets()).toEqual([]); expect(await client.getCards()).toEqual([]); expect(await client.getAssetTrend('a')).toEqual([])
})
