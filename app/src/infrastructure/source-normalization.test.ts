import { beforeAll, it, expect } from 'vitest'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { readBackupHistory } from './backup-history'
import { parseMovements } from './parse'
import { canonical, diffMonth, type CanonicalMovement } from '../domain/sync'

let SQL: SqlJsStatic
beforeAll(async () => { SQL = await initSqlJs() })
it.each(['Motorbike', 'null'])('S6 source-to-source note %s', (note) => {
  const db = new SQL.Database()
  try {
    db.run(`CREATE TABLE ASSETS(uid TEXT,NIC_NAME TEXT); CREATE TABLE ZCATEGORY(uid TEXT,NAME TEXT,pUid TEXT);
      CREATE TABLE INOUTCOME(uid TEXT,WDATE TEXT,assetUid TEXT,toAssetUid TEXT,DO_TYPE TEXT,ZMONEY REAL,ZCONTENT TEXT,ZDATA TEXT,ctgUid TEXT,IS_DEL INTEGER);
      INSERT INTO ASSETS VALUES ('cash','Cash'); INSERT INTO ZCATEGORY VALUES ('c','Category','0');`)
    db.run('INSERT INTO INOUTCOME VALUES (?,?,?,?,?,?,?,?,?,?)', ['x', '2026-10-01', 'cash', null, '1', 12.34, note, '  ', 'c', 0])
    const local = readBackupHistory(db.export(), SQL, '2026-10-23').map(canonical)
      .filter((row): row is CanonicalMovement => row !== null)
    const remote = parseMovements(`<dataset><row><id>x</id><mbDate>2026-10-01</mbDate><assetId>cash</assetId><inOutCode>1</inOutCode><mcid>c</mcid><mbCash>12.34</mbCash><mbContent><![CDATA[${note === 'Motorbike' ? 'Motorbike ((5/18))' : note}]]></mbContent><mbDetailContent> </mbDetailContent></row></dataset>`, '2026-10-23').map(canonical)
      .filter((row): row is CanonicalMovement => row !== null)
    expect(diffMonth('2026-10', local, remote)).toEqual([])
  } finally {
    db.close()
  }
})
