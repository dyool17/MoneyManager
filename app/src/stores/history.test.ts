import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSession } from './session'
import { useHistory } from './history'
import type { Movement } from '../domain/types'
import { canonical } from '../domain/sync'
import { dbMovements, dbStatus } from '../infrastructure/local-db'

vi.mock('../infrastructure/local-db', () => ({
  scopeOf: (origin: string, book: string) => `${origin}|${book}`,
  dbStatus: vi.fn(), dbMovements: vi.fn(), dbApply: vi.fn(), dbLog: vi.fn(),
}))

const mv = (id: string, date: string): Movement => ({
  id, date, assetId: 'a', accountName: 'Cash', amount: 10, type: 'expense', rawCode: '1', isFuture: false,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
  setActivePinia(createPinia())
  // Outside the desktop app there is no database: history comes from the phone as before.
  vi.mocked(dbStatus).mockRejectedValue(new Error('The local database is only available in the desktop app.'))
  vi.mocked(dbMovements).mockResolvedValue([])
})

const phone = () => {
  const session = useSession()
  session.source = 'phone'; session.address = 'http://phone:8080'; session.bookId = 'book'
  return session
}

describe('history store', () => {
  it('drops history loaded from another source when the session switches to the phone', async () => {
    const session = useSession()
    const history = useHistory()
    session.getHistory = vi.fn(async () => [mv('demo', '2026-08-01')])
    session.getSummaries = vi.fn(async () => [])
    await history.fromSession(2, new Date(2026, 9, 21))
    expect(history.movements.map((m) => m.id)).toEqual(['demo'])

    session.source = 'phone'
    session.address = 'http://192.168.1.2:8080'
    await nextTick()
    expect(history.state).toBe('idle')
    expect(history.movements).toEqual([])
    expect(history.budgets).toEqual([])
  })

  it('keeps history opened from a backup when the session switches', async () => {
    const session = useSession()
    const history = useHistory()
    history.movements = [mv('backup', '2026-10-01')]
    history.source = 'backup'
    history.state = 'ready'
    session.source = 'phone'
    await nextTick()
    expect(history.state).toBe('ready')
    expect(history.movements.map((m) => m.id)).toEqual(['backup'])
  })

  it('ignores a load that finishes after the session switched', async () => {
    const session = useSession()
    const history = useHistory()
    let finish: (m: Movement[]) => void = () => undefined
    session.getHistory = vi.fn(() => new Promise<Movement[]>((r) => { finish = r }))
    session.getSummaries = vi.fn(async () => [])
    const pending = history.fromSession(2, new Date(2026, 9, 21))
    // The phone read starts after the database check settles.
    await vi.waitFor(() => expect(session.getHistory).toHaveBeenCalled())
    session.source = 'phone'
    await nextTick()
    finish([mv('stale', '2026-08-01')])
    await pending
    expect(history.state).toBe('idle')
    expect(history.movements).toEqual([])
  })

  it('reads older months from the local database and only the current month onwards from the phone', async () => {
    const session = phone()
    vi.mocked(dbStatus).mockResolvedValue({ movements: 3, months: [], lastSync: '2026-10-20T00:00:00Z' })
    vi.mocked(dbMovements).mockResolvedValue([
      canonical(mv('db-2024', '2024-06-03'))!, canonical(mv('db-sep', '2026-09-30'))!,
      canonical(mv('db-oct-stale', '2026-10-02'))!,
    ])
    session.getHistory = vi.fn(async () => [mv('phone-oct', '2026-10-05'), mv('phone-nov', '2026-11-01')])
    session.getSummaries = vi.fn(async () => [])
    const history = useHistory()
    await history.fromSession(12, new Date(2026, 9, 21))
    expect(dbMovements).toHaveBeenCalledWith('http://phone:8080|book', '0000-01-01', '9999-12-31')
    expect(session.getHistory).toHaveBeenCalledExactlyOnceWith({ startDate: '2026-10-01', endDate: '2027-10-31' })
    // The phone is the source of truth from the current month on; the database never shadows it.
    expect(history.movements.map((m) => m.id).sort()).toEqual(['db-2024', 'db-sep', 'phone-nov', 'phone-oct'])
    // Phone rows pass through unchanged (the client already set their future flag).
    expect(history.movements.find((m) => m.id === 'phone-nov')).toEqual(mv('phone-nov', '2026-11-01'))
    expect(history.movements.find((m) => m.id === 'db-sep')).toMatchObject({ type: 'expense', rawCode: '1', isFuture: false, amount: 10 })
    expect(history.span).toEqual({ first: '2025-11-01', last: '2026-10-21' })
    expect(history.state).toBe('ready')
  })

  it('reads the whole span from the phone when the database is empty', async () => {
    const session = phone()
    vi.mocked(dbStatus).mockResolvedValue({ movements: 0, months: [], lastSync: null })
    session.getHistory = vi.fn(async () => [mv('p', '2026-10-05')])
    session.getSummaries = vi.fn(async () => [])
    await useHistory().fromSession(12, new Date(2026, 9, 21))
    expect(session.getHistory).toHaveBeenCalledExactlyOnceWith({ startDate: '2025-11-01', endDate: '2027-10-31' })
    expect(dbMovements).not.toHaveBeenCalled()
  })

  it('falls back to the phone when the database cannot be read', async () => {
    const session = phone()
    session.getHistory = vi.fn(async () => [mv('p', '2026-10-05')])
    session.getSummaries = vi.fn(async () => [])
    const history = useHistory()
    await history.fromSession(12, new Date(2026, 9, 21))
    expect(session.getHistory).toHaveBeenCalledExactlyOnceWith({ startDate: '2025-11-01', endDate: '2027-10-31' })
    expect(history.movements.map((m) => m.id)).toEqual(['p'])
  })
})

