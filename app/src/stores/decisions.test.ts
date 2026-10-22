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
