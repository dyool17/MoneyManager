import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { MonthPoint } from '../domain/types'

/** Component-local, memory-only reads. Context changes discard both results and in-flight work. */
export function useAccountTrend(accountId: () => string, context: () => string, read: (id: string) => Promise<MonthPoint[]>) {
  const points = shallowRef<MonthPoint[]>([])
  const error = ref<string | null>(null)
  const loading = ref(false)
  const cache = new Map<string, MonthPoint[]>()
  const pending = new Map<string, Promise<MonthPoint[]>>()
  let generation = 0
  let selection = 0
  let currentContext: string | undefined

  function load() {
    const scope = context()
    if (scope !== currentContext) {
      currentContext = scope
      generation++
      cache.clear()
      pending.clear()
    }
    const id = accountId(), ticket = ++selection, epoch = generation
    error.value = null
    const saved = cache.get(id)
    points.value = saved ?? []
    loading.value = !saved
    if (saved) return
    let task = pending.get(id)
    if (!task) {
      // Schedule the read immediately; no background prefetch or shared session mutations.
      try { task = Promise.resolve(read(id)) } catch (e) { task = Promise.reject(e) }
      pending.set(id, task)
      const active = task
      void task.then(value => {
        if (epoch === generation) cache.set(id, value)
      }, () => {}).finally(() => {
        if (pending.get(id) === active) pending.delete(id)
      })
    }
    void task.then(value => {
      if (ticket === selection && epoch === generation) points.value = value
    }, e => {
      if (ticket === selection && epoch === generation) error.value = e instanceof Error ? e.message : String(e)
    }).finally(() => {
      if (ticket === selection && epoch === generation) loading.value = false
    })
  }

  // Run before rendering, batching multi-field session commits into one demand read.
  watch([accountId, context], load, { immediate: true })
  onScopeDispose(() => { generation++; selection++; cache.clear(); pending.clear() })
  return { points, error, loading, retry: load }
}
