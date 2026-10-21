import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useSort } from './sort'

const rows = ref([
  { name: 'beta', total: 10 },
  { name: 'Álamo', total: 30 },
  { name: 'alfa', total: 20 },
])

describe('useSort', () => {
  it('keeps the original order until a column is chosen', () => {
    const s = useSort(rows, { name: (r) => r.name, total: (r) => r.total })
    expect(s.sorted.value.map((r) => r.name)).toEqual(['beta', 'Álamo', 'alfa'])
    expect(s.ariaSort('total')).toBe('none')
  })

  it('sorts numbers high to low first, then low to high, then back to the original order', () => {
    const s = useSort(rows, { name: (r) => r.name, total: (r) => r.total })
    s.toggle('total')
    expect(s.sorted.value.map((r) => r.total)).toEqual([30, 20, 10])
    expect(s.ariaSort('total')).toBe('descending')
    s.toggle('total')
    expect(s.sorted.value.map((r) => r.total)).toEqual([10, 20, 30])
    expect(s.ariaSort('total')).toBe('ascending')
    s.toggle('total')
    expect(s.sorted.value.map((r) => r.total)).toEqual([10, 30, 20])
  })

  it('sorts text A to Z first, ignoring case and accents', () => {
    const s = useSort(rows, { name: (r) => r.name, total: (r) => r.total })
    s.toggle('name')
    expect(s.sorted.value.map((r) => r.name)).toEqual(['Álamo', 'alfa', 'beta'])
    s.toggle('name')
    expect(s.sorted.value.map((r) => r.name)).toEqual(['beta', 'alfa', 'Álamo'])
  })
})
