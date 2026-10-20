export type MovementType =
  | 'income'
  | 'expense'
  | 'transfer-in'
  | 'transfer-out'
  | 'unknown'

export interface Movement {
  id: string
  date: string
  assetId: string
  toAssetId?: string
  accountName: string
  categoryId?: string
  categoryName?: string
  subcategoryId?: string
  subcategoryName?: string
  content?: string
  detail?: string
  amount: number
  type: MovementType
  /** Raw `inOutCode` kept so unmapped codes (2, 7, 8) stay visible. */
  rawCode: string
  isFuture: boolean
}

export interface Book {
  id: string
  name: string
}

export interface Subcategory {
  id: string
  name: string
}

export interface Category {
  id: string
  name: string
  subcategories: Subcategory[]
}

export interface Account {
  id: string
  name: string
}

export interface InitData {
  currentBook: Book
  books: Book[]
  defaultPeriod: Period
  incomeCategories: Category[]
  expenseCategories: Category[]
  accounts: Account[]
}

export interface Period {
  startDate: string
  endDate: string
}

export interface MovementQuery extends Period {
  mbid: string
  assetId?: string
}

export interface CategoryTotal {
  name: string
  total: number
  budget: number
}

export interface Summary {
  period: Period
  income: number
  expense: number
  cashExpense: number
  cardExpense: number
  net: number
  incomeByCategory: CategoryTotal[]
  expenseByCategory: CategoryTotal[]
  source: string
}

/** Phase 1 read-only contract. Phase 2 adds dashboard, assets, cards, trend. */
export interface MoneyManagerClient {
  getInitData(): Promise<InitData>
  getSummary(query: Period & { mbid: string }): Promise<Summary>
  getMovements(query: MovementQuery): Promise<Movement[]>
}

export class InvalidResponseError extends Error {
  constructor(source: string, reason: string) {
    super(`Invalid response from ${source}: ${reason}`)
    this.name = 'InvalidResponseError'
  }
}
