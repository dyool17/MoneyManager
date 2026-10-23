import { invoke, isTauri } from '@tauri-apps/api/core'
import type { CanonicalMovement } from '../domain/sync'

export interface MonthState { month: string; readAt: string; fingerprint: string; rows: number }
export interface SyncCounts { added: number; modified: number; deleted: number }
export interface ApplyBatch {
  source: 'phone' | 'backup'
  upserts: CanonicalMovement[]
  deletes: string[]
  months: MonthState[]
  counts: SyncCounts
}
export interface DbStatus { movements: number; months: MonthState[]; lastSync: string | null }
export interface SyncLog extends SyncCounts { at: string; source: 'phone' | 'backup'; months: string[] }

/** Isolates the accepted history of each phone origin and book. */
export const scopeOf = (origin: string, bookId: string): string => `${origin}|${bookId}`

async function localInvoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('Local database requires the Tauri desktop app.')
  return invoke<T>(command, args)
}
export const dbStatus = (scope: string): Promise<DbStatus> => localInvoke('db_status', { scope })
/** Inclusive date range, ordered by date and id. */
export const dbMovements = (scope: string, from: string, to: string): Promise<CanonicalMovement[]> =>
  localInvoke('db_movements', { scope, from, to })
/** Call only after user acceptance; all changes and the log commit atomically. */
export const dbApply = (scope: string, batch: ApplyBatch): Promise<{ applied: number }> =>
  localInvoke('db_apply', { scope, batch })
/** Most recently accepted batches first. */
export const dbLog = (scope: string, limit: number): Promise<SyncLog[]> => localInvoke('db_log', { scope, limit })
