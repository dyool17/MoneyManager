import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOutbox } from './outbox'
import type { WriteOp } from '../infrastructure/client'

const applyWrite = vi.hoisted(() => vi.fn())
vi.mock('../infrastructure/client', async () => {
  const actual = await vi.importActual<typeof import('../infrastructure/client')>('../infrastructure/client')
  return { ...actual, applyWrite }
})

const op: WriteOp = { op: 'delete-transactions', ids: ['a1'] }
const offline = Object.assign(new Error('PC Manager is not reachable.'), {
  kind: 'offline',
  message: 'PC Manager is not reachable.',
})
const unconfirmed = Object.assign(new Error('The phone did not confirm the change.'), {
  kind: 'unconfirmed',
  message: 'The phone did not confirm the change.',
})

let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v) },
    removeItem: (k: string) => { storage.delete(k) },
  })
  applyWrite.mockReset()
  setActivePinia(createPinia())
})

describe('outbox', () => {
  it('queues a change that never left the computer and keeps it pending', () => {
    const outbox = useOutbox()
    outbox.queue(op, 'Delete 1 transaction')
    expect(outbox.pending).toHaveLength(1)
    expect(outbox.pending[0]).toMatchObject({ op, label: 'Delete 1 transaction', status: 'pending' })
    expect(outbox.canSend).toBe(true)
  })

  it('never queues a change whose outcome is unknown, and flags it for review', () => {
    const outbox = useOutbox()
    outbox.recordFailure(op, unconfirmed)
    expect(outbox.pending).toHaveLength(0)
    expect(outbox.unconfirmed).toHaveLength(1)
    expect(outbox.unconfirmed[0]?.status).toBe('unconfirmed')
  })

  it('does not queue a change the phone refused', () => {
    const outbox = useOutbox()
    outbox.recordFailure(op, Object.assign(new Error('rejected'), { kind: 'rejected' }))
    expect(outbox.pending).toHaveLength(0)
    expect(outbox.unconfirmed).toHaveLength(0)
  })

  it('sends queued changes in order and keeps the ones that fail', async () => {
    const outbox = useOutbox()
    outbox.queue(op, 'Delete 1 transaction')
    outbox.queue({ op: 'delete-transactions', ids: ['a2'] }, 'Delete another')
    applyWrite.mockResolvedValueOnce(undefined).mockRejectedValueOnce(offline)
    const result = await outbox.sendAll('http://192.168.1.2:8080')
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    expect(outbox.pending).toHaveLength(1)
    expect(outbox.pending[0]?.op).toEqual({ op: 'delete-transactions', ids: ['a2'] })
  })

  it('keeps an unknown outcome out of the queue when a send is not confirmed', async () => {
    const outbox = useOutbox()
    outbox.queue(op, 'Delete 1 transaction')
    applyWrite.mockRejectedValueOnce(unconfirmed)
    const result = await outbox.sendAll('http://192.168.1.2:8080')
    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
    // It must not stay in the queue: the phone may already have applied it.
    expect(outbox.pending).toHaveLength(0)
    expect(outbox.unconfirmed).toHaveLength(1)
  })

  it('persists between sessions and can clear a reviewed change', () => {
    const outbox = useOutbox()
    outbox.queue(op, 'Delete 1 transaction')
    setActivePinia(createPinia())
    const next = useOutbox()
    expect(next.pending).toHaveLength(1)
    next.discard(next.pending[0]!.id)
    expect(next.pending).toHaveLength(0)
    expect(next.unconfirmed).toHaveLength(0)
  })
})
