import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { expect, it } from 'vitest'
import AccountsTable from './AccountsTable.vue'
import { locale } from '../../i18n'

it('keeps many accounts inside a keyboard-focusable region with accessible selected buttons and actions', async () => {
  locale.value = 'en'
  const rows = Array.from({ length: 80 }, (_, i) => ({ id: String(i), name: `Account ${i}`, kind: 'bank' as const, type: 'Bank', balance: i, share: 1 }))
  const html = await renderToString(createSSRApp(AccountsTable, { rows, selected: '4', canAdd: true }))
  expect(html).toContain('role="region" aria-label="Accounts" tabindex="0"')
  expect(html).toContain('aria-current="true"')
  expect(html).toContain('Account 79')
  expect(html).toContain('Add account')
  expect(html).toContain('Add card')
  expect(html).toContain('Filter accounts')
  expect(html).toContain('aria-pressed="true"')
})
