<script setup lang="ts">
import { computed } from 'vue'
import { useSort } from '../../composables/sort'
import SortTh from '../SortTh.vue'
import { useHistory } from '../../stores/history'
import { budgetHistory } from '../../domain/budget-history'
import type { Insights } from '../../domain/insights'
import { formatDate, formatMoney } from '../../domain/format'
import BarChart from '../BarChart.vue'
import AiButton from '../AiButton.vue'
import { useHealth } from './useHealth'

const props = defineProps<{ r: Insights; first: string; last: string }>()
const history = useHistory()
const r = computed(() => props.r)
const {
  groups, liquid, toggle, cushion, cardDebt, averageIncome, odd, projection,
  commitments, committedTotal, nextMonths,
} = useHealth(r, computed(() => history.movements), computed(() => props.first), computed(() => props.last))

const projMax = computed(() => Math.max(1, projection.value?.projected ?? 0, projection.value?.average ?? 0, projection.value?.income ?? 0))
const shortMonth = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'short' })
const commitmentRows = computed(() => commitments.value.map((c) => ({ label: shortMonth(c.month), values: { total: c.total } })))

const budgetRecord = computed(() => budgetHistory(history.budgets.filter((b) => b.month >= props.first.slice(0, 7))))
const monthName = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
const budgetSort = useSort(() => budgetRecord.value.records, { name: (b) => b.name, over: (b) => b.over, excess: (b) => b.averageOver, worst: (b) => b.worst?.total ?? null })
const oddSort = useSort(() => odd.value, { name: (o) => o.movement.content || o.movement.subcategoryName || o.movement.categoryName, times: (o) => o.times, amount: (o) => o.movement.amount, date: (o) => o.movement.date })

const cushionTone = computed(() => (cushion.value === null ? '' : cushion.value >= 6 ? '' : cushion.value >= 3 ? 'tone-1' : 'tone-2'))
const projTone = computed(() => (!projection.value ? '' : projection.value.projected > projection.value.income ? 'tone-2' : projection.value.projected > projection.value.average ? 'tone-1' : ''))
const debtTone = computed(() => (cardDebt.value === 0 ? '' : cardDebt.value > averageIncome.value * 0.5 ? 'tone-2' : 'tone-1'))
</script>

