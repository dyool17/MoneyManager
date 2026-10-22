<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, intlLocale } from '../i18n'
import { formatDate, formatMoney } from '../domain/format'
import { weekday, type DayTotal } from '../domain/insights'

const props = defineProps<{ days: DayTotal[]; first: string; last: string }>()

const DAY = 86_400_000
const toUtc = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) }
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10)
const hover = ref<{ date: string; total: number; count: number } | null>(null)

/** One column per week, Monday on top, five shades of the expense color by quantile. */
const grid = computed(() => {
  const byDate = new Map(props.days.map((d) => [d.date, d]))
  const sorted = props.days.map((d) => d.total).filter((v) => v > 0).sort((a, b) => a - b)
  const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))] ?? 0
  const cuts = [q(0.25), q(0.5), q(0.75), q(0.93)]
  const start = toUtc(props.first) - weekday(props.first) * DAY
  const end = toUtc(props.last)
  const weeks: { date: string; total: number; count: number; level: number; out: boolean }[][] = []
  for (let t = start; t <= end; t += DAY) {
    const date = toIso(t)
    const d = byDate.get(date)
    const total = d?.total ?? 0
    const level = total <= 0 ? 0 : 1 + cuts.filter((c) => total > c).length
    if (weekday(date) === 0) weeks.push([])
    weeks[weeks.length - 1]!.push({ date, total, count: d?.count ?? 0, level, out: date < props.first })
  }
  return weeks
})
const LABELS = computed(() => Array.from({ length: 7 }, (_, i) => i % 2 === 0
  ? new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(intlLocale(), { weekday: 'short', timeZone: 'UTC' }) : ''))
</script>

<template>
  <figure class="cal" @mouseleave="hover = null">
    <div class="wrap" aria-hidden="true">
      <div class="labels"><span v-for="(l, i) in LABELS" :key="i">{{ l }}</span></div>
      <div class="weeks">
        <div v-for="(w, i) in grid" :key="i" class="week">
          <span v-for="d in w" :key="d.date" :class="['cell', `l${d.level}`, { out: d.out }]"
            @mouseenter="hover = d" />
        </div>
      </div>
    </div>
    <figcaption>
      <span v-if="hover"><b>{{ formatDate(hover.date) }}</b> · {{ t('{amount} in {n} {kind}', { amount: formatMoney(hover.total), n: hover.count.toLocaleString(intlLocale()), kind: hover.count === 1 ? t('expense') : t('expenses') }) }}</span>
      <span v-else>{{ t('Hover a day to see what you spent.') }}</span>
      <span class="scale">{{ t('Less') }} <i v-for="l in 6" :key="l" :class="['cell', `l${l - 1}`]" /> {{ t('More') }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.cal { margin: 0; }
.wrap { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.25rem; }
.labels { display: grid; grid-template-rows: repeat(7, 13px); gap: 3px; font-size: 10px; color: var(--ink-soft); line-height: 13px; }
.weeks { display: flex; gap: 3px; }
.week { display: grid; grid-template-rows: repeat(7, 13px); gap: 3px; }
.cell { display: inline-block; width: 13px; height: 13px; border-radius: 3px; background: var(--mist); outline: 1px solid var(--rule); outline-offset: -1px; }
.cell.out { visibility: hidden; }
.l1 { background: color-mix(in oklab, var(--expense) 22%, var(--paper)); outline: none; }
.l2 { background: color-mix(in oklab, var(--expense) 42%, var(--paper)); outline: none; }
.l3 { background: color-mix(in oklab, var(--expense) 65%, var(--paper)); outline: none; }
.l4 { background: color-mix(in oklab, var(--expense) 85%, var(--paper)); outline: none; }
.l5 { background: var(--expense); outline: none; }
.week .cell:hover { outline: 2px solid var(--ink); outline-offset: 0; }
figcaption { display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.5rem; font-size: 0.82rem; color: var(--ink-soft); min-height: 1.3rem; }
.scale { display: inline-flex; align-items: center; gap: 3px; }
.scale .cell { width: 11px; height: 11px; }
</style>
