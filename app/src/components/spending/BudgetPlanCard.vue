<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, intlLocale } from '../../i18n'
import { useSession } from '../../stores/session'
import { useBudgetPlans } from '../../stores/budgets'
import { evaluateBudgets, suggestsAnnual, type BudgetStatus } from '../../domain/budget-plan'
import { elapsedShare } from '../../domain/budget'
import { todayIso } from '../../domain/period'
import { formatMoney } from '../../domain/format'

const session = useSession()
const budgets = useBudgetPlans()

const importError = ref('')
async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importError.value = ''
  try {
    await budgets.importFromFile(file)
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e)
  }
}

const month = computed(() => session.period.startDate.slice(0, 7))
const pace = computed(() => elapsedShare(session.period, todayIso()))
const statuses = computed<BudgetStatus[]>(() => {
  const plan = budgets.state.plan
  if (!plan || !month.value) return []
  return evaluateBudgets(plan, session.movements, month.value, budgets.state.modes, pace.value)
})

/** Categories the data suggests judging on the year; the user confirms each one. */
const suggestions = computed(() =>
  budgets.state.plan?.budgets
    .filter((b) => budgets.state.modes[b.categoryId] === undefined && suggestsAnnual(b, session.movements, month.value))
    .map((b) => b.categoryId) ?? [],
)
const suggested = (id: string) => suggestions.value.includes(id)
const STATE_LABEL = { ok: 'on track', ahead: 'spending fast', over: 'over budget' } as const
</script>

<template>
  <div class="card cats plan">
    <div class="card-head">
      <h2>{{ t('Imported budgets') }}</h2>
      <label class="import">
        <span class="small muted">{{ budgets.importing ? t('Reading backup locally…') : t('Import .mmbak / .sqlite') }}</span>
        <input type="file" accept=".mmbak,.sqlite,.sqlite3" :disabled="budgets.importing" @change="onFile" />
      </label>
    </div>

    <p class="muted small">
      {{ t('Subcategory and annual budgets come from a native backup you export from the phone. Read in memory and saved on this computer only; nothing is sent anywhere or written to the phone.') }}
      <template v-if="budgets.state.plan"> {{ t('Last import: {date}.', { date: new Date(budgets.state.plan.importedAt).toLocaleString(intlLocale()) }) }}</template>
    </p>

    <p v-if="budgets.storageError || importError" class="error" role="alert">{{ t(budgets.storageError || importError) }}</p>

    <p v-if="!budgets.state.plan" class="muted small">
      {{ t("No imported budgets yet, so categories are judged month by month from the phone's top-level budgets.") }}
    </p>
    <template v-else>
      <p v-if="suggestions.length" class="muted small" role="status">
        {{ t('{n} categories concentrate spending in a few months of the year; judging on the year keeps those seasonal spikes inside the annual allowance.', { n: suggestions.length.toLocaleString(intlLocale()) }) }}
      </p>
      <ul class="rows">
        <li v-for="s in statuses" :key="s.categoryId">
          <span class="row name-cell">
            <span class="name">{{ s.name }}<span v-if="s.parent" class="muted small"> · {{ s.parent }}</span></span>
            <span :class="['note', s.state]">{{ t(STATE_LABEL[s.state]) }} · {{ t('{spent} of {budget}', { spent: formatMoney(s.judgedSpent), budget: formatMoney(s.judgedBudget) }) }}</span>
            <span class="seg mode" role="group" :aria-label="t('Budget mode for {name}', { name: s.name })">
              <button :aria-pressed="s.mode === 'monthly'" @click="budgets.setMode(s.categoryId, 'monthly')">{{ t('Monthly') }}</button>
              <button :aria-pressed="s.mode === 'annual'" @click="budgets.setMode(s.categoryId, 'annual')">{{ t('Annual') }}</button>
            </span>
            <button v-if="suggested(s.categoryId)" type="button" class="hint" @click="budgets.setMode(s.categoryId, 'annual')">
              {{ t('Spends in bursts — use annual?') }}
            </button>
          </span>
        </li>
      </ul>
      <p v-if="!statuses.length" class="muted small">{{ t('No spending recorded for this month yet.') }}</p>
    </template>
  </div>
</template>

<style scoped>
.plan { margin-top: 1.25rem; }
.import { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
.rows { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
.row.name-cell { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 1rem; }
.row.name-cell .name { min-width: 12rem; }
.mode button { padding: 0.2rem 0.6rem; font-size: 0.8rem; }
.hint { border: 0; background: none; color: var(--accent); font-size: 0.85rem; cursor: pointer; padding: 0; }
.note { font-size: 0.85rem; }
.error { color: var(--expense); margin: 0.5rem 0 0; }
.small { font-size: 0.85rem; }
.muted { color: var(--ink-soft); }
</style>
