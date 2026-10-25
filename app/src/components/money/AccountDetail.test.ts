import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import AccountDetail from './AccountDetail.vue'
import { useSession } from '../../stores/session'
import { locale } from '../../i18n'

it.each([
  { balance: 50, label: 'Credit balance', style: 'income', amount: '50.00' },
  { balance: -50, label: 'To pay', style: 'expense', amount: '-50.00' },
  { balance: 0, label: 'Balance', style: '', amount: '0.00' },
])('renders signed card balance $balance with an honest label and style', async ({ balance, label, style, amount }) => {
  locale.value = 'en'
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useSession(), 'getAssetTrend').mockResolvedValue([])
  const html = await renderToString(createSSRApp(AccountDetail, { account: { id: 'card', name: 'Visa', kind: 'card', type: 'Credit card', balance, share: 100 } }).use(pinia))
  const detail = html.match(/<dl[^>]*>(.*?)<\/dl>/s)![1]!
  expect(detail).toContain(`>${label}</dt>`)
  const displayed = detail.match(/<dd class="([^"]*)"[^>]*>(.*?)<\/dd>/s)!
  expect(displayed[2]).toBe(amount)
  expect(displayed[1]!.trim()).toBe(`num ${style}`.trim())
  if (balance >= 0) expect(detail).not.toContain('To pay')
  vi.restoreAllMocks()
})

it('translates positive card credit balance into Spanish', async () => {
  locale.value = 'es'
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useSession(), 'getAssetTrend').mockResolvedValue([])
  const html = await renderToString(createSSRApp(AccountDetail, { account: { id: 'card', name: 'Visa', kind: 'card', type: 'Credit card', balance: 50, share: 100 } }).use(pinia))
  expect(html).toContain('Saldo a favor')
  vi.restoreAllMocks()
  locale.value = 'en'
})

it('renders the selected account and loading feedback before a delayed trend returns, retaining card details and actions', async () => {
  locale.value = 'en'
  const pinia = createPinia(); setActivePinia(pinia)
  const session = useSession()
  const read = vi.spyOn(session, 'getAssetTrend').mockReturnValue(new Promise(() => {}))
  const html = await renderToString(createSSRApp(AccountDetail, { account: { id: 'a', name: 'Selected Visa', kind: 'card', type: 'Credit card', balance: 50, share: 100, closingDay: '5', paymentDay: '20' } }).use(pinia))
  expect(read).toHaveBeenCalledWith('a')
  expect(html).toContain('Selected Visa')
  expect(html).toContain('50.00')
  expect(html).toContain('Loading…')
  expect(html).toContain('aria-busy="true" aria-live="polite"')
  expect(html).toContain('Statement closes')
  expect(html).toContain('Payment due')
  expect(html).toContain('See transactions')
  expect(html).toContain('Account settings')
  read.mockRestore()
})
