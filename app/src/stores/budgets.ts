import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useAccountMetadata } from './metadata'
import { validateBudgetState, type BudgetMode, type BudgetPlanState } from '../domain/budget-plan'
import { loadNativeBudgets } from '../infrastructure/native-budgets'

/**
 * Budget plans imported from a user-exported native backup, saved per phone like account
 * metadata. The imported date records when the user exported it; modes are per category id.
 */
export const useBudgetPlans = defineStore('budget-plans', () => {
  const metadata = useAccountMetadata()
  const state = shallowRef<BudgetPlanState>({ plan: null, modes: {} })
  const storageError = ref('')
  const importing = ref(false)
  const key = computed(() => `mm.budget-plan.v1.${metadata.scope}`)
  watch(key, () => {
    state.value = { plan: null, modes: {} }
    storageError.value = ''
    try {
      const saved = localStorage.getItem(key.value)
      if (saved) state.value = validateBudgetState(JSON.parse(saved))
    } catch {
      storageError.value = 'Invalid saved budgets.'
    }
  }, { immediate: true, flush: 'sync' })

  function persist(next: BudgetPlanState) {
    // Commit state only after persistence succeeds, so failed imports leave both unchanged.
    localStorage.setItem(key.value, JSON.stringify(next))
    state.value = next
    storageError.value = ''
  }

  async function importFromFile(file: File) {
    importing.value = true
    try {
      const plan = await loadNativeBudgets(file)
      // Existing modes survive a re-import: ids are stable category uids from the phone.
      persist({ plan, modes: state.value.modes })
    } finally {
      importing.value = false
    }
  }

  const setMode = (categoryId: string, mode: BudgetMode) => persist({ ...state.value, modes: { ...state.value.modes, [categoryId]: mode } })

  return { state, storageError, importing, key, importFromFile, setMode }
})
