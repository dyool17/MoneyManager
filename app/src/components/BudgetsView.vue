<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '../stores/session'
import { formatMoney } from '../domain/format'
import { buildBudgetReport } from '../domain/budget'
import { todayIso } from '../domain/period'

const session = useSession()
const report = computed(() =>
  session.summary ? buildBudgetReport(session.summary.expenseByCategory, session.period, todayIso()) : null,
)
const STATE_LABEL = { ok: 'On track', ahead: 'Spending fast', over: 'Over budget' }
const width = (ratio: number) => `${Math.min(100, ratio * 100)}%`
</script>

<template>
  <section v-if="report">
    <p v-if="!report.lines.length" class="muted">
      No budgets set for this month. Budgets are set in the Money Manager app on your phone.
    </p>
    <template v-else>
      <div class="total">
        <div>
          <span class="muted">Spent of budget</span>
          <strong class="amount">{{ formatMoney(report.totalSpent) }}</strong>
          <span class="muted"> of {{ formatMoney(report.totalBudget) }}</span>
        </div>
        <span :class="['left', report.totalBudget - report.totalSpent < 0 ? 'expense' : 'income']">
          {{ report.totalBudget - report.totalSpent < 0 ? 'Over by' : 'Left' }}
          <b class="amount">{{ formatMoney(Math.abs(report.totalBudget - report.totalSpent)) }}</b>
        </span>
      </div>

      <p v-if="report.pace !== null" class="muted legend">
        The thin line marks how far into the month we are ({{ Math.round(report.pace * 100) }}%).
      </p>

      <ul class="lines">
        <li v-for="l in report.lines" :key="l.name" :class="l.state">
          <div class="head">
            <span class="name">{{ l.name }}</span>
            <span class="chip">{{ STATE_LABEL[l.state] }}</span>
            <span class="amount figures">{{ formatMoney(l.spent) }} / {{ formatMoney(l.budget) }}</span>
          </div>
          <div class="track">
            <span class="fill" :style="{ width: width(l.ratio) }" />
            <span v-if="report.pace !== null" class="pace" :style="{ left: `${report.pace * 100}%` }" />
          </div>
          <span class="muted small">
            {{ l.remaining >= 0 ? `${formatMoney(l.remaining)} left` : `${formatMoney(-l.remaining)} over` }},
            {{ Math.round(l.ratio * 100) }}% used
          </span>
        </li>
      </ul>
    </template>

    <template v-if="report.unbudgeted.length">
      <h2>Without a budget</h2>
      <table>
        <tr v-for="c in report.unbudgeted" :key="c.name">
          <th scope="row">{{ c.name }}</th>
          <td class="amount expense">{{ formatMoney(c.total) }}</td>
        </tr>
      </table>
    </template>
  </section>
</template>

<style scoped>
.muted { color: var(--ink-soft); }
.small { font-size: 0.85rem; }
.total { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 1rem; padding: 1.25rem 1.5rem; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; }
.total span { display: inline; }
.total > div > span:first-child { display: block; }
.total strong { font-size: 2.2rem; font-weight: 650; letter-spacing: -0.02em; }
.left { font-size: 1.05rem; }
.legend { margin: 1rem 0 0; font-size: 0.85rem; }
.lines { list-style: none; padding: 0; margin: 1.25rem 0 0; display: grid; gap: 1.1rem; }
.head { display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 0.35rem; }
.name { font-weight: 600; }
.figures { margin-left: auto; }
.chip { font-size: 0.75rem; padding: 0.05rem 0.5rem; border-radius: 99px; background: var(--mist); color: var(--ink-soft); }
.over .chip { background: color-mix(in srgb, var(--expense) 18%, transparent); color: var(--expense); }
.ahead .chip { background: var(--warn-bg); color: var(--warn-ink); }
.track { position: relative; height: 0.7rem; border-radius: 99px; background: var(--mist); border: 1px solid var(--rule); }
.fill { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: var(--income); }
.ahead .fill { background: var(--warn-ink); }
.over .fill { background: var(--expense); }
.pace { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--ink); opacity: 0.6; }
h2 { font-size: 1.05rem; margin: 2rem 0 0.5rem; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.5rem 0; border-bottom: 1px solid var(--rule); text-align: left; font-weight: 400; }
td { text-align: right; }
</style>
