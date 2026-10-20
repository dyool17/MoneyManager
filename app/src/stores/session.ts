import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type {
  AssetGroup,
  CardGroup,
  Dashboard,
  InitData,
  MoneyManagerClient,
  MonthPoint,
  Movement,
  Period,
  Summary,
} from '../domain/types'
import {
  FixtureTransport,
  PcManagerClient,
  TauriTransport,
  takeBackup,
  applyWrite,
  type BackupReport,
  type WriteOp,
} from '../infrastructure/client'

export type Status = 'idle' | 'loading' | 'ready' | 'offline' | 'invalid-response'
export type Source = 'demo' | 'phone'

const ADDRESS_KEY = 'mm.address'

function readSavedAddress(): string {
  try {
    return localStorage.getItem(ADDRESS_KEY) ?? ''
  } catch {
    return ''
  }
}

export const useSession = defineStore('session', () => {
  const source = ref<Source>('demo')
  const address = ref(readSavedAddress())
  const status = ref<Status>('idle')
  const error = ref<string | null>(null)
  const init = shallowRef<InitData | null>(null)
  const period = ref<Period>({ startDate: '', endDate: '' })
  const summary = shallowRef<Summary | null>(null)
  const movements = shallowRef<Movement[]>([])
  const loadedAt = ref<Date | null>(null)
  const dashboard = shallowRef<Dashboard | null>(null)
  const assets = shallowRef<AssetGroup[]>([])
  const cards = shallowRef<CardGroup[]>([])
  /** Book used for period queries. Net worth, accounts and cards are not per book on the server. */
  const bookId = ref('')
  const backup = shallowRef<BackupReport | null>(null)
  const backupState = ref<'idle' | 'running' | 'done' | 'failed'>('idle')
  const backupError = ref<string | null>(null)
  let client: MoneyManagerClient = new PcManagerClient(new FixtureTransport())

  let latest = 0

  /**
   * Runs a load; on failure keeps the previous data and records the error.
   * `task` returns a commit callback so only the most recent load writes state.
   */
  async function run(task: () => Promise<() => void>) {
    const ticket = ++latest
    status.value = 'loading'
    error.value = null
    try {
      const commit = await task()
      if (ticket !== latest) return
      commit()
      status.value = 'ready'
      loadedAt.value = new Date()
    } catch (e) {
      if (ticket !== latest) return
      const isParse = e instanceof Error && e.name === 'InvalidResponseError'
      status.value = isParse ? 'invalid-response' : 'offline'
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  /** Saves a local backup of the connected phone. Demo data is never backed up. */
  async function backupNow() {
    if (source.value !== 'phone' || !init.value || backupState.value === 'running') return
    backupState.value = 'running'
    backupError.value = null
    try {
      backup.value = await takeBackup(address.value, { ...period.value, mbid: bookId.value })
      backupState.value = 'done'
    } catch (e) {
      backupError.value = e instanceof Error ? e.message : String(e)
      backupState.value = 'failed'
    }
  }

  /** Backups older than this no longer allow changes (matches the Rust check). */
  const BACKUP_MAX_AGE_MS = 30 * 60 * 1000
  const canWrite = () =>
    source.value === 'phone' &&
    backupState.value === 'done' &&
    !!backup.value &&
    Date.now() - new Date(backup.value.createdAt).getTime() < BACKUP_MAX_AGE_MS

  /** Applies one change on the phone, then reloads. Throws so the dialog can show the error. */
  async function write(op: WriteOp) {
    if (source.value !== 'phone') throw new Error('Connect your phone to make changes. Demo data cannot be changed.')
    await applyWrite(address.value, op)
    await refresh()
  }

  async function connect(next: Source, nextAddress = address.value) {
    const candidate: MoneyManagerClient =
      next === 'demo'
        ? new PcManagerClient(new FixtureTransport())
        : new PcManagerClient(new TauriTransport(nextAddress.trim()))
    await run(async () => {
      const data = await candidate.getInitData()
      const query = { ...data.defaultPeriod, mbid: data.currentBook.id }
      const s = await candidate.getSummary(query)
      const m = await candidate.getMovements(query)
      const o = await readOverview(candidate)
      // Commit only after every read succeeded, so a failure keeps the previous state.
      return () => {
        client = candidate
        source.value = next
        init.value = data
        bookId.value = data.currentBook.id
        period.value = { ...data.defaultPeriod }
        summary.value = s
        movements.value = m
        o()
        if (next === 'phone') {
          address.value = nextAddress.trim()
          try {
            localStorage.setItem(ADDRESS_KEY, address.value)
          } catch {
            /* storage unavailable: address is just not remembered */
          }
        }
      }
    })
    if (next === 'phone' && status.value === 'ready' && source.value === 'phone') await backupNow()
  }

  async function readOverview(from: MoneyManagerClient) {
    const d = await from.getDashboard()
    const a = await from.getAssets()
    const c = await from.getCards()
    return () => {
      dashboard.value = d
      assets.value = a
      cards.value = c
    }
  }

  async function loadPeriod(target: Period, mbid = bookId.value) {
    const query = { ...target, mbid }
    const s = await client.getSummary(query)
    const m = await client.getMovements(query)
    return () => {
      bookId.value = mbid
      period.value = { ...target }
      summary.value = s
      movements.value = m
    }
  }

  const setPeriod = (next: Period) => run(() => loadPeriod(next))
  const setBook = (id: string) => run(() => loadPeriod(period.value, id))
  const refresh = () =>
    run(async () => {
      const p = await loadPeriod(period.value)
      const o = await readOverview(client)
      return () => {
        p()
        o()
      }
    })

  /** Trend is fetched on demand and not part of the shared state. */
  const getAssetTrend = (assetId: string): Promise<MonthPoint[]> => client.getAssetTrend(assetId)
  /** Movements over any span for reports, fetched on demand like the trend. */
  const getHistory = (span: Period): Promise<Movement[]> => client.getMovements({ ...span, mbid: bookId.value })

  return {
    source,
    address,
    status,
    error,
    init,
    period,
    summary,
    movements,
    loadedAt,
    dashboard,
    assets,
    cards,
    connect,
    bookId,
    setPeriod,
    setBook,
    refresh,
    getAssetTrend,
    getHistory,
    backup,
    backupState,
    backupError,
    backupNow,
    canWrite,
    write,
  }
})
