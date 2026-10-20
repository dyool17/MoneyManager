import { invoke } from '@tauri-apps/api/core'
import { mergeMovements, splitByMonth, todayIso } from '../domain/period'
import type { MoneyManagerClient, MovementQuery, Period } from '../domain/types'
import {
  parseAssets,
  parseAssetTrend,
  parseCards,
  parseDashboard,
  parseInitData,
  parseMovements,
  parseSummary,
} from './parse'
import initFixture from '../../../fixtures/moneymanager/init-data.json5?raw'
import summaryFixture from '../../../fixtures/moneymanager/summary.json5?raw'
import movementsFixture from '../../../fixtures/moneymanager/movements.xml?raw'
import dashboardFixture from '../../../fixtures/moneymanager/dashboard.json5?raw'
import assetsFixture from '../../../fixtures/moneymanager/assets.json5?raw'
import cardsFixture from '../../../fixtures/moneymanager/cards.json5?raw'
import trendFixture from '../../../fixtures/moneymanager/asset-trend.json5?raw'

/** Allowed read endpoints. Mirrors the Rust `Endpoint` enum. */
export type Endpoint =
  | 'getInitData'
  | 'getSummaryDataByPeriod'
  | 'getDataByPeriod'
  | 'getDashBoardData'
  | 'getAssetData'
  | 'getCardData'
  | 'getEachAssetChartData'

export interface ReadParams {
  startDate?: string
  endDate?: string
  mbid?: string
  assetId?: string
}

/** Fetches raw response text. Implementations can only read. */
export interface Transport {
  get(endpoint: Endpoint, params?: ReadParams): Promise<string>
}

export class TauriTransport implements Transport {
  constructor(private readonly baseUrl: string) {}

  get(endpoint: Endpoint, params: ReadParams = {}): Promise<string> {
    return invoke<string>('mm_read', { baseUrl: this.baseUrl, endpoint, params })
  }
}

export class FixtureTransport implements Transport {
  async get(endpoint: Endpoint): Promise<string> {
    switch (endpoint) {
      case 'getInitData':
        return initFixture
      case 'getSummaryDataByPeriod':
        return summaryFixture
      case 'getDataByPeriod':
        return movementsFixture
      case 'getDashBoardData':
        return dashboardFixture
      case 'getAssetData':
        return assetsFixture
      case 'getCardData':
        return cardsFixture
      case 'getEachAssetChartData':
        return trendFixture
    }
  }
}

export class PcManagerClient implements MoneyManagerClient {
  constructor(
    private readonly transport: Transport,
    private readonly today: () => string = todayIso,
  ) {}

  async getInitData() {
    return parseInitData(await this.transport.get('getInitData'))
  }

  async getSummary(query: Period & { mbid: string }) {
    return parseSummary(await this.transport.get('getSummaryDataByPeriod', query))
  }

  async getDashboard() {
    return parseDashboard(await this.transport.get('getDashBoardData'))
  }

  async getAssets() {
    return parseAssets(await this.transport.get('getAssetData'))
  }

  async getCards() {
    return parseCards(await this.transport.get('getCardData'))
  }

  async getAssetTrend(assetId: string) {
    return parseAssetTrend(await this.transport.get('getEachAssetChartData', { assetId }))
  }

  async getMovements(query: MovementQuery) {
    const today = this.today()
    const chunks = []
    // Sequential on purpose: the phone server is single-threaded and slow.
    for (const month of splitByMonth(query)) {
      const text = await this.transport.get('getDataByPeriod', {
        ...month,
        mbid: query.mbid,
        assetId: query.assetId ?? '',
      })
      chunks.push(
        parseMovements(text, today).filter(
          (m) => m.date >= month.startDate && m.date <= month.endDate,
        ),
      )
    }
    return mergeMovements(chunks)
  }
}
