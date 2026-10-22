<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { t, intlLocale } from '../i18n'
import { useSession } from '../stores/session'
import { useNav } from '../stores/nav'
import { formatMoney } from '../domain/format'
import { buildBudgetReport } from '../domain/budget'
import { todayIso } from '../domain/period'
import {
  categoryRows,
  filterMovements,
  spendingKpis,
  totalsFromMovements,
  type TypeFilter,
} from '../domain/spending'
import PeriodHeader from './PeriodHeader.vue'
import MovementsTable from './MovementsTable.vue'
import ChangeDialog, { type Draft } from './ChangeDialog.vue'
import CategoryBars from './spending/CategoryBars.vue'
import BudgetPlanCard from './spending/BudgetPlanCard.vue'
import LifeEventsCard from './spending/LifeEventsCard.vue'
import BadDecisionsCard from './spending/BadDecisionsCard.vue'
import AiButton from './AiButton.vue'
import Icon from './Icon.vue'

const session = useSession()
// Another screen can open Spending filtered to one account ("account:<id>").
const nav = useNav()
const preset = nav.section?.startsWith('account:') ? nav.section.slice('account:'.length) : ''
const filters = reactive<{ category: string; account: string; type: TypeFilter }>({ category: '', account: preset, type: '' })
const draft = ref<Draft | null>(null)

const TYPES: Record<Exclude<TypeFilter, ''>, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer' }
const categoryNames = computed(() => {
  const init = session.init
  return init ? [...init.expenseCategories, ...init.incomeCategories].map((c) => c.name) : []
})
const hasPhoneFilters = computed(() => !!filters.account || !!filters.type)

const f = computed(() => ({ ...filters, text: '' }))
const kpis = computed(() => spendingKpis(session.movements, f.value))

/** The month summary cannot be filtered by account or type, so those views rebuild totals from movements. */
const budgets = computed(() =>
  Object.fromEntries((session.summary?.expenseByCategory ?? []).map((c) => [c.name, c.budget])),
)
const withoutCategory = computed(() => filterMovements(session.movements, { ...f.value, category: '' }))
const expenseTotals = computed(() =>
  hasPhoneFilters.value
    ? totalsFromMovements(withoutCategory.value.map((m) => ({ ...m, categoryName: m.categoryName ?? t('Uncategorized') })), 'expense', budgets.value)
    : (session.summary?.expenseByCategory ?? []),
)
const incomeTotals = computed(() =>
  hasPhoneFilters.value
    ? totalsFromMovements(withoutCategory.value.map((m) => ({ ...m, categoryName: m.categoryName ?? t('Uncategorized') })), 'income', {})
    : (session.summary?.incomeByCategory ?? []),
)
const report = computed(() => buildBudgetReport(expenseTotals.value, session.period, todayIso()))
const pace = computed(() => Object.fromEntries(report.value.lines.map((l) => [l.name, l.state])))
const unbudgeted = computed(() => categoryRows(report.value.unbudgeted).filter((r) => r.total > 0))
const left = computed(() => report.value.totalBudget - report.value.totalSpent)

const mainTotal = computed(() => (filters.type === 'income' ? kpis.value.income : kpis.value.expense))
const mainLabel = computed(() => (filters.type === 'income' ? t('Income this month') : t('Spent this month')))
const sharePct = computed(() => (kpis.value.share === null ? null : Math.round(kpis.value.share * 100)))

function toggleCategory(name: string) {
  filters.category = filters.category === name ? '' : name
}
function clearFilters() {
  filters.category = ''
  filters.account = ''
  filters.type = ''
}
</script>

