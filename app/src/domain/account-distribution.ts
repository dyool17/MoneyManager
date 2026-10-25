import { resolveMetadata, validateSettings, type BalanceRow, type MetadataState } from './metadata'

/** Converted signed balances; zero included accounts are listed explicitly, never fabricated slices. */
export function distributeAccounts(rows: BalanceRow[], state: MetadataState) {
  const positive: BalanceRow[] = [], negative: BalanceRow[] = [], limbo: BalanceRow[] = [], zero: BalanceRow[] = [], unresolved: BalanceRow[] = []
  const counts = new Map<string, number>()
  rows.forEach(row => counts.set(row.id, (counts.get(row.id) ?? 0) + 1))
  for (const row of rows) {
    const settings = resolveMetadata(state, row.id)
    try {
      if (!/^[A-Z]{3}$/.test(state.baseCurrency) || !settings || counts.get(row.id)! > 1 || !Number.isFinite(row.amount)) throw new Error('unresolved')
      validateSettings(settings, state.baseCurrency)
      const amount = row.amount * settings.rate
      if (!Number.isFinite(amount)) throw new Error('unresolved')
      const target = !settings.includeInTotals ? limbo : amount > 0 ? positive : amount < 0 ? negative : zero
      target.push({ ...row, amount })
    } catch { unresolved.push(row) }
  }
  return { positive, negative, limbo, zero, unresolved, limboNet: limbo.reduce((sum, row) => sum + row.amount, 0) }
}
