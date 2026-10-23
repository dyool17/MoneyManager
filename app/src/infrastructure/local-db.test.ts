import { afterEach, expect, it, vi } from 'vitest'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { dbApply, dbLog, dbMovements, dbStatus, scopeOf } from './local-db'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn(() => false) }))
afterEach(() => vi.resetAllMocks())
it('keeps phone origins and books separate', () => {
  expect(scopeOf('http://phone:8888', '1')).toBe('http://phone:8888|1')
  expect(scopeOf('http://other:8888', '1')).not.toBe(scopeOf('http://phone:8888', '1'))
  expect(scopeOf('http://phone:8888', '2')).not.toBe(scopeOf('http://phone:8888', '1'))
})
it('rejects every operation outside Tauri without invoking', async () => {
  const batch = { source: 'phone' as const, upserts: [], deletes: [], months: [], counts: { added: 0, modified: 0, deleted: 0 } }
  for (const result of [dbStatus('s'), dbMovements('s', '2026-01-01', '2026-12-31'), dbApply('s', batch), dbLog('s', 5)]) {
    await expect(result).rejects.toThrow('Local database requires the Tauri desktop app.')
  }
  expect(invoke).not.toHaveBeenCalled()
})
it('forwards typed commands and their arguments', async () => {
  vi.mocked(isTauri).mockReturnValue(true)
  vi.mocked(invoke).mockResolvedValue({ movements: 0, months: [], lastSync: null })
  expect(await dbStatus('s')).toEqual({ movements: 0, months: [], lastSync: null })
  await dbMovements('s', 'a', 'b'); await dbLog('s', 4)
  const batch = { source: 'backup' as const, upserts: [], deletes: [], months: [], counts: { added: 0, modified: 0, deleted: 0 } }
  await dbApply('s', batch)
  expect(invoke).toHaveBeenNthCalledWith(1, 'db_status', { scope: 's' })
  expect(invoke).toHaveBeenNthCalledWith(2, 'db_movements', { scope: 's', from: 'a', to: 'b' })
  expect(invoke).toHaveBeenNthCalledWith(3, 'db_log', { scope: 's', limit: 4 })
  expect(invoke).toHaveBeenNthCalledWith(4, 'db_apply', { scope: 's', batch })
})
