<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { t } from '../../i18n'
import { useSession } from '../../stores/session'
import { useBudgetPlans } from '../../stores/budgets'
import { useLifeEvents } from '../../stores/life-events'
import { todayIso } from '../../domain/period'
import { validateLifeEvents, type EventKind, type LifeEvent } from '../../domain/life-events'
import { useSavingsGoals } from '../../composables/savingsGoals'
import { readSelection, writeSelection } from './selection'

const props = defineProps<{ event: LifeEvent | null }>()
const emit = defineEmits<{ close: [] }>()
const session = useSession()
const plans = useBudgetPlans()
const events = useLifeEvents()
const form = reactive({ label: props.event?.label ?? '', kind: props.event?.kind ?? 'one-off' as EventKind, start: props.event?.start ?? todayIso(), end: props.event?.end ?? '' })
const selection = reactive(readSelection(props.event ?? { categoryIds: [] }))
const savings = useSavingsGoals()
const goalEnabled = ref(!!props.event?.savingsGoal)
const goal = reactive({ target: String(props.event?.savingsGoal?.target ?? ''), currency: props.event?.savingsGoal?.currency ?? savings.metadata.state.baseCurrency, accountIds: [...(props.event?.savingsGoal?.accountIds ?? [])] })
const accountChoices = computed(() => {
  const choices = new Map(savings.accounts.value.map(a => [a.id, a.name]))
  for (const id of goal.accountIds) if (!choices.has(id)) choices.set(id, id)
  return [...choices].map(([id, name]) => ({ id, name }))
})
const search = ref('')
const error = ref('')
const choices = computed(() => {
  const byId = new Map<string, string>()
  for (const b of plans.state.plan?.budgets ?? []) byId.set(b.categoryId, b.parent ? `${b.parent} · ${b.name}` : b.name)
  for (const m of session.movements) {
    if (m.categoryId && m.categoryName && !byId.has(m.categoryId)) byId.set(m.categoryId, m.categoryName)
    if (m.subcategoryId && m.subcategoryName && !byId.has(m.subcategoryId)) byId.set(m.subcategoryId, `${m.categoryName || ''} · ${m.subcategoryName}`)
  }
  for (const id of Object.keys(selection)) if (!byId.has(id)) byId.set(id, id)
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
})
// Keep newly loaded choices editable; retain saved ids even without loaded movements.
watch(choices, (categories) => {
  for (const c of categories) selection[c.id] ??= { direction: 'none', expected: '' }
}, { immediate: true })
function save() {
  error.value = ''
  try {
    const event: LifeEvent = { id: props.event?.id ?? crypto.randomUUID(), ...form, end: form.end || undefined, ...writeSelection(selection), savingsGoal: goalEnabled.value ? { target: Number(goal.target), currency: goal.currency.trim().toUpperCase(), accountIds: [...new Set(goal.accountIds)] } : undefined }
    validateLifeEvents({ events: [event] })
    events.add(event)
    emit('close')
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
</script>

<template>
  <form class="card editor" @submit.prevent="save">
    <h2>{{ event ? t('Edit milestone') : t('Add milestone') }}</h2>
    <label>{{ t('Note') }}<input v-model="form.label" required /></label>
    <label class="check-row goal-toggle"><input v-model="goalEnabled" type="checkbox" />{{ t('Savings goal') }}</label>
    <p class="muted">{{ t('Track ordinary spending changes, a savings target, or both.') }}</p>
    <label>{{ goalEnabled ? t('Goal deadline') : t('Start') }}<input v-model="form.start" type="date" required /></label>
    <fieldset v-if="goalEnabled" class="goal-fields"><legend>{{ t('Savings goal') }}</legend>
      <div class="goal-amounts">
      <label>{{ t('Target amount') }}<input v-model="goal.target" type="number" min="0.01" step="any" required /></label>
      <label>{{ t('Goal currency (ISO code)') }}<input v-model="goal.currency" pattern="[A-Za-z]{3}" required maxlength="3" /></label>
      </div>
      <p>{{ t('Use an account currency or the configured base currency. Missing conversion makes progress unavailable.') }}</p>
      <fieldset class="linked-accounts"><legend>{{ t('Linked accounts') }}</legend>
      <p v-if="!accountChoices.length">{{ t('Load accounts to link balances to this goal.') }}</p>
      <label v-for="account in accountChoices" :key="account.id" class="check-row"><input v-model="goal.accountIds" type="checkbox" :value="account.id" />{{ account.name }}</label>
      </fieldset>
    </fieldset>
    <section class="spending-fields">
    <h3>{{ goalEnabled ? t('Optional spending changes') : t('Spending changes') }}</h3>
    <p v-if="goalEnabled">{{ t('Expense categories are optional for goals. The deadline also dates any linked spending changes.') }}</p>
    <label>{{ t('Kind') }}<select v-model="form.kind"><option value="one-off">{{ t('One-off spike') }}</option><option value="new-normal">{{ t('New normal') }}</option><option value="temporary">{{ t('Temporary') }}</option></select></label>
    <p>{{ form.kind === 'one-off' ? t('One-off: a single spike, excluded from the projection baseline.') : form.kind === 'new-normal' ? t('New normal: the category baseline restarts at this date.') : t('Temporary: spending changes while this event lasts.') }}</p>
    <label>{{ t('End (blank = still open)') }}<input v-model="form.end" type="date" :min="form.start" /></label>
    <label>{{ t('Search categories') }}<input v-model="search" type="search" /></label>
    <p>{{ t('Expected amounts are optional positive monthly changes, not measured impact.') }}</p>
    <fieldset><legend>{{ t('Category involvement') }}</legend>
      <div v-for="c in choices.filter(c => c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))" :key="c.id" class="category">
        <template v-if="selection[c.id]">
          <label>{{ c.name }}<select v-model="selection[c.id]!.direction"><option value="none">{{ t('Not involved') }}</option><option value="affected">{{ t('Affected') }}</option><option value="relieved">{{ t('Relieved') }}</option></select></label>
          <label v-if="selection[c.id]!.direction !== 'none'">{{ t('Expected monthly change') }}<input v-model="selection[c.id]!.expected" type="number" min="0.01" step="any" /></label>
        </template>
      </div>
    </fieldset>
    </section>
    <p v-if="error" role="alert">{{ t('Could not save locally: {error}', { error: t(error) }) }}</p>
    <div><button type="submit">{{ t('Save event') }}</button><button type="button" @click="emit('close')">{{ t('Cancel') }}</button></div>
  </form>
</template>

<style scoped>
.editor { display: grid; gap: .7rem; padding: 1rem; border: 1px solid var(--rule); border-radius: 12px; }
label { display: grid; gap: .25rem; }
fieldset { min-width: 0; margin: 0; padding: .8rem; border: 1px solid var(--rule); border-radius: 8px; display: grid; gap: .65rem; }
legend, h3 { font-weight: 600; }
h3, p { margin: 0; }
.spending-fields { display: grid; gap: .7rem; padding-top: .7rem; border-top: 1px solid var(--rule); }
.goal-amounts { display: grid; grid-template-columns: 2fr 1fr; gap: .8rem; }
.linked-accounts { max-height: 12rem; overflow: auto; }
.check-row { display: flex; align-items: center; gap: .55rem; overflow-wrap: anywhere; }
.check-row input[type='checkbox'] { width: auto; flex: 0 0 auto; margin: 0; }
.goal-toggle { justify-self: start; font-weight: 600; padding: .5rem 0; }
.editor input, .editor select { box-sizing: border-box; min-width: 0; }
.category { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; padding: .5rem; }
input, select { width: 100%; }
button { margin-right: .5rem; }
[role='alert'] { color: var(--expense); }
@media (max-width: 600px) { .category, .goal-amounts { grid-template-columns: 1fr; } }
</style>
