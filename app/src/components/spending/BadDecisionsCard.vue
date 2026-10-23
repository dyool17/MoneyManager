<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../i18n'
import AiButton from '../AiButton.vue'
import { useSession } from '../../stores/session'
import { useBudgetPlans } from '../../stores/budgets'
import { useLifeEvents } from '../../stores/life-events'
import { useDecisions } from '../../stores/decisions'
import { useNav } from '../../stores/nav'
import { findBadDecisions } from '../../domain/bad-decisions'
import { formatDate, formatMoney } from '../../domain/format'

const session = useSession()
const plans = useBudgetPlans()
const events = useLifeEvents()
const dismissed = useDecisions()
const nav = useNav()

const month = computed(() => session.period.startDate.slice(0, 7))
const nameOf = (id: string) => plans.state.plan?.budgets.find((b) => b.categoryId === id)?.name
  ?? session.movements.find((m) => m.subcategoryId === id)?.subcategoryName
  ?? session.movements.find((m) => m.categoryId === id)?.categoryName
  ?? id

const decisions = computed(() => findBadDecisions({
  movements: session.movements, plan: plans.state.plan, modes: plans.state.modes,
  events: events.state.events, month: month.value,
}).filter((d) => !dismissed.isDismissed(d.movement.id)))

const REASON: Record<string, string> = {
  outlier: 'far above its usual cost',
  'large-share': 'a large share of the budget',
  'over-budget': 'pushes the budget over the line',
}
const error = ref('')

function intoEvent(d: (typeof decisions.value)[number]) {
  error.value = ''
  const m = d.movement
  const id = m.subcategoryId ?? m.categoryId
  try {
    events.add({ label: m.content?.slice(0, 80) || t('{category} spike', { category: m.subcategoryName || m.categoryName || t('Expense') }), start: m.date, categoryIds: id ? [id] : [], kind: 'one-off' })
    dismissed.dismiss(m.id)
    nav.go('milestones')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
function confirm(d: (typeof decisions.value)[number]) {
  error.value = ''
  const m = d.movement
  try {
    dismissed.confirm({ id: m.id, date: m.date, amount: m.amount, categoryId: m.subcategoryId ?? m.categoryId, categoryName: m.subcategoryName || m.categoryName || t('Uncategorized'), note: m.content })
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
</script>

<template>
  <div class="card cats decisions">
    <div class="card-head">
      <h2>{{ t('Possible bad decisions') }}</h2>
    </div>
    <p class="muted small">
      {{ t('Expenses that look big for their budget, have no life event or yearly allowance explaining them, and belong to a discretionary group. Dismissed flags stay hidden on this computer.') }}
    </p>
    <p v-if="error" class="error" role="alert">{{ t(error) }}</p>
    <ul v-if="decisions.length" class="rows">
      <li v-for="d in decisions" :key="d.movement.id">
        <span class="row">
          <span class="name">{{ d.movement.content || d.movement.subcategoryName || d.movement.categoryName }}</span>
          <span class="muted small">{{ formatDate(d.movement.date) }} · {{ d.budget ? nameOf(d.budget.categoryId) : (d.movement.subcategoryName || d.movement.categoryName) }}</span>
          <span class="num amount">{{ formatMoney(d.movement.amount) }}</span>
          <span class="muted small">{{ d.big.map((r) => t(REASON[r])).join(' · ') }}</span>
          <AiButton :question="t('Was this expense a bad decision? {date} {category} {amount} ({reasons}). Explain and suggest what to do.', { date: formatDate(d.movement.date), category: d.movement.subcategoryName || d.movement.categoryName || '', amount: formatMoney(d.movement.amount), reasons: d.big.map((r) => t(REASON[r])).join(', ') })" :about="t('Possible bad decision')" compact>{{ t('Why?') }}</AiButton>
          <button type="button" @click="confirm(d)">{{ t('Confirm bad decision') }}</button>
          <button v-if="d.movement.subcategoryId || d.movement.categoryId" type="button" @click="intoEvent(d)">{{ t('Life event') }}</button>
          <button type="button" class="hint" @click="dismissed.dismiss(d.movement.id)">{{ t('Dismiss') }}</button>
        </span>
      </li>
    </ul>
    <p v-else class="muted small">{{ t('Nothing flagged this month.') }}</p>
    <p v-if="dismissed.storageError" class="error" role="alert">{{ t(dismissed.storageError) }}</p>
  </div>
</template>

<style scoped>
.decisions { margin-top: 1.25rem; }
.rows { display: grid; gap: 0.4rem; margin: 0.5rem 0 0; padding: 0; list-style: none; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 1rem; }
.row .name { min-width: 10rem; font-weight: 500; }
.row button { cursor: pointer; }
.hint { border: 0; background: none; color: var(--ink-soft); font-size: 0.85rem; padding: 0; }
.error { color: var(--expense); margin: 0.5rem 0 0; }
.small { font-size: 0.85rem; }
.muted { color: var(--ink-soft); }
</style>
