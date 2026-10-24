import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useAccountMetadata } from './metadata'
import { validateLifeEvents, type LifeEvent, type LifeEventState } from '../domain/life-events'

/**
 * Life events recorded by the user, saved per phone like account metadata. They are private
 * notes that explain unusual spending; nothing is written to the phone.
 */
export const useLifeEvents = defineStore('life-events', () => {
  const metadata = useAccountMetadata()
  const state = shallowRef<LifeEventState>({ events: [] })
  const storageError = ref('')
  const key = computed(() => `mm.life-events.v1.${metadata.scope}`)
  watch(key, () => {
    state.value = { events: [] }
    storageError.value = ''
    try {
      const saved = localStorage.getItem(key.value)
      if (saved) state.value = validateLifeEvents(JSON.parse(saved))
    } catch {
      storageError.value = 'Invalid saved life events.'
    }
  }, { immediate: true, flush: 'sync' })

  function persist(next: LifeEventState) {
    // Commit state only after persistence succeeds, so a failed change leaves both unchanged.
    localStorage.setItem(key.value, JSON.stringify(next))
    state.value = next
    storageError.value = ''
  }

  /** Adds or updates one event; a missing id gets a generated one. Returns the stored event. */
  function add(event: Omit<LifeEvent, 'id'> & { id?: string }): LifeEvent {
    const stored: LifeEvent = { ...event, id: event.id || crypto.randomUUID() }
    validateLifeEvents({ events: [stored] })
    if (stored.savingsGoal) stored.savingsGoal = { ...stored.savingsGoal, accountIds: [...new Set(stored.savingsGoal.accountIds)] }
    const others = state.value.events.filter((e) => e.id !== stored.id)
    persist({ events: [...others, stored].sort((a, b) => a.start.localeCompare(b.start)) })
    return stored
  }

  const remove = (id: string) => persist({ events: state.value.events.filter((e) => e.id !== id) })

  return { state, storageError, key, add, remove }
})
