import { beforeAll, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { loadNativeBudgets, readNativeBudgets } from './native-budgets'
// Node uses a file path; production uses the bundled URL.
vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({ default: new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname }))
let SQL: SqlJsStatic
beforeAll(async () => { SQL = await initSqlJs() })

function backup() {
  const db = new SQL.Database()
  db.run(`CREATE TABLE ZCATEGORY(uid TEXT, NAME TEXT, pUid TEXT, TYPE INTEGER, C_IS_DEL INTEGER);
    CREATE TABLE BUDGET(uid TEXT, targetUid TEXT, DO_TYPE INTEGER, PERIOD_TYPE INTEGER, IS_TOTAL INTEGER, IS_DEL INTEGER);
    CREATE TABLE BUDGET_AMOUNT(uid TEXT, budgetUid TEXT, IS_DEL INTEGER, AMOUNT REAL, BUDGET_PERIOD INTEGER, MODIFY_DATE INTEGER);
    CREATE TABLE INOUTCOME(secret TEXT);
    INSERT INTO INOUTCOME VALUES ('PRIVATE TRANSACTION NOT TO IMPORT');
    INSERT INTO ZCATEGORY VALUES ('var','Variable','0',1,NULL), ('gifts','Gifts','var',1,NULL), ('old','Gifts','var',1,1), ('trips','Trips','var',1,0);
    INSERT INTO BUDGET VALUES
      ('b-var','var',1,6,0,0), ('b-gifts','gifts',1,6,0,0), ('b-old','old',1,6,0,0),
      ('b-total','',1,6,1,0), ('b-trips','trips',1,6,0,1);
    INSERT INTO BUDGET_AMOUNT VALUES
      ('a1','b-var',0,1500,0,1), ('a2','b-gifts',0,100,0,1), ('a3','b-gifts',0,400,202512,1),
      ('a4','b-gifts',1,999,202511,1), ('a5','b-old',0,50,0,1), ('a6','b-total',0,9000,0,1), ('a7','b-trips',0,300,0,1);`)
  const bytes = db.export(); db.close(); return bytes
}

describe('native budget import', () => {
  it('reads monthly budgets per category with their month overrides', () => {
    const plan = readNativeBudgets(backup(), SQL, '2026-10-21T00:00:00.000Z')
    expect(plan).toEqual({
      importedAt: '2026-10-21T00:00:00.000Z',
      budgets: [
        { categoryId: 'gifts', name: 'Gifts', parent: 'Variable', amount: 100, overrides: { '2025-12': 400 } },
        { categoryId: 'var', name: 'Variable', parent: '', amount: 1500, overrides: {} },
      ],
    })
  })

  it('skips deleted budgets, amounts and categories, the overall total, and budgets that are all zero', () => {
    const db = new SQL.Database(backup())
    db.run("INSERT INTO ZCATEGORY VALUES ('fun','Fun','var',1,NULL); INSERT INTO BUDGET VALUES ('b-fun','fun',1,6,0,0); INSERT INTO BUDGET_AMOUNT VALUES ('a8','b-fun',0,0,0,1)")
    const ids = readNativeBudgets(db.export(), SQL).budgets.map((b) => b.categoryId)
    db.close()
    expect(ids).toEqual(['gifts', 'var'])
  })

  it('rejects files that are not unencrypted SQLite or lack the budget tables', () => {
    expect(() => readNativeBudgets(new TextEncoder().encode('not a backup'), SQL)).toThrow('unencrypted SQLite')
    const db = new SQL.Database(); db.run('CREATE TABLE ZCATEGORY(uid TEXT)')
    const bytes = db.export(); db.close()
    expect(() => readNativeBudgets(bytes, SQL)).toThrow('BUDGET')
  })

  it('loads a selected file through the async path', async () => {
    const plan = await loadNativeBudgets(new File([backup().slice().buffer], 'synthetic.mmbak'))
    expect(plan.budgets).toHaveLength(2)
  })
})
