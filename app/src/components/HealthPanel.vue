<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSession } from '../stores/session'
import { useAccountMetadata } from '../stores/metadata'
import { useHistory } from '../stores/history'
import { budgetHistory } from '../domain/budget-history'
import type { Insights } from '../domain/insights'
import type { Movement } from '../domain/types'
import {
  cushionMonths, futureCommitments, greenStreak, healthScore, isLikelyLiquid, mainGroupShares,
  outliers, projectMonth, simulateCut, volatility,
} from '../domain/health'
import { formatDate, formatMoney } from '../domain/format'
import BarChart from './BarChart.vue'

const props = defineProps<{ r: Insights; movements: Movement[]; first: string; last: string }>()
const session = useSession()
const metadata = useAccountMetadata()
const history = useHistory()
const today = computed(() => props.last)

/* Emergency cushion: spendable groups are a per-viewer choice, remembered in this browser only. */
const LIQUID_KEY = 'mm.liquidGroups'
function readLiquid(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(LIQUID_KEY) ?? '{}') } catch { return {} }
}
const liquidChoice = ref<Record<string, boolean>>(readLiquid())
watch(liquidChoice, (v) => { try { localStorage.setItem(LIQUID_KEY, JSON.stringify(v)) } catch { /* private mode */ } }, { deep: true })
const groups = computed(() => session.assets
  .filter((g) => g.balance > 0)
  .map((g) => ({ id: g.id, name: g.name, balance: g.balance, liquid: liquidChoice.value[g.id] ?? isLikelyLiquid(g.name) })))
const liquid = computed(() => groups.value.filter((g) => g.liquid).reduce((a, g) => a + g.balance, 0))
const cushion = computed(() => cushionMonths(liquid.value, props.r.averageExpense))
const toggle = (id: string, on: boolean) => { liquidChoice.value = { ...liquidChoice.value, [id]: on } }

/* Debt and income: same totals as the net worth view, corrected by account metadata when available. */
const cardDebt = computed(() => Math.abs(metadata.totals.debts ?? session.dashboard?.debts ?? 0))
const averageIncome = computed(() => props.r.months.reduce((a, m) => a + m.income, 0) / (props.r.months.length || 1))

/* Commitments already scheduled */
const commitments = computed(() => futureCommitments(props.movements, today.value))
const committedTotal = computed(() => commitments.value.reduce((a, c) => a + c.total, 0))
const nextMonths = computed(() => commitments.value.slice(0, 3).reduce((a, c) => a + c.total, 0) / 3)
const shortMonth = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'short' })
const commitmentRows = computed(() => commitments.value.map((c) => ({ label: shortMonth(c.month), values: { total: c.total } })))

/* Fixed vs variable and friends */
const months = computed(() => props.r.months.map((m) => m.month))
const groupsShare = computed(() => mainGroupShares(props.movements.filter((m) => m.date >= props.first && m.date <= props.last), months.value))

/* Projection */
const projection = computed(() => projectMonth(props.movements, today.value, props.r.months))
const projMax = computed(() => Math.max(1, projection.value?.projected ?? 0, projection.value?.average ?? 0, projection.value?.income ?? 0))

/* Outliers, strengths */
const odd = computed(() => outliers(props.movements.filter((m) => m.date >= props.first && m.date <= props.last)))
const vol = computed(() => volatility(props.r.months.filter((m) => m.month < today.value.slice(0, 7))))
const streak = computed(() => greenStreak(props.r.months, today.value))
const improved = computed(() => props.r.changes.filter((c) => c.change <= -1).sort((a, b) => a.change - b.change).slice(0, 3))

/* Budget track record over the analysed months */
const budgetRecord = computed(() => budgetHistory(history.budgets.filter((b) => b.month >= props.first.slice(0, 7))))
const monthName = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

