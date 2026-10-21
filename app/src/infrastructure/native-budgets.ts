import type { SqlJsStatic } from 'sql.js'
import { validateBudgetState, type BudgetPlan, type PlannedBudget } from '../domain/budget-plan'
import { MAX_BACKUP_BYTES } from './native-metadata'

const MAGIC = new TextEncoder().encode('SQLite format 3\0')
/** PERIOD_TYPE of the phone's monthly budgets. */
const MONTHLY = 6

/**
 * Reads the phone's monthly budgets from a private backup in WASM memory. PC Manager does not
 * serve budgets below the top-level categories, so the backup is the only source. Never reads
 * transactions.
 */
export function readNativeBudgets(bytes: Uint8Array, SQL: SqlJsStatic, importedAt = new Date().toISOString()): BudgetPlan {
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 64 MiB import limit.')
  if (!MAGIC.every((b, i) => bytes[i] === b)) throw new Error('Choose an unencrypted SQLite .mmbak or .sqlite backup.')
  const db = new SQL.Database(bytes)
  try {
    db.run('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF')
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ZCATEGORY','BUDGET','BUDGET_AMOUNT')")[0]?.values.flat()
    if (tables?.length !== 3) throw new Error('Unsupported backup schema: ZCATEGORY, BUDGET and BUDGET_AMOUNT tables required.')
    const rows = db.exec(`SELECT c.uid, c.NAME, COALESCE(p.NAME, ''), a.AMOUNT, a.BUDGET_PERIOD
      FROM BUDGET b
      JOIN BUDGET_AMOUNT a ON a.budgetUid = b.uid AND a.IS_DEL = 0
      JOIN ZCATEGORY c ON c.uid = b.targetUid AND COALESCE(c.C_IS_DEL, 0) = 0
      LEFT JOIN ZCATEGORY p ON p.uid = c.pUid AND c.pUid <> '0'
      WHERE b.IS_DEL = 0 AND b.IS_TOTAL = 0 AND b.PERIOD_TYPE = ${MONTHLY}
      LIMIT 100001`)[0]?.values ?? []
    if (rows.length > 100000) throw new Error('Too many budget amounts in backup.')
    const byId = new Map<string, PlannedBudget>()
    for (const [id, name, parent, amount, period] of rows) {
      const b = byId.get(String(id)) ?? { categoryId: String(id), name: String(name), parent: String(parent), amount: 0, overrides: {} }
      const p = String(period)
      if (p === '0') b.amount = Number(amount)
      else if (/^\d{6}$/.test(p)) b.overrides[`${p.slice(0, 4)}-${p.slice(4)}`] = Number(amount)
      byId.set(b.categoryId, b)
    }
    const budgets = [...byId.values()]
      .filter((b) => b.amount > 0 || Object.values(b.overrides).some((v) => v > 0))
      .sort((a, b) => a.name.localeCompare(b.name) || a.parent.localeCompare(b.parent))
    const plan = { importedAt, budgets }
    validateBudgetState({ plan, modes: {} })
    return plan
  } finally { db.close() }
}

/** Bundled WASM only; no backup bytes or budgets are sent to any server. */
export async function loadNativeBudgets(file: File): Promise<BudgetPlan> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 64 MiB import limit.')
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url'),
  ])
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  return readNativeBudgets(new Uint8Array(await file.arrayBuffer()), SQL)
}
