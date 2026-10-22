import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSession } from './session'
import { useHistory } from './history'
import type { Movement } from '../domain/types'

const mv = (id: string, date: string): Movement => ({
  id, date, assetId: 'a', accountName: 'Cash', amount: 10, type: 'expense', rawCode: '1', isFuture: false,
})

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
  setActivePinia(createPinia())
})

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
    session.source = 'phone'
    await nextTick()
    finish([mv('stale', '2026-08-01')])
    await pending
    expect(history.state).toBe('idle')
    expect(history.movements).toEqual([])
  })
})