/* Score */
const score = computed(() => healthScore({ savingsRate: props.r.savingsRate, cushion: cushion.value, cardDebt: cardDebt.value, averageIncome: averageIncome.value, volatility: vol.value, months: props.r.months }))
const scoreTone = computed(() => (score.value.total >= 70 ? 'good' : score.value.total >= 40 ? 'fair' : 'weak'))

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
  <div class="health">
    <div class="card score" :class="scoreTone">
      <div class="dial">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="50" class="ring" />
          <circle cx="60" cy="60" r="50" class="arc" :style="{ strokeDasharray: `${(score.total / 100) * 314} 314` }" />
        </svg>
        <div><strong>{{ score.total }}</strong><span>of 100</span></div>
      </div>
      <div class="parts">
        <h2>Financial health</h2>
        <div v-for="p in score.parts" :key="p.key" class="part" :title="p.detail">
          <span>{{ p.label }}</span>
          <div class="track"><span :style="{ width: `${(p.points / p.max) * 100}%` }" /></div>
          <b>{{ p.points }}/{{ p.max }}</b>
        </div>
        <small>Fixed weights. Hover a line to see how it is scored.</small>
      </div>
    </div>

    <h2 class="section">Risks</h2>
    <div class="grid3">
      <div class="card">
        <h3>Emergency cushion</h3>
        <p class="big" :class="cushion === null ? '' : cushion >= 6 ? 'income' : cushion >= 3 ? 'warn' : 'expense'">
          {{ cushion === null ? '—' : `${cushion.toLocaleString(undefined, { maximumFractionDigits: 1 })} months` }}
        </p>
        <p class="muted">{{ formatMoney(liquid) }} spendable ÷ {{ formatMoney(r.averageExpense) }} average monthly spend. Aim for 3 to 6 months.</p>
        <details>
          <summary>Which accounts count ({{ groups.filter((g) => g.liquid).length }} of {{ groups.length }})</summary>
          <label v-for="g in groups" :key="g.id" class="check">
            <input type="checkbox" :checked="g.liquid" @change="toggle(g.id, ($event.target as HTMLInputElement).checked)" />
            {{ g.name }} <span class="amount muted">{{ formatMoney(g.balance) }}</span>
          </label>
        </details>
      </div>

      <div class="card">
        <h3>Month-end projection</h3>
        <template v-if="projection">
          <p class="big" :class="projection.projected > projection.income ? 'expense' : projection.projected > projection.average ? 'warn' : 'income'">{{ formatMoney(projection.projected) }}</p>
          <p class="muted">Spent {{ formatMoney(projection.spent) }} with {{ Math.round(projection.elapsed * 100) }}% of the month gone.</p>
          <div class="proj">
            <div v-for="row in [
              { label: 'Projected', value: projection.projected, cls: 'expense' },
              { label: 'Your average', value: projection.average, cls: 'neutral' },
              { label: 'Income', value: projection.income, cls: 'income' },
            ]" :key="row.label" class="proj-row">
              <span>{{ row.label }}</span>
              <div class="track"><span :class="row.cls" :style="{ width: `${(row.value / projMax) * 100}%` }" /></div>
              <b class="amount">{{ formatMoney(row.value) }}</b>
            </div>
          </div>
        </template>
        <p v-else class="muted">Needs at least one earlier month.</p>
      </div>

      <div class="card">
        <h3>Debt load</h3>
        <p class="big" :class="cardDebt === 0 ? 'income' : cardDebt > averageIncome * 0.5 ? 'expense' : 'warn'">
          {{ averageIncome > 0 ? `${Math.round((cardDebt / averageIncome) * 100)}%` : '—' }}
        </p>
        <p class="muted">{{ formatMoney(cardDebt) }} owed against {{ formatMoney(averageIncome) }} average monthly income. Under 30% is comfortable.</p>
      </div>
    </div>

    <div class="card">
      <div class="head">
        <h3>Already committed</h3>
        <small v-if="committedTotal">{{ formatMoney(committedTotal) }} scheduled in the next 12 months · next 3 months average {{ formatMoney(nextMonths) }}<template v-if="averageIncome"> ({{ Math.round((nextMonths / averageIncome) * 100) }}% of income)</template></small>
      </div>
      <p v-if="!committedTotal" class="muted">No future expenses are scheduled. Installments and repeating entries saved ahead of time show up here.</p>
      <BarChart v-else :rows="commitmentRows" :series="[{ key: 'total', label: 'Scheduled', color: 'var(--transfer)' }]" label="Expenses scheduled per month" :height="170" />
    </div>

    <h2 class="section">Strengths and weak spots</h2>
    <div class="grid2">
      <div class="card">
        <h3>How your spending splits</h3>
        <div v-for="g in groupsShare.slice(0, 5)" :key="g.name" class="split-row">
          <div class="row"><span>{{ g.name }}</span><b>{{ Math.round(g.share * 100) }}%</b></div>
          <div class="track"><span :style="{ width: `${g.share * 100}%` }" /></div>
          <small v-if="g.previousShare !== null" class="muted">{{ Math.round(g.previousShare * 100) }}% in the three months before that</small>
        </div>
        <p class="muted note" v-if="groupsShare.length > 1">A high fixed share leaves little room to adjust when income drops.</p>
      </div>

      <div class="card">
        <h3>Signals</h3>
        <ul class="signals">
          <li :class="streak >= 3 ? 'good' : streak === 0 ? 'bad' : ''">
            <b>{{ streak }} {{ streak === 1 ? 'month' : 'months' }}</b> in a row with money left over
          </li>
          <li v-if="vol !== null" :class="vol <= 0.15 ? 'good' : vol >= 0.3 ? 'bad' : ''">
            Monthly spend varies <b>{{ Math.round(vol * 100) }}%</b> around its average · {{ vol <= 0.15 ? 'steady' : vol >= 0.3 ? 'hard to predict' : 'moderate' }}
          </li>
          <li v-for="c in improved" :key="c.name" class="good">
            <b>{{ c.name }}</b> down {{ formatMoney(-c.change) }}/mo vs the three months before
          </li>
          <li v-if="!improved.length" class="muted">No category dropped in the last three months.</li>
        </ul>
      </div>
    </div>

    <div class="card">
      <div class="head">
        <h3>Budget track record</h3>
        <small v-if="budgetRecord.overallHitRate !== null">Stayed within budget {{ Math.round(budgetRecord.overallHitRate * 100) }}% of the time across {{ budgetRecord.months }} months</small>
      </div>
      <p v-if="history.budgetState === 'unavailable'" class="muted">Budgets are read from the phone. Connect it and press Reload.</p>
      <p v-else-if="history.budgetState === 'loading'" class="muted">Reading one summary per month…</p>
      <p v-else-if="history.budgetState === 'failed'" class="muted">Could not read past budgets. The other reports are not affected.</p>
      <p v-else-if="!budgetRecord.records.length" class="muted">No budgets set in these months.</p>
      <table v-else>
        <tr><th scope="col">Category</th><th scope="col">Months over</th><th scope="col">Average excess</th><th scope="col">Worst month</th></tr>
        <tr v-for="b in budgetRecord.records" :key="b.name">
          <th scope="row">{{ b.name }}</th>
          <td>
            <span class="dots" :aria-label="`${b.over} of ${b.months}`"><i v-for="i in b.months" :key="i" :class="{ over: i <= b.over }" /></span>
            {{ b.over }} of {{ b.months }}
          </td>
          <td :class="['amount', b.over ? 'expense' : 'muted']">{{ b.over ? formatMoney(b.averageOver) : '—' }}</td>
          <td class="muted">{{ b.worst ? `${monthName(b.worst.month)} · ${formatMoney(b.worst.total)} of ${formatMoney(b.worst.budget)}` : 'Never over' }}</td>
        </tr>
      </table>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Unusual expenses</h3>
        <p class="muted small">More than two standard deviations above what that category usually costs.</p>
        <p v-if="!odd.length" class="muted">Nothing unusual.</p>
        <table v-else>
          <tr v-for="o in odd" :key="o.movement.id">
            <th scope="row">{{ o.movement.content || o.movement.subcategoryName || o.movement.categoryName }}<small>{{ formatDate(o.movement.date) }} · {{ o.movement.subcategoryName || o.movement.categoryName }}</small></th>
            <td class="muted">{{ o.times }}× typical</td>
            <td class="amount expense">{{ formatMoney(o.movement.amount) }}</td>
          </tr>
        </table>
      </div>

      <div class="card sim">
        <h3>What if you cut back?</h3>
        <div class="chips">
          <label v-for="c in candidates" :key="c.name" :class="{ on: chosen.includes(c.name) }">
            <input v-model="chosen" type="checkbox" :value="c.name" /> {{ c.name }}
          </label>
        </div>
        <label class="slider">Cut by <b>{{ percent }}%</b>
          <input v-model.number="percent" type="range" min="5" max="50" step="5" />
        </label>
        <div class="result">
          <div><span class="muted">Per month</span><strong class="amount income">{{ formatMoney(saving.monthly) }}</strong></div>
          <div><span class="muted">Per year</span><strong class="amount income">{{ formatMoney(saving.yearly) }}</strong></div>
        </div>
        <p v-if="cushion !== null && saving.monthly > 0 && r.averageExpense" class="muted small">
          Saved for a year, that adds {{ (saving.yearly / r.averageExpense).toLocaleString(undefined, { maximumFractionDigits: 1 }) }} months to your cushion.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.health { display: grid; gap: 1.25rem; }
