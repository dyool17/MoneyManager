<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useSession } from '../stores/session'
import { formatDate, formatMoney } from '../domain/format'
import type { MonthPoint } from '../domain/types'
import LineChart from './LineChart.vue'
import ChangeDialog, { type Draft } from './ChangeDialog.vue'

const draft = ref<Draft | null>(null)

const session = useSession()
const selected = ref<string | null>(session.assets[0]?.items[0]?.id ?? null)
const trend = shallowRef<MonthPoint[]>([])
const trendError = ref<string | null>(null)
const trendLoading = ref(false)

const selectedItem = computed(() =>
  session.assets.flatMap((g) => g.items).find((i) => i.id === selected.value),
)
const accountMovements = computed(() =>
  session.movements.filter((m) => m.assetId === selected.value),
)

let request = 0
watch(
  selected,
  async (id) => {
    if (!id) return
    const ticket = ++request
    trendLoading.value = true
    trendError.value = null
    try {
      const points = await session.getAssetTrend(id)
      if (ticket === request) trend.value = points
    } catch (e) {
      if (ticket === request) trendError.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (ticket === request) trendLoading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="layout">
    <nav class="tree" aria-label="Accounts">
      <div v-for="g in session.assets" :key="g.id" class="group">
        <div class="group-head">
          <span>{{ g.name }}</span>
          <span class="amount">{{ formatMoney(g.balance) }}</span>
        </div>
        <button
          v-for="i in g.items"
          :key="i.id"
          :aria-current="i.id === selected"
          @click="selected = i.id"
        >
          <span class="dot" :style="{ background: i.color ?? 'var(--transfer)' }" />
          <span class="name">{{ i.name }}</span>
          <span :class="['amount', i.balance < 0 ? 'expense' : '']">{{ formatMoney(i.balance) }}</span>
        </button>
      </div>
      <p v-if="!session.assets.length" class="muted">No accounts found.</p>
      <button class="add" @click="draft = { kind: 'asset' }">Add account</button>
    </nav>

    <div v-if="selectedItem" class="detail">
      <header>
        <h2>{{ selectedItem.name }}</h2>
        <strong class="amount">{{ formatMoney(selectedItem.balance) }}</strong>
        <div class="acts">
          <button @click="draft = { kind: 'asset', initial: selectedItem, groupId: session.assets.find((g) => g.items.some((i) => i.id === selectedItem!.id))?.id }">Edit</button>
          <button class="danger-btn" @click="draft = { kind: 'delete-asset', id: selectedItem.id, name: selectedItem.name, isCard: false }">Delete</button>
        </div>
      </header>

      <div class="card">
        <h3>Balance by month</h3>
        <p v-if="trendError" class="error">Could not load the trend: {{ trendError }}</p>
        <p v-else-if="trendLoading && !trend.length" class="muted">Loading…</p>
        <LineChart
          v-else-if="trend.length"
          :points="trend.map((p) => ({ label: p.month, value: p.value }))"
          :color="selectedItem.color"
          :label="`${selectedItem.name} balance by month`"
        />
        <p v-else class="muted">No history for this account.</p>
      </div>

      <div class="card">
        <h3>This month in {{ selectedItem.name }}</h3>
        <p v-if="!accountMovements.length" class="muted">No transactions in the selected month.</p>
        <table v-else>
          <tr v-for="m in accountMovements" :key="m.id">
            <td class="muted date">{{ formatDate(m.date) }}</td>
            <td>{{ m.content ?? m.categoryName ?? '—' }}</td>
            <td :class="['amount', m.type]">{{ formatMoney(m.amount) }}</td>
          </tr>
        </table>
      </div>
    </div>
    <ChangeDialog v-if="draft" :draft="draft" @close="draft = null" />
  </section>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: 18rem 1fr; gap: 1.5rem; align-items: start; }
.muted { color: var(--ink-soft); }
.tree { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 0.5rem; }
.group + .group { margin-top: 0.5rem; }
.group-head { display: flex; justify-content: space-between; padding: 0.5rem 0.6rem 0.25rem; font-size: 0.85rem; color: var(--ink-soft); }
.tree button { display: flex; align-items: center; gap: 0.6rem; width: 100%; border: none; background: transparent; text-align: left; padding: 0.5rem 0.6rem; }
.tree button[aria-current='true'] { background: var(--mist); font-weight: 600; }
.name { flex: 1; }
.dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; flex: none; }
.detail { display: grid; gap: 1.25rem; }
.detail header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.75rem 1.25rem; }
.detail header strong { margin-left: auto; }
.acts { display: flex; gap: 0.5rem; }
.danger-btn { color: var(--expense); }
.add { width: 100%; margin-top: 0.5rem; }
h2 { font-size: 1.6rem; margin: 0; letter-spacing: -0.01em; }
.detail header strong { font-size: 1.6rem; }
.card { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 1.25rem 1.5rem; }
h3 { font-size: 1rem; margin: 0 0 0.75rem; }
table { width: 100%; border-collapse: collapse; }
td { padding: 0.45rem 0; border-bottom: 1px solid var(--rule); }
tr:last-child td { border-bottom: none; }
td.amount { text-align: right; }
.date { width: 9rem; }
.error { color: var(--warn-ink); }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
</style>
