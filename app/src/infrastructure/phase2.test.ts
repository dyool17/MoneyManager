import { describe, expect, it } from 'vitest'
import { InvalidResponseError } from '../domain/types'
import { PcManagerClient, type Endpoint, type ReadParams, type Transport } from './client'
import { parseAssets, parseAssetTrend, parseCards, parseDashboard } from './parse'
import dashboardText from '../../../fixtures/moneymanager/dashboard.json5?raw'
import assetsText from '../../../fixtures/moneymanager/assets.json5?raw'
import cardsText from '../../../fixtures/moneymanager/cards.json5?raw'
import trendText from '../../../fixtures/moneymanager/asset-trend.json5?raw'

describe('parseDashboard', () => {
  it('reads net worth, history and shares', () => {
    const d = parseDashboard(dashboardText)
    expect(d).toMatchObject({ netWorth: 14400, assets: 15800, debts: -1400, source: 'getDashBoardData' })
    expect(d.history.map((p) => p.total)).toEqual([12000, 13219.5, 14400])
    expect(d.debtShares).toEqual([{ name: 'Credit Card', amount: -1400 }])
  })

  it('rejects a body without assetSummary', () => {
    expect(() => parseDashboard('{ assetLine: [] }')).toThrow(/assetSummary/)
  })
})

describe('parseAssets', () => {
  it('reads groups with their accounts', () => {
    const groups = parseAssets(assetsText)
    expect(groups.map((g) => [g.id, g.balance, g.items.map((i) => i.id)])).toEqual([
      ['cash-group', 2500, ['cash']],
      ['account-group', 13300, ['checking']],
    ])
  })

  it('rejects non-array bodies and items without id', () => {
    expect(() => parseAssets('{}')).toThrow(InvalidResponseError)
    expect(() => parseAssets("[{assetGroupId:'g',assetName:'G',assetMoney:'1',children:[{assetName:'x',assetMoney:'1'}]}]")).toThrow(/assetId/)
  })
})

describe('parseCards', () => {
  it('reads outstanding amount, linked account and billing days', () => {
    const [group] = parseCards(cardsText)
    expect(group.items[0]).toMatchObject({
      id: 'credit',
      balance: -0,
      outstanding: 1400,
      linkedAssetId: 'checking',
      closingDay: '1',
      paymentDay: '15',
    })
  })
})

describe('parseAssetTrend', () => {
  it('reads monthly balances', () => {
    expect(parseAssetTrend(trendText).map((p) => p.value)).toEqual([1900, 2300, 2500])
  })
})

describe('PcManagerClient.getAssetTrend', () => {
  it('sends only the asset id', async () => {
    const calls: [Endpoint, ReadParams | undefined][] = []
    const transport: Transport = {
      async get(endpoint, params) {
        calls.push([endpoint, params])
        return trendText
      },
    }
    await new PcManagerClient(transport).getAssetTrend('cash')
    expect(calls).toEqual([['getEachAssetChartData', { assetId: 'cash' }]])
  })
})
