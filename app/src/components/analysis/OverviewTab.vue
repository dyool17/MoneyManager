<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t, intlLocale } from '../../i18n'
import type { Insights } from '../../domain/insights'
import { categoryShares } from '../../domain/insights'
import { formatMoney, monthLabel } from '../../domain/format'
import { useHistory } from '../../stores/history'
import { useCountUp } from '../../composables/countUp'
import BarChart from '../BarChart.vue'
import AiButton from '../AiButton.vue'
import { useHealth } from './useHealth'
import MonthlyReport from './MonthlyReport.vue'
import GoalPlanner from './GoalPlanner.vue'

const props = defineProps<{ r: Insights; first: string; last: string }>()
const emit = defineEmits<{ tab: [tab: 'risks' | 'opportunities'] }>()
const history = useHistory()
const leftOver = computed(() => props.r.months.reduce((a, m) => a + m.income, 0) / (props.r.months.length || 1) - props.r.averageExpense)
const r = computed(() => props.r)
const { score, word, unknown, topRisks } = useHealth(r, computed(() => history.movements), computed(() => props.first), computed(() => props.last))

const scoreShown = useCountUp(computed(() => score.value.total))
const averageShown = useCountUp(computed(() => props.r.averageExpense))
const CIRC = 314
const tone = computed(() => (score.value.total >= 60 ? 'good' : score.value.total >= 40 ? 'fair' : 'weak'))

/* Income vs spending */
const selectedMonth = ref<number | null>(null)
watch(() => props.first, () => { selectedMonth.value = null })
const shortMonth = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString(intlLocale(), { month: 'short' })
const monthRows = computed(() => props.r.months.map((m) => ({ label: shortMonth(m.month), values: { income: m.income, expense: m.expense } })))
const SERIES = computed(() => [
  { key: 'income', label: t('Income'), color: 'var(--neutral-mark)' },
  { key: 'expense', label: t('Spending'), color: 'var(--accent)' },
])
const overIdx = computed(() => new Set(props.r.months.flatMap((m, i) => (m.expense > m.income ? [i] : []))))
const colorFor = (i: number, key: string) => (key === 'expense' && overIdx.value.has(i) ? 'var(--expense)' : undefined)
const notes = computed(() => props.r.months.map((_, i) => (overIdx.value.has(i) ? t('Spent more than earned') : null)))

/* Categories for the clicked month, or the whole span. */
const focusMonth = computed(() => (selectedMonth.value === null ? null : props.r.months[selectedMonth.value]?.month ?? null))
const categories = computed(() => {
  const list = focusMonth.value
    ? categoryShares(history.movements.filter((m) => m.date.startsWith(focusMonth.value!)))
    : props.r.categories
  const top = list.slice(0, 8)
  const rest = list.slice(8)
  if (rest.length) top.push({ name: t('{n} more', { n: rest.length }), total: rest.reduce((a, c) => a + c.total, 0), share: rest.reduce((a, c) => a + c.share, 0), count: rest.reduce((a, c) => a + c.count, 0) })
  return top
})
const catMax = computed(() => Math.max(1, ...categories.value.map((c) => c.total)))
const changeOf = (name: string) => props.r.changes.find((c) => c.name === name)

const worst = computed(() => [...props.r.months].sort((a, b) => b.expense - a.expense)[0])
const best = computed(() => [...props.r.months].sort((a, b) => b.net - a.net)[0])
const topOpps = computed(() => props.r.opportunities.slice(0, 3))
const oppLabel = (o: Insights['opportunities'][number]) => (o.month ? t('Spent more than earned in {month}', { month: monthLabel(o.month + '-01') }) : o.title)
</script>

