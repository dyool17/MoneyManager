<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t, intlLocale } from '../../i18n'
import { opportunityTitle, opportunityDetail } from './opportunity-text'
import { useSort } from '../../composables/sort'
import SortTh from '../SortTh.vue'
import type { Insights } from '../../domain/insights'
import { simulateCut } from '../../domain/health'
import { formatMoney } from '../../domain/format'
import AiButton from '../AiButton.vue'
import { useHealth } from './useHealth'
import { useHistory } from '../../stores/history'

const props = defineProps<{ r: Insights; first: string; last: string }>()
const history = useHistory()
const r = computed(() => props.r)
const { cushion } = useHealth(r, computed(() => history.movements), computed(() => props.first), computed(() => props.last))

const totalOpportunity = computed(() => props.r.opportunities.filter((o) => o.kind !== 'overspent-month').reduce((a, o) => a + o.monthly, 0))
const GLYPH: Record<string, string> = { rising: '↗', recurring: '↻', 'small-purchases': '⋯', 'overspent-month': '!' }
const KIND_LABEL: Record<string, string> = { rising: 'Rising', recurring: 'Repeating', 'small-purchases': 'Small purchases', 'overspent-month': 'Overspent' }
const recurringSort = useSort(() => props.r.recurring, { label: (c) => c.label, months: (c) => c.months, amount: (c) => c.amount })

/* Simulator: monthly average per category over the span. */
const monthlyByCategory = computed(() => Object.fromEntries(props.r.categories.map((c) => [c.name, c.total / (props.r.months.length || 1)])))
const candidates = computed(() => props.r.categories.slice(0, 8))
const chosen = ref<string[]>([])
/** Default picks skip categories that are mostly fixed bills, which are hard to cut. */
function repeatingShare(name: string, total: number) {
  const fixed = props.r.recurring.filter((rc) => rc.category === name).reduce((a, rc) => a + rc.amount * rc.months, 0)
  return total > 0 ? fixed / total : 0
}
watch(candidates, (c) => { if (!chosen.value.length || !chosen.value.every((n) => c.some((x) => x.name === n))) chosen.value = c.filter((x) => repeatingShare(x.name, x.total) < 0.5).slice(0, 3).map((x) => x.name) }, { immediate: true })
const percent = ref(15)
const saving = computed(() => simulateCut(monthlyByCategory.value, chosen.value, percent.value))
</script>

<template>
  <div class="an-stack">
    <div class="card">
      <div class="card-head">
        <div>
          <h2>{{ t('Ways to spend less') }}</h2>
          <small v-if="totalOpportunity" class="muted">{{ t('Up to {amount}/mo to review', { amount: formatMoney(totalOpportunity) }) }}</small>
        </div>
        <AiButton :question="t('Which of these opportunities would save me the most with the least effort?')" :about="t('Ways to spend less')" compact>{{ t('Why?') }}</AiButton>
      </div>
      <p v-if="!r.opportunities.length" class="muted">{{ t('Nothing stands out. Nice.') }}</p>
      <ul class="an-list">
        <li v-for="(o, i) in r.opportunities" :key="i" class="an-row op-row">
          <div class="op-main">
            <span class="op-icon" aria-hidden="true">{{ GLYPH[o.kind] }}</span>
            <div>
              <strong>{{ opportunityTitle(o) }}</strong>
              <small class="muted op-kind">{{ t(KIND_LABEL[o.kind]!) }}</small>
              <p>{{ opportunityDetail(o) }}</p>
            </div>
          </div>
          <span class="num amount">{{ formatMoney(o.monthly) }}<small class="muted">{{ o.kind === 'overspent-month' ? t(' over') : t('/mo') }}</small></span>
        </li>
      </ul>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2>{{ t('Repeating charges') }}</h2>
          <small class="muted">{{ t('{n} found', { n: r.recurring.length.toLocaleString(intlLocale()) }) }}</small>
        </div>
        <AiButton :question="t('Which of my repeating charges look like subscriptions I could cancel?')" :about="t('Repeating charges')">{{ t('Which can I cancel?') }}</AiButton>
      </div>
      <p v-if="!r.recurring.length" class="muted">{{ t('No repeating charges found in this span.') }}</p>
      <div v-else class="an-scroll">
        <table class="an-table">
          <thead><tr><SortTh :sort="recurringSort" by="label">{{ t('Charge') }}</SortTh><SortTh :sort="recurringSort" by="months" num>{{ t('Months') }}</SortTh><SortTh :sort="recurringSort" by="amount" num>{{ t('Amount') }}</SortTh></tr></thead>
          <tbody>
            <tr v-for="c in recurringSort.sorted.value" :key="c.label + c.amount">
              <th scope="row">{{ c.label }}<small>{{ c.category }}</small></th>
              <td class="amount num muted">{{ t('{n} months', { n: c.months.toLocaleString(intlLocale()) }) }}</td>
              <td class="amount num">{{ formatMoney(c.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>{{ t('What if you cut back?') }}</h2>
        <AiButton :question="t('Which categories could I realistically cut back, and by how much?')" :about="t('Cut-back simulator')" compact>{{ t('Suggest') }}</AiButton>
      </div>
      <div class="op-chips" role="group" :aria-label="t('Categories to cut')">
        <label v-for="c in candidates" :key="c.name" :class="['pill', { on: chosen.includes(c.name) }]">
          <input v-model="chosen" type="checkbox" :value="c.name" /> {{ c.name }}
        </label>
      </div>
      <label class="op-slider">{{ t('Cut by') }} <b>{{ percent.toLocaleString(intlLocale()) }}%</b>
        <input v-model.number="percent" type="range" min="5" max="50" step="5" />
      </label>
      <div class="op-result">
        <div><span class="label">{{ t('Per month') }}</span><strong class="big num">{{ formatMoney(saving.monthly) }}</strong></div>
        <div><span class="label">{{ t('Per year') }}</span><strong class="big num">{{ formatMoney(saving.yearly) }}</strong></div>
      </div>
      <p v-if="cushion !== null && saving.monthly > 0 && r.averageExpense" class="muted an-note">
        {{ t('Saved for a year, that adds {n} months to your cushion.', { n: (saving.yearly / r.averageExpense).toLocaleString(intlLocale(), { maximumFractionDigits: 1 }) }) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.op-row { align-items: start; }
.op-main { display: flex; gap: 0.75rem; align-items: flex-start; min-width: 0; }
.op-icon { flex: none; width: 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-ink); font-weight: 600; }
.op-kind { margin-left: 0.5rem; }
.op-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem; }
.op-chips .pill { cursor: pointer; border: 1px solid var(--rule); background: transparent; position: relative; }
.op-chips .pill.on { border-color: var(--ink); }
.op-chips input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.op-chips .pill:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.op-slider { display: grid; gap: 0.3rem; font-size: 0.9rem; max-width: 26rem; }
.op-slider input { width: 100%; accent-color: var(--accent); }
.op-result { display: flex; gap: 3rem; flex-wrap: wrap; margin: 1rem 0 0.2rem; }
.op-result div { display: grid; }
</style>
