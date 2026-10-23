<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../i18n'
import { useSession } from '../stores/session'
import { useBudgetPlans } from '../stores/budgets'
import { useLifeEvents } from '../stores/life-events'
import { useDecisions } from '../stores/decisions'
import { timeline } from '../domain/milestone-impact'
import { todayIso } from '../domain/period'
import { formatDate, formatMoney, monthLabel } from '../domain/format'
import type { LifeEvent } from '../domain/life-events'
import MilestoneEditor from './milestones/MilestoneEditor.vue'

const session = useSession()
const plans = useBudgetPlans()
const events = useLifeEvents()
const decisions = useDecisions()
const editing = ref<LifeEvent | null>(null)
const adding = ref(false)
const deleting = ref<string | null>(null)
const error = ref('')
const data = computed(() => timeline({ events: events.state.events, confirmed: decisions.confirmed, movements: session.movements, today: todayIso() }))
const nameOf = (id: string, fallback = id) => plans.state.plan?.budgets.find(b => b.categoryId === id)?.name
  ?? session.movements.find(m => m.subcategoryId === id)?.subcategoryName
  ?? session.movements.find(m => m.categoryId === id)?.categoryName ?? fallback
const kinds = { 'one-off': 'One-off spike', 'new-normal': 'New normal', temporary: 'Temporary' }
function remove(id: string) {
  error.value = ''
  try { events.remove(id); deleting.value = null } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
function undo(id: string) {
  error.value = ''
  try { decisions.unconfirm(id) } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
</script>

<template>
  <section class="milestones">
    <header><h1>{{ t('Milestones') }}</h1><button @click="editing = null; adding = true">{{ t('Add milestone') }}</button></header>
    <p>{{ t('Milestone impacts are estimates, not proof of cause: actual spending is compared with the median month of the 6 whole months before the start, prorated to the event window. At least 3 months of spending history are needed per category. Only loaded movements are used; open events run to today.') }}</p>
    <MilestoneEditor v-if="adding || editing" :key="editing?.id ?? 'new'" :event="editing" @close="adding = false; editing = null" />
    <p v-if="error" role="alert">{{ t('Could not save locally: {error}', { error: t(error) }) }}</p>
    <p v-if="events.storageError" role="alert">{{ t(events.storageError) }}</p>
    <p v-if="decisions.storageError" role="alert">{{ t(decisions.storageError) }}</p>
    <div class="card">
      <h2>{{ t('Totals') }}</h2>
      <p>{{ t('Lost to confirmed bad decisions') }}: {{ formatMoney(data.totals.lostToDecisions) }}</p>
      <p>{{ t('Net estimated milestone impact') }}: {{ formatMoney(data.totals.milestoneNet) }}</p>
      <p class="muted">{{ t('Year totals group milestones by their start year and decisions by their date. These totals are separate, not additive.') }}</p>
      <dl v-for="year in data.totals.byYear" :key="year.year"><dt>{{ year.year }}</dt><dd>{{ t('Lost to confirmed bad decisions') }}: {{ formatMoney(year.lostToDecisions) }} · {{ t('Net estimated milestone impact') }}: {{ formatMoney(year.milestoneNet) }}</dd></dl>
    </div>
    <h2>{{ t('Timeline') }}</h2>
    <p v-if="!data.items.length">{{ t('No milestones or confirmed bad decisions yet.') }}</p>
    <article v-for="item in data.items" :key="item.type + item.id" class="card">
      <template v-if="item.type === 'event'">
        <h3>{{ item.event.label }}</h3>
        <p>{{ item.event.end ? t('{start} to {end}', { start: formatDate(item.date), end: formatDate(item.event.end) }) : t('{start} onwards', { start: formatDate(item.date) }) }} · {{ t(kinds[item.event.kind]) }}</p>
        <p>{{ t('Extra cost') }}: {{ formatMoney(item.impact.extraCost) }} · {{ t('Relief') }}: {{ formatMoney(item.impact.relief) }} · {{ t('Estimated net') }}: {{ formatMoney(item.impact.net) }}</p>
        <ul><li v-for="c in item.impact.categories" :key="c.id">
          {{ nameOf(c.id, c.name) }} · {{ c.direction === 'affected' ? t('Affected') : t('Relieved') }} · {{ t('Actual') }}: {{ formatMoney(c.actual) }} · {{ t('Baseline') }}: {{ c.baseline === null ? t('Not enough history') : formatMoney(c.baseline) }}
        </li></ul>
        <button @click="editing = item.event; adding = false">{{ t('Edit') }}</button>
        <button v-if="deleting !== item.id" @click="deleting = item.id">{{ t('Delete') }}</button>
        <div v-else role="group" :aria-label="t('Confirm deletion')"><p>{{ t('Delete this milestone? This cannot be undone.') }}</p><button @click="remove(item.id)">{{ t('Confirm deletion') }}</button><button @click="deleting = null">{{ t('Cancel') }}</button></div>
      </template>
      <template v-else>
        <h3>{{ t('Confirmed bad decision') }}</h3>
        <p>{{ formatDate(item.date) }} · {{ monthLabel(item.date) }} · {{ item.decision.categoryName }} · {{ formatMoney(item.decision.amount) }}</p>
        <p>{{ item.decision.note }}</p><button @click="undo(item.id)">{{ t('Undo confirmation') }}</button>
      </template>
    </article>
  </section>
</template>

<style scoped>
.milestones { display: grid; gap: 1rem; max-width: 1000px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
h1, h3 { margin: 0; }
.card { padding: 1rem; border: 1px solid var(--rule); border-radius: 12px; background: var(--paper); }
button { margin-right: .5rem; }
.muted { color: var(--ink-soft); }
[role='alert'] { color: var(--expense); }
</style>
