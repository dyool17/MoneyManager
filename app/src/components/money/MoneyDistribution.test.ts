import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { expect, it } from 'vitest'
import MoneyDistribution from './MoneyDistribution.vue'
import { useSession } from '../../stores/session'
import { useAccountMetadata } from '../../stores/metadata'
import { locale } from '../../i18n'

it('renders three disjoint groups, honest mixed-sign limbo and visible unresolved/zero accounts', async () => {
  locale.value = 'en'
  const pinia = createPinia(); setActivePinia(pinia)
  const session = useSession(), metadata = useAccountMetadata()
  session.assets = [{ id: 'g', name: 'Bank', balance: 0, items: [
    { id: 'p', name: 'Included asset', balance: 20 }, { id: 'd', name: 'Negative asset', balance: -10 },
    { id: 'lp', name: 'Off budget inflow', balance: 40 }, { id: 'ln', name: 'Off budget outflow', balance: -60 },
    { id: 'z', name: 'Empty wallet', balance: 0 }, { id: 'u', name: 'Unknown', balance: 3 },
  ] }]
  session.cards = [{ id: 'c', name: 'Cards', balance: 0, outstanding: 0, items: [{ id: 'cp', name: 'Positive card', balance: 0, outstanding: 5 }, { id: 'cn', name: 'Negative card', balance: 0, outstanding: -7 }] }]
  metadata.state = { version: 1, baseCurrency: 'USD', imported: null, overrides: Object.fromEntries(['p', 'd', 'lp', 'ln', 'z', 'cp', 'cn'].map(id => [id, { includeInTotals: !id.startsWith('l'), currency: 'USD', rate: 1 }])) }
  const html = await renderToString(createSSRApp(MoneyDistribution).use(pinia))
  expect(html).toContain('In favor')
  expect(html).toContain('Debts')
  expect(html).toContain('Limbo')
  expect(html).toContain('Net: -20.00 USD')
  for (const name of ['Included asset', 'Negative asset', 'Off budget inflow', 'Off budget outflow', 'Positive card', 'Negative card', 'Empty wallet', 'Unknown']) expect(html.split(name), name).toHaveLength(2)
  expect(html).toContain('Unresolved accounts')
  expect(html).toContain('Included zero balances')
})