.card { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 1.1rem 1.3rem; min-width: 0; }
h2 { font-size: 1.02rem; margin: 0; }
h2.section { margin-top: 0.5rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); }
h3 { font-size: 0.98rem; margin: 0 0 0.5rem; }
.head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.head small, .muted { color: var(--ink-soft); }
.small { font-size: 0.82rem; margin: 0 0 0.5rem; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
.big { font-size: 1.7rem; font-weight: 650; margin: 0 0 0.25rem; letter-spacing: -0.01em; }
.big + .muted { margin-top: 0; font-size: 0.86rem; }
.warn { color: var(--warn-ink); }
.track { height: 6px; background: var(--mist); border-radius: 3px; overflow: hidden; }
.track span { display: block; height: 100%; border-radius: 3px; background: var(--accent); transition: width 0.45s ease; }
.track .expense { background: var(--expense); } .track .income { background: var(--income); } .track .neutral { background: var(--transfer); }
.score { display: grid; grid-template-columns: auto 1fr; gap: 2rem; align-items: center; }
.dial { position: relative; width: 140px; height: 140px; }
.dial svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring { fill: none; stroke: var(--mist); stroke-width: 10; }
.arc { fill: none; stroke-width: 10; stroke-linecap: round; transition: stroke-dasharray 0.8s ease; stroke: var(--accent); }
.good .arc { stroke: var(--income); } .weak .arc { stroke: var(--expense); } .fair .arc { stroke: var(--warn-ink); }
.dial > div { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
.dial strong { font-size: 2.4rem; font-weight: 700; line-height: 1; }
.dial span { color: var(--ink-soft); font-size: 0.8rem; }
.parts { display: grid; gap: 0.45rem; }
.parts h2 { margin-bottom: 0.25rem; }
.part { display: grid; grid-template-columns: 10rem 1fr 3rem; gap: 0.75rem; align-items: center; font-size: 0.9rem; cursor: help; }
.part b { text-align: right; font-weight: 600; }
.parts small { color: var(--ink-soft); }
details summary { cursor: pointer; color: var(--accent); font-size: 0.86rem; }
.check { display: flex; gap: 0.5rem; align-items: center; font-size: 0.86rem; padding: 0.2rem 0; }
.check .amount { margin-left: auto; }
.proj { display: grid; gap: 0.4rem; margin-top: 0.5rem; }
.proj-row { display: grid; grid-template-columns: 6.5rem 1fr auto; gap: 0.6rem; align-items: center; font-size: 0.84rem; }
.split-row { margin-bottom: 0.7rem; }
.split-row .row { display: flex; justify-content: space-between; margin-bottom: 0.25rem; }
.split-row small { font-size: 0.78rem; }
.note { font-size: 0.82rem; margin: 0.25rem 0 0; }
.signals { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.signals li { padding: 0.55rem 0.75rem 0.55rem 2rem; border-radius: 8px; background: var(--mist); position: relative; font-size: 0.9rem; }
.signals li::before { content: '•'; position: absolute; left: 0.8rem; color: var(--ink-soft); font-weight: 700; }
.signals li.good::before { content: '✓'; color: var(--income); }
.signals li.bad::before { content: '!'; color: var(--expense); }
table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
th, td { text-align: left; font-weight: 400; padding: 0.4rem 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
th small { display: block; color: var(--ink-soft); font-size: 0.76rem; }
td { padding-left: 0.75rem; white-space: nowrap; }
td.amount { text-align: right; }
.dots { display: inline-flex; gap: 2px; margin-right: 0.4rem; vertical-align: middle; }
.dots i { width: 6px; height: 10px; border-radius: 2px; background: color-mix(in oklab, var(--income) 55%, var(--paper)); }
.dots i.over { background: var(--expense); }
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.8rem; }
.chips label { border: 1px solid var(--rule); border-radius: 99px; padding: 0.2rem 0.7rem; font-size: 0.82rem; cursor: pointer; }
.chips label.on { background: color-mix(in oklab, var(--accent) 14%, var(--paper)); border-color: var(--accent); color: var(--accent); }
.chips input { position: absolute; opacity: 0; pointer-events: none; }
.slider { display: grid; gap: 0.3rem; font-size: 0.9rem; }
.slider input { width: 100%; accent-color: var(--accent); padding: 0; border: 0; }
.result { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 0.9rem 0 0.4rem; }
.result div { display: grid; }
.result strong { font-size: 1.5rem; font-weight: 650; }
@media (max-width: 1000px) { .grid3, .grid2 { grid-template-columns: 1fr; } .score { grid-template-columns: 1fr; justify-items: center; } .part { grid-template-columns: 8rem 1fr 3rem; } }
</style>
