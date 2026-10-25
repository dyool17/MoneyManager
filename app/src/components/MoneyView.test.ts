import { beforeEach, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import MoneyView from './MoneyView.vue'
import { useSession } from '../stores/session'
import { useLifeEvents } from '../stores/life-events'
import { locale } from '../i18n'

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  locale.value = 'en'
})

it('keeps dated milestones visible in Money with stored movements and no balance history', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSession()
  session.source = 'stored'
  session.storedScope = 'http://phone|book'
  useLifeEvents().state = { events: [{ id: 'move', label: 'Moving milestone', start: '2025-01-15', kind: 'one-off', categoryIds: ['home'] }] }
  const html = await renderToString(createSSRApp(MoneyView).use(pinia))
  expect(html).toContain('Moving milestone')
  expect(html).toContain('Historical balances unavailable.')
  expect(html).not.toContain('Account distribution')
  expect(html).not.toContain('Counts toward totals')
})
