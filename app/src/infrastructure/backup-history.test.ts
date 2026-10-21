import { beforeAll, describe, expect, it } from 'vitest'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { readBackupHistory } from './backup-history'

let SQL: SqlJsStatic
beforeAll(async () => { SQL = await initSqlJs() })

function backup() {
  const db = new SQL.Database()
  db.run(`CREATE TABLE ASSETS(uid TEXT PRIMARY KEY, NIC_NAME TEXT);
    CREATE TABLE ZCATEGORY(uid TEXT PRIMARY KEY, NAME TEXT, pUid TEXT);
    CREATE TABLE INOUTCOME(uid TEXT PRIMARY KEY, WDATE TEXT, assetUid TEXT, toAssetUid TEXT,
      DO_TYPE TEXT, ZMONEY REAL, ZCONTENT TEXT, ZDATA TEXT, ctgUid TEXT, IS_DEL INTEGER);
    INSERT INTO ASSETS VALUES ('cash','Cash');
    INSERT INTO ZCATEGORY VALUES ('var','Variable','0'), ('gifts','Gifts','var');
    INSERT INTO INOUTCOME VALUES
      ('m1','2026-03-04','cash',NULL,'1',25,'Birthday gift',NULL,'gifts',0),
      ('m2','2026-03-05','cash',NULL,'1',80,'Groceries',NULL,'var',0),
      ('m3','2026-03-06','cash',NULL,'1',20,'Deleted',NULL,'gifts',1),
      ('m4','2026-03-07','cash',NULL,'1',30,'No category',NULL,NULL,0);`)
  const bytes = db.export(); db.close(); return bytes
}

describe('backup history subcategories', () => {
  it('keeps the top-level categoryId and adds the movement subcategoryId', () => {
    const rows = readBackupHistory(backup(), SQL, '2026-03-08')
    expect(rows.map((m) => [m.id, m.categoryId, m.subcategoryId, m.subcategoryName])).toEqual([
      ['m1', 'var', 'gifts', 'Gifts'],
      ['m2', 'var', 'var', undefined],
      ['m4', undefined, undefined, undefined],
    ])
  })
})
