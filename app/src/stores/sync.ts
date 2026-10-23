import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { canonical, diffMonth, fingerprint, summarize, conflicts as findConflicts } from '../domain/sync'
import type { CanonicalMovement, IncomingChange } from '../domain/sync'
import { shiftMonth } from '../domain/format'
import { loadBackupHistory } from '../infrastructure/backup-history'
import { dbApply, dbMovements, dbStatus, dbLog, scopeOf } from '../infrastructure/local-db'
import type { DbStatus, SyncLog, MonthState } from '../infrastructure/local-db'
import { useSession } from './session'
import { useAccountMetadata } from './metadata'
import { useOutbox } from './outbox'

interface Preview extends MonthState {
  remote: CanonicalMovement[]
  source: 'phone' | 'backup'
  // A partial acceptance or keep-local decision cannot certify the remote snapshot.
  complete: boolean
}

/** Read-only phone comparisons; only explicit acceptance writes the local database. */
export const useSync = defineStore('sync', () => {
  const session = useSession()
  const metadata = useAccountMetadata()
  const outbox = useOutbox()
  // The last phone and book this computer synced with, so a backup can be previewed after a restart.
  const SCOPE_KEY = 'mm.sync.scope.v1'
  const savedScope = () => { try { return localStorage.getItem(SCOPE_KEY) } catch { return null } }
  const scope = ref<string | null>(savedScope())
  const pending = shallowRef(new Map<string, IncomingChange[]>())
  const previews = shallowRef(new Map<string, Preview>())
  const progress = ref<{ done: number; total: number; current: string | null }>({ done: 0, total: 0, current: null })
  const error = ref<string | null>(null)
  const reading = ref(false)
  const applying = ref(false)
  const status = shallowRef<DbStatus | null>(null)
  const log = shallowRef<SyncLog[]>([])
  let generation = 0
  let cancelled = false
  const disabledReason = computed(() => session.source !== 'phone' ? 'Connect a phone to read changes. Demo data cannot sync.' : null)
  const changes = computed(() => [...pending.value.values()].flat())
  const summary = computed(() => summarize(changes.value))
  const relevantOutbox = computed(() => outbox.items.filter(item =>
    (item.status === 'pending' || item.status === 'unconfirmed') &&
    (!item.phone || item.phone === session.address || item.phone === metadata.scope)))
  const conflicts = computed(() => findConflicts(changes.value, relevantOutbox.value))
  const outgoing = computed(() => ({
    pending: relevantOutbox.value.filter(item => item.status === 'pending').length,
    unconfirmed: relevantOutbox.value.filter(item => item.status === 'unconfirmed').length,
  }))
  const message = (e: unknown) => e instanceof Error ? e.message : String(e)

  function rememberScope() {
    if (session.source !== 'phone' || !session.address) return
    const next = scopeOf(metadata.scope, session.bookId)
    if (scope.value === next) return
    generation++
    cancelled = true
    scope.value = next
    try { localStorage.setItem(SCOPE_KEY, next) } catch { /* not remembered across restarts */ }
    pending.value = new Map(); previews.value = new Map()
    status.value = null; log.value = []
  }
  rememberScope()
  watch(() => [session.source, session.address, session.bookId], () => {
    generation++
    cancelled = true
    rememberScope()
  }, { flush: 'sync' })
  // Post-flush waits for connect's whole commit, including the new client and book.
  watch(() => [session.source, session.address, session.bookId, session.status], async (next, previous) => {
    if (session.source !== 'phone' || session.status !== 'ready') return
    if (previous && next.slice(0, 3).every((value, i) => value === previous[i]) && previous[3] === 'ready') return
    await readRecent()
  })

  function cancel() { cancelled = true }

  function compare(month: string, remote: CanonicalMovement[], local: CanonicalMovement[], source: Preview['source']) {
    const ids = new Set(remote.map(row => row.id))
    const rows = local.filter(row => row.date.startsWith(month) || ids.has(row.id))
    // One preview has one provenance: never label backup changes as phone data.
    const sameSource = [...previews.value.values()].every(preview => preview.source === source)
    const next = new Map(sameSource ? pending.value : [])
    next.set(month, diffMonth(month, rows, remote))
    const snapshots = new Map(sameSource ? previews.value : [])
    snapshots.set(month, { month, remote, source, readAt: new Date().toISOString(), fingerprint: fingerprint(remote), rows: remote.length, complete: true })
    // A date move discovered in either read order must not also delete the old row.
    const remoteMonths = new Map<string, string>()
    for (const [m, preview] of snapshots) for (const row of preview.remote) remoteMonths.set(row.id, m)
    for (const [m, entries] of next) next.set(m, entries.filter(change =>
      change.kind !== 'deleted' || !remoteMonths.has(change.id) || remoteMonths.get(change.id) === m))
    pending.value = next; previews.value = snapshots
  }

  async function read(months: string[]) {
    if (disabledReason.value) { error.value = disabledReason.value; return }
    if (reading.value || applying.value) return
    rememberScope()
    if (!scope.value) { error.value = 'Connect a phone to establish a database scope.'; return }
    const target = scope.value; const token = generation
    reading.value = true; cancelled = false; error.value = null
    progress.value = { done: 0, total: months.length, current: null }
    try {
      const local = await dbMovements(target, '0000-01-01', '9999-12-31')
      for (const month of months) {
        if (cancelled || token !== generation) break
        progress.value.current = month
        const remote = (await session.getHistory(shiftMonth(`${month}-01`, 0)))
          .map(canonical).filter((row): row is CanonicalMovement => row !== null)
        if (token !== generation) break
        compare(month, remote, local, 'phone')
        progress.value.done++
      }
    } catch (e) { if (token === generation) error.value = message(e) }
    finally { reading.value = false; progress.value.current = null }
  }
  function readRecent() {
    const now = new Date()
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return read([-2, -1, 0].map(offset => shiftMonth(first, offset).startDate.slice(0, 7)))
  }

  async function previewBackup(file: File) {
    if (reading.value || applying.value) return
    if (!scope.value) { error.value = 'Connect a phone first to establish a database scope for this backup.'; return }
    const token = generation; const target = scope.value
    reading.value = true; error.value = null
    try {
      const remote = (await loadBackupHistory(file, new Date().toISOString().slice(0, 10)))
        .map(canonical).filter((row): row is CanonicalMovement => row !== null)
      const local = await dbMovements(target, '0000-01-01', '9999-12-31')
      if (token !== generation) return
      pending.value = new Map(); previews.value = new Map()
      for (const month of [...new Set(remote.map(row => row.date.slice(0, 7)))].sort()) {
        compare(month, remote.filter(row => row.date.startsWith(month)), local, 'backup')
      }
    } catch (e) { if (token === generation) error.value = message(e) }
    finally { reading.value = false }
  }

  async function accept(ids: string[] | 'all', month?: string) {
    if (reading.value || applying.value || !scope.value) return
    const available = [...previews.value.values()].filter(p => !month || p.month === month)
    const source = available[0]?.source
    if (!source) return
    if (source === 'phone' && disabledReason.value) { error.value = disabledReason.value; return }
    const blocked = new Set(conflicts.value.map(c => c.change.id))
    const selected = changes.value.filter(c => (!month || c.month === month) &&
      (ids === 'all' ? !blocked.has(c.id) : ids.includes(c.id)))
    const selectedSet = new Set(selected)
    const months = available.filter(p => p.complete && (pending.value.get(p.month) ?? []).every(c => selectedSet.has(c)))
      .map(({ month, readAt, fingerprint, rows }) => ({ month, readAt, fingerprint, rows }))
    if (!selected.length && !months.length) return
    const target = scope.value; const token = generation
    applying.value = true; error.value = null
    try {
      await dbApply(target, {
        source, upserts: selected.flatMap(c => c.remote ? [c.remote] : []),
        deletes: selected.filter(c => c.kind === 'deleted').map(c => c.id), months,
        counts: { added: selected.filter(c => c.kind === 'new').length, modified: selected.filter(c => c.kind === 'modified').length, deleted: selected.filter(c => c.kind === 'deleted').length },
      })
      if (token !== generation) return
      const next = new Map(pending.value); const snapshots = new Map(previews.value)
      for (const [m, entries] of next) {
        const remaining = entries.filter(c => !selectedSet.has(c))
        if (!remaining.length && (entries.some(c => selectedSet.has(c)) || months.some(p => p.month === m))) {
          next.delete(m); snapshots.delete(m)
        } else {
          next.set(m, remaining)
          if (remaining.length !== entries.length) snapshots.set(m, { ...snapshots.get(m)!, complete: false })
        }
      }
      pending.value = next; previews.value = snapshots
      const nextStatus = await dbStatus(target); const nextLog = await dbLog(target, 50)
      if (token === generation) { status.value = nextStatus; log.value = nextLog }
    } catch (e) { if (token === generation) error.value = message(e) }
    finally { applying.value = false }
  }
  function keepLocal(id: string) {
    if (reading.value || applying.value || !conflicts.value.some(c => c.change.id === id)) return
    const next = new Map(pending.value); const snapshots = new Map(previews.value)
    for (const [month, entries] of next) {
      if (!entries.some(c => c.id === id)) continue
      const remaining = entries.filter(c => c.id !== id)
      if (remaining.length) next.set(month, remaining)
      else next.delete(month)
      snapshots.set(month, { ...snapshots.get(month)!, complete: false })
    }
    pending.value = next; previews.value = snapshots
  }
  return { scope, pending, previews, summary, conflicts, outgoing, progress, reading, applying, error, disabledReason, status, log, read, readRecent, cancel, accept, keepLocal, previewBackup }
})
