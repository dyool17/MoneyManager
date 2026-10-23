<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { t } from '../../i18n'
import { useSession } from '../../stores/session'
import { useBudgetPlans } from '../../stores/budgets'
import { useLifeEvents } from '../../stores/life-events'
import { todayIso } from '../../domain/period'
import { validateLifeEvents, type EventKind, type LifeEvent } from '../../domain/life-events'
import { readSelection, writeSelection } from './selection'

const props = defineProps<{ event: LifeEvent | null }>()
const emit = defineEmits<{ close: [] }>()
const session = useSession()
const plans = useBudgetPlans()
const events = useLifeEvents()
const form = reactive({ label: props.event?.label ?? '', kind: props.event?.kind ?? 'one-off' as EventKind, start: props.event?.start ?? todayIso(), end: props.event?.end ?? '' })
const selection = reactive(readSelection(props.event ?? { categoryIds: [] }))
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
    const event: LifeEvent = { id: props.event?.id ?? crypto.randomUUID(), ...form, end: form.end || undefined, ...writeSelection(selection) }
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
    <label>{{ t('Kind') }}<select v-model="form.kind"><option value="one-off">{{ t('One-off spike') }}</option><option value="new-normal">{{ t('New normal') }}</option><option value="temporary">{{ t('Temporary') }}</option></select></label>
    <p>{{ form.kind === 'one-off' ? t('One-off: a single spike, excluded from the projection baseline.') : form.kind === 'new-normal' ? t('New normal: the category baseline restarts at this date.') : t('Temporary: spending changes while this event lasts.') }}</p>
    <label>{{ t('Start') }}<input v-model="form.start" type="date" required /></label>
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
    <p v-if="error" role="alert">{{ t('Could not save locally: {error}', { error: t(error) }) }}</p>
    <div><button type="submit">{{ t('Save event') }}</button><button type="button" @click="emit('close')">{{ t('Cancel') }}</button></div>
  </form>
</template>

<style scoped>
.editor { display: grid; gap: .7rem; padding: 1rem; border: 1px solid var(--rule); border-radius: 12px; }
label { display: grid; gap: .25rem; }
fieldset { max-height: 24rem; overflow: auto; border: 1px solid var(--rule); }
.category { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; padding: .5rem; }
input, select { width: 100%; }
button { margin-right: .5rem; }
[role='alert'] { color: var(--expense); }
@media (max-width: 600px) { .category { grid-template-columns: 1fr; } }
</style>
