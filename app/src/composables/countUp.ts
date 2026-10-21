import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** Animates a number toward its new value so totals visibly settle instead of jumping. */
export function useCountUp(source: Ref<number | null | undefined>, duration = 600) {
  const shown = ref(source.value ?? 0)
  let frame = 0
  const animated = typeof requestAnimationFrame === 'function'
  const cancel = () => { if (animated) cancelAnimationFrame(frame) }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  watch(source, (to) => {
    cancel()
    const target = to ?? 0
    if (reduced || !animated) { shown.value = target; return }
    const from = shown.value
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      shown.value = from + (target - from) * (1 - (1 - t) ** 3)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  }, { immediate: true })
  onBeforeUnmount(cancel)
  return shown
}
