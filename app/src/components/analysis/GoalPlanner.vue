<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t, intlLocale } from '../../i18n'
import AiButton from '../AiButton.vue'
import { formatMoney } from '../../domain/format'
import { goalPlan } from '../../domain/goal'

/** A savings goal: what to set aside each month, against what is left over today. Remembered on this computer. */
const props = defineProps<{ today: string; leftOver: number }>()
const KEY = 'mm.goal'
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as { amount: number; by: string } | null } catch { return null } })()
const amount = ref<number | null>(saved?.amount ?? null)
const by = ref(saved?.by ?? '')
watch([amount, by], ([a, b]) => { try { localStorage.setItem(KEY, JSON.stringify({ amount: a, by: b })) } catch { /* private mode */ } })

const plan = computed(() => (amount.value && by.value ? goalPlan({ amount: amount.value, by: by.value, today: props.today, leftOver: props.leftOver }) : null))
const byLabel = computed(() => (by.value ? new Date(`${by.value}-15T12:00:00`).toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' }) : ''))
</script>

<template>
  <section class="card goal">
    <h2>{{ t('Savings goal') }}</h2>
    <div class="fields">
      <label>{{ t('Amount') }} <input v-model.number="amount" type="number" min="1" step="100" placeholder="10000" /></label>
      <label>{{ t('By') }} <input v-model="by" type="month" :min="today.slice(0, 7)" /></label>
    </div>
    <template v-if="plan">
      <p v-if="plan.months === 0" class="muted">{{ t('Choose a month after this one.') }}</p>
      <template v-else>
        <p>{{ t('Set aside {amount} a month for {n} {unit}.', { amount: formatMoney(plan.monthly), n: plan.months, unit: plan.months === 1 ? t('month') : t('months') }) }}</p>
        <div class="track" role="img" :aria-label="t('You leave {amount} a month today; the goal needs {needed}', { amount: formatMoney(Math.max(0, leftOver)), needed: formatMoney(plan.monthly) })">
          <span :style="{ width: `${Math.min(100, plan.coverage * 100)}%`, background: plan.gap > 0 ? 'var(--expense)' : 'var(--accent)' }" />
        </div>
        <p class="muted small">{{ plan.gap > 0 ? t('Today you leave {amount} a month, {gap} short of the goal.', { amount: formatMoney(Math.max(0, leftOver)), gap: formatMoney(plan.gap) }) : t('What you leave over today, {amount} a month, already covers it.', { amount: formatMoney(leftOver) }) }}</p>
        <AiButton :question="t('Help me save {amount} by {by}: {monthly} a month. Where can I find {gap} more each month without touching fixed bills?', { amount: formatMoney(amount!), by: byLabel, monthly: formatMoney(plan.monthly), gap: formatMoney(Math.max(plan.gap, 0)) })" :about="t('Savings goal')">{{ t('Plan how to get there') }}</AiButton>
      </template>
    </template>
    <p v-else class="muted small">{{ t('Enter an amount and a month to see what it takes.') }}</p>
  </section>
</template>

<style scoped>
.goal { display: flex; flex-direction: column; gap: 0.7rem; }
h2 { margin: 0; font-size: 1.05rem; }
p { margin: 0; }
.small { font-size: 0.85rem; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
label { display: grid; gap: 0.25rem; font-size: 0.85rem; color: var(--ink-soft); }
.goal :deep(.ai-btn) { align-self: flex-start; }
</style>
