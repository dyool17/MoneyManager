import type { MoneyManagerClient, MovementQuery, Period } from '../domain/types'
import { fromCanonical } from '../domain/sync'
import { storedInit, storedSummary, storedToday } from '../domain/stored'
import { dbMovements, dbStatus } from './local-db'

/** Missing/unavailable desktop storage retains the browser/demo startup. */
export async function startupSource(scope: string | null): Promise<'stored' | 'demo'> {
  if (!scope || scope.lastIndexOf('|') <= 0 || scope.endsWith('|')) return 'demo'
  try { return (await dbStatus(scope)).movements > 0 ? 'stored' : 'demo' } catch { return 'demo' }
}

/** Read-only view of accepted local history. No phone transport or database writes. */
export class StoredClient implements MoneyManagerClient {
  constructor(readonly scope: string) {}
  async getStatus() { return dbStatus(this.scope) }
  async getInitData() { return storedInit(this.scope, await dbMovements(this.scope, '0000-01-01', '9999-12-31')) }
  async getSummary(query: Period & { mbid: string }) {
    return storedSummary(query, await dbMovements(this.scope, query.startDate, query.endDate))
  }
  async getMovements(query: MovementQuery) {
    const today = storedToday()
    return (await dbMovements(this.scope, query.startDate, query.endDate))
      .filter(row => !query.assetId || row.assetId === query.assetId)
      .map(row => fromCanonical(row, today))
  }
  async getDashboard() { return { netWorth: 0, assets: 0, debts: 0, history: [], assetShares: [], debtShares: [], source: 'Stored data' } }
  async getAssets() { return [] }
  async getCards() { return [] }
  async getAssetTrend(_assetId: string) { return [] }
}
