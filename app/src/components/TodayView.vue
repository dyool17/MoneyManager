<script setup lang="ts">
import { computed, watch } from 'vue'
import Icon from './Icon.vue'
import AiButton from './AiButton.vue'
import PaceChart from './today/PaceChart.vue'
import { useHistory } from '../stores/history'
import { useSession } from '../stores/session'
import { useAccountMetadata } from '../stores/metadata'
import { useChat } from '../stores/chat'
import { useBrief } from '../stores/brief'
import { useNav } from '../stores/nav'
import { useLiquid } from '../composables/liquid'
import { analyze } from '../domain/insights'
import { cushionMonths, futureCommitments, healthScore, outliers, projectMonth, volatility } from '../domain/health'
import { pace, safeToSpend } from '../domain/today'
import { formatMoney } from '../domain/format'
import { todayIso } from '../domain/period'

const history = useHistory()
const session = useSession()
const metadata = useAccountMetadata()
const chat = useChat()
const brief = useBrief()
const nav = useNav()
const { liquid } = useLiquid()

const today = todayIso()
const month = today.slice(0, 7)
const dayOfMonth = Number(today.slice(8, 10))
const first = (() => {
  const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
})()

const ready = computed(() => history.state === 'ready')
const r = computed(() => (ready.value ? analyze(history.movements, first, today) : null))
const now = computed(() => r.value?.months.find((m) => m.month === month) ?? { month, income: 0, expense: 0, net: 0 })
const past = computed(() => (r.value?.months ?? []).filter((m) => m.month < month))
const projection = computed(() => (r.value ? projectMonth(history.movements, today, r.value.months) : null))
const scheduled = computed(() => (ready.value ? futureCommitments(history.movements, today).find((c) => c.month === month)?.total ?? 0 : 0))
const p = computed(() => pace(history.movements, today, past.value.slice(-6).map((m) => m.month)))
const daysLeft = computed(() => p.value.daysInMonth - dayOfMonth)
const expectedIncome = computed(() => projection.value?.income ?? now.value.income)
const safe = computed(() => safeToSpend({ income: expectedIncome.value, spent: now.value.expense, scheduled: scheduled.value, daysLeft: daysLeft.value }))
const closing = computed(() => (projection.value ? projection.value.income - projection.value.projected : null))

const averageIncome = computed(() => past.value.reduce((a, m) => a + m.income, 0) / (past.value.length || 1))
const liquidKnown = computed(() => session.assets.length > 0)
const debts = computed(() => metadata.totals.debts ?? session.dashboard?.debts ?? null)
const score = computed(() => {
  if (!r.value) return null
  const cushion = liquidKnown.value ? cushionMonths(liquid.value, r.value.averageExpense) : null
  return healthScore({ savingsRate: r.value.savingsRate, cushion, cardDebt: Math.abs(debts.value ?? 0), averageIncome: averageIncome.value, volatility: volatility(past.value), months: r.value.months })
})
const weakest = computed(() => score.value ? [...score.value.parts].sort((a, b) => a.points / a.max - b.points / b.max).slice(0, 2).map((x) => x.label.toLowerCase()).join(' and ') : '')
const nextMonths = computed(() => (ready.value ? futureCommitments(history.movements, today).filter((c) => c.month > month).slice(0, 3) : []))

type Item = { title: string; detail: string; question?: string; about?: string; action?: { label: string; run: () => void } }
const attention = computed<Item[]>(() => {
  const out: Item[] = []
  if (closing.value !== null && closing.value < 0) out.push({ title: `${monthName.value} closes ${formatMoney(-closing.value)} short`, detail: 'Projection from your past months', question: `Why is ${monthName.value} projected to close ${formatMoney(-closing.value)} short, and how can I close the gap?`, about: 'Month-end projection' })
  if (now.value.expense > now.value.income && now.value.income > 0) out.push({ title: 'Spending passed this month\'s income', detail: `${formatMoney(now.value.expense - now.value.income)} over so far`, question: 'What pushed my spending above my income this month?', about: 'This month' })
  const rising = r.value?.opportunities.find((o) => o.kind === 'rising')
  if (rising) out.push({ title: rising.title, detail: `${formatMoney(rising.monthly)} more per month`, question: `${rising.title}. What changed?`, about: rising.title })
  const odd = outliers(history.movements.filter((m) => m.date >= first && m.date <= today)).filter((o) => o.movement.date.startsWith(month))[0]
  if (odd) out.push({ title: `Unusual: ${formatMoney(odd.movement.amount)} on ${odd.movement.date.slice(5)}`, detail: `${odd.times}× a typical ${odd.movement.subcategoryName || odd.movement.categoryName || 'expense'}`, question: `Why is the ${formatMoney(odd.movement.amount)} expense on ${odd.movement.date} unusual?`, about: 'Unusual expense' })
  if (!liquidKnown.value) out.push({ title: 'Emergency cushion unknown', detail: 'Connect the phone to read balances', action: { label: 'Connect', run: () => nav.go('settings', 'phone') } })
  return out.slice(0, 4)
})