it('S7 probe: row-read database failure falls back to full phone history', async () => {
  const session = phone()
  vi.mocked(dbStatus).mockResolvedValue({ movements: 1, months: [], lastSync: null })
  vi.mocked(dbMovements).mockRejectedValue(new Error('database disk image is malformed'))
  session.getHistory = vi.fn(async () => [mv('phone', '2026-09-01')])
  session.getSummaries = vi.fn(async () => [])
  const history = useHistory(); await history.fromSession(12, new Date(2026, 9, 21))
  expect(history.state).toBe('ready')
  expect(session.getHistory).toHaveBeenCalledWith({ startDate: '2025-11-01', endDate: '2027-10-31' })
})
it('uses all stored months with a notice offline and clears the notice on reload', async () => {
  const session = phone()
  vi.mocked(dbStatus).mockResolvedValue({ movements: 2, months: [], lastSync: null })
  vi.mocked(dbMovements).mockResolvedValue([canonical(mv('old', '2026-09-01'))!, canonical(mv('current', '2026-10-01'))!])
  session.getHistory = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([mv('live', '2026-10-02')])
  session.getSummaries = vi.fn(async () => [])
  const history = useHistory()
  await history.fromSession(12, new Date(2026, 9, 21))
  expect(history.state).toBe('ready')
  expect(history.movements.map(m => m.id)).toEqual(['old', 'current'])
  expect(history.error).toBeNull()
  expect(history.notice).toBe('Phone not reachable: showing the history stored on this computer.')
  await history.fromSession(12, new Date(2026, 9, 21))
  expect(history.notice).toBeNull()
  expect(history.movements.map(m => m.id)).toEqual(['old', 'live'])
})
it('reports the phone error when both row and phone reads fail', async () => {
  const session = phone()
  vi.mocked(dbStatus).mockResolvedValue({ movements: 1, months: [], lastSync: null })
  vi.mocked(dbMovements).mockRejectedValue(new Error('Database broken'))
  session.getHistory = vi.fn().mockRejectedValue(new Error('Phone offline'))
  const history = useHistory()
  await history.fromSession(12, new Date(2026, 9, 21))
  expect(history.state).toBe('failed')
  expect(history.error).toBe('Phone offline')
  expect(history.notice).toBeNull()
  expect(history.movements).toEqual([])
  expect(session.getHistory).toHaveBeenCalledExactlyOnceWith({ startDate: '2025-11-01', endDate: '2027-10-31' })
})
it('S7 probe: phone id wins when a stored movement moved into the current month', async () => {
  const session = phone()
  vi.mocked(dbStatus).mockResolvedValue({ movements: 1, months: [], lastSync: null })
  vi.mocked(dbMovements).mockResolvedValue([canonical(mv('same', '2026-09-01'))!])
  session.getHistory = vi.fn(async () => [mv('same', '2026-10-02')])
  session.getSummaries = vi.fn(async () => [])
  const history = useHistory(); await history.fromSession(12, new Date(2026, 9, 21))
  expect(history.movements).toEqual([mv('same', '2026-10-02')])
})

it('S1/S7 probe: accepted stored history is available when the phone is offline', async () => {
  const session = phone()
  vi.mocked(dbStatus).mockResolvedValue({ movements: 1, months: [], lastSync: null })
  vi.mocked(dbMovements).mockResolvedValue([canonical(mv('stored', '2026-09-01'))!])
  session.getHistory = vi.fn(async () => { throw new Error('Phone offline') })
  const history = useHistory(); await history.fromSession(12, new Date(2026, 9, 21))
  expect(history.state).toBe('ready')
  expect(history.movements.map(m => m.id)).toEqual(['stored'])
})
