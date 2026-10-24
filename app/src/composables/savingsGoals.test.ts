import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSavingsGoals } from './savingsGoals'
const goal = { target: 100, currency: 'USD', accountIds: ['a'] }
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  setActivePinia(createPinia())
})
it('shows unknown without loaded balances and for stored data, and labels retained offline balances', () => {
  const savings = useSavingsGoals()
  savings.metadata.state = { version: 1, baseCurrency: 'USD', imported: null, overrides: { a: { currency: 'USD', rate: 1, includeInTotals: true } } }
  savings.session.assets = [{ id: 'g', name: 'Accounts', balance: 50, items: [{ id: 'a', name: 'Savings', balance: 50 }] }]
  expect(savings.progress(goal)).toBeNull()
  savings.session.loadedAt = new Date()
  expect(savings.progress(goal)?.percent).toBe(50)
  savings.session.status = 'offline'
  expect(savings.progress(goal)?.amount).toBe(50)
  savings.session.source = 'stored'
  expect(savings.progress(goal)).toBeNull()
})
it('excludes credit cards even when present as positive asset rows', () => {
  const savings = useSavingsGoals()
  savings.session.loadedAt = new Date()
  savings.session.assets = [{ id: 'g', name: 'Accounts', balance: 50, items: [{ id: 'a', name: 'Card', balance: 50 }] }]
  savings.session.cards = [{ id: 'c', name: 'Cards', balance: 50, outstanding: 50, items: [{ id: 'a', name: 'Card', balance: 50, outstanding: 50 }] }]
  expect(savings.accounts.value).toEqual([])
  expect(savings.progress(goal)).toBeNull()
})
