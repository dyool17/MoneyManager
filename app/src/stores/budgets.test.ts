import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
// Node uses a file path; production uses the bundled URL.
vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({ default: new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname }))
import { useSession } from './session'
import { useAccountMetadata } from './metadata'
import { useBudgetPlans } from './budgets'
import type { BudgetPlanState } from '../domain/budget-plan'

let SQL: SqlJsStatic
beforeAll(async () => { SQL = await initSqlJs() })

let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) } })
  setActivePinia(createPinia())
})

function setup() {
  const session = useSession(); session.source = 'phone'; session.address = 'http://192.168.1.2:8080'
  return { session, metadata: useAccountMetadata(), budgets: useBudgetPlans() }
}

function backup() {
  const db = new SQL.Database()
  db.run(`CREATE TABLE ZCATEGORY(uid TEXT, NAME TEXT, pUid TEXT, TYPE INTEGER, C_IS_DEL INTEGER);
    CREATE TABLE BUDGET(uid TEXT, targetUid TEXT, DO_TYPE INTEGER, PERIOD_TYPE INTEGER, IS_TOTAL INTEGER, IS_DEL INTEGER);
    CREATE TABLE BUDGET_AMOUNT(uid TEXT, budgetUid TEXT, IS_DEL INTEGER, AMOUNT REAL, BUDGET_PERIOD INTEGER, MODIFY_DATE INTEGER);
    INSERT INTO ZCATEGORY VALUES ('gifts','Gifts','var',1,NULL), ('var','Variable','0',1,NULL);
    INSERT INTO BUDGET VALUES ('b-gifts','gifts',1,6,0,0), ('b-var','var',1,6,0,0);
    INSERT INTO BUDGET_AMOUNT VALUES ('a1','b-gifts',0,100,0,1), ('a2','b-var',0,1500,0,1);`)
  const bytes = db.export(); db.close(); return bytes
}

describe('budget plan store', () => {
  it('persists the plan and modes per phone scope and reloads them', async () => {
    const { session, budgets } = setup()
    await budgets.importFromFile(new File([backup().slice().buffer], 'synthetic.mmbak'))
    budgets.setMode('gifts', 'annual')
    expect(saved.get(`mm.budget-plan.v1.${new URL(session.address).origin}`)).toBeTruthy()
    setActivePinia(createPinia())
    const next = useSession(); next.source = 'phone'; next.address = session.address
    const loaded = useBudgetPlans()
    expect(loaded.state.plan?.budgets.map((b) => b.name)).toEqual(['Gifts', 'Variable'])
    expect(loaded.state.modes.gifts).toBe('annual')
    next.address = 'http://192.168.1.9:8080'
    expect(loaded.state.plan).toBeNull()
  })

  it('rejects invalid files and failed persistence leaving state and storage unchanged', async () => {
    const { budgets } = setup()
    const before = JSON.stringify([...saved])
    await expect(budgets.importFromFile(new File(['not a backup'], 'x.mmbak'))).rejects.toThrow('unencrypted SQLite')
    expect(JSON.stringify([...saved])).toBe(before)
    expect(budgets.storageError).toBe('')
    localStorage.setItem = () => { throw new Error('Storage full') }
    await expect(budgets.importFromFile(new File([backup().slice().buffer], 'synthetic.mmbak'))).rejects.toThrow('Storage full')
    expect(budgets.state.plan).toBeNull()
  })

  it('rejects corrupt saved state with the shared validation error', () => {
    const { metadata } = setup()
    saved.set(`mm.budget-plan.v1.${metadata.scope}`, '{"plan":{"importedAt":1,"budgets":[]},"modes":{}}')
    setActivePinia(createPinia())
    const session = useSession(); session.source = 'phone'; session.address = 'http://192.168.1.2:8080'
    const loaded = useBudgetPlans()
    expect(loaded.storageError).toBe('Invalid saved budgets.')
    expect(loaded.state).toEqual<BudgetPlanState>({ plan: null, modes: {} })
  })
})
