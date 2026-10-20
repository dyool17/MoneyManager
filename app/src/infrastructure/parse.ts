import JSON5 from 'json5'
import { XMLParser } from 'fast-xml-parser'
import {
  InvalidResponseError,
  type Category,
  type InitData,
  type Movement,
  type MovementType,
  type Summary,
} from '../domain/types'

type Raw = Record<string, unknown>

/** Parses the PC Manager's non-strict JS object literals. Never evaluates them. */
export function parseLooseObject(text: string, source: string): unknown {
  try {
    return JSON5.parse(text)
  } catch (e) {
    throw new InvalidResponseError(source, (e as Error).message)
  }
}

function asObject(value: unknown, source: string, field: string): Raw {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidResponseError(source, `${field} is not an object`)
  }
  return value as Raw
}

function asArray(value: unknown, source: string, field: string): Raw[] {
  if (!Array.isArray(value)) throw new InvalidResponseError(source, `${field} is not an array`)
  return value as Raw[]
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s === '' || s === 'null' ? undefined : s
}

function num(value: unknown, source: string, field: string): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (value === '' || value === null || value === undefined || Number.isNaN(n)) {
    throw new InvalidResponseError(source, `${field} is not a number`)
  }
  return n
}

function categories(raw: unknown, source: string, field: string): Category[] {
  return asArray(raw ?? [], source, field).map((c) => ({
    id: String(c.mcid),
    name: String(c.mcname),
    subcategories: asArray(c.mcsc ?? [], source, `${field}.mcsc`).map((s) => ({
      id: String(s.mcscid),
      name: String(s.mcscname),
    })),
  }))
}

export function parseInitData(text: string): InitData {
  const source = 'getInitData'
  const root = asObject(parseLooseObject(text, source), source, 'root')
  const init = asObject(root.initData, source, 'initData')
  return {
    currentBook: { id: String(init.mbid), name: String(init.mbName) },
    books: asArray(root.multiBooks ?? [], source, 'multiBooks').map((b) => ({
      id: String(b.mbid),
      name: String(b.mbname),
    })),
    defaultPeriod: {
      startDate: String(init.initStartDate),
      endDate: String(init.initEndDate),
    },
    incomeCategories: categories(root.category_0, source, 'category_0'),
    expenseCategories: categories(root.category_1, source, 'category_1'),
    accounts: asArray(root.assetNames ?? [], source, 'assetNames').map((a) => ({
      id: String(a.assetId),
      name: String(a.assetName),
    })),
  }
}

export function parseSummary(text: string): Summary {
  const source = 'getSummaryDataByPeriod'
  const root = asObject(parseLooseObject(text, source), source, 'root')
  const s = asObject(root.summary, source, 'summary')
  const totals = (field: string) =>
    asArray(root[field], source, field).map((c) => ({
      name: String(c.mcname),
      total: num(c.mcSum, source, `${field}.mcSum`),
      budget: num(c.budget ?? 0, source, `${field}.budget`),
    }))
  return {
    period: { startDate: String(s.startDate), endDate: String(s.endDate) },
    income: num(s.income, source, 'summary.income'),
    expense: num(s.outcome, source, 'summary.outcome'),
    cashExpense: num(s.cash, source, 'summary.cash'),
    cardExpense: num(s.card, source, 'summary.card'),
    net: num(s.sum, source, 'summary.sum'),
    incomeByCategory: totals('income'),
    expenseByCategory: totals('outcome'),
    source,
  }
}

const TYPES: Record<string, MovementType> = {
  '0': 'income',
  '1': 'expense',
  '3': 'transfer-out',
  '4': 'transfer-in',
}

const xml = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  isArray: (name) => name === 'row',
})

export function parseMovements(text: string, today: string): Movement[] {
  const source = 'getDataByPeriod'
  let doc: Raw
  try {
    doc = xml.parse(text, true) as Raw
  } catch (e) {
    throw new InvalidResponseError(source, (e as Error).message)
  }
  const dataset = doc.dataset
  if (dataset === undefined) throw new InvalidResponseError(source, 'missing <dataset>')
  if (dataset === '') return []
  const rows = (asObject(dataset, source, 'dataset').row as Raw[] | undefined) ?? []
  return rows.map((r) => {
    const id = str(r.id)
    const date = str(r.mbDate)
    const assetId = str(r.assetId)
    const rawCode = str(r.inOutCode)
    if (!id || !date || !assetId || !rawCode) {
      throw new InvalidResponseError(source, 'row missing id, mbDate, assetId or inOutCode')
    }
    return {
      id,
      date,
      assetId,
      toAssetId: str(r.toAssetId),
      accountName: str(r.payType) ?? assetId,
      categoryId: str(r.mcid),
      categoryName: str(r.mbCategory),
      subcategoryId: str(r.mcscid),
      subcategoryName: str(r.subCategory),
      content: str(r.mbContent),
      detail: str(r.mbDetailContent),
      amount: num(r.mbCash, source, 'mbCash'),
      type: TYPES[rawCode] ?? 'unknown',
      rawCode,
      isFuture: date > today,
    }
  })
}
