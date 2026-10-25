import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { expect, it } from 'vitest'
import DistributionPie from './DistributionPie.vue'
import { locale } from '../../i18n'

it('renders signed labels and totals, with magnitude percentages and an accessible chart description', async () => {
  locale.value = 'en'
  const html = await renderToString(createSSRApp(DistributionPie, { title: 'Debts', currency: 'USD', rows: [{ id: 'a', name: 'Loan', amount: -30 }, { id: 'b', name: 'Card', amount: -10 }] }))
  expect(html).toContain('-40.00 USD')
  expect(html).toContain('-30.00 USD')
  expect(html).toContain('75%')
  expect(html).toContain('25%')
  expect(html).toContain('role="img"')
  expect(html).toContain('Percentages use the sum of magnitudes in this chart, not net worth.')
})

it('shows truthful empty/zero states without a donut', async () => {
  const html = await renderToString(createSSRApp(DistributionPie, { title: 'Empty', currency: 'USD', rows: [{ id: 'z', name: 'Zero', amount: 0 }] }))
  expect(html).toContain('No nonzero balances.')
  expect(html).toContain('Zero')
  expect(html).not.toContain('<svg')
  expect(html).not.toContain('NaN')
})
