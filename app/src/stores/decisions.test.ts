import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSession } from './session'
import { useAccountMetadata } from './metadata'
import { useDecisions } from './decisions'

let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) } })
  setActivePinia(createPinia())
})

function setup() {
  const session = useSession(); session.source = 'phone'; session.address = 'http://192.168.1.2:8080'
  return { session, metadata: useAccountMetadata(), decisions: useDecisions() }
}

describe('dismissed decisions store', () => {
  it('persists snapshots, suppresses pending flags, reloads and undoes confirmations', () => {
    const { decisions, session } = setup()
    const snapshot = { id: 'm', date: '2026-01-01', amount: 12, categoryId: 'c', categoryName: 'Food', note: 'Lunch' }
    decisions.confirm(snapshot)
    decisions.confirm(snapshot)
    expect(decisions.confirmed).toEqual([snapshot])
    expect(decisions.isConfirmed('m')).toBe(true)
    expect(decisions.isDismissed('m')).toBe(true)
    setActivePinia(createPinia())
    const next = useSession(); next.source = 'phone'; next.address = session.address
    const loaded = useDecisions()
    expect(loaded.confirmed).toEqual([snapshot])
    loaded.unconfirm('m')
    expect(loaded.isConfirmed('m')).toBe(false)
    expect(loaded.isDismissed('m')).toBe(false)
    expect(JSON.parse(saved.get(loaded.key)!)).toEqual({ dismissed: [], confirmed: [] })
    loaded.confirm(snapshot)
    next.address = 'http://192.168.1.9:8080'
    expect(loaded.confirmed).toEqual([])
  })

  it('loads legacy dismissals and leaves both state and storage unchanged on invalid input or persistence failure', () => {
    const { decisions } = setup()
    decisions.dismiss('old')
    const before = saved.get(decisions.key)
    const snapshot = { id: 'm', date: '2026-01-01', amount: 12, categoryName: 'Food' }
    for (const over of [{ id: '' }, { date: 'bad' }, { amount: Infinity }, { amount: 0 }, { categoryName: 1 }, { note: 1 }, { categoryId: 1 }]) {
      expect(() => decisions.confirm({ ...snapshot, ...over } as never)).toThrow()
      expect(decisions.confirmed).toEqual([])
      expect(saved.get(decisions.key)).toBe(before)
    }
    vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: () => { throw new Error('full') } })
    expect(() => decisions.confirm(snapshot)).toThrow('full')
    expect(() => decisions.dismiss('new')).toThrow('full')
    expect(decisions.dismissed).toEqual(['old'])
    expect(decisions.confirmed).toEqual([])
    expect(saved.get(decisions.key)).toBe(before)
    setActivePinia(createPinia())
    const session = useSession(); session.source = 'phone'; session.address = 'http://192.168.1.2:8080'
    expect(useDecisions().confirmed).toEqual([])
    expect(useDecisions().isDismissed('old')).toBe(true)
  })

  it('keeps a confirmation intact when undo cannot persist', () => {
    const { decisions } = setup()
    const snapshot = { id: 'm', date: '2026-01-01', amount: 12, categoryName: 'Food' }
    decisions.confirm(snapshot)
    const before = saved.get(decisions.key)
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('full') } })
    expect(() => decisions.unconfirm('m')).toThrow('full')
    expect(decisions.confirmed).toEqual([snapshot])
    expect(decisions.isConfirmed('m')).toBe(true)
    expect(saved.get(decisions.key)).toBe(before)
  })

  it('rejects corrupt saved confirmations without loading partial state', () => {
    const { decisions } = setup()
    saved.set(decisions.key, JSON.stringify({ dismissed: ['old'], confirmed: [{ id: 'm' }] }))
    setActivePinia(createPinia())
    const session = useSession(); session.source = 'phone'; session.address = 'http://192.168.1.2:8080'
    const loaded = useDecisions()
    expect(loaded.storageError).toBe('Invalid saved dismissals.')
    expect(loaded.dismissed).toEqual([])
    expect(loaded.confirmed).toEqual([])
  })

  it('persists dismissals per phone scope and hides them after reload', () => {
    const { session, decisions } = setup()
    decisions.dismiss('m1')
    decisions.dismiss('m1') // twice is still one entry
    expect(decisions.dismissed).toEqual(['m1'])
    setActivePinia(createPinia())
    const next = useSession(); next.source = 'phone'; next.address = session.address
    const loaded = useDecisions()
    expect(loaded.isDismissed('m1')).toBe(true)
    next.address = 'http://192.168.1.9:8080'
    expect(loaded.dismissed).toEqual([])
  })

  it('rejects corrupt saved state with the shared validation error', () => {
    const { metadata } = setup()
    saved.set(`mm.bad-decisions.v1.${metadata.scope}`, '{"dismissed":[1]}')
    setActivePinia(createPinia())
    const session = useSession(); session.source = 'phone'; session.address = 'http://192.168.1.2:8080'
    const loaded = useDecisions()
    expect(loaded.storageError).toBe('Invalid saved dismissals.')
    expect(loaded.dismissed).toEqual([])
  })
})
