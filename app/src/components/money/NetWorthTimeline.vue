<script setup lang="ts">
import SavingsGoalProgress from '../milestones/SavingsGoalProgress.vue'
import { computed, ref } from 'vue'
import { t } from '../../i18n'
import { formatDate, formatMoney, monthLabel } from '../../domain/format'
import { netWorthTimeline } from '../../domain/net-worth-timeline'
import { eventImpact } from '../../domain/milestone-impact'
import type { LifeEvent } from '../../domain/life-events'
import type { NetWorthPoint, Movement } from '../../domain/types'

const props = defineProps<{ history: NetWorthPoint[]; events: LifeEvent[]; movements: Movement[]; today: string }>()
const selectedId = ref<string | null>(null)
const hovered = ref<number | null>(null)
const data = computed(() => netWorthTimeline(props.history, props.events, props.today))
const selected = computed(() => data.value.events.find(e => e.event.id === selectedId.value))
const impact = computed(() => selected.value ? eventImpact({ ...selected.value.event, end: selected.value.end }, props.movements, props.today) : null)
const hasEstimate = computed(() => impact.value?.categories.some(c => c.baseline !== null))
const partialEstimate = computed(() => impact.value?.categories.some(c => c.baseline === null))
const W = 640, LEFT = 72, RIGHT = 16, TOP = 22, BOTTOM = 170
const x = (fraction: number) => LEFT + fraction * (W - LEFT - RIGHT)
const geometry = computed(() => {
  const values = data.value.points.map(p => p.total)
  const lo = values.length ? Math.min(...values) : 0, hi = values.length ? Math.max(...values) : 1
  const pad = (hi - lo || Math.abs(hi) || 1) * .15
  const min = lo - pad, max = hi + pad
  const y = (value: number) => TOP + (max - value) / (max - min) * (BOTTOM - TOP)
  return {
    points: data.value.points.map(p => ({ ...p, px: x(p.x), py: y(p.total) })),
    line: data.value.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.total)}`).join(' '),
    ticks: [min, (min + max) / 2, max].map(value => ({ value, y: y(value) })),
  }
})
const activePoint = computed(() => hovered.value === null ? null : geometry.value.points[hovered.value])
const select = (id: string) => { selectedId.value = selectedId.value === id ? null : id }
</script>

<template>
  <div class="combined">
    <p class="muted explanation">{{ t('Monthly net worth and milestones share the same dates. Correlation does not prove causation; estimated spending impact is not a balance adjustment.') }}</p>
    <div class="legend"><span class="line-key" />{{ t('Net worth') }} <span class="event-key" />{{ t('Milestones') }}</div>
    <figure v-if="data.points.length || data.events.length">
      <svg :viewBox="`0 0 ${W} 205`" role="img" :aria-label="t('Net worth and milestone timeline')">
        <template v-for="tick in geometry.ticks" :key="tick.value">
          <line :x1="LEFT" :x2="W - RIGHT" :y1="tick.y" :y2="tick.y" class="grid" />
          <text :x="LEFT - 8" :y="tick.y + 4" text-anchor="end">{{ formatMoney(tick.value) }}</text>
        </template>
        <rect v-if="selected" :x="x(selected.startX)" :y="TOP" :width="Math.max(2, x(selected.endX) - x(selected.startX))" :height="BOTTOM - TOP" class="window" />
        <text v-if="events.some(e => e.savingsGoal && e.start > today)" :x="W - RIGHT" y="15" text-anchor="end">{{ t('Future / planned — no projected balances') }}</text>
        <path v-if="data.points.length" :d="geometry.line" class="worth-line" />
        <g v-for="(point, i) in geometry.points" :key="point.month">
          <circle :cx="point.px" :cy="point.py" r="4" class="point" />
          <circle :cx="point.px" :cy="point.py" r="12" class="hit" @mouseenter="hovered = i" @mouseleave="hovered = null">
            <title>{{ monthLabel(point.month) }}: {{ formatMoney(point.total) }}</title>
          </circle>
          <text v-if="i === 0 || i === geometry.points.length - 1 || (geometry.points.length > 4 && i === Math.floor(geometry.points.length / 2))" :x="point.px" y="195" text-anchor="middle">{{ point.month }}</text>
        </g>
      </svg>
      <figcaption>{{ activePoint ? `${monthLabel(activePoint.month)}: ${formatMoney(activePoint.total)}` : t('Net worth by month') }}</figcaption>
    </figure>
    <div v-if="data.events.length" class="tracks" role="group" :aria-label="t('Select a milestone')">
      <button v-for="item in data.events" :key="item.event.id" type="button" class="track" :aria-pressed="selectedId === item.event.id" @click="select(item.event.id)">
        <span class="track-label">{{ item.event.label }} · {{ formatDate(item.event.start) }} <em v-if="item.event.start > today">{{ t('Planned') }}</em></span>
        <SavingsGoalProgress v-if="item.event.savingsGoal" :goal="item.event.savingsGoal" />
        <span class="track-axis" aria-hidden="true"><span class="bar" :style="{ left: `${item.startX * 100}%`, width: `${(item.endX - item.startX) * 100}%` }"><span class="marker" /></span></span>
      </button>
    </div>
    <p v-else class="muted">{{ t('No milestones in this history range. Add them in Milestones or choose a wider range.') }}</p>
    <article v-if="selected" class="detail" aria-live="polite">
      <h3>{{ selected.event.label }}</h3>
      <p>{{ formatDate(selected.event.start) }} — {{ formatDate(selected.end) }}</p>
      <SavingsGoalProgress v-if="selected.event.savingsGoal" :goal="selected.event.savingsGoal" />
      <template v-else>
      <template v-if="selected.comparison">
        <p><strong>{{ t('Observed net worth change') }}: {{ formatMoney(selected.comparison.change) }}</strong></p>
        <p>{{ monthLabel(selected.comparison.before.month) }}: {{ formatMoney(selected.comparison.before.total) }} → {{ monthLabel(selected.comparison.after.month) }}: {{ formatMoney(selected.comparison.after.total) }}</p>
      </template>
      <p v-else>{{ t('Not enough monthly snapshots to compare this milestone.') }}</p>
      <p>{{ t('Monthly snapshots compare the last month before the milestone with the last available month in its window, not exact daily balances.') }}</p>
      <p>{{ t('Estimated extra spending (positive) or relief (negative)') }}: <strong>{{ hasEstimate ? formatMoney(impact!.net) : t('Not enough history') }}</strong></p>
      <p v-if="hasEstimate && partialEstimate">{{ t('Partial estimate: some categories lack spending history.') }}</p>
      <p class="muted">{{ t('Estimate uses loaded spending against the median of the six months before the milestone; at least three months per category are required. Overlapping milestones must not be added together.') }}</p>
      </template>
    </article>
  </div>
</template>

<style scoped>
.combined { display: grid; gap: .75rem; }
p, figure, h3 { margin: 0; }
.explanation, .legend, figcaption, .detail { font-size: .85rem; }
.legend { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.line-key { width: 1.5rem; height: 3px; background: var(--accent); }
.event-key { margin-left: .75rem; width: .65rem; height: .65rem; background: var(--ink-soft); border-radius: 50%; }
svg { width: 100%; height: auto; display: block; }
text { fill: var(--ink-soft); font-size: 11px; }
.grid { stroke: var(--rule); stroke-dasharray: 3 4; }
.worth-line { stroke: var(--accent); stroke-width: 2.5; fill: none; stroke-linejoin: round; }
.point { fill: var(--accent); }
.hit { fill: transparent; }
.window { fill: var(--accent); opacity: .13; }
figcaption { min-height: 1.3em; color: var(--ink-soft); }
.tracks { display: grid; gap: .4rem; max-height: 18rem; overflow-y: auto; }
.track { display: block; text-align: left; width: 100%; padding: .4rem 0; background: transparent; border: 1px solid transparent; border-radius: 6px; cursor: pointer; }
.track:hover, .track[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
.track:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.track-label { display: block; padding: 0 .5rem; overflow-wrap: anywhere; font-size: .85rem; }
.track-axis { display: block; position: relative; height: 20px; margin-left: 11.25%; margin-right: 2.5%; }
.track-axis::before { content: ''; position: absolute; top: 10px; width: 100%; height: 1px; background: var(--rule); }
.bar { position: absolute; top: 7px; height: 7px; background: var(--ink-soft); border-radius: 4px; min-width: 2px; }
.marker { position: absolute; left: -4px; top: -1px; width: 9px; height: 9px; border-radius: 50%; background: var(--ink-soft); }
.track[aria-pressed='true'] .bar, .track[aria-pressed='true'] .marker { background: var(--accent); }
.detail { padding: 1rem; border: 1px solid var(--rule); border-radius: 8px; display: grid; gap: .5rem; overflow-wrap: anywhere; }
</style>
