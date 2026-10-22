import { describe, expect, it } from 'vitest'
import { csvCell, movementsCsv } from './export'
import { setLocale } from '../i18n'
import type { Movement } from './types'

describe('csvCell', () => {
  it('quotes separators and quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(-200)).toBe('-200')
  })

  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1')).toBe(`"'+1"`)
    expect(csvCell('@SUM')).toBe(`"'@SUM"`)
  })
})

describe('movementsCsv', () => {
  it.each(['en', 'es'] as const)('writes a BOM, a localized header and one row per movement (%s)', (locale) => {
    setLocale(locale)
    const m: Movement = {
      id: 'x1', date: '2026-08-02', assetId: 'credit', accountName: 'Credit Card',
      categoryName: 'Variable', subcategoryName: 'Food', content: 'Groceries, weekly',
      amount: 120.5, type: 'expense', rawCode: '1', isFuture: false,
    }
    const csv = movementsCsv([m])
    expect(csv.split('\r\n')[0]).toBe(locale === 'en'
      ? '﻿Date,Type,Account,To account,Category,Subcategory,Note,Detail,Amount,Upcoming,Id'
      : '﻿Fecha,Tipo,Cuenta,Cuenta de destino,Categoría,Subcategoría,Nota,Detalle,Importe,Próximo,Id')
    expect(csv.split('\r\n')[1]).toBe(locale === 'en'
      ? '2026-08-02,Expense,Credit Card,,Variable,Food,"Groceries, weekly",,120.5,no,x1'
      : '2026-08-02,Gasto,Credit Card,,Variable,Food,"Groceries, weekly",,120.5,no,x1')
    setLocale('en')
  })
})
