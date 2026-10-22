import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAccountMetadata } from './metadata'

/**
 * Bad-decision flags the user dismissed, saved per phone so a flag does not come back every
 * session. Movement ids only; nothing else about the expense is stored.
 */
export const useDecisions = defineStore('bad-decisions', () => {
  const metadata = useAccountMetadata()
  const dismissed = ref<string[]>([])
  const storageError = ref('')
  const key = computed(() => `mm.bad-decisions.v1.${metadata.scope}`)
  watch(key, () => {
    dismissed.value = []
    storageError.value = ''
    try {
      const saved = localStorage.getItem(key.value)
      if (saved) dismissed.value = readIds(JSON.parse(saved))
    } catch {
      storageError.value = 'Invalid saved dismissals.'
    }
  }, { immediate: true, flush: 'sync' })

  const persist = (ids: string[]) => {
    localStorage.setItem(key.value, JSON.stringify({ dismissed: ids }))
    dismissed.value = ids
    storageError.value = ''
  }
  const isDismissed = (id: string) => dismissed.value.includes(id)
  const dismiss = (id: string) => { if (!isDismissed(id)) persist([...dismissed.value, id]) }

  return { dismissed, storageError, key, isDismissed, dismiss }
})

function readIds(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { dismissed?: unknown }).dismissed)) throw new Error('Invalid saved dismissals.')
  const ids = (raw as { dismissed: unknown[] }).dismissed
  if (!ids.every((v) => typeof v === 'string')) throw new Error('Invalid saved dismissals.')
  return ids
}