const monthName = computed(() => new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { month: 'long' }))
const longDate = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening' })()
const headline = computed(() => {
  if (!ready.value || !projection.value) return 'Here is how your month is going.'
  const ratio = now.value.expense / (p.value.typical[dayOfMonth - 1] || now.value.expense || 1)
  return ratio > 1.05 ? 'Spending is running ahead this month.' : ratio < 0.95 ? 'Spending is below your usual pace.' : 'Spending is on your usual pace.'
})
/** Fixed-rule summary shown when the assistant is not set up, or while it writes. */
const plain = computed(() => {
  if (!projection.value) return ''
  const c = closing.value ?? 0
  return `You have spent ${formatMoney(now.value.expense)} with ${daysLeft.value} days left. At your usual pace ${monthName.value} closes near ${formatMoney(projection.value.projected)}, ${c >= 0 ? `leaving about ${formatMoney(c)}` : `about ${formatMoney(-c)} short`}.`
})

// Also reloads after a phone connection resets the history.
watch(() => history.state, (s) => { if (s === 'idle') history.fromSession(12) }, { immediate: true })
</script>

<template>
  <section class="today">
    <header>
      <div class="label">{{ longDate }} · day {{ dayOfMonth }} of {{ p.daysInMonth }}</div>
      <h1>{{ greeting }}. {{ headline }}</h1>
    </header>

    <p v-if="history.state === 'loading' || history.state === 'idle'" class="card muted">Reading the last 12 months…</p>
    <p v-else-if="history.state === 'failed'" class="card warn">Could not read your history: {{ history.error }}</p>

    <template v-else>
      <section class="card brief ai-surface" aria-label="Your brief">
        <div class="brief-text">
          <div class="brief-label"><Icon name="sparkle" :size="14" />{{ brief.state === 'ready' ? 'Your brief · written by the assistant from today\'s reports' : 'Your month in one line' }}</div>
          <p v-if="chat.ready && brief.state === 'ready'" class="lead">{{ brief.text }}</p>
          <p v-else class="lead">{{ plain }}</p>
          <p v-if="brief.state === 'failed'" class="muted small">The assistant could not write the brief: {{ brief.error }}</p>
          <div v-if="chat.ready" class="brief-actions">
            <button v-if="closing !== null && closing < 0" type="button" @click="nav.ask('How can I close this month\'s gap?', 'This month')">How can I close the gap?</button>
            <button type="button" @click="nav.ask('What changed most this month compared with my usual months?', 'This month')">What changed this month?</button>
            <button v-if="brief.state === 'ready'" type="button" class="link" @click="brief.load(today, true)">Rewrite</button>
            <button v-else type="button" class="link" :disabled="brief.state === 'loading' || !chat.context" @click="brief.load(today)">{{ brief.state === 'loading' ? 'Writing…' : 'Write my brief' }}</button>
          </div>
        </div>
        <div class="brief-side">
          <div>
            <div class="muted small">Safe to spend per day</div>
            <div :class="['num', 'big', { warn: safe.perDay === 0 }]">{{ formatMoney(safe.perDay) }}</div>
            <div class="muted small">{{ safe.left > 0 ? `${formatMoney(safe.left)} left after scheduled charges` : 'Your usual income is already used up' }}</div>
          </div>
          <div v-if="closing !== null">
            <div class="muted small">Projected month end</div>
            <div class="num mid">{{ closing >= 0 ? '+' : '−' }}{{ formatMoney(Math.abs(closing)) }}</div>
          </div>
        </div>
      </section>

      <div class="kpis">
        <div class="card">
          <div class="label">Spent in {{ monthName }}</div>
          <div class="num big">{{ formatMoney(now.expense) }}</div>
          <div class="muted small">of {{ formatMoney(now.income) }} income received</div>
          <div class="track"><span :style="{ width: `${Math.min(100, now.income ? (now.expense / now.income) * 100 : 0)}%`, background: now.expense > now.income ? 'var(--expense)' : 'var(--accent)' }" /></div>
        </div>
        <div class="card">
          <div class="label">Savings rate, 12 months</div>
          <div class="num big">{{ r?.savingsRate === null || r?.savingsRate === undefined ? '—' : `${(r.savingsRate * 100).toFixed(1)}%` }}</div>
          <div class="muted small">{{ formatMoney(averageIncome - (r?.averageExpense ?? 0)) }} left over per month</div>
        </div>
        <button type="button" class="card kpi-link" @click="nav.go('analysis')">
          <div class="label">Financial health</div>
          <div><span class="num big">{{ score?.total ?? '—' }}</span><span class="muted"> / 100</span></div>
          <div class="muted small">Weakest: {{ weakest }}</div>
        </button>
        <div class="card">
          <div class="label">Already scheduled</div>
          <div class="num big">{{ formatMoney(nextMonths[0]?.total ?? 0) }}</div>
          <div class="muted small">{{ nextMonths.length ? 'next month, from saved future entries' : 'Nothing saved for future dates' }}</div>
        </div>
      </div>

      <div class="row">
        <section class="card pace-card">
          <div class="card-head">
            <div><h2>{{ monthName }} pace</h2><div class="muted small">Cumulative spending against a typical month (last 6 months)</div></div>
            <AiButton question="Explain how my spending pace this month compares with a typical month" :about="`${monthName} pace`" />
          </div>
          <PaceChart :actual="p.actual" :typical="p.typical" :days-in-month="p.daysInMonth" :projected="projection?.projected ?? null"
            :label="`${monthName}: ${formatMoney(now.expense)} spent by day ${dayOfMonth}; a typical month had ${formatMoney(p.typical[dayOfMonth - 1] ?? 0)} by then; projected ${formatMoney(projection?.projected ?? 0)}`" />
        </section>

        <section class="card attention">
          <h2>Needs attention</h2>
          <p v-if="!attention.length" class="muted">Nothing stands out right now.</p>
          <div v-for="a in attention" :key="a.title" class="item">
            <div><b>{{ a.title }}</b><div class="muted small">{{ a.detail }}</div></div>
            <AiButton v-if="a.question" :question="a.question" :about="a.about" compact>Why?</AiButton>
            <button v-else-if="a.action" type="button" @click="a.action.run()">{{ a.action.label }}</button>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.today { display: flex; flex-direction: column; gap: 1.25rem; }
