<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '../stores/session'
import { formatMoney } from '../domain/format'

const session = useSession()
const s = computed(() => session.summary)

/** Income and expense share one scale, so the bar shows how much of the income was spent. */
const scale = computed(() => Math.max(s.value?.income ?? 0, s.value?.expense ?? 0, 1))
const pct = (n: number) => `${Math.min(100, (n / scale.value) * 100)}%`
const budgetPct = (total: number, budget: number) => (budget > 0 ? Math.round((total / budget) * 100) : null)
</script>

<template>
  <section v-if="s">
    <div class="flow" :title="`Source: ${s.source}`">
      <div class="net">
        <span>Left over</span>
        <strong :class="['amount', s.net >= 0 ? 'income' : 'expense']">{{ formatMoney(s.net) }}</strong>
      </div>
      <div class="bars">
        <div class="bar">
          <span class="fill income-bg" :style="{ width: pct(s.income) }" />
          <span class="label">Income <b class="amount">{{ formatMoney(s.income) }}</b></span>
        </div>
        <div class="bar">
          <span class="fill expense-bg" :style="{ width: pct(s.expense) }" />
          <span class="label">
            Spent <b class="amount">{{ formatMoney(s.expense) }}</b>
            <small>{{ formatMoney(s.cashExpense) }} cash, {{ formatMoney(s.cardExpense) }} card</small>
          </span>
        </div>
      </div>
    </div>

    <div class="columns">
      <div v-for="group in [
        { title: 'Spending by category', rows: s.expenseByCategory, cls: 'expense' },
        { title: 'Income by category', rows: s.incomeByCategory, cls: 'income' },
      ]" :key="group.title">
        <h2>{{ group.title }}</h2>
        <p v-if="!group.rows.length" class="empty">Nothing recorded this month.</p>
        <table v-else>
          <tr v-for="row in group.rows" :key="row.name">
            <th scope="row">{{ row.name }}</th>
            <td :class="['amount', group.cls]">{{ formatMoney(row.total) }}</td>
            <td class="budget">
              <template v-if="budgetPct(row.total, row.budget) !== null">
                <meter :value="row.total" :max="row.budget" :high="row.budget * 0.9" :optimum="0" />
                {{ budgetPct(row.total, row.budget) }}% of {{ formatMoney(row.budget) }}
              </template>
            </td>
          </tr>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.flow {
  display: grid;
  grid-template-columns: minmax(12rem, auto) 1fr;
  gap: 2rem;
  align-items: center;
  padding: 1.5rem 1.75rem;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 12px;
}
.net span { display: block; color: var(--ink-soft); }
.net strong { font-size: 2.4rem; font-weight: 650; letter-spacing: -0.02em; }
.bars { display: grid; gap: 0.6rem; }
.bar {
  position: relative;
  height: 2.6rem;
  border-radius: 4px;
  background: var(--mist);
  overflow: hidden;
}
.fill { position: absolute; inset: 0 auto 0 0; opacity: 0.22; transition: width 0.4s ease; }
.income-bg { background: var(--income); }
.expense-bg { background: var(--expense); }
.label { position: relative; display: flex; align-items: center; gap: 0.5rem; height: 100%; padding: 0 0.9rem; }
.label small { color: var(--ink-soft); margin-left: auto; }
.columns { display: grid; grid-template-columns: 3fr 2fr; gap: 2.5rem; margin-top: 2.25rem; }
h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.55rem 0; border-bottom: 1px solid var(--rule); text-align: left; font-weight: 400; }
td.amount { text-align: right; padding-left: 1rem; }
.budget { padding-left: 1.25rem; color: var(--ink-soft); font-size: 0.85rem; white-space: nowrap; }
meter { width: 4.5rem; vertical-align: middle; margin-right: 0.35rem; }
.empty { color: var(--ink-soft); }
@media (max-width: 900px) {
  .flow, .columns { grid-template-columns: 1fr; }
}
</style>
