import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useSession } from './session'
import {
  emptyMetadata, importMetadata, overrideMetadata, resolveMetadata, calculateTotals, validateState,
  type AccountSettings, type MetadataSnapshot, type MetadataState,
} from '../domain/metadata'

export const useAccountMetadata = defineStore('account-metadata', () => {
  const session = useSession()
  const state = shallowRef<MetadataState>(emptyMetadata())
  const storageError = ref('')
  const scope = computed(() => {
    if (session.source === 'demo') return 'demo'
    const address = session.source === 'stored' ? session.storedScope.slice(0, session.storedScope.lastIndexOf('|')) : session.address
    try { return new URL(address).origin } catch { return address.trim() }
  })
  const key = computed(() => `mm.account-metadata.v1.${scope.value}`)
  watch(key, () => {
    state.value = emptyMetadata(); storageError.value = ''
    try {
      const saved = localStorage.getItem(key.value)
      if (saved) state.value = validateState(JSON.parse(saved))
    } catch { storageError.value = 'Saved metadata could not be loaded. Import a backup or configure accounts again.' }
  }, { immediate: true, flush: 'sync' })

  const rows = computed(() => {
    const cards = session.cards.flatMap(g => g.items)
    const cardIds = new Set(cards.map(c => c.id))
    return [
      ...session.assets.flatMap(g => g.items).filter(a => !cardIds.has(a.id)).map(a => ({ id: a.id, name: a.name, amount: a.balance })),
      ...cards.map(c => ({ id: c.id, name: c.name, amount: c.outstanding })),
    ]
  })
  const totals = computed(() => calculateTotals(rows.value, state.value))
  const changedAccounts = computed(() => rows.value.filter(r => {
    const imported = state.value.imported?.accounts[r.id]
    return imported && imported.name !== r.name && !Object.prototype.hasOwnProperty.call(state.value.overrides, r.id)
  }).map(r => r.id))

  function persist(next: MetadataState) {
    // Commit state only after persistence succeeds, so failed imports leave both unchanged.
    localStorage.setItem(key.value, JSON.stringify(next))
    state.value = next
    storageError.value = ''
  }
  const acceptImport = (snapshot: MetadataSnapshot) => persist(importMetadata(state.value, snapshot, rows.value.map(r => r.id)))
  const saveOverride = (id: string, settings: AccountSettings | null, base: string) => persist(overrideMetadata(state.value, id, settings, base))
  const settingsFor = (id: string) => resolveMetadata(state.value, id)
  const sourceOf = (id: string) => Object.prototype.hasOwnProperty.call(state.value.overrides, id)
    ? 'Local override' : settingsFor(id) ? 'Imported backup' : 'Not configured'

  return { state, storageError, scope, rows, totals, changedAccounts, acceptImport, saveOverride, settingsFor, sourceOf }
})
