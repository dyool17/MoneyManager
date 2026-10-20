<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSession } from '../stores/session'
import { formatDate, formatMoney } from '../domain/format'
import type { Movement, MovementType } from '../domain/types'

const session = useSession()
const text = ref('')
const type = ref<MovementType | ''>('')
const account = ref('')
const category = ref('')

const TYPE_LABEL: Record<MovementType, string> = {
  income: 'Income',
  expense: 'Expense',
  'transfer-out': 'Transfer out',
  'transfer-in': 'Transfer in',
  unknown: 'Other',
}

const categories = computed(() => {
  const init = session.init
  return init ? [...init.expenseCategories, ...init.incomeCategories] : []
})

const filtered = computed(() => {
  const q = text.value.trim().toLowerCase()
  return session.movements.filter(
    (m) =>
      (!type.value || m.type === type.value) &&
      (!account.value || m.assetId === account.value || m.toAssetId === account.value) &&
      (!category.value || m.categoryId === category.value) &&
      (!q || `${m.content ?? ''} ${m.detail ?? ''}`.toLowerCase().includes(q)),
  )
})

const recorded = computed(() => filtered.value.filter((m) => !m.isFuture))
const upcoming = computed(() => filtered.value.filter((m) => m.isFuture))

const accountName = (id?: string) => session.init?.accounts.find((a) => a.id === id)?.name ?? id
const typeLabel = (m: Movement) => (m.type === 'unknown' ? `Other (code ${m.rawCode})` : TYPE_LABEL[m.type])
</script>

<template>
  <section>
    <div class="filters">
      <input v-model="text" type="search" placeholder="Search notes" aria-label="Search notes" />
      <select v-model="type" aria-label="Type">
        <option value="">All types</option>
        <option v-for="(label, key) in TYPE_LABEL" :key="key" :value="key">{{ label }}</option>
      </select>
      <select v-model="account" aria-label="Account">
        <option value="">All accounts</option>
        <option v-for="a in session.init?.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <select v-model="category" aria-label="Category">
        <option value="">All categories</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <span class="count">{{ filtered.length }} of {{ session.movements.length }}</span>
    </div>

    <p v-if="!session.movements.length" class="empty">No transactions this month. Try another month.</p>
    <p v-else-if="!filtered.length" class="empty">No transactions match these filters.</p>

    <template v-for="group in [
      { title: 'Recorded', rows: recorded },
      { title: 'Upcoming charges', rows: upcoming },
    ]" :key="group.title">
      <template v-if="group.rows.length">
        <h2>{{ group.title }} <small v-if="group.title !== 'Recorded'">dated after today</small></h2>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Note</th><th>Category</th><th>Account</th><th>Type</th><th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in group.rows" :key="m.id" :class="{ future: m.isFuture }">
              <td class="date">{{ formatDate(m.date) }}</td>
              <td>
                {{ m.content ?? '—' }}
                <small v-if="m.detail">{{ m.detail }}</small>
              </td>
              <td>{{ m.categoryName ?? '' }}<small v-if="m.subcategoryName">{{ m.subcategoryName }}</small></td>
              <td>
                {{ m.accountName }}
                <small v-if="m.toAssetId">{{ m.type === 'transfer-out' ? 'to' : 'from' }} {{ accountName(m.toAssetId) }}</small>
              </td>
              <td :class="m.type">{{ typeLabel(m) }}</td>
              <td :class="['num', 'amount', m.type]">{{ formatMoney(m.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </template>
  </section>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 1.25rem; }
.filters input { flex: 1 1 14rem; }
.count { margin-left: auto; color: var(--ink-soft); font-size: 0.85rem; }
h2 { font-size: 1.05rem; margin: 1.5rem 0 0.5rem; }
h2 small { font-weight: 400; color: var(--ink-soft); margin-left: 0.4rem; }
table { width: 100%; border-collapse: collapse; background: var(--paper); border: 1px solid var(--rule); border-radius: 10px; overflow: hidden; }
th { text-align: left; font-weight: 500; font-size: 0.85rem; color: var(--ink-soft); padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--rule); }
td { padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
tbody tr:last-child td { border-bottom: none; }
td small { display: block; color: var(--ink-soft); font-size: 0.8rem; }
.num { text-align: right; }
.date { white-space: nowrap; color: var(--ink-soft); }
.future td { background: color-mix(in srgb, var(--mist) 60%, transparent); }
.empty { color: var(--ink-soft); }
@media (max-width: 720px) {
  table { display: block; overflow-x: auto; }
}
</style>
