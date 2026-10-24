import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSession } from './session'
import { useAccountMetadata } from './metadata'
import { useLifeEvents } from './life-events'

let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) } })
  setActivePinia(createPinia())
})

function setup() {
  const session = useSession(); session.source = 'phone'; session.address = 'http://192.168.1.2:8080'
  return { session, metadata: useAccountMetadata(), events: useLifeEvents() }
}

const draft = { label: 'Moving', start: '2026-03-01', end: '2026-03-31', categoryIds: ['gifts'], kind: 'one-off' as const }

describe('life events store', () => {
  it('persists events per phone scope and reloads them', () => {
    const { session, events } = setup()
    const added = events.add(draft)
    expect(added.id).toBeTruthy()
    events.add({ ...draft, id: added.id, label: 'Moved out' })
    expect(events.state.events).toHaveLength(1)
    expect(saved.get(`mm.life-events.v1.${new URL(session.address).origin}`)).toBeTruthy()
    setActivePinia(createPinia())
    const next = useSession(); next.source = 'phone'; next.address = session.address
    const loaded = useLifeEvents()
    expect(loaded.state.events[0]?.label).toBe('Moved out')
    next.address = 'http://192.168.1.9:8080'
    expect(loaded.state.events).toEqual([])
  })

  it('removes an event and rejects failed persistence without changes', () => {
    const { events } = setup()
    const a = events.add(draft)
    localStorage.setItem = () => { throw new Error('Storage full') }
    expect(() => events.remove(a.id)).toThrow('Storage full')
    expect(events.state.events).toHaveLength(1)
    localStorage.setItem = saved.size ? ((k: string, v: string) => { saved.set(k, v) }) : vi.fn()
    events.remove(a.id)
    expect(events.state.events).toEqual([])
  })

  it('validates and deduplicates goal updates atomically while preserving legacy events', () => {
    const { events } = setup()
    events.add({ ...draft, id: 'legacy' })
    const goal = { target: 100, currency: 'USD', accountIds: ['a', 'a'] }
    events.add({ ...draft, id: 'goal', categoryIds: [], savingsGoal: goal })
    expect(events.state.events.find(e => e.id === 'goal')?.savingsGoal?.accountIds).toEqual(['a'])
    const before = JSON.stringify(events.state)
    const disk = [...saved]
    expect(() => events.add({ ...draft, id: 'goal', savingsGoal: { ...goal, target: 0 } })).toThrow('Invalid saved life events.')
    expect(JSON.stringify(events.state)).toBe(before)
    expect([...saved]).toEqual(disk)
    localStorage.setItem = () => { throw new Error('Storage full') }
    expect(() => events.add({ ...draft, id: 'goal', savingsGoal: goal })).toThrow('Storage full')
    expect(JSON.stringify(events.state)).toBe(before)
    expect([...saved]).toEqual(disk)
  })

  it('rejects corrupt saved state with the shared validation error', () => {
    const { metadata } = setup()
    saved.set(`mm.life-events.v1.${metadata.scope}`, '{"events":[{"id":"","start":"bad"}]}')
    setActivePinia(createPinia())
    const session = useSession(); session.source = 'phone'; session.address = 'http://192.168.1.2:8080'
    const loaded = useLifeEvents()
    expect(loaded.storageError).toBe('Invalid saved life events.')
    expect(loaded.state.events).toEqual([])
  })
})
