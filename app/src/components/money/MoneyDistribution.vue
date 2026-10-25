<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../../i18n'
import { formatMoney } from '../../domain/format'
import { distributeAccounts } from '../../domain/account-distribution'
import { useAccountMetadata } from '../../stores/metadata'
import DistributionPie from './DistributionPie.vue'

const metadata = useAccountMetadata()
const groups = computed(() => distributeAccounts(metadata.rows, metadata.state))
const currency = computed(() => metadata.state.baseCurrency)
const limboPositive = computed(() => groups.value.limbo.filter(row => row.amount >= 0))
const limboNegative = computed(() => groups.value.limbo.filter(row => row.amount < 0))
</script>

<template>
  <section :aria-label="t('Account distribution')">
    <h2>{{ t('Account distribution') }}</h2>
    <p class="muted">{{ t('Current balances converted to {currency} using account settings.', { currency: currency || t('Not configured') }) }}</p>
    <p v-if="groups.unresolved.length" class="muted">{{ t('Charts show resolved accounts only; unresolved balances are not counted.') }}</p>
    <div class="distribution-grid">
      <div class="card"><DistributionPie :title="t('In favor')" :rows="groups.positive" :currency="currency" /></div>
      <div class="card"><DistributionPie :title="t('Debts')" :rows="groups.negative" :currency="currency" /></div>
      <section class="card limbo" :aria-label="t('Limbo')">
        <h3>{{ t('Limbo') }}</h3>
        <p class="num net">{{ t('Net: {amount} {currency}', { amount: formatMoney(groups.limboNet), currency }) }}</p>
        <p class="muted">{{ t('Excluded from net worth. Positive contributions minus negative contributions.') }}</p>
        <DistributionPie :title="t('Excluded positive balances')" :rows="limboPositive" :currency="currency" />
        <DistributionPie :title="t('Excluded negative balances')" :rows="limboNegative" :currency="currency" />
      </section>
    </div>
    <div v-if="groups.zero.length" class="card notices">
      <h3>{{ t('Included zero balances') }}</h3>
      <ul><li v-for="row in groups.zero" :key="row.id">{{ row.name }}: {{ formatMoney(0) }} {{ currency }}</li></ul>
    </div>
    <div v-if="groups.unresolved.length" class="card notices" role="status">
      <h3>{{ t('Unresolved accounts') }}</h3>
      <p>{{ t('Not classified: configure inclusion, currency and exchange rate; check invalid balances or duplicate account IDs.') }}</p>
      <ul><li v-for="(row, index) in groups.unresolved" :key="index">{{ row.name }}</li></ul>
    </div>
  </section>
</template>

<style scoped>
h2 { font-size: 1.2rem; margin: 0 0 0.5rem; }
h3 { font-size: 1rem; margin: 0; }
.distribution-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; align-items: start; }
.card { min-width: 0; }
.net { font-weight: 600; }
.notices { margin-top: 1rem; }
.notices ul { max-height: 12rem; overflow: auto; overflow-wrap: anywhere; }
@media (max-width: 850px) { .distribution-grid { grid-template-columns: 1fr; } }
</style>
