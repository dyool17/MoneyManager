<script setup lang="ts">
import { computed, shallowRef, ref, watch } from 'vue'
import { useSession } from '../../stores/session'
import { useAccountMetadata } from '../../stores/metadata'
import { useNav } from '../../stores/nav'
import { formatMoney } from '../../domain/format'
import { accountFlow, type AccountRow } from '../../domain/money'
import type { MonthPoint } from '../../domain/types'
import LineChart from '../LineChart.vue'
import AiButton from '../AiButton.vue'

const props = defineProps<{ account: AccountRow }>()
defineEmits<{ edit: []; remove: [] }>()
const session = useSession()
const metadata = useAccountMetadata()
const nav = useNav()

const trend = shallowRef<MonthPoint[]>([])
const trendError = ref<string | null>(null)
const trendLoading = ref(false)
let request = 0
watch(() => props.account.id, async (id) => {
  const ticket = ++request
  trendLoading.value = true
  trendError.value = null
  trend.value = []
  try {
    const points = await session.getAssetTrend(id)
    if (ticket === request) trend.value = points
  } catch (e) {
    if (ticket === request) trendError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (ticket === request) trendLoading.value = false
  }
}, { immediate: true })

const flow = computed(() => accountFlow(session.movements, props.account.id))
const counted = computed(() => {
  const s = metadata.settingsFor(props.account.id)
  return s ? (s.includeInTotals ? 'Yes' : 'No') : 'Not configured'
})
const isCard = computed(() => props.account.kind === 'card')
const linkedName = computed(() => session.assets.flatMap((g) => g.items).find((i) => i.id === props.account.linkedAssetId)?.name ?? props.account.linkedAssetId)
</script>

<template>
  <aside class="card detail" aria-label="Account detail">
    <div class="label">{{ account.type }}</div>
    <h2>{{ account.name }}</h2>
    <div :class="['num', 'big', account.balance < 0 ? 'expense' : '']">{{ formatMoney(account.balance) }}</div>

    <template v-if="isCard">
      <p v-if="linkedName" class="muted">Paid from {{ linkedName }}</p>
      <dl>
        <div><dt class="label">To pay</dt><dd class="num expense">{{ formatMoney(account.balance) }}</dd></div>
        <div v-if="account.closingDay"><dt class="label">Statement closes</dt><dd>Day {{ account.closingDay }}</dd></div>
        <div v-if="account.paymentDay"><dt class="label">Payment due</dt><dd>Day {{ account.paymentDay }}</dd></div>
      </dl>
    </template>

    <div class="chart">
      <div class="label">Balance by month</div>
      <p v-if="trendError" class="error">Could not load the trend: {{ trendError }}</p>
      <p v-else-if="trendLoading && !trend.length" class="muted">Loading…</p>
      <LineChart v-else-if="trend.length" :points="trend.map((p) => ({ label: p.month, value: p.value }))" :color="account.color" :label="`${account.name} balance by month`" />
      <p v-else class="muted">No history for this account.</p>
    </div>

    <dl>
      <div><dt class="label">In this month</dt><dd class="num income">{{ formatMoney(flow.in) }}</dd></div>
      <div><dt class="label">Out this month</dt><dd class="num expense">{{ formatMoney(flow.out) }}</dd></div>
      <div><dt class="label">Counts toward totals</dt><dd>{{ counted }}</dd></div>
    </dl>

    <div class="acts">
      <button class="primary" @click="nav.go('spending', `account:${account.id}`)">See transactions</button>
      <button @click="nav.go('settings', 'accounts')">Account settings</button>
      <AiButton :question="`Tell me about my ${account.name} account`" :about="`${account.name} account`">Ask about this account</AiButton>
    </div>
    <div v-if="session.source === 'phone'" class="acts">
      <button @click="$emit('edit')">Edit</button>
      <button class="danger-btn" @click="$emit('remove')">Delete</button>
    </div>
  </aside>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
h2 { margin: 0; font-size: 1.3rem; }
dl { display: flex; flex-wrap: wrap; gap: 0.8rem 1.8rem; margin: 0.5rem 0; }
dd { margin: 0.2rem 0 0; font-weight: 600; }
.chart { margin-top: 0.5rem; }
.acts { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
.danger-btn { color: var(--expense); }
.error { color: var(--warn-ink); }
</style>
