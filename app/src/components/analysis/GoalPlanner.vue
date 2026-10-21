<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
const byLabel = computed(() => (by.value ? new Date(`${by.value}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''))
</script>

<template>
  <section class="card goal">
    <h2>Savings goal</h2>
    <div class="fields">
      <label>Amount <input v-model.number="amount" type="number" min="1" step="100" placeholder="10000" /></label>
      <label>By <input v-model="by" type="month" :min="today.slice(0, 7)" /></label>
    </div>
    <template v-if="plan">
      <p v-if="plan.months === 0" class="muted">Choose a month after this one.</p>
      <template v-else>
        <p>Set aside <b class="num">{{ formatMoney(plan.monthly) }}</b> a month for {{ plan.months }} {{ plan.months === 1 ? 'month' : 'months' }}.</p>
        <div class="track" role="img" :aria-label="`You leave ${formatMoney(Math.max(0, leftOver))} a month today; the goal needs ${formatMoney(plan.monthly)}`">
          <span :style="{ width: `${Math.min(100, plan.coverage * 100)}%`, background: plan.gap > 0 ? 'var(--expense)' : 'var(--accent)' }" />
        </div>
        <p class="muted small">{{ plan.gap > 0 ? `Today you leave ${formatMoney(Math.max(0, leftOver))} a month, ${formatMoney(plan.gap)} short of the goal.` : `What you leave over today, ${formatMoney(leftOver)} a month, already covers it.` }}</p>
        <AiButton :question="`Help me save ${formatMoney(amount!)} by ${byLabel}: ${formatMoney(plan.monthly)} a month. Where can I find ${formatMoney(Math.max(plan.gap, 0))} more each month without touching fixed bills?`" about="Savings goal">Plan how to get there</AiButton>
      </template>
    </template>
    <p v-else class="muted small">Enter an amount and a month to see what it takes.</p>
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
