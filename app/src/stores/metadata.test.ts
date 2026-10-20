import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSession } from './session'
import { useAccountMetadata } from './metadata'
const settings = { includeInTotals: true, currency: 'GTQ', rate: 1 }
const snapshot = { baseCurrency: 'GTQ', importedAt: '2026-10-20T12:00:00Z', accounts: { a: { name: 'Account', ...settings } } }
let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) } })
  setActivePinia(createPinia())
})
function setup() {
  const session = useSession(); session.source = 'phone'; session.address = 'http://192.168.1.2:8080'
  session.assets = [{ id: 'g', name: 'Group', balance: 100, items: [{ id: 'a', name: 'Account', balance: 100 }] }]
  return { session, metadata: useAccountMetadata() }
}

describe('account metadata store', () => {
  it('persists normalized metadata per phone and keeps overrides on re-import', () => {
    const { session, metadata } = setup()
    metadata.acceptImport(snapshot)
    metadata.saveOverride('a', { ...settings, includeInTotals: false }, 'GTQ')
    metadata.acceptImport(snapshot)
    expect(metadata.totals.netWorth).toBe(0)
    expect(metadata.sourceOf('a')).toBe('Local override')
    setActivePinia(createPinia())
    const next = useSession(); next.source = 'phone'; next.address = session.address; next.assets = session.assets
    const loaded = useAccountMetadata()
    expect(loaded.totals.netWorth).toBe(0)
    next.address = 'http://192.168.1.3:8080'
    expect(loaded.totals.netWorth).toBeNull()
    expect(loaded.settingsFor('a')).toBeUndefined()
  })

  it('uses card outstanding, not unreliable card group totals; new accounts remain pending', () => {
    const { session, metadata } = setup()
    metadata.saveOverride('a', settings, 'GTQ')
    session.cards = [{ id: 'cg', name: 'Cards', balance: 0, outstanding: 0, items: [{ id: 'card', name: 'Card', balance: 0, outstanding: -25 }] }]
    expect(metadata.totals.missing).toEqual(['card'])
    metadata.saveOverride('card', settings, 'GTQ')
    expect(metadata.totals.netWorth).toBe(75)
    expect(metadata.totals.debts).toBe(-25)
    metadata.saveOverride('card', { ...settings, includeInTotals: false }, 'GTQ')
    expect(metadata.totals.netWorth).toBe(100)
  })

  it('rejects invalid imports and failed persistence without changing metadata or storage', () => {
    const { metadata } = setup(); metadata.acceptImport(snapshot)
    const before = JSON.stringify([...saved])
    expect(() => metadata.acceptImport({ ...snapshot, accounts: { other: snapshot.accounts.a } })).toThrow()
    expect(JSON.stringify([...saved])).toBe(before)
    localStorage.setItem = () => { throw new Error('Storage full') }
    expect(() => metadata.saveOverride('a', { ...settings, includeInTotals: false }, 'GTQ')).toThrow('Storage full')
    expect(metadata.totals.netWorth).toBe(100)
  })

  it('preserves unknown settings and warns when imported account names change', () => {
    const { session, metadata } = setup(); metadata.acceptImport(snapshot)
    session.assets = [{ ...session.assets[0]!, items: [{ id: 'a', name: 'Renamed', balance: 100 }] }]
    expect(metadata.changedAccounts).toEqual(['a'])
    metadata.saveOverride('a', settings, 'GTQ')
    expect(metadata.changedAccounts).toEqual([])
    metadata.saveOverride('a', null, 'GTQ')
    expect(metadata.changedAccounts).toEqual(['a'])
  })
})
