<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatMoney } from '../domain/format'

export interface BarSeries { key: string; label: string; color: string }

const props = defineProps<{
  rows: { label: string; values: Record<string, number> }[]
  series: BarSeries[]
  label: string
  /** Index of the highlighted bar group, if any. */
  selected?: number | null
  height?: number
}>()
const emit = defineEmits<{ select: [index: number | null] }>()

/** Drawn at the real pixel width so text and bars never stretch. */
const box = ref<HTMLElement | null>(null)
const width = ref(640)
let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(([e]) => { width.value = Math.max(200, e!.contentRect.width) })
  if (box.value) observer.observe(box.value)
})
onBeforeUnmount(() => observer?.disconnect())
const H = computed(() => props.height ?? 220)
const PAD = { top: 12, right: 8, bottom: 26, left: 8 }
const hover = ref<number | null>(null)

const max = computed(() => Math.max(1, ...props.rows.flatMap((r) => props.series.map((s) => r.values[s.key] ?? 0))))
const geometry = computed(() => {
  const inner = width.value - PAD.left - PAD.right
  const slot = inner / Math.max(1, props.rows.length)
  const gap = 2
  const bar = Math.max(2, Math.min(28, (slot * 0.72 - gap * (props.series.length - 1)) / props.series.length))
  const plot = H.value - PAD.top - PAD.bottom
  return props.rows.map((r, i) => {
    const groupW = bar * props.series.length + gap * (props.series.length - 1)
    const x0 = PAD.left + i * slot + (slot - groupW) / 2
    return {
      i, slotX: PAD.left + i * slot, slot, label: r.label,
      bars: props.series.map((s, j) => {
        const v = r.values[s.key] ?? 0
        const h = (v / max.value) * plot
        return { key: s.key, color: s.color, x: x0 + j * (bar + gap), y: PAD.top + plot - h, w: bar, h }
      }),
    }
  })
})
/** Label every nth tick so long spans never collide. */
const every = computed(() => Math.ceil(props.rows.length / 12))
const tip = computed(() => (hover.value === null ? null : { row: props.rows[hover.value]!, g: geometry.value[hover.value]! }))
</script>

<template>
  <figure class="chart">
    <div class="legend" v-if="series.length > 1">
      <span v-for="s in series" :key="s.key"><i :style="{ background: s.color }" />{{ s.label }}</span>
    </div>
    <div ref="box" class="plot">
      <svg :viewBox="`0 0 ${width} ${H}`" :height="H" role="img" :aria-label="label" @mouseleave="hover = null">
        <line :x1="PAD.left" :x2="width - PAD.right" :y1="H - PAD.bottom" :y2="H - PAD.bottom" class="base" />
        <g v-for="g in geometry" :key="g.i" :class="{ dim: selected != null && selected !== g.i }">
          <rect v-for="b in g.bars" :key="b.key" :x="b.x" :y="b.y" :width="b.w" :height="Math.max(0, b.h)" rx="3" :fill="b.color" />
          <text v-if="g.i % every === 0" :x="g.slotX + g.slot / 2" :y="H - 8" class="tick">{{ g.label }}</text>
          <rect class="hit" :x="g.slotX" :y="0" :width="g.slot" :height="H"
            @mouseenter="hover = g.i" @click="emit('select', selected === g.i ? null : g.i)" />
        </g>
      </svg>
      <div v-if="tip" class="tooltip" :style="{ left: `${((tip.g.slotX + tip.g.slot / 2) / width) * 100}%` }">
        <strong>{{ tip.row.label }}</strong>
        <span v-for="s in series" :key="s.key"><i :style="{ background: s.color }" />{{ s.label }} <b>{{ formatMoney(tip.row.values[s.key] ?? 0) }}</b></span>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.chart { margin: 0; }
.legend { display: flex; gap: 1rem; font-size: 0.82rem; color: var(--ink-soft); margin-bottom: 0.4rem; }
.legend i, .tooltip i { display: inline-block; width: 0.65rem; height: 0.65rem; border-radius: 2px; margin-right: 0.35rem; vertical-align: -1px; }
.plot { position: relative; }
svg { width: 100%; height: auto; display: block; }
.base { stroke: var(--rule); }
.tick { fill: var(--ink-soft); font-size: 11px; text-anchor: middle; }
.dim rect:not(.hit) { opacity: 0.3; }
rect:not(.hit) { transition: opacity 0.2s, height 0.4s, y 0.4s; }
.hit { fill: transparent; cursor: pointer; }
.hit:hover { fill: var(--ink); fill-opacity: 0.04; }
.tooltip {
  position: absolute; top: 0; transform: translateX(-50%); pointer-events: none;
  background: var(--paper); border: 1px solid var(--rule); border-radius: 8px; padding: 0.45rem 0.65rem;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.12); font-size: 0.82rem; display: grid; gap: 0.15rem; white-space: nowrap; z-index: 2;
}
.tooltip b { font-weight: 600; margin-left: 0.4rem; }
</style>
