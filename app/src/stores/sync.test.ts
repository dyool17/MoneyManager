import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSession } from './session'
import { useSync } from './sync'
import { useOutbox } from './outbox'
import { canonical, fingerprint } from '../domain/sync'
import type { Movement } from '../domain/types'
import { dbApply, dbMovements, dbStatus, dbLog } from '../infrastructure/local-db'
import { loadBackupHistory } from '../infrastructure/backup-history'

vi.mock('../infrastructure/local-db', () => ({
  scopeOf: (origin: string, book: string) => `${origin}|${book}`,
  dbApply: vi.fn(), dbMovements: vi.fn(), dbStatus: vi.fn(), dbLog: vi.fn(),
}))
vi.mock('../infrastructure/backup-history', () => ({ loadBackupHistory: vi.fn() }))
const mv = (id: string, date = '2026-10-01', amount = 10): Movement => ({
  id, date, amount, assetId: 'cash', accountName: 'Cash', type: 'expense', rawCode: '1', isFuture: false,
})
function setup() {
  const session = useSession()
  session.source = 'phone'; session.address = 'http://phone:8080/path'; session.bookId = 'book'
  session.getHistory = vi.fn(async () => [] as Movement[])
  session.write = vi.fn(async () => { throw new Error('Phone write forbidden') })
  return { session, store: useSync() }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
  setActivePinia(createPinia())
  vi.mocked(dbMovements).mockResolvedValue([])
  vi.mocked(dbStatus).mockResolvedValue({ movements: 0, months: [], lastSync: null })
  vi.mocked(dbLog).mockResolvedValue([])
  vi.mocked(dbApply).mockResolvedValue({ applied: 1 })
})
afterEach(() => { expect(useSession().write).not.toHaveBeenCalled(); vi.useRealTimers() })

