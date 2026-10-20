<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '../stores/session'
import { formatMoney } from '../domain/format'
import LineChart from './LineChart.vue'

const session = useSession()
const d = computed(() => session.dashboard)
const history = computed(() => d.value?.history.map((p) => ({ label: p.month, value: p.total })) ?? [])

/** Splits a list of shares into proportional widths for a single stacked bar. */
function stack(shares: { name: string; amount: number }[]) {
  const total = shares.reduce((sum, s) => sum + Math.abs(s.amount), 0) || 1
  return shares.map((s) => ({ ...s, pct: (Math.abs(s.amount) / total) * 100 }))
}
const assetStack = computed(() => stack(d.value?.assetShares ?? []))
const debtStack = computed(() => stack(d.value?.debtShares ?? []))
</script>

<template>
  <section v-if="d">
    <header class="hero" :title="`Source: ${d.source}`">
      <div>
        <span class="muted">Net worth today</span>
        <strong class="amount">{{ formatMoney(d.netWorth) }}</strong>
      </div>
      <dl>
        <div><dt>Assets</dt><dd class="amount income">{{ formatMoney(d.assets) }}</dd></div>
        <div><dt>Debts</dt><dd class="amount expense">{{ formatMoney(d.debts) }}</dd></div>
      </dl>
    </header>

    <div class="card">
      <h2>Net worth by month</h2>
      <LineChart v-if="history.length" :points="history" label="Net worth by month" />
      <p v-else class="muted">No history yet.</p>
    </div>

    <div class="split">
      <div v-for="group in [
        { title: 'Where your money is', rows: assetStack, cls: 'income' },
        { title: 'What you owe', rows: debtStack, cls: 'expense' },
      ]" :key="group.title" class="card">
        <h2>{{ group.title }}</h2>
        <p v-if="!group.rows.length" class="muted">Nothing here.</p>
        <template v-else>
          <div class="stack" :class="group.cls">
            <span v-for="(r, i) in group.rows" :key="r.name" :style="{ width: `${r.pct}%`, opacity: 1 - i * 0.22 }" :title="r.name" />
          </div>
          <table>
            <tr v-for="r in group.rows" :key="r.name">
              <th scope="row">{{ r.name }}</th>
              <td class="muted">{{ Math.round(r.pct) }}%</td>
              <td :class="['amount', group.cls]">{{ formatMoney(r.amount) }}</td>
            </tr>
          </table>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.muted { color: var(--ink-soft); }
.hero { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1.5rem; margin-bottom: 1.5rem; }
.hero span { display: block; }
.hero strong { font-size: 3rem; font-weight: 650; letter-spacing: -0.03em; line-height: 1.1; }
dl { display: flex; gap: 2.5rem; margin: 0; }
dt { color: var(--ink-soft); font-size: 0.85rem; }
dd { margin: 0; font-size: 1.3rem; font-weight: 600; }
.card { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 1.25rem 1.5rem; }
h2 { font-size: 1.05rem; margin: 0 0 1rem; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-top: 1.25rem; }
.stack { display: flex; height: 0.75rem; border-radius: 99px; overflow: hidden; gap: 2px; margin-bottom: 0.75rem; }
.stack.income span { background: var(--income); }
.stack.expense span { background: var(--expense); }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.45rem 0; border-bottom: 1px solid var(--rule); text-align: left; font-weight: 400; }
td { text-align: right; padding-left: 1rem; }
tr:last-child th, tr:last-child td { border-bottom: none; }
@media (max-width: 900px) { .split { grid-template-columns: 1fr; } }
</style>
