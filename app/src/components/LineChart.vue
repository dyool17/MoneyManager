<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney } from '../domain/format'

const props = defineProps<{
  points: { label: string; value: number }[]
  /** CSS color for the line, defaults to the accent token. */
  color?: string
  label: string
}>()

const W = 600
const H = 180
const PAD = { top: 16, right: 16, bottom: 28, left: 16 }

const geometry = computed(() => {
  const values = props.points.map((p) => p.value)
  // Scale to the data with some headroom so small changes stay visible.
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.15
  const min = lo - pad
  const max = hi + pad
  const span = max - min
  const stepX = props.points.length > 1 ? (W - PAD.left - PAD.right) / (props.points.length - 1) : 0
  const xy = props.points.map((p, i) => ({
    ...p,
    x: PAD.left + i * stepX,
    y: PAD.top + (1 - (p.value - min) / span) * (H - PAD.top - PAD.bottom),
  }))
  const baseY = H - PAD.bottom
  const zeroY = min < 0 && max > 0 ? PAD.top + (1 - (0 - min) / span) * (H - PAD.top - PAD.bottom) : null
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = xy.length
    ? `${line} L${xy[xy.length - 1].x.toFixed(1)},${baseY} L${xy[0].x.toFixed(1)},${baseY} Z`
    : ''
  return { xy, line, area, zeroY }
})
</script>

<template>
  <figure>
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="label" preserveAspectRatio="none">
      <line v-if="geometry.zeroY !== null" :x1="PAD.left" :x2="W - PAD.right" :y1="geometry.zeroY" :y2="geometry.zeroY" class="zero" />
      <path :d="geometry.area" class="area" :style="{ fill: color ?? 'var(--accent)' }" />
      <path :d="geometry.line" class="line" :style="{ stroke: color ?? 'var(--accent)' }" />
      <g v-for="p in geometry.xy" :key="p.label">
        <circle :cx="p.x" :cy="p.y" r="4" :style="{ fill: color ?? 'var(--accent)' }">
          <title>{{ p.label }}: {{ formatMoney(p.value) }}</title>
        </circle>
      </g>
    </svg>
    <figcaption>
      <span v-for="p in points" :key="p.label">{{ p.label }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
figure { margin: 0; }
svg { width: 100%; height: 180px; display: block; overflow: visible; }
.zero { stroke: var(--rule); stroke-dasharray: 3 4; }
.area { opacity: 0.12; }
.line { fill: none; stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
figcaption { display: flex; justify-content: space-between; color: var(--ink-soft); font-size: 0.8rem; padding: 0 0.25rem; }
</style>
