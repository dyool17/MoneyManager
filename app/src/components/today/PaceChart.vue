<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../../i18n'
import { formatMoney } from '../../domain/format'

/** This month's cumulative spending against a typical month, with the month-end projection. */
const props = defineProps<{ actual: number[]; typical: number[]; daysInMonth: number; projected: number | null; label: string }>()

const H = 220
const PAD = { top: 18, right: 14, bottom: 26, left: 14 }
const box = ref<HTMLElement | null>(null)
const width = ref(600)
const hover = ref<number | null>(null)
let observer: ResizeObserver | null = null
onMounted(() => {
  if (!box.value || typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(([e]) => { width.value = Math.max(280, e!.contentRect.width) })
  observer.observe(box.value)
})
onBeforeUnmount(() => observer?.disconnect())

const g = computed(() => {
  const days = props.daysInMonth
  const max = Math.max(1, ...props.actual, ...props.typical, props.projected ?? 0) * 1.08
  const x = (day: number) => PAD.left + ((day - 1) / Math.max(1, days - 1)) * (width.value - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const today = props.actual.length
  const last = props.actual[today - 1] ?? 0
  return {
    x, y, today, last,
    actual: path(props.actual),
    typical: path(props.typical),
    projection: props.projected !== null && today ? `M${x(today).toFixed(1)},${y(last).toFixed(1)} L${x(days).toFixed(1)},${y(props.projected).toFixed(1)}` : '',
    grid: [0.25, 0.5, 0.75, 1].map((f) => y(max * f / 1.08)),
  }
})

function onMove(e: MouseEvent) {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
  const ratio = (e.clientX - rect.left - PAD.left) / (rect.width - PAD.left - PAD.right)
  hover.value = Math.min(props.daysInMonth, Math.max(1, Math.round(ratio * (props.daysInMonth - 1)) + 1))
}
const tip = computed(() => {
  const d = hover.value
  if (d === null) return null
  return { day: d, x: g.value.x(d), actual: props.actual[d - 1], typical: props.typical[d - 1] }
})
</script>

<template>
  <div ref="box" class="pace">
    <svg :width="width" :height="H" role="img" :aria-label="label" @mousemove="onMove" @mouseleave="hover = null">
      <line v-for="(gy, i) in g.grid" :key="i" :x1="0" :x2="width" :y1="gy" :y2="gy" class="grid" />
      <line :x1="0" :x2="width" :y1="H - PAD.bottom" :y2="H - PAD.bottom" class="base" />
      <path v-if="typical.length" :d="g.typical" class="typical" />
      <path v-if="g.projection" :d="g.projection" class="projection" />
      <path :d="g.actual" class="actual" />
      <template v-if="g.today">
        <line :x1="g.x(g.today)" :x2="g.x(g.today)" :y1="PAD.top" :y2="H - PAD.bottom" class="today" />
        <circle :cx="g.x(g.today)" :cy="g.y(g.last)" r="5" class="dot" />
      </template>
      <line v-if="tip" :x1="tip.x" :x2="tip.x" :y1="PAD.top" :y2="H - PAD.bottom" class="cross" />
      <text :x="PAD.left" :y="H - 6" class="axis">{{ t('Day {n}', { n: 1 }) }}</text>
      <text v-if="g.today" :x="g.x(g.today)" :y="H - 6" text-anchor="middle" class="axis">{{ t('Today') }}</text>
      <text :x="width - PAD.right" :y="H - 6" text-anchor="end" class="axis">{{ t('Day {n}', { n: daysInMonth }) }}</text>
    </svg>
    <div v-if="tip" class="tip" :style="{ left: `${Math.min(tip.x, width - 170)}px` }">
      <b>{{ t('Day {n}', { n: tip.day }) }}</b>
      <span v-if="tip.actual !== undefined"><i class="k actual" />{{ t('This month') }} {{ formatMoney(tip.actual) }}</span>
      <span v-if="tip.typical !== undefined"><i class="k typical" />{{ t('Typical') }} {{ formatMoney(tip.typical) }}</span>
    </div>
    <div class="legend">
      <span><i class="k actual" />{{ t('This month') }}</span>
      <span v-if="typical.length"><i class="k typical" />{{ t('Typical month') }}</span>
      <span v-if="projected !== null"><i class="k projection" />{{ t('Projection') }} {{ formatMoney(projected) }}</span>
    </div>
  </div>
</template>

<style scoped>
.pace { position: relative; }
svg { display: block; overflow: visible; }
.grid { stroke: var(--track); }
.base { stroke: var(--rule); }
.typical { fill: none; stroke: var(--neutral-mark); stroke-width: 2; }
.actual { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.projection { fill: none; stroke: var(--accent); stroke-width: 2; stroke-dasharray: 5 5; }
.today { stroke: var(--rule); stroke-dasharray: 2 4; }
.cross { stroke: var(--ink-soft); stroke-width: 1; }
.dot { fill: var(--accent); stroke: var(--paper); stroke-width: 2; }
.axis { font-size: 11px; fill: var(--ink-soft); }
.tip { position: absolute; top: 0; display: grid; gap: 0.15rem; padding: 0.5rem 0.65rem; border-radius: 9px; background: var(--paper); border: 1px solid var(--rule); box-shadow: 0 8px 20px rgb(17 19 24 / 0.1); font-size: 0.8rem; pointer-events: none; min-width: 150px; }
.tip span { display: flex; align-items: center; gap: 0.4rem; font-variant-numeric: tabular-nums; }
.legend { display: flex; flex-wrap: wrap; gap: 1.1rem; margin-top: 0.5rem; font-size: 0.8rem; color: var(--ink-soft); }
.legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
.k { display: inline-block; width: 14px; height: 0; border-top: 3px solid var(--accent); }
.k.typical { border-top-color: var(--neutral-mark); }
.k.projection { border-top: 2px dashed var(--accent); }
</style>
