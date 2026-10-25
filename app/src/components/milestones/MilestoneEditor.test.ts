import { expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia } from 'pinia'
import MilestoneEditor from './MilestoneEditor.vue'
import { locale } from '../../i18n'
import type { LifeEvent } from '../../domain/life-events'

const render = (event: LifeEvent | null) => renderToString(createSSRApp(MilestoneEditor, { event }).use(createPinia()))
it('groups savings controls with an adjacent intrinsic checkbox and deadline label', async () => {
  locale.value = 'en'
  const html = await render({ id: 'g', label: 'Imported goal', start: '2027-01-01', kind: 'one-off', categoryIds: ['legacy'], savingsGoal: { target: 100, currency: 'USD', accountIds: ['missing-account'] } })
  expect(html).toContain('class="check-row goal-toggle"')
  expect(html).toContain('Goal deadline')
  expect(html).toContain('Linked accounts')
  expect(html).toContain('missing-account')
  expect(html).toContain('legacy')
  expect(html).toContain('value="100"')
  expect(html).toContain('value="2027-01-01"')
})
it('preserves ordinary category editing and date controls', async () => {
  locale.value = 'en'
  const html = await render({ id: 'e', label: 'Ordinary', start: '2026-01-01', kind: 'temporary', categoryIds: ['home'] })
  expect(html).toContain('Start')
  expect(html).toContain('End (blank = still open)')
  expect(html).toContain('home')
  expect(html).toContain('Category involvement')
  expect(html).toContain('Save event')
  expect(html).not.toContain('Goal deadline')
})
