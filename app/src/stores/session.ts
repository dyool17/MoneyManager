import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { InitData, MoneyManagerClient, Movement, Period, Summary } from '../domain/types'
import { FixtureTransport, PcManagerClient, TauriTransport } from '../infrastructure/client'

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
  let client: MoneyManagerClient = new PcManagerClient(new FixtureTransport())

  /** Runs a load; on failure keeps the previous data and records the error. */
  async function run(task: () => Promise<void>) {
    status.value = 'loading'
    error.value = null
    try {
      await task()
      status.value = 'ready'
      loadedAt.value = new Date()
    } catch (e) {
      const isParse = e instanceof Error && e.name === 'InvalidResponseError'
      status.value = isParse ? 'invalid-response' : 'offline'
      error.value = e instanceof Error ? e.message : String(e)
    }
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
      // Commit only after every read succeeded, so a failure keeps the previous state.
      client = candidate
      source.value = next
      init.value = data
      period.value = { ...data.defaultPeriod }
      summary.value = s
      movements.value = m
      if (next === 'phone') {
        address.value = nextAddress.trim()
        try {
          localStorage.setItem(ADDRESS_KEY, address.value)
        } catch {
          /* storage unavailable: address is just not remembered */
        }
      }
    })
  }

  async function loadPeriod(target: Period) {
    if (!init.value) return
    const query = { ...target, mbid: init.value.currentBook.id }
    const s = await client.getSummary(query)
    const m = await client.getMovements(query)
    period.value = { ...target }
    summary.value = s
    movements.value = m
  }

  const setPeriod = (next: Period) => run(() => loadPeriod(next))
  const refresh = () => run(() => loadPeriod(period.value))

  return { source, address, status, error, init, period, summary, movements, loadedAt, connect, setPeriod, refresh }
})
