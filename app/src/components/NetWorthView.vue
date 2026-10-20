<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '../stores/session'
import { formatMoney } from '../domain/format'
import LineChart from './LineChart.vue'
import { useAccountMetadata } from '../stores/metadata'

defineEmits<{ configure: [] }>()
const metadata = useAccountMetadata()
const session = useSession()
const current = computed(() => metadata.totals.netWorth !== null ? metadata.totals : session.source === 'demo' ? session.dashboard : null)
const d = computed(() => session.dashboard)
const history = computed(() => d.value?.history.map((p) => ({ label: p.month, value: p.total })) ?? [])

/** Splits a list of shares into proportional widths for a single stacked bar. */
function stack(shares: { name: string; amount: number }[]) {
  const total = shares.reduce((sum, s) => sum + Math.abs(s.amount), 0) || 1
  return shares.map((s) => ({ ...s, pct: (Math.abs(s.amount) / total) * 100 }))
}
const assetStack = computed(() => stack(current.value?.assetShares ?? []))
const debtStack = computed(() => stack(current.value?.debtShares ?? []))
</script>

<template>
  <section v-if="d">
    <p v-if="session.source === 'phone'">
      Current totals use live balances and account metadata. Historical charts remain PC Manager data.
      <button @click="$emit('configure')">Configure account metadata</button>
    </p>
    <p v-if="metadata.storageError" role="alert">{{ metadata.storageError }}</p>
    <p v-if="metadata.changedAccounts.length" role="status">Accounts changed since import. Review metadata or import a fresh backup.</p>
    <div v-if="!current" class="card">
      <h2>Account metadata needed</h2>
      <p>Configure {{ metadata.totals.missing.length }} account(s) or import a .mmbak backup before calculating corrected totals.</p>
      <button @click="$emit('configure')">Configure accounts</button>
      <p class="muted">Unverified PC Manager net worth: {{ formatMoney(d.netWorth) }}. It may differ from the mobile total.</p>
    </div>
    <header v-else class="hero" :title="metadata.totals.netWorth !== null ? 'Source: live account balances + metadata' : `Source: ${d.source}`">
      <div>
        <span class="muted">Net worth today</span>
        <strong class="amount">{{ formatMoney(current.netWorth!) }} <small>{{ metadata.state.baseCurrency }}</small></strong>
      </div>
      <dl>
        <div><dt>Assets</dt><dd class="amount income">{{ formatMoney(current.assets!) }}</dd></div>
        <div><dt>Debts</dt><dd class="amount expense">{{ formatMoney(current.debts!) }}</dd></div>
      </dl>
    </header>

    <div class="card">
      <h2>Net worth by month — PC Manager history</h2>
      <p v-if="session.source === 'phone'" class="muted">Historical figures are not recalculated using current account settings.</p>
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