header h1 { margin: 0.35rem 0 0; font-size: 2rem; line-height: 1.2; }
.small { font-size: 0.85rem; }
.warn { color: var(--warn-ink); }
.brief { display: flex; flex-wrap: wrap; gap: 1.5rem; }
.brief-text { flex: 1 1 520px; display: flex; flex-direction: column; gap: 0.6rem; }
.brief-label { display: flex; align-items: center; gap: 0.45rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ai-accent); }
.lead { margin: 0; font-size: 1.12rem; line-height: 1.55; }
.writing { color: var(--ai-soft); font-size: 0.9rem; }
.brief-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.2rem; }
.brief-actions button { background: var(--ai-raise); border-color: var(--ai-line); color: var(--ai-ink); }
.brief-actions button.link { background: transparent; color: var(--ai-accent); }
.brief-side { flex: 0 1 260px; display: grid; gap: 0.9rem; align-content: start; padding-left: 1.5rem; border-left: 1px solid var(--ai-line); }
.brief-side .warn { color: #fdba74; }
.mid { font-size: 1.45rem; font-weight: 600; }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
.kpis .card { display: grid; gap: 0.35rem; align-content: start; }
.kpis .track { margin-top: 0.4rem; height: 6px; }
.kpi-link { text-align: left; border: 0; font: inherit; cursor: pointer; }
.kpi-link:hover { box-shadow: 0 0 0 1px var(--accent-line); }
.row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: stretch; }
.pace-card { flex: 2 1 560px; min-width: 0; }
.pace-card h2, .attention h2 { margin: 0; font-size: 1.05rem; }
.attention { flex: 1 1 320px; display: flex; flex-direction: column; }
.attention h2 { margin-bottom: 0.4rem; }
.item { display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; padding: 0.8rem 0; border-bottom: 1px solid var(--track); }
.item:last-child { border-bottom: 0; }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .brief-side { padding-left: 0; border-left: 0; } .kpis { grid-template-columns: 1fr; } header h1 { font-size: 1.5rem; } }
</style>
