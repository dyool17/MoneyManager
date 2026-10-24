<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, intlLocale } from '../../i18n'
import { useSession } from '../../stores/session'
import { useAccountMetadata } from '../../stores/metadata'
import { useCountUp } from '../../composables/countUp'
import { formatMoney, monthLabel } from '../../domain/format'
import { sliceHistory, type HistoryRange } from '../../domain/money'
import LineChart from '../LineChart.vue'
import AiButton from '../AiButton.vue'

defineEmits<{ configure: [] }>()
const session = useSession()
const metadata = useAccountMetadata()

const RANGES: HistoryRange[] = ['6M', '12M', 'All']
const range = ref<HistoryRange>('12M')

const current = computed(() => session.source === 'stored' ? null : metadata.totals.netWorth !== null ? metadata.totals : session.source === 'demo' ? session.dashboard : null)
const history = computed(() => sliceHistory(session.dashboard?.history ?? [], range.value))
const points = computed(() => history.value.map((p) => ({ label: /^\d{4}-\d{2}/.test(p.month) ? monthLabel(p.month) : p.month, value: p.total })))
const change = computed(() => history.value.length > 1 ? history.value[history.value.length - 1].total - history.value[0].total : null)
const netShown = useCountUp(computed(() => current.value?.netWorth))
</script>

<template>
  <section class="card hero" :aria-label="t('Net worth')">
    <div v-if="session.source === 'stored'" class="needed">
      <p>{{ t('Balances, net worth, accounts and cards need the phone. Stored movements remain available in reports.') }}</p>
    </div>
    <div v-else-if="!current" class="needed">
      <h2>{{ t('Account metadata needed') }}</h2>
      <p>{{ t('Configure {n} account(s) or import a .mmbak backup before calculating corrected totals.', { n: metadata.totals.missing.length.toLocaleString(intlLocale()) }) }}</p>
      <button class="primary" @click="$emit('configure')">{{ t('Configure accounts') }}</button>
      <p v-if="session.dashboard" class="muted">{{ t('Unverified PC Manager net worth: {amount}. It may differ from the mobile total.', { amount: formatMoney(session.dashboard.netWorth) }) }}</p>
    </div>
    <div v-else class="figures" :title="metadata.totals.netWorth !== null ? t('Source: live account balances + metadata') : t('Source: {source}', { source: session.dashboard?.source ?? '' })">
      <div class="label">{{ t('Net worth') }} <span v-if="session.source === 'demo'" class="chip">{{ t('Demo data') }}</span></div>
      <div class="num big value">{{ formatMoney(netShown) }} <small v-if="metadata.state.baseCurrency">{{ metadata.state.baseCurrency }}</small></div>
      <div v-if="change !== null" :class="['change', change >= 0 ? 'income' : 'expense']">
        <span class="num">{{ change >= 0 ? '+' : '' }}{{ formatMoney(change) }}</span>
        <span class="muted">{{ range === 'All' ? t('over the full history') : t('over the last {n} months', { n: range === '6M' ? 6 : 12 }) }}</span>
      </div>
      <dl>
        <div><dt class="label">{{ t('You have') }}</dt><dd class="num income">{{ formatMoney(current.assets!) }}</dd></div>
        <div><dt class="label">{{ t('You owe') }}</dt><dd class="num expense">{{ formatMoney(current.debts!) }}</dd></div>
      </dl>
      <AiButton :question="t('Why did my net worth change over the last months?')" :about="t('Net worth')">{{ t('Why did it change?') }}</AiButton>
    </div>

    <div v-if="session.source !== 'stored'" class="chart">
      <div class="card-head">
        <h2>{{ t('History') }}</h2>
        <div class="seg" role="group" :aria-label="t('History range')">
          <button v-for="r in RANGES" :key="r" type="button" :aria-pressed="range === r" @click="range = r">{{ r === 'All' ? t('All') : r === '6M' ? t('6M') : t('12M') }}</button>
        </div>
      </div>
      <p v-if="session.source === 'phone'" class="muted note">{{ t('Historical figures are PC Manager data and are not recalculated with current account settings.') }}</p>
      <LineChart v-if="points.length" :points="points" :label="t('Net worth by month')" />
      <p v-else class="muted">{{ t('No history yet.') }}</p>
    </div>
  </section>
</template>

<style scoped>
.hero { display: flex; flex-wrap: wrap; gap: 2rem 3rem; align-items: stretch; }
.figures, .needed { flex: 1 1 18rem; display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; }
.chart { flex: 2 1 22rem; min-width: 0; }
.value { font-size: 2.8rem; letter-spacing: -0.02em; }
.value small { font-size: 1rem; color: var(--ink-soft); }
.change { font-size: 0.95rem; }
.change .muted { color: var(--ink-soft); }
dl { display: flex; gap: 2.5rem; margin: 0.8rem 0 1rem; }
dd { margin: 0.2rem 0 0; font-size: 1.3rem; font-weight: 600; }
.chip { margin-left: 0.4rem; padding: 0.1rem 0.5rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent-ink); font-size: 0.72rem; text-transform: none; letter-spacing: 0; }
.note { font-size: 0.82rem; margin: 0 0 0.5rem; }
h2 { margin: 0; }
</style>
