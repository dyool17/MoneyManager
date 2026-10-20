import type { Share } from './types'

export interface AccountSettings { includeInTotals: boolean; currency: string; rate: number }
export interface MetadataSnapshot {
  baseCurrency: string
  importedAt: string
  accounts: Record<string, AccountSettings & { name: string }>
}
export interface MetadataState {
  version: 1
  baseCurrency: string
  imported: MetadataSnapshot | null
  overrides: Record<string, AccountSettings>
}
export interface BalanceRow { id: string; name: string; amount: number }

export const emptyMetadata = (): MetadataState => ({ version: 1, baseCurrency: '', imported: null, overrides: {} })
const code = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function validateSettings(v: unknown, base: string): asserts v is AccountSettings {
  if (!object(v) || typeof v.includeInTotals !== 'boolean' || !code(v.currency) ||
      typeof v.rate !== 'number' || !Number.isFinite(v.rate) || v.rate <= 0 ||
      (v.currency === base && v.rate !== 1)) throw new Error('Choose inclusion, currency and a positive exchange rate (base currency rate must be 1).')
}

export function validateState(v: unknown): MetadataState {
  if (!object(v) || v.version !== 1 || (v.baseCurrency !== '' && !code(v.baseCurrency)) || !object(v.overrides)) {
    throw new Error('Invalid saved account metadata.')
  }
  const base = v.baseCurrency as string
  if (v.imported !== null) {
    const s = v.imported
    if (!object(s) || !code(s.baseCurrency) || s.baseCurrency !== base || !object(s.accounts) ||
        typeof s.importedAt !== 'string' || !Number.isFinite(Date.parse(s.importedAt))) throw new Error('Invalid imported metadata.')
    for (const a of Object.values(s.accounts)) {
      validateSettings(a, base)
      if (typeof (a as unknown as Record<string, unknown>).name !== 'string') throw new Error('Invalid account name.')
    }
  }
  for (const a of Object.values(v.overrides)) validateSettings(a, base)
  if (!base && Object.keys(v.overrides).length) throw new Error('Choose a base currency first.')
  return v as unknown as MetadataState
}

export function resolveMetadata(state: MetadataState, id: string): AccountSettings | undefined {
  if (Object.prototype.hasOwnProperty.call(state.overrides, id)) return state.overrides[id]
  if (state.imported && Object.prototype.hasOwnProperty.call(state.imported.accounts, id)) return state.imported.accounts[id]
  return undefined
}

export function importMetadata(state: MetadataState, snapshot: MetadataSnapshot, liveIds: string[]): MetadataState {
  if (!liveIds.some(id => Object.prototype.hasOwnProperty.call(snapshot.accounts, id))) throw new Error('This backup does not match any loaded accounts.')
  if (state.baseCurrency && state.baseCurrency !== snapshot.baseCurrency) throw new Error('Backup base currency differs. Keep the same base currency for this phone.')
  return validateState({ ...state, baseCurrency: snapshot.baseCurrency, imported: snapshot })
}

/** Null removes only the local override, never imported metadata. */
export function overrideMetadata(state: MetadataState, id: string, settings: AccountSettings | null, base: string): MetadataState {
  if (!id || !code(base) || (state.baseCurrency && state.baseCurrency !== base)) throw new Error('Choose a consistent base currency.')
  const overrides = { ...state.overrides }
  if (settings === null) delete overrides[id]
  else {
    validateSettings(settings, base)
    Object.defineProperty(overrides, id, { value: { ...settings }, enumerable: true, configurable: true, writable: true })
  }
  return validateState({ ...state, baseCurrency: base, overrides })
}

/** Calculates current totals only when every live account has explicit metadata. */
export function calculateTotals(rows: BalanceRow[], state: MetadataState) {
  const missing = rows.filter(r => !resolveMetadata(state, r.id)).map(r => r.id)
  const assetShares: Share[] = [], debtShares: Share[] = []
  if (missing.length || !state.baseCurrency || !rows.length) return { missing, netWorth: null, assets: null, debts: null, assetShares, debtShares }
  let assets = 0, debts = 0
  for (const row of rows) {
    const m = resolveMetadata(state, row.id)!
    if (!m.includeInTotals) continue
    const amount = row.amount * m.rate
    if (!Number.isFinite(amount)) throw new Error('An account has an invalid converted balance.')
    if (amount >= 0) { assets += amount; assetShares.push({ name: row.name, amount }) }
    else { debts += amount; debtShares.push({ name: row.name, amount }) }
  }
  return { missing, netWorth: assets + debts, assets, debts, assetShares, debtShares }
}
