import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSession } from './session'
import type { WriteOp } from '../infrastructure/client'

const applyWrite = vi.hoisted(() => vi.fn())
vi.mock('../infrastructure/client', async () => {
  const actual = await vi.importActual<typeof import('../infrastructure/client')>('../infrastructure/client')
  return { ...actual, applyWrite }
})

const op: WriteOp = { op: 'delete-transactions', ids: ['a1'] }
const backup = (ageMinutes: number) => ({
  folder: '/tmp/backup', createdAt: new Date(Date.now() - ageMinutes * 60_000).toISOString(),
  source: 'http://192.168.1.2:8080', sqlite: { status: 'saved' as const, bytes: 10 },
  snapshot: [], snapshotErrors: [],
})

beforeEach(() => {
  applyWrite.mockReset()
  applyWrite.mockResolvedValue(undefined)
  setActivePinia(createPinia())
})

/** Connects a phone session and marks the backup state. */
function phoneSession(ageMinutes: number) {
  const session = useSession()
  session.source = 'phone'
  session.address = 'http://192.168.1.2:8080'
  session.backup = backup(ageMinutes)
  session.backupState = 'done'
  return session
}

describe('session write gate', () => {
  it('refuses to write in demo mode and never calls the phone', async () => {
    const session = useSession()
    session.source = 'demo'
    await expect(session.write(op)).rejects.toThrow(/Connect your phone/)
    expect(applyWrite).not.toHaveBeenCalled()
    expect(session.canWrite()).toBe(false)
  })

  it('allows a phone write with a fresh backup and forwards the exact operation', async () => {
    const session = phoneSession(29.9)
    expect(session.canWrite()).toBe(true)
    await session.write(op)
    expect(applyWrite).toHaveBeenCalledWith('http://192.168.1.2:8080', op)
  })

  it('refuses a stale backup and a missing backup', () => {
    expect(phoneSession(30.1).canWrite()).toBe(false)
    const session = useSession()
    session.source = 'phone'
    session.backupState = 'idle'
    expect(session.canWrite()).toBe(false)
    session.backupState = 'done'
    session.backup = null
    expect(session.canWrite()).toBe(false)
  })

  it('propagates a rejected write and does not report success', async () => {
    const session = phoneSession(1)
    applyWrite.mockRejectedValueOnce(new Error('The phone rejected the change: locked'))
    await expect(session.write(op)).rejects.toThrow(/rejected/)
  })
})
