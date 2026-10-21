import { computed, ref, type Ref } from 'vue'

type Value = string | number | null | undefined
export type SortDir = 'asc' | 'desc'

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/**
 * Click-to-sort for a table. The first click sorts numbers high to low and text
 * A to Z, the second reverses it, the third returns to the original order.
 */
export function useSort<T, K extends string>(rows: Ref<T[]> | (() => T[]), keys: Record<K, (row: T) => Value>) {
  const key = ref<K | null>(null) as Ref<K | null>
  const dir = ref<SortDir>('asc')
  const source = typeof rows === 'function' ? computed(rows) : rows

  const sorted = computed(() => {
    const list = source.value ?? []
    const k = key.value
    if (k === null) return list
    const get = keys[k]
    const sign = dir.value === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const x = get(a), y = get(b)
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))
      return c * sign
    })
  })

  function toggle(k: K) {
    if (key.value !== k) {
      const sample = (source.value ?? []).map(keys[k]).find((v) => v != null)
      key.value = k
      dir.value = typeof sample === 'number' ? 'desc' : 'asc'
      return
    }
    const first: SortDir = typeof (source.value ?? []).map(keys[k]).find((v) => v != null) === 'number' ? 'desc' : 'asc'
    if (dir.value === first) dir.value = first === 'asc' ? 'desc' : 'asc'
    else key.value = null
  }

  const ariaSort = (k: K): 'none' | 'ascending' | 'descending' => (key.value !== k ? 'none' : dir.value === 'asc' ? 'ascending' : 'descending')

  return { sorted, key, dir, toggle, ariaSort }
}