it('reads sequential months, keeps previews, and accepts one exact atomic batch', async () => {
  const { session, store } = setup()
  const old = canonical(mv('edit'))!; const gone = canonical(mv('gone'))!
  vi.mocked(dbMovements).mockResolvedValue([old, gone])
  vi.mocked(session.getHistory).mockResolvedValueOnce([mv('new'), mv('edit', undefined, 20)]).mockResolvedValueOnce([])
  await store.read(['2026-10', '2026-11'])
  expect(session.getHistory).toHaveBeenNthCalledWith(1, { startDate: '2026-10-01', endDate: '2026-10-31' })
  expect(session.getHistory).toHaveBeenNthCalledWith(2, { startDate: '2026-11-01', endDate: '2026-11-30' })
  expect(dbMovements).toHaveBeenCalledExactlyOnceWith('http://phone:8080|book', '0000-01-01', '9999-12-31')
  expect(store.progress).toEqual({ done: 2, total: 2, current: null })
  expect(store.summary).toEqual([{ month: '2026-10', new: 1, modified: 1, deleted: 1 }])
  expect(dbApply).not.toHaveBeenCalled()
  await store.accept('all')
  expect(dbApply).toHaveBeenCalledExactlyOnceWith('http://phone:8080|book', {
    source: 'phone', upserts: [canonical(mv('new')), canonical(mv('edit', undefined, 20))], deletes: ['gone'],
    counts: { added: 1, modified: 1, deleted: 1 }, months: [
      { month: '2026-10', readAt: expect.any(String), fingerprint: fingerprint([canonical(mv('new'))!, canonical(mv('edit', undefined, 20))!]), rows: 2 },
      { month: '2026-11', readAt: expect.any(String), fingerprint: fingerprint([]), rows: 0 },
    ],
  })
  expect(store.pending.size).toBe(0)
  expect(dbStatus).toHaveBeenCalled(); expect(dbLog).toHaveBeenCalled()
})
it('cancels after the in-flight month and resumes without losing comparisons', async () => {
  const { session, store } = setup()
  let finish!: (rows: Movement[]) => void
  vi.mocked(session.getHistory).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const task = store.read(['2026-10', '2026-11'])
  await vi.waitFor(() => expect(session.getHistory).toHaveBeenCalledTimes(1))
  store.cancel(); finish([mv('first')]); await task
  expect(store.pending.get('2026-10')?.map(c => c.id)).toEqual(['first'])
  expect(store.progress.done).toBe(1)
  await store.read(['2026-11'])
  expect(store.pending.has('2026-10')).toBe(true)
  expect(dbApply).not.toHaveBeenCalled()
})
it('keeps compared months when the phone locks', async () => {
  const { session, store } = setup()
  vi.mocked(session.getHistory).mockResolvedValueOnce([mv('first')]).mockRejectedValueOnce(new Error('Phone locked'))
  await store.read(['2026-10', '2026-11', '2026-12'])
  expect(session.getHistory).toHaveBeenCalledTimes(2)
  expect(store.error).toBe('Phone locked'); expect(store.pending.get('2026-10')).toHaveLength(1)
  expect(dbApply).not.toHaveBeenCalled()
})
it.each([['2026-09', '2026-10'], ['2026-10', '2026-09']])('reports a moved date once across read order %s %s', async (a, b) => {
  const { session, store } = setup()
  vi.mocked(dbMovements).mockResolvedValue([canonical(mv('moved', '2026-09-01'))!])
  vi.mocked(session.getHistory).mockImplementation(async p => p.startDate.startsWith('2026-10') ? [mv('moved')] : [])
  await store.read([a, b])
  expect([...store.pending.values()].flat().map(c => [c.id, c.kind])).toEqual([['moved', 'modified']])
})
it('leaves pending intact on database failure', async () => {
  const { session, store } = setup()
  vi.mocked(session.getHistory).mockResolvedValue([mv('new')]); await store.read(['2026-10'])
  const before = [...store.pending.entries()]
  vi.mocked(dbApply).mockRejectedValueOnce(new Error('Disk full'))
  await store.accept('all')
  expect([...store.pending.entries()]).toEqual(before); expect(store.error).toBe('Disk full')
})
it('excludes conflicts from all, accepts phone by id, and keeps local without writing', async () => {
  const { session, store } = setup(); const outbox = useOutbox()
  outbox.queue({ op: 'update-transaction', id: 'conflict', fields: {
    date: '2026-10-01', assetId: 'cash', payType: '0', categoryId: 'c', categoryName: 'Food', amount: 5, kind: 'expense',
  } }, 'Update')
  outbox.recordFailure({ op: 'delete-transactions', ids: ['keep'] }, { kind: 'unconfirmed' }, 'Unknown')
  vi.mocked(session.getHistory).mockResolvedValue([mv('conflict'), mv('keep'), mv('plain')])
  await store.read(['2026-10'])
  expect(store.conflicts).toHaveLength(2); expect(store.outgoing).toEqual({ pending: 1, unconfirmed: 1 })
  await store.accept('all')
  expect(vi.mocked(dbApply).mock.calls[0]![1]).toMatchObject({ upserts: [canonical(mv('plain'))], months: [] })
  store.keepLocal('keep')
  expect(dbApply).toHaveBeenCalledTimes(1); expect(outbox.items).toHaveLength(2)
  await store.accept(['conflict'])
  expect(vi.mocked(dbApply).mock.calls[1]![1]).toMatchObject({ upserts: [canonical(mv('conflict'))], months: [] })
  expect(store.pending.size).toBe(0)
})
it('previews all backup months including deletions, then explicitly applies backup source', async () => {
  const { store } = setup()
  vi.mocked(dbMovements).mockResolvedValue([canonical(mv('gone'))!])
  vi.mocked(loadBackupHistory).mockResolvedValue([mv('oct'), mv('nov', '2026-11-01')])
  await store.previewBackup(new File([], 'history.mmbak'))
  expect(store.summary).toEqual([{ month: '2026-10', new: 1, modified: 0, deleted: 1 }, { month: '2026-11', new: 1, modified: 0, deleted: 0 }])
  expect(dbApply).not.toHaveBeenCalled()
  await store.accept('all')
  expect(vi.mocked(dbApply).mock.calls[0]![1]).toMatchObject({ source: 'backup', deletes: ['gone'], counts: { added: 2, modified: 0, deleted: 1 } })
})
it('disables demo reads and backup without a known scope', async () => {
  const { session, store } = setup(); session.source = 'demo'; await nextTick()
  await store.read(['2026-10']); expect(store.error).toMatch(/phone/i)
  expect(session.getHistory).not.toHaveBeenCalled(); expect(dbApply).not.toHaveBeenCalled()
  const fresh = createPinia(); setActivePinia(fresh)
  const demo = useSession(); demo.write = vi.fn()
  const unknown = useSync(); await unknown.previewBackup(new File([], 'x.mmbak'))
  expect(unknown.error).toMatch(/scope|connect/i); expect(loadBackupHistory).not.toHaveBeenCalled()
})
it('accepts only the selected month and leaves the other month pending', async () => {
  const { session, store } = setup()
  vi.mocked(session.getHistory).mockImplementation(async p => [mv(p.startDate, p.startDate)])
  await store.read(['2026-10', '2026-11'])
  await store.accept('all', '2026-10')
  expect(vi.mocked(dbApply).mock.calls[0]![1]).toMatchObject({
    upserts: [canonical(mv('2026-10-01'))], counts: { added: 1, modified: 0, deleted: 0 },
    months: [{ month: '2026-10', readAt: expect.any(String), fingerprint: expect.any(String), rows: 1 }],
  })
  expect([...store.pending.keys()]).toEqual(['2026-11'])
})
it('allows offline backup acceptance under the remembered phone scope', async () => {
  const { session, store } = setup()
  session.source = 'demo'
  vi.mocked(loadBackupHistory).mockResolvedValue([mv('backup')])
  await store.previewBackup(new File([], 'backup.mmbak'))
  await store.accept('all')
  expect(vi.mocked(dbApply).mock.calls[0]).toEqual(['http://phone:8080|book', expect.objectContaining({ source: 'backup' })])
  expect(session.getHistory).not.toHaveBeenCalled()
})
it('automatically reads the recent three whole months after a successful connection', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 21))
  const session = useSession(); session.write = vi.fn(); session.getHistory = vi.fn(async () => [])
  const store = useSync()
  session.source = 'phone'; session.address = 'http://phone'; session.bookId = 'b'; session.status = 'ready'
  await nextTick(); await vi.waitFor(() => expect(store.progress.done).toBe(3))
  expect(vi.mocked(session.getHistory).mock.calls.map(c => c[0].startDate)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
  expect(dbApply).not.toHaveBeenCalled()
})

