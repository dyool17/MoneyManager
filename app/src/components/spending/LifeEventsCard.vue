<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { t } from '../../i18n'
import { formatDate } from '../../domain/format'
import { useSession } from '../../stores/session'
import { useBudgetPlans } from '../../stores/budgets'
import { useLifeEvents } from '../../stores/life-events'
import { todayIso } from '../../domain/period'
import type { EventKind, LifeEvent } from '../../domain/life-events'

const session = useSession()
const plans = useBudgetPlans()
const events = useLifeEvents()

const form = reactive({ label: '', kind: 'one-off' as EventKind, start: todayIso(), end: '', categories: [] as string[] })
const error = ref('')
const adding = ref(false)

/** Category choices: imported budget uids plus every category seen in the loaded movements. */
const choices = computed(() => {
  const byId = new Map<string, string>()
  for (const b of plans.state.plan?.budgets ?? []) byId.set(b.categoryId, b.parent ? `${b.parent} · ${b.name}` : b.name)
  for (const m of session.movements) {
    if (m.categoryId && m.categoryName) byId.set(m.categoryId, byId.get(m.categoryId) ?? m.categoryName)
    if (m.subcategoryId && m.subcategoryName) byId.set(m.subcategoryId, byId.get(m.subcategoryId) ?? `${m.categoryName || ''} · ${m.subcategoryName}`)
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
})
const nameOf = (id: string) => choices.value.find((c) => c.id === id)?.name ?? id
const toggle = (id: string) => {
  form.categories = form.categories.includes(id) ? form.categories.filter((c) => c !== id) : [...form.categories, id]
}

function submit() {
  error.value = ''
  if (!form.label.trim() || !form.categories.length) { error.value = 'Write a note and pick at least one category.'; return }
  try {
    events.add({ label: form.label.trim(), kind: form.kind, start: form.start, end: form.end || undefined, categoryIds: form.categories })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    return
  }
  adding.value = false
  Object.assign(form, { label: '', kind: 'one-off', start: todayIso(), end: '', categories: [] })
}
const remove = (id: string) => {
  error.value = ''
  try { events.remove(id) } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
const KIND_LABEL: Record<EventKind, string> = { 'one-off': 'One-off spike', 'new-normal': 'New normal', temporary: 'Temporary' }
const rangeOf = (e: LifeEvent) => (e.end ? t('{start} to {end}', { start: formatDate(e.start), end: formatDate(e.end) }) : t('{start} onwards', { start: formatDate(e.start) }))
</script>

<template>
  <div class="card cats events">
    <div class="card-head">
      <h2>{{ t('Life events') }}</h2>
      <button type="button" @click="adding = !adding">{{ adding ? t('Cancel') : t('Add event') }}</button>
    </div>

    <p class="muted small">
      {{ t('Notes like a move, an illness or a new baby that explain unusual spending. The assistant reads them (without labels unless you share transaction descriptions) to project and explain better. Saved on this computer only.') }}
    </p>

    <form v-if="adding" class="form" @submit.prevent="submit">
      <label>{{ t('Note') }} <input v-model="form.label" maxlength="80" :placeholder="t('Moving')" required /></label>
      <label>{{ t('Kind') }}
        <select v-model="form.kind">
          <option value="one-off">{{ t('One-off spike') }}</option>
          <option value="new-normal">{{ t('New normal (baseline restarts)') }}</option>
          <option value="temporary">{{ t('Temporary') }}</option>
        </select>
      </label>
      <div class="dates">
        <label>{{ t('Start') }} <input v-model="form.start" type="date" required /></label>
        <label>{{ t('End (blank = still open)') }} <input v-model="form.end" type="date" /></label>
      </div>
      <fieldset><legend>{{ t('Affected categories') }}</legend>
        <label v-for="c in choices" :key="c.id" class="cat"><input type="checkbox" :checked="form.categories.includes(c.id)" @change="toggle(c.id)" /> {{ c.name }}</label>
      </fieldset>
      <p v-if="error" class="error" role="alert">{{ t(error) }}</p>
      <button class="primary" type="submit">{{ t('Save event') }}</button>
    </form>

    <ul v-if="events.state.events.length" class="rows">
      <li v-for="e in events.state.events" :key="e.id">
        <span class="ev">
          <span class="name">{{ e.label }}</span>
          <span class="muted small">{{ rangeOf(e) }} · {{ t(KIND_LABEL[e.kind]) }} · {{ e.categoryIds.map(nameOf).join(', ') }}</span>
          <button type="button" class="hint" @click="remove(e.id)">{{ t('Remove') }}</button>
        </span>
      </li>
    </ul>
    <p v-else class="muted small">{{ t('No events recorded.') }}</p>
    <p v-if="events.storageError" class="error" role="alert">{{ t(events.storageError) }}</p>
  </div>
</template>

<style scoped>
.events { margin-top: 1.25rem; }
.form { display: grid; gap: 0.5rem; margin: 0.5rem 0; }
.dates { display: flex; gap: 1rem; flex-wrap: wrap; }
.form input, .form select { max-width: 16rem; }
fieldset { border: 1px solid var(--rule); border-radius: 8px; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; padding: 0.5rem; max-height: 12rem; overflow-y: auto; }
fieldset legend { font-size: 0.85rem; color: var(--ink-soft); }
.cat { font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.3rem; }
.rows { display: grid; gap: 0.4rem; margin: 0.5rem 0 0; padding: 0; list-style: none; }
.ev { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 1rem; }
.ev .name { min-width: 8rem; }
.hint { border: 0; background: none; color: var(--expense); font-size: 0.85rem; cursor: pointer; padding: 0; }
.error { color: var(--expense); margin: 0.5rem 0 0; }
.small { font-size: 0.85rem; }
.muted { color: var(--ink-soft); }
</style>