<template>
  <section class="spending">
    <header class="top">
      <h1>{{ t('Spending') }}</h1>
      <PeriodHeader />
      <div class="actions" v-if="session.source === 'phone'">
        <button @click="draft = { kind: 'transfer' }">{{ t('Add transfer') }}</button>
        <button class="primary" @click="draft = { kind: 'transaction' }"><Icon name="plus" :size="14" /> {{ t('Add movement') }}</button>
      </div>
    </header>

    <div class="pills" role="group" :aria-label="t('Filters')">
      <label :class="['pill', { on: filters.category }]">
        <span class="sr">{{ t('Category') }}</span>
        <select v-model="filters.category" :aria-label="t('Category')">
          <option value="">{{ t('All categories') }}</option>
          <option v-for="c in categoryNames" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label :class="['pill', { on: filters.account }]">
        <select v-model="filters.account" :aria-label="t('Account')">
          <option value="">{{ t('All accounts') }}</option>
          <option v-for="a in session.init?.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label :class="['pill', { on: filters.type }]">
        <select v-model="filters.type" :aria-label="t('Type')">
          <option value="">{{ t('All types') }}</option>
          <option v-for="(label, key) in TYPES" :key="key" :value="key">{{ t(label) }}</option>
        </select>
      </label>
      <button v-if="filters.category || filters.account || filters.type" class="clear" @click="clearFilters">{{ t('Clear filters') }}</button>
    </div>

    <div class="kpis">
      <div class="card kpi">
        <span class="label">{{ mainLabel }}</span>
        <span class="num big">{{ formatMoney(mainTotal) }}</span>
        <span class="muted small">{{ filters.category || t('All categories') }}</span>
      </div>
      <div class="card kpi">
        <template v-if="filters.category">
          <span class="label">{{ t('Share of all spending') }}</span>
          <span class="num big">{{ sharePct === null ? '—' : `${sharePct.toLocaleString(intlLocale())}%` }}</span>
          <span class="small">
            <AiButton :question="t('Why did my {category} spending change?', { category: filters.category })" :about="t('{category} spending', { category: filters.category })" compact>{{ t('Why?') }}</AiButton>
          </span>
        </template>
        <template v-else>
          <span class="label">{{ t('Income vs spending') }}</span>
          <span class="num big"><span class="income">{{ formatMoney(kpis.income) }}</span></span>
          <span class="muted small">{{ t('spent') }} <b class="num expense">{{ formatMoney(kpis.expense) }}</b></span>
        </template>
      </div>
      <div class="card kpi">
        <span class="label">{{ t('Movements') }}</span>
        <span class="num big">{{ kpis.count.toLocaleString(intlLocale()) }}</span>
        <span class="muted small">{{ t('of {n} this month', { n: session.movements.length.toLocaleString(intlLocale()) }) }}</span>
      </div>
    </div>

    <div class="card cats">
      <div class="card-head">
        <h2>{{ t('Categories and budgets') }}</h2>
        <AiButton :question="t('Suggest realistic monthly budgets from my history')" :about="t('Budgets')">{{ t('Suggest budgets') }}</AiButton>
      </div>
      <p v-if="report.lines.length" class="budget-total">
        <span class="num">{{ formatMoney(report.totalSpent) }}</span>
        <span class="muted"> {{ t('of {amount} budgeted', { amount: formatMoney(report.totalBudget) }) }}</span>
        <span :class="['num', left < 0 ? 'expense' : 'income']"> · {{ left < 0 ? t('over by') : t('left') }} {{ formatMoney(Math.abs(left)) }}</span>
        <span v-if="report.pace !== null" class="muted"> · {{ t('{n}% of the month elapsed', { n: Math.round(report.pace * 100).toLocaleString(intlLocale()) }) }}</span>
      </p>
      <p v-else class="muted small">{{ t('No budgets set for this month. Budgets are set in the Money Manager app on your phone.') }}</p>
      <CategoryBars :totals="expenseTotals" :selected="filters.category" kind="expense" :pace="pace" @toggle="toggleCategory" />
      <p v-if="unbudgeted.length" class="muted small unbudgeted">
        {{ t('{n} categories have no budget: {categories}.', { n: unbudgeted.length.toLocaleString(intlLocale()), categories: unbudgeted.map((r) => r.name).join(', ') }) }}
      </p>
    </div>

    <BudgetPlanCard />
    <LifeEventsCard />
    <BadDecisionsCard />

    <div class="card cats">
      <div class="card-head"><h2>{{ t('Income by category') }}</h2></div>
      <CategoryBars :totals="incomeTotals" :selected="filters.category" kind="income" @toggle="toggleCategory" />
    </div>

    <MovementsTable :category="filters.category" :account="filters.account" :type="filters.type" />
    <ChangeDialog v-if="draft" :draft="draft" @close="draft = null" />
  </section>
</template>

<style scoped>
.spending { display: grid; gap: 1.25rem; }
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.5rem; }
.top h1 { margin: 0; font-size: 2rem; }
.actions { margin-left: auto; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.actions .primary { display: inline-flex; align-items: center; gap: 0.35rem; }
.pills { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.pill { position: relative; cursor: pointer; padding: 0 0.4rem; border: 1px solid var(--rule); background: var(--paper); }
.pill:hover { border-color: var(--ink-soft); }
.pill select { border: 0; background: transparent; color: inherit; padding: 0.4rem 0.4rem; cursor: pointer; max-width: 14rem; }
.pill select option { color: var(--ink); background: var(--paper); }
.clear { border: 0; background: none; color: var(--accent); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1rem; }
.kpi { display: grid; gap: 0.25rem; align-content: start; }
.kpi .big { font-size: 1.9rem; }
.small { font-size: 0.85rem; }
.budget-total { margin: 0 0 0.75rem; }
.unbudgeted { margin: 0.9rem 0 0; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
