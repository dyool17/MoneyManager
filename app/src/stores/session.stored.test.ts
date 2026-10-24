import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSession } from './session'
import { dbMovements, dbStatus } from '../infrastructure/local-db'
import { FixtureTransport, TauriTransport, applyWrite, takeBackup } from '../infrastructure/client'
vi.mock('../infrastructure/client', async importOriginal => ({ ...await importOriginal<typeof import('../infrastructure/client')>(), applyWrite: vi.fn(), takeBackup: vi.fn() }))
vi.mock('../infrastructure/local-db', () => ({ dbMovements: vi.fn(), dbStatus: vi.fn() }))
beforeEach(() => {
  setActivePinia(createPinia()); vi.clearAllMocks()
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 1, 15))
  vi.mocked(dbMovements).mockResolvedValue([{ id: 'x', date: '2026-02-03', type: 'expense', amount: 4, assetId: 'a', accountName: 'Bank' }])
  vi.mocked(dbStatus).mockResolvedValue({ movements: 1, months: [], lastSync: '2026-02-04' })
})
import { afterEach } from 'vitest'
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it('commits stored period data, provenance and last sync; refuses writes', async () => {
  const session = useSession(); await session.connect('stored', 'http://phone|b')
  expect(session.status).toBe('ready'); expect(session.source).toBe('stored')
  expect(session.storedScope).toBe('http://phone|b'); expect(session.lastSync).toBe('2026-02-04')
  expect(session.period).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' })
  expect(session.movements.map(m => m.id)).toEqual(['x']); expect(session.summary?.expense).toBe(4)
  expect(session.canWrite()).toBe(false)
  const before = JSON.stringify([session.movements, session.summary])
  await expect(session.write({ op: 'delete-transactions', ids: ['x'] })).rejects.toThrow('Connect your phone')
  expect(JSON.stringify([session.movements, session.summary])).toBe(before)
  expect(applyWrite).not.toHaveBeenCalled(); expect(takeBackup).not.toHaveBeenCalled()
  vi.mocked(dbMovements).mockRejectedValue(new Error('read failed'))
  await session.connect('stored', 'http://other|c')
  expect(session.status).toBe('offline'); expect(session.error).toBe('read failed')
  expect(session.storedScope).toBe('http://phone|b'); expect(JSON.stringify([session.movements, session.summary])).toBe(before)
})
it('replaces stored with a phone only after all reads succeed', async () => {
  const session = useSession(); await session.connect('stored', 'http://phone|b')
  const previous = session.movements
  const read = vi.spyOn(TauriTransport.prototype, 'get').mockRejectedValue(new Error('phone offline'))
  await session.connect('phone', 'http://phone')
  expect(session.source).toBe('stored'); expect(session.movements).toBe(previous)
  expect(session.storedScope).toBe('http://phone|b'); expect(session.lastSync).toBe('2026-02-04')
  const fixtures = new FixtureTransport()
  read.mockImplementation(endpoint => fixtures.get(endpoint))
  await session.connect('phone', 'http://phone')
  expect(session.status).toBe('ready'); expect(session.source).toBe('phone'); expect(session.address).toBe('http://phone')
  expect(session.storedScope).toBe(''); expect(session.lastSync).toBeNull()
  expect(session.movements).not.toBe(previous); expect(takeBackup).toHaveBeenCalledOnce()
})
it('preserves demo on failed stored connect and still allows choosing demo later', async () => {
  const session = useSession(); await session.connect('demo'); const previous = session.movements
  vi.mocked(dbStatus).mockRejectedValue(new Error('db failed'))
  await session.connect('stored', 'http://phone|b')
  expect(session.source).toBe('demo'); expect(session.movements).toBe(previous)
  vi.mocked(dbStatus).mockResolvedValue({ movements: 1, months: [], lastSync: null })
  await session.connect('stored', 'http://phone|b'); await session.connect('demo')
  expect(session.source).toBe('demo'); expect(session.status).toBe('ready')
})