it('remembers the last phone scope across restarts so a backup can be previewed without the phone', async () => {
  const saved = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) } })
  setup()
  // A restart: new stores, the app opens on demo data before any phone connection.
  setActivePinia(createPinia())
  const session = useSession()
  session.write = vi.fn(async () => { throw new Error('Phone write forbidden') })
  const store = useSync()
  expect(store.scope).toBe('http://phone:8080|book')
  vi.mocked(loadBackupHistory).mockResolvedValue([mv('from-backup')])
  await store.previewBackup(new File([], 'phone.mmbak'))
  expect(store.error).toBeNull()
  expect(store.summary).toEqual([{ month: '2026-10', new: 1, modified: 0, deleted: 0 }])
  expect(dbApply).not.toHaveBeenCalled()
})

it('loads the database status and sync log for the scope without needing an acceptance first', async () => {
  vi.mocked(dbStatus).mockResolvedValue({ movements: 5385, months: [], lastSync: '2026-10-23T22:00:00Z' })
  vi.mocked(dbLog).mockResolvedValue([{ at: '2026-10-23T22:00:00Z', source: 'backup', added: 5385, modified: 0, deleted: 0, months: ['2026-10'] }])
  const { store } = setup()
  await store.refresh()
  expect(dbStatus).toHaveBeenCalledWith('http://phone:8080|book')
  expect(store.status?.movements).toBe(5385)
  expect(store.log).toHaveLength(1)
  expect(dbApply).not.toHaveBeenCalled()
})

it('refresh reports a database error instead of failing silently', async () => {
  vi.mocked(dbStatus).mockRejectedValue(new Error('database is locked'))
  const { store } = setup()
  await store.refresh()
  expect(store.status).toBeNull()
  expect(store.error).toBe('database is locked')
})

