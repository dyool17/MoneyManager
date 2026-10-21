import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { Movement } from '../domain/types'
import type { MonthBudget } from '../domain/budget-history'
import { monthRange } from '../domain/insights'
import { shiftMonth } from '../domain/format'
import { loadBackupHistory } from '../infrastructure/backup-history'
import { useSession } from './session'

export type HistorySource = 'phone' | 'backup'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Months of movements for reports. Kept in memory only, never saved to disk. */
export const useHistory = defineStore('history', () => {
  const movements = shallowRef<Movement[]>([])
  const source = ref<HistorySource | null>(null)
  const span = ref({ first: '', last: '' })
  const state = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const error = ref<string | null>(null)
  /** Past budgets come from one summary per month; only the phone has them. */
  const budgets = shallowRef<MonthBudget[]>([])
  const budgetState = ref<'idle' | 'loading' | 'ready' | 'failed' | 'unavailable'>('idle')
  let latest = 0

  async function load(from: HistorySource, task: () => Promise<Movement[]>, first: string, last: string) {
    const token = ++latest
    state.value = 'loading'
    error.value = null
    try {
      const m = await task()
      if (token !== latest) return
      movements.value = m
      source.value = from
      span.value = { first, last }
      state.value = 'ready'
    } catch (e) {
      if (token !== latest) return
      error.value = e instanceof Error ? e.message : String(e)
      state.value = 'failed'
    }
  }

  /** The last `months` whole months up to today, from whatever the session is connected to. */
  async function fromSession(months: number, today = new Date()) {
    const session = useSession()
    const last = iso(today)
    const first = shiftMonth(last.slice(0, 8) + '01', -(months - 1)).startDate
    // Scheduled entries a year ahead feed the future commitments report.
    const ahead = shiftMonth(last.slice(0, 8) + '01', 12).endDate
    await load('phone', () => session.getHistory({ startDate: first, endDate: ahead }), first, last)
    if (state.value === 'ready') await loadBudgets(first, last)
  }

  async function loadBudgets(first: string, last: string) {
    const token = latest
    const session = useSession()
    budgetState.value = 'loading'
    try {
      const periods = monthRange(first.slice(0, 7), last.slice(0, 7)).map((m) => shiftMonth(`${m}-01`, 0))
      const summaries = await session.getSummaries(periods)
      if (token !== latest) return
      budgets.value = summaries.map((s, i) => ({ month: periods[i]!.startDate.slice(0, 7), expenseByCategory: s.expenseByCategory }))
      budgetState.value = 'ready'
    } catch {
      if (token === latest) budgetState.value = 'failed'
    }
  }

  /** Offline reports from a backup file, for when the phone is not around. */
  function fromBackup(file: File, months: number, today = new Date()) {
    budgets.value = []
    budgetState.value = 'unavailable'
    const last = iso(today)
    const first = shiftMonth(last.slice(0, 8) + '01', -(months - 1)).startDate
    return load('backup', () => loadBackupHistory(file, last), first, last)
  }

  return { movements, source, span, state, error, budgets, budgetState, fromSession, fromBackup }
})