<template>
  <div class="an-stack">
    <div class="card ov-score">
      <div class="dial" :class="tone" role="img" :aria-label="t('Health score {score} of 100, {word}', { score: score.total, word })">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="50" class="ring" />
          <circle cx="60" cy="60" r="50" class="arc" :style="{ strokeDasharray: `${(score.total / 100) * CIRC} ${CIRC}` }" />
        </svg>
        <div><strong class="num">{{ Math.round(scoreShown) }}</strong><span>{{ t('of 100') }}</span></div>
      </div>
      <div class="ov-parts">
        <div class="card-head">
          <div>
            <span class="label">{{ t('Financial health') }}</span>
            <h2 class="num ov-word">{{ word }}</h2>
          </div>
          <AiButton question="Why is my financial health score what it is, and what would raise it most?" :about="t('Financial health score')" compact>{{ t('Why?') }}</AiButton>
        </div>
        <div v-for="p in score.parts" :key="p.key" class="ov-part" :title="p.detail">
          <span>{{ p.label }}</span>
          <div class="track" role="img" :aria-label="unknown.has(p.key) ? t('Unknown') : t('{points} of {max} points', { points: p.points, max: p.max })"><span :style="{ width: unknown.has(p.key) ? '0%' : `${(p.points / p.max) * 100}%` }" /></div>
          <b class="num">{{ unknown.has(p.key) ? '?' : p.points }}/{{ p.max }}</b>
        </div>
        <small class="muted">{{ t('Fixed weights. A "?" means there is not enough data to score that part yet. Hover a line to see how it is scored.') }}</small>
      </div>
    </div>

    <div class="ov-tiles">
      <div class="card"><span class="label">{{ t('Average spent per month') }}</span><p class="big num">{{ formatMoney(averageShown) }}</p></div>
      <div class="card"><span class="label">{{ t('Saved of what came in') }}</span><p :class="['big', 'num', (r.savingsRate ?? 0) >= 0 ? '' : 'expense']">{{ r.savingsRate === null ? '—' : `${Math.round(r.savingsRate * 1000) / 10}%` }}</p></div>
      <div v-if="worst" class="card"><span class="label">{{ t('Highest spending month') }}</span><p class="big num">{{ monthLabel(worst.month + '-01') }}</p><small class="amount expense">{{ formatMoney(worst.expense) }}</small></div>
      <div v-if="best" class="card"><span class="label">{{ t('Best month to save') }}</span><p class="big num">{{ monthLabel(best.month + '-01') }}</p><small class="amount">{{ t('{amount} left over', { amount: formatMoney(best.net) }) }}</small></div>
    </div>

    <div class="an-grid2 ov-main">
      <div class="card">
        <div class="card-head">
          <div>
            <h2>{{ t('Income and spending by month') }}</h2>
            <small class="muted">{{ t('Click a month to see its categories.') }}</small>
          </div>
          <AiButton question="Explain this chart" :about="t('Income and spending by month')" compact>{{ t('Explain') }}</AiButton>
        </div>
        <BarChart :rows="monthRows" :series="SERIES" :label="t('Income and spending by month')" :selected="selectedMonth" :color-for="colorFor" :notes="notes"
          :extra-legend="overIdx.size ? [{ label: t('Spent more than earned'), color: 'var(--expense)' }] : []" @select="selectedMonth = $event" />
      </div>

      <div class="card">
        <div class="card-head">
          <h2>{{ t('Where the money goes') }}</h2>
          <button v-if="focusMonth" type="button" class="pill" @click="selectedMonth = null">{{ monthLabel(focusMonth + '-01') }} ✕</button>
        </div>
        <p v-if="!categories.length" class="muted">{{ t('No spending in this span.') }}</p>
        <ol class="an-list">
          <li v-for="c in categories" :key="c.name" class="ov-cat">
            <div class="ov-cat-row">
              <span>{{ c.name }} <small v-if="'group' in c && c.group" class="muted">{{ c.group }}</small></span>
              <span class="amount num">{{ formatMoney(c.total) }}</span>
            </div>
            <div class="track"><span :style="{ width: `${(c.total / catMax) * 100}%` }" /></div>
            <small class="muted">
              {{ Math.round(c.share * 100) }}% · {{ c.count }} {{ c.count === 1 ? t('expense') : t('expenses') }}
              <template v-if="!focusMonth && changeOf(c.name)?.previous && Math.abs(changeOf(c.name)!.change) >= 1">
                · {{ changeOf(c.name)!.change > 0 ? t('▲ up') : t('▼ down') }} {{ t('{amount}/mo vs prior 3', { amount: formatMoney(Math.abs(changeOf(c.name)!.change)) }) }}
              </template>
            </small>
          </li>
        </ol>
      </div>
    </div>

    <div class="an-grid2">
      <div class="card">
        <div class="card-head"><h2>{{ t('Risks') }}</h2><button type="button" @click="emit('tab', 'risks')">{{ t('See all risks') }}</button></div>
        <p v-if="!topRisks.length" class="muted">{{ t('Nothing stands out. Nice.') }}</p>
        <ul class="an-list">
          <li v-for="i in topRisks" :key="i.key" class="an-row">
            <div><strong>{{ i.title }}</strong><p>{{ i.detail }}</p></div>
            <span :class="['num', `tone-${i.severity}`]">{{ i.value }}</span>
          </li>
        </ul>
      </div>
      <div class="card">
        <div class="card-head"><h2>{{ t('Opportunities') }}</h2><button type="button" @click="emit('tab', 'opportunities')">{{ t('See all opportunities') }}</button></div>
        <p v-if="!topOpps.length" class="muted">{{ t('Nothing stands out. Nice.') }}</p>
        <ul class="an-list">
          <li v-for="(o, i) in topOpps" :key="i" class="an-row">
            <div><strong>{{ oppLabel(o) }}</strong><p>{{ o.detail }}</p></div>
            <span class="num amount">{{ formatMoney(o.monthly) }}<small class="muted">{{ o.kind === 'overspent-month' ? t(' over') : t('/mo') }}</small></span>
          </li>
        </ul>
      </div>
    </div>

    <div class="ov-ai">
      <MonthlyReport :months="r.months" :today="last" class="ov-report" />
      <GoalPlanner :today="last" :left-over="leftOver" class="ov-goal" />
    </div>
  </div>
