<script setup lang="ts">
import SavingsGoalProgress from '../milestones/SavingsGoalProgress.vue'
import { useSavingsGoals } from '../../composables/savingsGoals'
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
const W = 800, LEFT = 100, RIGHT = 100, TOP = 22, BOTTOM = 170
const savings = useSavingsGoals()
const markers = computed(() => {
  const laneEnds: number[] = []
  return data.value.events.map(item => {
    const px = x(item.startX)
    let lane = laneEnds.findIndex(end => end + 12 < px - 85)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = px + 85
    const progress = item.event.savingsGoal ? savings.progress(item.event.savingsGoal) : null
    return { ...item, px, lane, percent: progress ? Math.round(progress.percent) : null }
  })
})
const chartHeight = computed(() => 250 + (Math.max(0, ...markers.value.map(m => m.lane)) + 1) * 72)
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
    <p v-if="!data.points.length" class="muted">{{ t('Historical balances unavailable. Dated milestones remain visible.') }}</p>
    <p v-if="data.skipped" class="muted">{{ t('Unsupported history observations skipped: {n}', { n: data.skipped }) }}</p>
    <figure v-if="data.points.length || data.events.length">
      <div class="calendar-scroll" tabindex="0" :aria-label="t('Net worth and milestone timeline')">
      <svg :viewBox="`0 0 ${W} ${chartHeight}`" role="group" :aria-label="t('Net worth and milestone timeline')">
        <template v-for="tick in data.points.length ? geometry.ticks : []" :key="tick.value">
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
        <line :x1="LEFT" :x2="W - RIGHT + 20" y1="215" y2="215" class="calendar-rail" />
        <path :d="`M${W - RIGHT + 12},210 l8,5 l-8,5`" class="calendar-rail" />
        <g v-for="year in data.years" :key="year.year">
          <line :x1="x(year.x)" :x2="x(year.x)" y1="208" y2="222" class="calendar-rail" />
          <text :x="x(year.x)" y="239" text-anchor="middle">{{ year.year }}</text>
        </g>
        <g v-for="item in markers" :key="item.event.id" class="milestone-marker">
          <line :x1="item.px" :x2="item.px" :y1="TOP" :y2="250 + item.lane * 72" class="marker-guide" />
          <circle :cx="item.px" cy="215" r="6" class="point" />
          <foreignObject :x="item.px - 85" :y="250 + item.lane * 72" width="170" height="68">
            <button type="button" class="milestone-select" :aria-pressed="selectedId === item.event.id" @click="select(item.event.id)">
              <strong>{{ item.event.label }}</strong>
              <span>{{ formatDate(item.event.start) }}<template v-if="item.event.start > today"> · {{ t('Planned') }}</template></span>
              <span v-if="item.event.savingsGoal">{{ t('Savings goal') }} · {{ item.percent === null ? '—' : `${item.percent}%` }}</span>
            </button>
          </foreignObject>
        </g>
      </svg>
      </div>
      <figcaption>{{ activePoint ? `${monthLabel(activePoint.month)}: ${formatMoney(activePoint.total)}` : t('Net worth by month') }}</figcaption>
    </figure>
    <p v-if="data.events.length" class="muted">{{ t('Select a milestone') }}</p>
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
.combined { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: .75rem; }
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
.calendar-scroll { min-width: 0; max-width: 100%; overflow: auto; max-height: 32rem; }
.calendar-scroll svg { min-width: 800px; }
.calendar-rail { stroke: var(--ink-soft); fill: none; stroke-width: 2; }
.marker-guide { stroke: var(--ink-soft); stroke-dasharray: 2 4; opacity: .45; }
.milestone-select { box-sizing: border-box; width: 166px; height: 64px; margin: 2px; padding: 4px 6px; display: flex; flex-direction: column; text-align: left; justify-content: center; background: var(--paper); border: 1px solid var(--rule); border-radius: 6px; cursor: pointer; font-size: 11px; }
.milestone-select strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.milestone-select:hover, .milestone-select[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
.milestone-select:focus-visible { outline: 2px solid var(--accent); }
.detail { padding: 1rem; border: 1px solid var(--rule); border-radius: 8px; display: grid; gap: .5rem; overflow-wrap: anywhere; }
</style>
