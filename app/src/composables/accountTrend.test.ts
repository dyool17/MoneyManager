import { effectScope, nextTick, ref } from 'vue'
import { expect, it, vi } from 'vitest'
import { useAccountTrend } from './accountTrend'
import type { MonthPoint } from '../domain/types'

function deferred() {
  let resolve!: (points: MonthPoint[]) => void
  let reject!: (error: Error) => void
  const promise = new Promise<MonthPoint[]>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const points = [{ month: '2026-01', value: 12 }]
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await nextTick() }

it('shows selection loading immediately, dedupes in-flight reads and revisits loaded accounts without refetch', async () => {
  const id = ref('a'), context = ref('demo|book|1')
  const a = deferred(), b = deferred()
  const read = vi.fn((id: string) => id === 'a' ? a.promise : b.promise)
  const scope = effectScope()
  const trend = scope.run(() => useAccountTrend(() => id.value, () => context.value, read))!
  expect(trend.loading.value).toBe(true)
  expect(trend.points.value).toEqual([])
  id.value = 'b'; await nextTick()
  expect(trend.loading.value).toBe(true)
  id.value = 'a'; await nextTick()
  expect(read).toHaveBeenCalledTimes(2)
  b.resolve([{ month: 'old', value: 99 }]); await settle()
  expect(trend.points.value).toEqual([])
  a.resolve(points); await settle()
  expect(trend.points.value).toEqual(points)
  id.value = 'b'; await nextTick(); id.value = 'a'; await nextTick()
  expect(trend.points.value).toEqual(points)
  expect(trend.loading.value).toBe(false)
  expect(read).toHaveBeenCalledTimes(2)
  scope.stop()
})

it('invalidates refresh/source/address/book scope, ignores stale completions, retries errors and disposes cache', async () => {
  const id = ref('a'), context = ref('phone|one|book|1')
  const old = deferred(), fresh = deferred()
  const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(points)
  const scope = effectScope()
  const trend = scope.run(() => useAccountTrend(() => id.value, () => context.value, read))!
  context.value = 'phone|one|book|2'; await nextTick()
  old.resolve([{ month: 'stale', value: 100 }]); await settle()
  expect(trend.points.value).toEqual([])
  fresh.resolve(points); await settle()
  expect(trend.points.value).toEqual(points)
  context.value = 'stored|two|other|3'; await settle()
  expect(trend.error.value).toBe('offline')
  expect(trend.loading.value).toBe(false)
  trend.retry(); await settle()
  expect(trend.error.value).toBe(null)
  expect(trend.points.value).toEqual(points)
  context.value = 'demo|two|other|3'; await settle()
  expect(read).toHaveBeenCalledTimes(5)
  scope.stop()
})