</template>

<style scoped>
.ov-ai { display: flex; flex-wrap: wrap; gap: 1rem; align-items: stretch; }
.ov-report { flex: 1.4 1 460px; }
.ov-goal { flex: 1 1 300px; }
.ov-score { display: grid; grid-template-columns: auto 1fr; gap: 2.5rem; align-items: center; }
.dial { position: relative; width: 150px; height: 150px; }
.dial svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring { fill: none; stroke: var(--track); stroke-width: 9; }
.arc { fill: none; stroke-width: 9; stroke-linecap: round; transition: stroke-dasharray 0.8s ease; stroke: var(--accent); }
.fair .arc { stroke: var(--warn-ink); }
.weak .arc { stroke: var(--expense); }
.dial > div { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
.dial strong { font-size: 2.6rem; font-weight: 600; line-height: 1; }
.dial span { color: var(--ink-soft); font-size: 0.8rem; }
.ov-parts { display: grid; gap: 0.55rem; min-width: 0; }
.ov-parts .card-head { margin-bottom: 0.2rem; }
.ov-word { margin: 0.1rem 0 0; font-size: 1.5rem; font-weight: 600; }
.ov-part { display: grid; grid-template-columns: minmax(7rem, 11rem) 1fr 3.2rem; gap: 0.75rem; align-items: center; font-size: 0.9rem; cursor: help; }
.ov-part b { text-align: right; font-weight: 500; }
.ov-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.25rem; }
.ov-tiles .big { margin: 0.35rem 0 0.1rem; font-size: 1.5rem; }
.ov-main { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
.ov-cat { display: grid; gap: 0.3rem; padding: 0.35rem 0; }
.ov-cat-row { display: flex; justify-content: space-between; gap: 1rem; }
@media (max-width: 1000px) {
  .ov-score { grid-template-columns: 1fr; justify-items: center; gap: 1.25rem; }
  .ov-parts { width: 100%; }
  .ov-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ov-main { grid-template-columns: 1fr; }
}
@media (max-width: 560px) { .ov-part { grid-template-columns: 6.5rem 1fr 3rem; } }
</style>
