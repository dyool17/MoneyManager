import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useCountUp } from './countUp'

describe('useCountUp', () => {
  it('lands on the new value when animation is unavailable', async () => {
    const source = ref<number | null>(10)
    const shown = useCountUp(source)
    expect(shown.value).toBe(10)
    source.value = null
    await nextTick()
    expect(shown.value).toBe(0)
  })
})