it('S6 probe: a backup with a wholly soft-deleted month removes its stored rows', async () => {
  const { store } = setup()
  vi.mocked(dbMovements).mockResolvedValue([canonical(mv('gone', '2026-09-01'))!])
  vi.mocked(loadBackupHistory).mockResolvedValue([mv('survivor', '2026-10-01')])
  await store.previewBackup(new File([], 'history.mmbak'))
  await store.accept('all')
  expect(vi.mocked(dbApply).mock.calls[0]![1].deletes).toEqual(['gone'])
})
it('S5 probe: phone wins cannot leave its opposite pending write queued', async () => {
  const { session, store } = setup(); const outbox = useOutbox()
  outbox.queue({ op: 'delete-transactions', ids: ['conflict'] }, 'Delete')
  vi.mocked(session.getHistory).mockResolvedValue([mv('conflict')])
  await store.read(['2026-10']); await store.accept(['conflict'])
  expect(outbox.pending).toHaveLength(0)
})
it('refuses a partial multi-id conflict, then discards only after successful apply', async () => {
  const { session, store } = setup(); const outbox = useOutbox()
  outbox.queue({ op: 'delete-transactions', ids: ['a', 'b'] }, 'Delete both')
  vi.mocked(session.getHistory).mockResolvedValue([mv('a'), mv('b')])
  await store.read(['2026-10'])
  const before = [...store.pending.entries()]
  await store.accept(['a'])
  expect(store.error).toBe('This pending change also affects other movements. Send or discard it in Pending changes first.')
  expect(dbApply).not.toHaveBeenCalled()
  expect([...store.pending.entries()]).toEqual(before)
  expect(outbox.items).toHaveLength(1)
  vi.mocked(dbApply).mockRejectedValueOnce(new Error('Disk full'))
  await store.accept(['a', 'b'])
  expect(outbox.items).toHaveLength(1)
  expect([...store.pending.entries()]).toEqual(before)
  await store.accept(['a', 'b'])
  expect(outbox.items).toEqual([])
  expect(store.pending.size).toBe(0)
})
it('empty backup clears previews without comparing or writing', async () => {
  const { session, store } = setup()
  vi.mocked(session.getHistory).mockResolvedValue([mv('previous')])
  await store.read(['2026-10'])
  vi.mocked(loadBackupHistory).mockResolvedValue([])
  await store.previewBackup(new File([], 'empty.mmbak'))
  expect(store.error).toBe('This backup has no movements; nothing was compared.')
  expect(store.pending.size).toBe(0)
  expect(store.previews.size).toBe(0)
  await store.accept('all')
  expect(dbApply).not.toHaveBeenCalled()
})
it('backup bound includes scheduled rows but never later local months', async () => {
  const { store } = setup()
  vi.mocked(dbMovements).mockResolvedValue([
    canonical(mv('within', '2027-01-01'))!, canonical(mv('later', '2027-03-01'))!,
  ])
  vi.mocked(loadBackupHistory).mockResolvedValue([mv('past'), { ...mv('scheduled', '2027-02-01'), isFuture: true }])
  await store.previewBackup(new File([], 'backup.mmbak'))
  expect([...store.pending.keys()]).toEqual(['2026-10', '2027-01', '2027-02'])
  await store.accept('all')
  expect(vi.mocked(dbApply).mock.calls[0]![1]).toMatchObject({ deletes: ['within'], counts: { added: 2, modified: 0, deleted: 1 } })
})
it('S8 probe: a scope switch during read discards that result without applying', async () => {
  const { session, store } = setup()
  let finish!: (rows: Movement[]) => void
  vi.mocked(session.getHistory).mockImplementationOnce(() => new Promise(r => { finish = r }))
  const task = store.read(['2026-10'])
  await vi.waitFor(() => expect(session.getHistory).toHaveBeenCalled())
  session.bookId = 'other'; finish([mv('stale')]); await task
  expect(store.pending.size).toBe(0); expect(dbApply).not.toHaveBeenCalled()
})
it('S1 probe: a scope switch during apply never retargets the batch', async () => {
  const { session, store } = setup()
  vi.mocked(session.getHistory).mockResolvedValue([mv('new')]); await store.read(['2026-10'])
  let finish!: (result: { applied: number }) => void
  vi.mocked(dbApply).mockImplementationOnce(() => new Promise(r => { finish = r }))
  const task = store.accept('all'); session.bookId = 'other'
  finish({ applied: 1 }); await task
  expect(dbApply).toHaveBeenCalledExactlyOnceWith('http://phone:8080|book', expect.anything())
  expect(store.pending.size).toBe(0); expect(store.status).toBeNull()
})

it('preserves an unconfirmed opposing change when the database fails, then removes it when the phone wins', async () => {
  const { session, store } = setup()
  const outbox = useOutbox()
  outbox.recordFailure({ op: 'delete-transactions', ids: ['x'] }, { kind: 'unconfirmed' }, 'Unknown delete')
  vi.mocked(session.getHistory).mockResolvedValue([mv('x')])
  await store.read(['2026-10'])
  const snapshot = () => JSON.stringify({ pending: [...store.pending], previews: [...store.previews], outbox: outbox.items })
  const before = snapshot()
  vi.mocked(dbApply).mockRejectedValueOnce(new Error('Disk full'))
  await store.accept(['x'])
  expect(store.error).toBe('Disk full')
  expect(snapshot()).toBe(before)
  await store.accept(['x'])
  expect(outbox.items).toEqual([])
  expect(store.pending.size).toBe(0)
})
