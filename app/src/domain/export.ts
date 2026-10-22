import type { Movement } from './types'
import { t } from '../i18n'

const TYPE: Record<Movement['type'], string> = {
  income: 'Income',
  expense: 'Expense',
  'transfer-in': 'Transfer in',
  'transfer-out': 'Transfer out',
  unknown: 'Other',
}

/**
 * Quotes a CSV cell. Text starting with = + - @ is prefixed with ' so
 * spreadsheet apps never run it as a formula. Numbers are written as-is.
 */
export function csvCell(value: string | number | undefined): string {
  if (value === undefined) return ''
  if (typeof value === 'number') return String(value)
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r;]/.test(safe) || safe !== value ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Movements as CSV with a UTF-8 BOM so Excel opens accents correctly. */
export function movementsCsv(rows: Movement[]): string {
  const header = ['Date', 'Type', 'Account', 'To account', 'Category', 'Subcategory', 'Note', 'Detail', 'Amount', 'Upcoming', 'Id'].map((key) => t(key))
  const lines = rows.map((m) =>
    [
      m.date,
      t(TYPE[m.type]),
      m.accountName,
      m.toAssetId,
      m.categoryName,
      m.subcategoryName,
      m.content,
      m.detail,
      m.amount,
      m.isFuture ? t('yes') : t('no'),
      m.id,
    ]
      .map(csvCell)
      .join(','),
  )
  return '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n'
}
