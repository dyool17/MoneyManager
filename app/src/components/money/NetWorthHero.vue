<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSession } from '../../stores/session'
import { useAccountMetadata } from '../../stores/metadata'
import { useCountUp } from '../../composables/countUp'
import { formatMoney } from '../../domain/format'
import { sliceHistory, type HistoryRange } from '../../domain/money'
import LineChart from '../LineChart.vue'
import AiButton from '../AiButton.vue'

defineEmits<{ configure: [] }>()
const session = useSession()
const metadata = useAccountMetadata()

const RANGES: HistoryRange[] = ['6M', '12M', 'All']
const range = ref<HistoryRange>('12M')

const current = computed(() => metadata.totals.netWorth !== null ? metadata.totals : session.source === 'demo' ? session.dashboard : null)
const history = computed(() => sliceHistory(session.dashboard?.history ?? [], range.value))
const points = computed(() => history.value.map((p) => ({ label: p.month, value: p.total })))
const change = computed(() => history.value.length > 1 ? history.value[history.value.length - 1].total - history.value[0].total : null)
const netShown = useCountUp(computed(() => current.value?.netWorth))
</script>

<template>
  <section class="card hero" aria-label="Net worth">
    <div v-if="!current" class="needed">
      <h2>Account metadata needed</h2>
      <p>Configure {{ metadata.totals.missing.length }} account(s) or import a .mmbak backup before calculating corrected totals.</p>
      <button class="primary" @click="$emit('configure')">Configure accounts</button>
      <p v-if="session.dashboard" class="muted">Unverified PC Manager net worth: {{ formatMoney(session.dashboard.netWorth) }}. It may differ from the mobile total.</p>
    </div>
    <div v-else class="figures" :title="metadata.totals.netWorth !== null ? 'Source: live account balances + metadata' : `Source: ${session.dashboard?.source}`">
      <div class="label">Net worth <span v-if="session.source === 'demo'" class="chip">Demo data</span></div>
      <div class="num big value">{{ formatMoney(netShown) }} <small v-if="metadata.state.baseCurrency">{{ metadata.state.baseCurrency }}</small></div>
      <div v-if="change !== null" :class="['change', change >= 0 ? 'income' : 'expense']">
        <span class="num">{{ change >= 0 ? '+' : '' }}{{ formatMoney(change) }}</span>
        <span class="muted"> over {{ range === 'All' ? 'the full history' : `the last ${range === '6M' ? 6 : 12} months` }}</span>
      </div>
      <dl>
        <div><dt class="label">You have</dt><dd class="num income">{{ formatMoney(current.assets!) }}</dd></div>
        <div><dt class="label">You owe</dt><dd class="num expense">{{ formatMoney(current.debts!) }}</dd></div>
      </dl>
      <AiButton question="Why did my net worth change over the last months?" about="Net worth">Why did it change?</AiButton>
    </div>

    <div class="chart">
      <div class="card-head">
        <h2>History</h2>
        <div class="seg" role="group" aria-label="History range">
          <button v-for="r in RANGES" :key="r" type="button" :aria-pressed="range === r" @click="range = r">{{ r }}</button>
        </div>
      </div>
      <p v-if="session.source === 'phone'" class="muted note">Historical figures are PC Manager data and are not recalculated with current account settings.</p>
      <LineChart v-if="points.length" :points="points" label="Net worth by month" />
      <p v-else class="muted">No history yet.</p>
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
