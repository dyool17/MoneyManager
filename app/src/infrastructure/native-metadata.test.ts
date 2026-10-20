import { beforeAll, describe, expect, it, vi } from 'vitest'
import tauriConfig from '../../src-tauri/tauri.conf.json'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { loadNativeMetadata, readNativeMetadata } from './native-metadata'
import { calculateTotals, emptyMetadata, importMetadata, overrideMetadata } from '../domain/metadata'
// Node uses a file path; production uses the bundled URL (also browser-smoke checked).
vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({ default: new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname }))
let SQL: SqlJsStatic
beforeAll(async () => { SQL = await initSqlJs() })

function backup(flag: string | null = '1', rate = 7.78) {
  const db = new SQL.Database()
  db.run(`CREATE TABLE CURRENCY(uid TEXT, ISO TEXT, RATE REAL, IS_MAIN_CURRENCY INTEGER, IS_DEL INTEGER);
    CREATE TABLE ASSETS(uid TEXT, NIC_NAME TEXT, ZDATA2 TEXT, currencyUid TEXT);
    CREATE TABLE INOUTCOME(secret TEXT);
    INSERT INTO INOUTCOME VALUES ('PRIVATE TRANSACTION NOT TO IMPORT');
    INSERT INTO CURRENCY VALUES ('gtq','GTQ',1,1,0);`)
  db.run('INSERT INTO CURRENCY VALUES (?,?,?,?,?)', ['usd', 'USD', rate, 0, 0])
  db.run('INSERT INTO ASSETS VALUES (?,?,?,?)', ['account-1', 'Receivable', flag, 'gtq'])
  db.run('INSERT INTO ASSETS VALUES (?,?,?,?)', ['account-2', 'Foreign account', '0', 'usd'])
  const bytes = db.export(); db.close(); return bytes
}

describe('native metadata import', () => {
  it('loads a selected File through the async import path and keeps IPC permissions narrow', async () => {
    const bytes = backup()
    const result = await loadNativeMetadata(new File([bytes.slice().buffer], 'synthetic.mmbak'))
    expect(result.accounts['account-1']?.includeInTotals).toBe(false)
    expect(result.accounts['account-2']?.rate).toBe(7.78)
    const csp = tauriConfig.app.security.csp as string
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("connect-src 'self' ipc: http://ipc.localhost")
  })

  it('reads only account flags and currencies, without modifying backup bytes', () => {
    const bytes = backup(), before = bytes.slice()
    const result = readNativeMetadata(bytes, SQL, '2026-10-20T12:00:00Z')
    expect(result).toEqual({ baseCurrency: 'GTQ', importedAt: '2026-10-20T12:00:00Z', accounts: {
      'account-1': { name: 'Receivable', includeInTotals: false, currency: 'GTQ', rate: 1 },
      'account-2': { name: 'Foreign account', includeInTotals: true, currency: 'USD', rate: 7.78 },
    } })
    expect(bytes).toEqual(before)
    expect(JSON.stringify(result)).not.toContain('PRIVATE TRANSACTION')
  })

  it('rejects invalid files, unsupported flags and exchange rates', () => {
    expect(() => readNativeMetadata(new Uint8Array(), SQL)).toThrow(/SQLite/)
    expect(() => readNativeMetadata(new TextEncoder().encode('not SQLite'), SQL)).toThrow(/SQLite/)
    for (const flag of ['2', '', null]) expect(() => readNativeMetadata(backup(flag), SQL)).toThrow()
    expect(() => readNativeMetadata(backup('0', 0), SQL)).toThrow()
    const db = new SQL.Database(); db.run('CREATE TABLE other(id)')
    const bytes = db.export(); db.close()
    expect(() => readNativeMetadata(bytes, SQL)).toThrow(/schema/)
  })

  it('rejects duplicate account IDs rather than silently replacing metadata', () => {
    const db = new SQL.Database(backup())
    db.run("INSERT INTO ASSETS VALUES ('account-1','Duplicate','0','gtq')")
    const bytes = db.export(); db.close()
    expect(() => readNativeMetadata(bytes, SQL)).toThrow(/Duplicate/)
  })

  it('rejects every invalid metadata case with its exact message and unchanged input', () => {
    // FNV-1a: input integrity without importing Node modules in a browser-targeted test.
    const digest = (bytes: Uint8Array) => {
      let hash = 0x811c9dc5
      for (const b of bytes) hash = (hash ^ b) * 0x01000193 >>> 0
      return hash
    }
    const settingsError = 'Choose inclusion, currency and a positive exchange rate (base currency rate must be 1).'
    const cases: [string, string][] = [
      ['DROP TABLE CURRENCY', 'Unsupported backup schema: ASSETS and CURRENCY tables required.'],
      ["UPDATE ASSETS SET ZDATA2='2'", 'Unsupported account metadata or inclusion flag.'],
      ["UPDATE CURRENCY SET RATE=-1 WHERE uid='usd'", settingsError],
      ["UPDATE CURRENCY SET RATE=2 WHERE uid='gtq'", settingsError],
      ['INSERT INTO ASSETS SELECT * FROM ASSETS LIMIT 1', 'Duplicate account ID in backup.'],
      ["INSERT INTO CURRENCY SELECT * FROM CURRENCY WHERE uid='usd'", 'Invalid or duplicate currency metadata.'],
      ["UPDATE ASSETS SET currencyUid='missing'", 'Account currency is missing from the backup.'],
      ['DELETE FROM ASSETS', 'Backup must contain between 1 and 10000 accounts.'],
      ['UPDATE CURRENCY SET IS_MAIN_CURRENCY=0', 'Backup must have one main currency.'],
      ['UPDATE CURRENCY SET IS_MAIN_CURRENCY=1', 'Backup must have one main currency.'],
    ]
    for (const [sql, message] of cases) {
      const db = new SQL.Database(backup()); db.run(sql)
      const bytes = db.export(); db.close()
      const before = digest(bytes)
      expect(() => readNativeMetadata(bytes, SQL)).toThrow(message)
      expect(digest(bytes)).toBe(before)
    }
  })

  it('imports into totals, keeps overrides across re-import and gates unknown accounts', () => {
    const snapshot = readNativeMetadata(backup(), SQL, '2026-10-20T12:00:00Z')
    let state = importMetadata(emptyMetadata(), snapshot, ['account-1', 'account-2'])
    const rows = [
      { id: 'account-1', name: 'Receivable', amount: 550 },
      { id: 'account-2', name: 'Foreign account', amount: 10 },
    ]
    expect(calculateTotals(rows, state).netWorth).toBe(77.8)
    state = overrideMetadata(state, 'account-2', { includeInTotals: false, currency: 'USD', rate: 7.78 }, 'GTQ')
    state = importMetadata(state, snapshot, ['account-2'])
    expect(calculateTotals(rows, state).netWorth).toBe(0)
    expect(calculateTotals([...rows, { id: 'new', name: 'New', amount: 1 }], state).netWorth).toBeNull()
    expect(Object.keys(snapshot).sort()).toEqual(['accounts', 'baseCurrency', 'importedAt'])
  })
})
