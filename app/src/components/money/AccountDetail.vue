<script setup lang="ts">
import { computed } from 'vue'
import { useAccountTrend } from '../../composables/accountTrend'
import { t, intlLocale } from '../../i18n'
import { useSession } from '../../stores/session'
import { useAccountMetadata } from '../../stores/metadata'
import { useNav } from '../../stores/nav'
import { formatMoney, monthLabel } from '../../domain/format'
import { accountFlow, type AccountRow } from '../../domain/money'
import LineChart from '../LineChart.vue'
import AiButton from '../AiButton.vue'

const props = defineProps<{ account: AccountRow }>()
defineEmits<{ edit: []; remove: [] }>()
const session = useSession()
const metadata = useAccountMetadata()
const nav = useNav()

const { points: trend, error: trendError, loading: trendLoading, retry } = useAccountTrend(
  () => props.account.id,
  () => JSON.stringify([session.source, session.address, session.storedScope, session.bookId, session.loadedAt]),
  (id) => session.getAssetTrend(id),
)

const flow = computed(() => accountFlow(session.movements, props.account.id))
const counted = computed(() => {
  const s = metadata.settingsFor(props.account.id)
  return s ? (s.includeInTotals ? t('Yes') : t('No')) : t('Not configured')
})
const isCard = computed(() => props.account.kind === 'card')
const linkedName = computed(() => session.assets.flatMap((g) => g.items).find((i) => i.id === props.account.linkedAssetId)?.name ?? props.account.linkedAssetId)
</script>

<template>
  <aside class="card detail" :aria-label="t('Account detail')">
    <div class="label">{{ isCard ? t('Credit card') : account.type }}</div>
    <h2>{{ account.name }}</h2>
    <div :class="['num', 'big', account.balance < 0 ? 'expense' : '']">{{ formatMoney(account.balance) }}</div>

    <template v-if="isCard">
      <p v-if="linkedName" class="muted">{{ t('Paid from {name}', { name: linkedName }) }}</p>
      <dl>
        <div><dt class="label">{{ account.balance < 0 ? t('To pay') : account.balance > 0 ? t('Credit balance') : t('Balance') }}</dt><dd :class="['num', account.balance < 0 ? 'expense' : account.balance > 0 ? 'income' : '']">{{ formatMoney(account.balance) }}</dd></div>
        <div v-if="account.closingDay"><dt class="label">{{ t('Statement closes') }}</dt><dd>{{ t('Day {n}', { n: Number(account.closingDay).toLocaleString(intlLocale()) }) }}</dd></div>
        <div v-if="account.paymentDay"><dt class="label">{{ t('Payment due') }}</dt><dd>{{ t('Day {n}', { n: Number(account.paymentDay).toLocaleString(intlLocale()) }) }}</dd></div>
      </dl>
    </template>

    <div class="chart" :aria-busy="trendLoading" aria-live="polite">
      <div class="label">{{ t('Balance by month') }}</div>
      <div v-if="trendError"><p class="error">{{ t('Could not load the trend: {error}', { error: t(trendError) }) }}</p><button type="button" @click="retry">{{ t('Retry trend') }}</button></div>
      <p v-else-if="trendLoading && !trend.length" class="muted">{{ t('Loading…') }}</p>
      <LineChart v-else-if="trend.length" :points="trend.map((p) => ({ label: /^\d{4}-\d{2}/.test(p.month) ? monthLabel(p.month) : p.month, value: p.value }))" :color="account.color" :label="t('{name} balance by month', { name: account.name })" />
      <p v-else class="muted">{{ t('No history for this account.') }}</p>
    </div>

    <dl>
      <div><dt class="label">{{ t('In this month') }}</dt><dd class="num income">{{ formatMoney(flow.in) }}</dd></div>
      <div><dt class="label">{{ t('Out this month') }}</dt><dd class="num expense">{{ formatMoney(flow.out) }}</dd></div>
      <div><dt class="label">{{ t('Counts toward totals') }}</dt><dd>{{ counted }}</dd></div>
    </dl>

    <div class="acts">
      <button class="primary" @click="nav.go('spending', `account:${account.id}`)">{{ t('See transactions') }}</button>
      <button @click="nav.go('settings', 'accounts')">{{ t('Account settings') }}</button>
      <AiButton :question="t('Tell me about my {name} account', { name: account.name })" :about="t('{name} account', { name: account.name })">{{ t('Ask about this account') }}</AiButton>
    </div>
    <div v-if="session.source === 'phone'" class="acts">
      <button @click="$emit('edit')">{{ t('Edit') }}</button>
      <button class="danger-btn" @click="$emit('remove')">{{ t('Delete') }}</button>
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
