import { expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import NetWorthTimeline from './NetWorthTimeline.vue'
import NetWorthHero from './NetWorthHero.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSession } from '../../stores/session'
import { locale } from '../../i18n'

const history = [1, 2, 3].map(n => ({ month: `2026-0${n}`, total: n * 100, assets: n * 100, debts: 0 }))
const event = { id: 'e', label: 'Moving <home>', start: '2026-02-10', end: '2026-03-15', kind: 'temporary' as const, categoryIds: ['home'] }
const render = (events = [event], points = history) => renderToString(createSSRApp(NetWorthTimeline, { history: points, events, movements: [], today: '2026-03-31' }))

it('renders monthly balances and selectable, escaped milestone tracks on the combined chart', async () => {
  locale.value = 'en'
  const html = await render()
  expect(html).toContain('Net worth and milestone timeline')
  expect(html).toContain('Moving &lt;home&gt;')
  expect(html).toContain('aria-pressed="false"')
  expect(html).toContain('2026-01')
  expect(html).toContain('300.00')
  expect(html).toContain('Correlation does not prove causation')
})

it('keeps the balance chart with no milestones and excludes milestones outside the range', async () => {
  locale.value = 'en'
  expect(await render([])).toContain('No milestones in this history range.')
  const html = await render([event], history.slice(0, 1))
  expect(html).not.toContain('Moving &lt;home&gt;')
  expect(html).toContain('100.00')
})

it('preserves the history empty state only when no monthly balances exist', async () => {
  locale.value = 'en'
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSession()
  session.dashboard = { netWorth: 300, assets: 300, debts: 0, history, assetShares: [], debtShares: [], source: 'Test' }
  const renderHero = () => renderToString(createSSRApp(NetWorthHero).use(pinia))
  expect(await renderHero()).not.toContain('No history yet.')
  session.dashboard = { ...session.dashboard, history: [] }
  expect(await renderHero()).toContain('No history yet.')
})

it('localizes the combined view in Spanish', async () => {
  locale.value = 'es'
  const html = await render()
  expect(html).toContain('Patrimonio neto y cronología de hitos')
  expect(html).toContain('Selecciona un hito')
  locale.value = 'en'
})
