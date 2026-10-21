<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSort } from '../composables/sort'
import SortTh from './SortTh.vue'
import { useSession } from '../stores/session'
import { formatDate, formatMoney } from '../domain/format'
import type { Movement, MovementType } from '../domain/types'
import { filterMovements, type TypeFilter } from '../domain/spending'
import { movementsCsv } from '../domain/export'
import { exportCsv } from '../infrastructure/client'
import ChangeDialog, { type Draft } from './ChangeDialog.vue'

const draft = ref<Draft | null>(null)
const editRow = (m: Movement) =>
  (draft.value = m.type === 'transfer-in' || m.type === 'transfer-out' ? { kind: 'transfer', initial: m } : { kind: 'transaction', initial: m })

/** Filters come from the Spending screen; the search box is local to the table. */
const props = defineProps<{ category: string; account: string; type: TypeFilter }>()
const session = useSession()
const text = ref('')

const TYPE_LABEL: Record<MovementType, string> = {
  income: 'Income',
  expense: 'Expense',
  'transfer-out': 'Transfer out',
  'transfer-in': 'Transfer in',
  unknown: 'Other',
}

const filtered = computed(() =>
  filterMovements(session.movements, { category: props.category, account: props.account, type: props.type, text: text.value }),
)

const recorded = computed(() => filtered.value.filter((m) => !m.isFuture))
const upcoming = computed(() => filtered.value.filter((m) => m.isFuture))

const movementColumns = {
  date: (m: Movement) => m.date,
  note: (m: Movement) => m.content ?? null,
  category: (m: Movement) => [m.categoryName, m.subcategoryName].filter(Boolean).join(' '),
  account: (m: Movement) => m.accountName ?? null,
  type: (m: Movement) => typeLabel(m),
  amount: (m: Movement) => m.amount,
}
const recordedSort = useSort(recorded, movementColumns)
const upcomingSort = useSort(upcoming, movementColumns)
const exportState = ref<{ kind: 'idle' | 'saving' | 'saved' | 'failed'; text?: string }>({ kind: 'idle' })
async function exportFiltered() {
  exportState.value = { kind: 'saving' }
  try {
    const path = await exportCsv(session.period, movementsCsv(filtered.value))
    exportState.value = { kind: 'saved', text: path }
  } catch (e) {
    exportState.value = { kind: 'failed', text: e instanceof Error ? e.message : String(e) }
  }
}

const accountName = (id?: string) => session.init?.accounts.find((a) => a.id === id)?.name ?? id
const typeLabel = (m: Movement) => (m.type === 'unknown' ? `Other (code ${m.rawCode})` : TYPE_LABEL[m.type])
</script>

<template>
  <section class="card">
    <div class="head">
      <h2>Movements</h2>
      <span class="count muted">{{ filtered.length }} of {{ session.movements.length }}</span>
      <input v-model="text" type="search" placeholder="Search notes" aria-label="Search notes" />
      <button :disabled="!filtered.length || exportState.kind === 'saving'" @click="exportFiltered">Export CSV</button>
    </div>
    <p v-if="exportState.kind === 'saved'" class="export ok" role="status">Saved {{ filtered.length }} transactions to <code>{{ exportState.text }}</code></p>
    <p v-else-if="exportState.kind === 'failed'" class="export warn" role="alert">Export failed: {{ exportState.text }}</p>

    <p v-if="!session.movements.length" class="empty">No transactions this month. Try another month.</p>
    <p v-else-if="!filtered.length" class="empty">No transactions match these filters.</p>

    <template v-for="group in [
      { title: 'Recorded', rows: recorded, sort: recordedSort },
      { title: 'Upcoming charges', rows: upcoming, sort: upcomingSort },
    ]" :key="group.title">
      <template v-if="group.rows.length">
        <h3>{{ group.title }} <small v-if="group.title !== 'Recorded'">dated after today</small></h3>
        <div class="scroll"><table>
          <thead>
            <tr>
              <SortTh :sort="group.sort" by="date">Date</SortTh><SortTh :sort="group.sort" by="note">Note</SortTh><SortTh :sort="group.sort" by="category">Category</SortTh><SortTh :sort="group.sort" by="account">Account</SortTh><SortTh :sort="group.sort" by="type">Type</SortTh><SortTh :sort="group.sort" by="amount" num>Amount</SortTh><th><span class="sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in group.sort.sorted.value" :key="m.id" :class="{ future: m.isFuture }">
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
              <td class="row-actions">
                <template v-if="session.source === 'phone'">
                  <button v-if="m.type !== 'unknown'" class="link" :aria-label="`Edit ${m.content ?? 'transaction'}`" @click="editRow(m)">Edit</button>
                  <button class="link danger-link" :aria-label="`Delete ${m.content ?? 'transaction'}`" @click="draft = { kind: 'delete-transactions', rows: [m] }">Delete</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table></div>
      </template>
    </template>
    <ChangeDialog v-if="draft" :draft="draft" @close="draft = null" />
  </section>
</template>

<style scoped>
.row-actions { white-space: nowrap; text-align: right; }
.link { border: none; background: none; padding: 0 0.35rem; color: var(--accent); }
.danger-link { color: var(--expense); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.head { display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; align-items: center; margin-bottom: 1rem; }
.head h2 { margin: 0; font-size: 1.05rem; }
.head input { flex: 1 1 14rem; margin-left: auto; max-width: 22rem; }
.count { font-size: 0.85rem; }
.export { margin: 0 0 1rem; font-size: 0.9rem; }
.export code { word-break: break-all; }
.ok { color: var(--income); }
.warn { color: var(--warn-ink); }
h3 { font-size: 0.95rem; margin: 1.25rem 0 0.5rem; }
h3 small { font-weight: 400; color: var(--ink-soft); margin-left: 0.4rem; }
.scroll { overflow-x: auto; }
table { width: 100%; min-width: 42rem; border-collapse: collapse; }
th { text-align: left; font-weight: 600; font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-soft); padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--rule); }
td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: var(--hover); }
td small { display: block; color: var(--ink-soft); font-size: 0.8rem; }
.num { text-align: right; }
.date { white-space: nowrap; color: var(--ink-soft); }
.future td { color: var(--ink-soft); }
.empty { color: var(--ink-soft); }
</style>
