import type { SqlJsStatic } from 'sql.js'
import type { Movement, MovementType } from '../domain/types'
import { MAX_BACKUP_BYTES } from './native-metadata'

const TYPES: Record<string, MovementType> = { '0': 'income', '1': 'expense', '3': 'transfer-out', '4': 'transfer-in' }

/** Reads transactions from a backup in WASM memory for offline reports. Nothing is stored or sent. */
export function readBackupHistory(bytes: Uint8Array, SQL: SqlJsStatic, today: string): Movement[] {
  const db = new SQL.Database(bytes)
  try {
    db.run('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF')
    const rows = db.exec(`SELECT t.uid, t.WDATE, t.assetUid, t.toAssetUid, a.NIC_NAME, t.DO_TYPE, t.ZMONEY, t.ZCONTENT, t.ZDATA,
        COALESCE(p.uid, c.uid), COALESCE(p.NAME, c.NAME), CASE WHEN p.uid IS NULL THEN NULL ELSE c.NAME END, t.ctgUid
      FROM INOUTCOME t
      LEFT JOIN ASSETS a ON a.uid = t.assetUid
      LEFT JOIN ZCATEGORY c ON c.uid = t.ctgUid
      LEFT JOIN ZCATEGORY p ON p.uid = c.pUid AND c.pUid <> '0'
      WHERE t.IS_DEL = 0`)[0]?.values ?? []
    return rows.map(([id, date, assetId, toAssetId, account, code, money, content, detail, categoryId, categoryName, subcategoryName, subcategoryId]) => {
      const d = String(date)
      return {
        id: String(id), date: d, assetId: String(assetId ?? ''), toAssetId: toAssetId ? String(toAssetId) : undefined,
        accountName: String(account ?? ''), categoryId: categoryId ? String(categoryId) : undefined,
        categoryName: categoryName ? String(categoryName) : undefined, subcategoryId: subcategoryId ? String(subcategoryId) : undefined,
        subcategoryName: subcategoryName ? String(subcategoryName) : undefined,
        content: content ? String(content).trim() : undefined, detail: detail ? String(detail).trim() : undefined,
        amount: Number(money) || 0, type: TYPES[String(code)] ?? 'unknown', rawCode: String(code), isFuture: d > today,
      }
    })
  } finally { db.close() }
}

export async function loadBackupHistory(file: File, today: string): Promise<Movement[]> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 64 MiB import limit.')
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url'),
  ])
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  return readBackupHistory(new Uint8Array(await file.arrayBuffer()), SQL, today)
}
