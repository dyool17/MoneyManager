import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAccountMetadata } from './metadata'

import type { DecisionSnapshot } from '../domain/bad-decisions'

export type { DecisionSnapshot }
interface DecisionState { dismissed: string[]; confirmed: DecisionSnapshot[] }

/** Private dismissals and durable confirmation snapshots, saved per account scope. */
export const useDecisions = defineStore('bad-decisions', () => {
  const metadata = useAccountMetadata()
  const dismissed = ref<string[]>([])
  const confirmed = ref<DecisionSnapshot[]>([])
  const storageError = ref('')
  const key = computed(() => `mm.bad-decisions.v1.${metadata.scope}`)
  watch(key, () => {
    dismissed.value = []
    confirmed.value = []
    storageError.value = ''
    try {
      const saved = localStorage.getItem(key.value)
      if (saved) {
        const state = readState(JSON.parse(saved))
        dismissed.value = state.dismissed
        confirmed.value = state.confirmed
      }
    } catch {
      storageError.value = 'Invalid saved dismissals.'
    }
  }, { immediate: true, flush: 'sync' })

  const persist = (state: DecisionState) => {
    readState(state)
    localStorage.setItem(key.value, JSON.stringify(state))
    dismissed.value = state.dismissed
    confirmed.value = state.confirmed
    storageError.value = ''
  }
  const isConfirmed = (id: string) => confirmed.value.some(s => s.id === id)
  // Existing pending-flag consumers use this predicate; undo restores visibility.
  const isDismissed = (id: string) => dismissed.value.includes(id) || isConfirmed(id)
  const dismiss = (id: string) => { if (!dismissed.value.includes(id)) persist({ dismissed: [...dismissed.value, id], confirmed: confirmed.value }) }
  const confirm = (snapshot: DecisionSnapshot) => persist({ dismissed: dismissed.value, confirmed: [...confirmed.value.filter(s => s.id !== snapshot.id), { ...snapshot }] })
  const unconfirm = (id: string) => persist({ dismissed: dismissed.value, confirmed: confirmed.value.filter(s => s.id !== id) })

  return { dismissed, confirmed, storageError, key, isDismissed, dismiss, confirm, unconfirm, isConfirmed }
})

function fail(): never { throw new Error('Invalid saved dismissals.') }
function readState(raw: unknown): DecisionState {
  if (!raw || typeof raw !== 'object') fail()
  const { dismissed, confirmed = [] } = raw as Partial<DecisionState>
  if (!Array.isArray(dismissed) || !dismissed.every(v => typeof v === 'string')) fail()
  if (!Array.isArray(confirmed)) fail()
  for (const s of confirmed) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id || typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || typeof s.amount !== 'number' || !Number.isFinite(s.amount) || s.amount <= 0 || typeof s.categoryName !== 'string' || s.categoryId !== undefined && typeof s.categoryId !== 'string' || s.note !== undefined && typeof s.note !== 'string') fail()
  }
  return { dismissed, confirmed }
}
