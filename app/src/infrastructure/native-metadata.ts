import type { SqlJsStatic } from 'sql.js'
import { emptyMetadata, validateState, type MetadataSnapshot } from '../domain/metadata'

export const MAX_BACKUP_BYTES = 64 * 1024 * 1024
const MAGIC = new TextEncoder().encode('SQLite format 3\0')

/** Reads a private backup in WASM memory. Never exports it or reads transactions. */
export function readNativeMetadata(bytes: Uint8Array, SQL: SqlJsStatic, importedAt = new Date().toISOString()): MetadataSnapshot {
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 64 MiB metadata import limit.')
  if (!MAGIC.every((b, i) => bytes[i] === b)) throw new Error('Choose an unencrypted SQLite .mmbak or .sqlite backup.')
  const db = new SQL.Database(bytes)
  try {
    db.run('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF')
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ASSETS','CURRENCY')")[0]?.values.flat()
    if (tables?.length !== 2) throw new Error('Unsupported backup schema: ASSETS and CURRENCY tables required.')
    const currencies = db.exec('SELECT uid, ISO, RATE, IS_MAIN_CURRENCY FROM CURRENCY WHERE IS_DEL=0 LIMIT 10001')[0]?.values ?? []
    if (currencies.length > 10000) throw new Error('Too many currencies in backup.')
    const main = currencies.filter(c => c[3] === 1)
    if (main.length !== 1 || typeof main[0]![1] !== 'string') throw new Error('Backup must have one main currency.')
    const baseCurrency = main[0]![1] as string
    const rates = new Map<string, { currency: string; rate: number }>()
    for (const [id, iso, rate] of currencies) {
      if (typeof id !== 'string' || typeof iso !== 'string' || typeof rate !== 'number' || rates.has(id)) throw new Error('Invalid or duplicate currency metadata.')
      rates.set(id, { currency: iso, rate })
    }
    const rows = db.exec('SELECT uid, NIC_NAME, ZDATA2, currencyUid FROM ASSETS LIMIT 10001')[0]?.values ?? []
    if (!rows.length || rows.length > 10000) throw new Error('Backup must contain between 1 and 10000 accounts.')
    const accounts: MetadataSnapshot['accounts'] = {}
    for (const [id, name, flag, currencyId] of rows) {
      if (typeof id !== 'string' || !id || typeof name !== 'string' || (flag !== '0' && flag !== '1') || typeof currencyId !== 'string') throw new Error('Unsupported account metadata or inclusion flag.')
      if (Object.prototype.hasOwnProperty.call(accounts, id)) throw new Error('Duplicate account ID in backup.')
      const currency = rates.get(currencyId)
      if (!currency) throw new Error('Account currency is missing from the backup.')
      Object.defineProperty(accounts, id, { value: { name, includeInTotals: flag === '0', ...currency }, enumerable: true })
    }
    const snapshot = { baseCurrency, importedAt, accounts }
    validateState({ ...emptyMetadata(), baseCurrency, imported: snapshot })
    return snapshot
  } finally { db.close() }
}

/** Bundled WASM only; no backup bytes or metadata are sent to any server. */
export async function loadNativeMetadata(file: File): Promise<MetadataSnapshot> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 64 MiB metadata import limit.')
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url'),
  ])
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  return readNativeMetadata(new Uint8Array(await file.arrayBuffer()), SQL)
}
