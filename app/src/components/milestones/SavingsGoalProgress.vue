<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../../i18n'
import { formatMoney } from '../../domain/format'
import type { SavingsGoal } from '../../domain/savings-goal'
import { useSavingsGoals } from '../../composables/savingsGoals'
const props = defineProps<{ goal: SavingsGoal }>()
const savings = useSavingsGoals()
const value = computed(() => savings.progress(props.goal))
</script>

<template>
  <div class="goal-progress">
    <strong>{{ t('Savings goal') }} · {{ goal.currency }} {{ formatMoney(goal.target) }}</strong>
    <template v-if="value">
      <p>{{ Math.round(value.percent) }}% · {{ t('Current amount') }}: {{ formatMoney(value.amount) }} {{ goal.currency }} · {{ t('Remaining') }}: {{ formatMoney(value.remaining) }} {{ goal.currency }}</p>
      <progress :value="value.percent" max="100" :aria-label="t('Savings goal')" />
    </template>
    <p v-else>{{ t('Progress unavailable: load account balances and configure currency metadata.') }}</p>
    <p class="muted">{{ t('Uses current whole account balances, not future balances. Money is not reserved or moved. Shared accounts measure each goal independently; do not add goals as separate funds.') }}</p>
    <p v-if="value && savings.session.status === 'offline'">{{ t('Last loaded balances; phone is offline.') }}</p>
  </div>
</template>

<style scoped>
p { margin: .35rem 0; }
progress { width: 100%; }
.muted { color: var(--ink-soft); font-size: .85rem; }
</style>