<template>
  <div class="an-stack">
    <div class="an-grid3">
      <div class="card">
        <div class="card-head"><span class="label">Emergency cushion</span><AiButton question="Why is my emergency cushion what it is, and how can I grow it?" about="Emergency cushion" compact>Why?</AiButton></div>
        <p :class="['big', 'num', cushionTone]">{{ cushion === null ? '—' : `${cushion.toLocaleString(undefined, { maximumFractionDigits: 1 })} months` }}</p>
        <p class="muted an-note">
          <template v-if="cushion === null">No balances or spending to measure yet.</template>
          <template v-else>{{ formatMoney(liquid) }} spendable ÷ {{ formatMoney(r.averageExpense) }} average monthly spend. Aim for 3 to 6 months.</template>
        </p>
        <details class="rk-details">
          <summary>Which accounts count ({{ groups.filter((g) => g.liquid).length }} of {{ groups.length }})</summary>
          <label v-for="g in groups" :key="g.id" class="rk-check">
            <input type="checkbox" :checked="g.liquid" @change="toggle(g.id, ($event.target as HTMLInputElement).checked)" />
            {{ g.name }} <span class="amount num muted">{{ formatMoney(g.balance) }}</span>
          </label>
        </details>
      </div>

      <div class="card">
        <div class="card-head"><span class="label">Month-end projection</span><AiButton question="Why is my month-end spending projection what it is?" about="Month-end projection" compact>Why?</AiButton></div>
        <template v-if="projection">
          <p :class="['big', 'num', projTone]">{{ formatMoney(projection.projected) }}</p>
          <p class="muted an-note">Spent {{ formatMoney(projection.spent) }} with {{ Math.round(projection.elapsed * 100) }}% of the month gone.</p>
          <div class="rk-proj">
            <div v-for="row in [
              { label: 'Projected', value: projection.projected, color: 'var(--expense)' },
              { label: 'Your average', value: projection.average, color: 'var(--neutral-mark)' },
              { label: 'Income', value: projection.income, color: 'var(--accent)' },
            ]" :key="row.label" class="rk-proj-row">
              <span>{{ row.label }}</span>
              <div class="track"><span :style="{ width: `${(row.value / projMax) * 100}%`, background: row.color }" /></div>
              <b class="amount num">{{ formatMoney(row.value) }}</b>
            </div>
          </div>
        </template>
        <p v-else class="muted an-note">Needs at least one earlier month.</p>
      </div>

      <div class="card">
        <div class="card-head"><span class="label">Debt load</span><AiButton question="Why is my debt load what it is, and what would reduce it?" about="Debt load" compact>Why?</AiButton></div>
        <p :class="['big', 'num', debtTone]">{{ averageIncome > 0 ? `${Math.round((cardDebt / averageIncome) * 100)}%` : '—' }}</p>
        <p class="muted an-note">{{ formatMoney(cardDebt) }} owed against {{ formatMoney(averageIncome) }} average monthly income. Under 30% is comfortable.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2>Already committed</h2>
          <small v-if="committedTotal" class="muted">{{ formatMoney(committedTotal) }} scheduled in the next 12 months · next 3 months average {{ formatMoney(nextMonths) }}<template v-if="averageIncome"> ({{ Math.round((nextMonths / averageIncome) * 100) }}% of income)</template></small>
        </div>
        <div class="actions">
          <AiButton v-if="committedTotal" question="Explain this chart" about="Expenses already scheduled per month" compact>Explain</AiButton>
          <AiButton question="Which of my already committed future expenses matter most for my budget?" about="Already committed expenses" compact>Why?</AiButton>
        </div>
      </div>
      <p v-if="!committedTotal" class="muted">No future expenses are scheduled. Installments and repeating entries saved ahead of time show up here.</p>
      <BarChart v-else :rows="commitmentRows" :series="[{ key: 'total', label: 'Scheduled', color: 'var(--accent)' }]" label="Expenses scheduled per month" :height="170" />
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2>Budget track record</h2>
          <small v-if="budgetRecord.overallHitRate !== null" class="muted">Stayed within budget {{ Math.round(budgetRecord.overallHitRate * 100) }}% of the time across {{ budgetRecord.months }} months</small>
        </div>
        <AiButton question="Which budgets do I keep going over, and why?" about="Budget track record" compact>Why?</AiButton>
      </div>
      <p v-if="history.budgetState === 'unavailable'" class="muted">Budgets are read from the phone. Connect it and press Reload.</p>
      <p v-else-if="history.budgetState === 'loading'" class="muted">Reading one summary per month…</p>
      <p v-else-if="history.budgetState === 'failed'" class="muted">Could not read past budgets. The other reports are not affected.</p>
      <p v-else-if="!budgetRecord.records.length" class="muted">No budgets set in these months.</p>
      <div v-else class="an-scroll">
        <table class="an-table">
          <thead><tr><SortTh :sort="budgetSort" by="name">Category</SortTh><SortTh :sort="budgetSort" by="over">Months over</SortTh><SortTh :sort="budgetSort" by="excess" num>Average excess</SortTh><SortTh :sort="budgetSort" by="worst">Worst month</SortTh></tr></thead>
          <tbody>
            <tr v-for="b in budgetSort.sorted.value" :key="b.name">
              <th scope="row">{{ b.name }}</th>
              <td>
                <span class="rk-dots" role="img" :aria-label="`${b.over} of ${b.months} months over`"><i v-for="i in b.months" :key="i" :class="{ over: i <= b.over }" /></span>
                {{ b.over }} of {{ b.months }}
              </td>
              <td :class="['amount', 'num', b.over ? 'expense' : 'muted']">{{ b.over ? formatMoney(b.averageOver) : '—' }}</td>
              <td class="muted">{{ b.worst ? `${monthName(b.worst.month)} · ${formatMoney(b.worst.total)} of ${formatMoney(b.worst.budget)}` : 'Never over' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2>Unusual expenses</h2>
          <small class="muted">More than two standard deviations above what that category usually costs.</small>
        </div>
        <AiButton question="Why were my unusual expenses flagged, and are any of them worth a closer look?" about="Unusual expenses" compact>Why?</AiButton>
      </div>
      <p v-if="!odd.length" class="muted">Nothing unusual.</p>
      <div v-else class="an-scroll">
        <table class="an-table">
          <thead><tr><SortTh :sort="oddSort" by="name">Expense</SortTh><SortTh :sort="oddSort" by="times" num>vs typical</SortTh><SortTh :sort="oddSort" by="amount" num>Amount</SortTh></tr></thead>
          <tbody>
            <tr v-for="o in oddSort.sorted.value" :key="o.movement.id">
              <th scope="row">{{ o.movement.content || o.movement.subcategoryName || o.movement.categoryName }}<small>{{ formatDate(o.movement.date) }} · {{ o.movement.subcategoryName || o.movement.categoryName }}</small></th>
              <td class="amount num muted">{{ o.times }}× typical</td>
              <td class="amount num expense">{{ formatMoney(o.movement.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.big { margin: 0.5rem 0 0.25rem; font-size: 1.9rem; }
.rk-details { margin-top: 0.6rem; }
.rk-details summary { cursor: pointer; color: var(--accent-ink); font-size: 0.86rem; }
.rk-check { display: flex; gap: 0.5rem; align-items: center; font-size: 0.86rem; padding: 0.25rem 0; }
.rk-check .amount { margin-left: auto; }
.rk-proj { display: grid; gap: 0.45rem; margin-top: 0.7rem; }
.rk-proj-row { display: grid; grid-template-columns: 6.5rem 1fr auto; gap: 0.6rem; align-items: center; font-size: 0.84rem; }
.rk-dots { display: inline-flex; gap: 2px; margin-right: 0.4rem; vertical-align: middle; }
.rk-dots i { width: 6px; height: 10px; border-radius: 2px; background: var(--track); }
.rk-dots i.over { background: var(--expense); }
</style>
