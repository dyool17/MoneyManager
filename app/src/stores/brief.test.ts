import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSession } from './session'
import { useBrief } from './brief'

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
  setActivePinia(createPinia())
})

describe('brief store', () => {
  it('forgets a brief written from another source when the session switches', async () => {
    const session = useSession()
    const brief = useBrief()
    brief.text = 'So far this month, you have spent Q0.'
    brief.state = 'ready'
    session.source = 'phone'
    await nextTick()
    expect(brief.text).toBeNull()
    expect(brief.state).toBe('idle')
  })
})
