<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useHistory } from '../stores/history'
import { useSession } from '../stores/session'
import { analyze, categoryShares } from '../domain/insights'
import { formatDate, formatMoney, monthLabel } from '../domain/format'
import BarChart from './BarChart.vue'
import SpendingCalendar from './SpendingCalendar.vue'

const history = useHistory()
const session = useSession()
const RANGES = [3, 6, 12] as const
const range = ref<number>(12)
const selectedMonth = ref<number | null>(null)
const openDay = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

/** Analysis span: the last `range` months of what was loaded. */
const first = computed(() => {
  const last = history.span.last
  if (!last) return ''
  const [y, m] = last.split('-').map(Number)
  const d = new Date(y, m - range.value, 1)
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  return start < history.span.first ? history.span.first : start
})
const r = computed(() => (first.value ? analyze(history.movements, first.value, history.span.last) : null))

const shortMonth = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'short' })
const monthRows = computed(() => r.value?.months.map((m) => ({ label: shortMonth(m.month), values: { income: m.income, expense: m.expense } })) ?? [])
const SERIES = [
  { key: 'income', label: 'Income', color: 'var(--income)' },
  { key: 'expense', label: 'Spent', color: 'var(--expense)' },
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const weekdayRows = computed(() => r.value?.weekdays.map((w) => ({ label: WEEKDAYS[w.weekday]!, values: { average: w.average } })) ?? [])
const peakWeekday = computed(() => r.value && [...r.value.weekdays].sort((a, b) => b.average - a.average)[0])

/** Categories for the clicked month, or for the whole span. */
const focusMonth = computed(() => (selectedMonth.value === null ? null : r.value?.months[selectedMonth.value]?.month ?? null))
const categories = computed(() => {
  if (!r.value) return []
  const list = focusMonth.value
    ? categoryShares(history.movements.filter((m) => m.date.startsWith(focusMonth.value!)))
    : r.value.categories
  const top = list.slice(0, 10)
  const rest = list.slice(10)
  if (rest.length) top.push({ name: `${rest.length} more`, total: rest.reduce((a, c) => a + c.total, 0), share: rest.reduce((a, c) => a + c.share, 0), count: rest.reduce((a, c) => a + c.count, 0) })
  return top
})
const catMax = computed(() => Math.max(1, ...categories.value.map((c) => c.total)))
const changeOf = (name: string) => r.value?.changes.find((c) => c.name === name)

const worst = computed(() => r.value && [...r.value.months].sort((a, b) => b.expense - a.expense)[0])
const best = computed(() => r.value && [...r.value.months].sort((a, b) => b.net - a.net)[0])
const dayMovements = computed(() => (openDay.value ? history.movements.filter((m) => m.date === openDay.value && m.type === 'expense').sort((a, b) => b.amount - a.amount) : []))
const totalOpportunity = computed(() => r.value?.opportunities.filter((o) => o.kind !== 'overspent-month').reduce((a, o) => a + o.monthly, 0) ?? 0)

watch(range, () => { selectedMonth.value = null })
// A new connection or book replaces live history; a loaded backup stays until replaced.
watch(() => [session.source, session.address, session.bookId], () => { if (history.source !== 'backup') loadFromSession() })
const loadFromSession = () => history.fromSession(12)
async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) await history.fromBackup(file, 12)
  if (fileInput.value) fileInput.value.value = ''
}
onMounted(() => { if (history.state === 'idle') loadFromSession() })
</script>

<template>
  <section class="insights">
    <header class="top">
      <div>
        <h1>Insights</h1>
        <p class="sub">
          <template v-if="history.state === 'ready'">
            {{ history.source === 'backup' ? 'From a backup file' : session.source === 'demo' ? 'From demo data' : 'Live from your phone' }}
            · {{ formatDate(first) }} – {{ formatDate(history.span.last) }}
          </template>
          <template v-else-if="history.state === 'loading'">Reading your history…</template>
          <template v-else>Spending patterns across months.</template>
        </p>
      </div>
      <div class="controls">
        <div class="seg" role="group" aria-label="Range">
          <button v-for="n in RANGES" :key="n" :aria-pressed="range === n" @click="range = n">{{ n }} months</button>
        </div>
        <button class="ghost" :disabled="history.state === 'loading'" @click="loadFromSession">Reload</button>
        <button class="ghost" @click="fileInput?.click()">Open backup…</button>
        <input ref="fileInput" type="file" accept=".mmbak,.sqlite" hidden @change="onFile" />
      </div>
    </header>

    <p v-if="history.state === 'failed'" class="error" role="alert">
      Could not read the history: {{ history.error }}. Connect the phone and press Reload, or open a backup.
    </p>

    <template v-if="r">
      <div class="tiles">
        <div class="tile">
          <span>Average spent per month</span>
          <strong class="amount">{{ formatMoney(r.averageExpense) }}</strong>
        </div>
        <div class="tile">
          <span>Saved of what came in</span>
          <strong :class="['amount', (r.savingsRate ?? 0) >= 0 ? 'income' : 'expense']">{{ r.savingsRate === null ? '—' : `${Math.round(r.savingsRate * 1000) / 10}%` }}</strong>
        </div>
        <div class="tile" v-if="worst">
          <span>Highest spending month</span>
          <strong>{{ monthLabel(worst.month + '-01') }}</strong>
          <small class="amount expense">{{ formatMoney(worst.expense) }}</small>
        </div>
        <div class="tile" v-if="best">
          <span>Best month to save</span>
          <strong>{{ monthLabel(best.month + '-01') }}</strong>
          <small class="amount income">{{ formatMoney(best.net) }} left over</small>
        </div>
      </div>

      <div class="card wide">
        <div class="card-head">
          <h2>Income and spending by month</h2>
          <small>Click a month to see its categories.</small>
        </div>
        <BarChart :rows="monthRows" :series="SERIES" label="Income and spending by month" :selected="selectedMonth" @select="selectedMonth = $event" />
      </div>

      <div class="grid">
        <div class="card">
          <div class="card-head">
            <h2>Where the money goes</h2>
            <button v-if="focusMonth" class="chip" @click="selectedMonth = null">{{ monthLabel(focusMonth + '-01') }} ✕</button>
          </div>
          <p v-if="!categories.length" class="empty">No spending in this span.</p>
          <ol class="cats">
            <li v-for="c in categories" :key="c.name">
              <div class="cat-row">
                <span class="name">{{ c.name }} <small v-if="c.group">{{ c.group }}</small></span>
                <span class="amount">{{ formatMoney(c.total) }}</span>
              </div>
              <div class="track"><span :style="{ width: `${(c.total / catMax) * 100}%` }" /></div>
              <div class="meta">
                <span>{{ Math.round(c.share * 100) }}% · {{ c.count }} {{ c.count === 1 ? 'expense' : 'expenses' }}</span>
                <span v-if="!focusMonth && changeOf(c.name)?.previous && Math.abs(changeOf(c.name)!.change) >= 1" :class="['delta', changeOf(c.name)!.change > 0 ? 'up' : 'down']">
                  {{ changeOf(c.name)!.change > 0 ? '▲' : '▼' }} {{ formatMoney(Math.abs(changeOf(c.name)!.change)) }}/mo vs prior 3
                </span>
              </div>
            </li>
          </ol>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>Ways to spend less</h2>
            <small v-if="totalOpportunity">Up to {{ formatMoney(totalOpportunity) }}/mo to review</small>
          </div>
          <p v-if="!r.opportunities.length" class="empty">Nothing stands out. Nice.</p>
          <ul class="opps">
            <li v-for="(o, i) in r.opportunities.slice(0, 6)" :key="i" :class="o.kind">
              <span class="icon" aria-hidden="true">{{ { rising: '↗', recurring: '↻', 'small-purchases': '⋯', 'overspent-month': '!' }[o.kind] }}</span>
              <div>
                <strong>{{ o.month ? `Spent more than earned in ${monthLabel(o.month + '-01')}` : o.title }}</strong>
                <p>{{ o.detail }}</p>
              </div>
              <span class="amount">{{ formatMoney(o.monthly) }}<small>{{ o.kind === 'overspent-month' ? ' over' : '/mo' }}</small></span>
            </li>
          </ul>
          <details v-if="r.recurring.length" class="recurring">
            <summary>See the {{ r.recurring.length }} repeating charges</summary>
            <table>
              <tr v-for="c in r.recurring" :key="c.label + c.amount">
                <th scope="row">{{ c.label }} <small>{{ c.category }}</small></th>
                <td>{{ c.months }} months</td>
                <td class="amount">{{ formatMoney(c.amount) }}</td>
              </tr>
            </table>
          </details>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <div class="card-head">
            <h2>Spending by day of the week</h2>
            <small v-if="peakWeekday">{{ WEEKDAYS[peakWeekday.weekday] }} costs the most: {{ formatMoney(peakWeekday.average) }} on average</small>
          </div>
          <BarChart :rows="weekdayRows" :series="[{ key: 'average', label: 'Average', color: 'var(--accent)' }]" label="Average spending per weekday" :height="180" />
        </div>
        <div class="card">
          <div class="card-head"><h2>Days you spent the most</h2></div>
          <ol class="days">
            <li v-for="(d, i) in r.topDays" :key="d.date">
              <button :aria-expanded="openDay === d.date" @click="openDay = openDay === d.date ? null : d.date">
                <span class="rank">{{ i + 1 }}</span>
                <span>{{ formatDate(d.date) }} <small>{{ d.count }} {{ d.count === 1 ? 'expense' : 'expenses' }}</small></span>
                <span class="amount expense">{{ formatMoney(d.total) }}</span>
              </button>
              <ul v-if="openDay === d.date" class="day-list">
                <li v-for="m in dayMovements" :key="m.id">
                  <span>{{ m.content || m.subcategoryName || m.categoryName }}</span>
                  <span class="amount">{{ formatMoney(m.amount) }}</span>
                </li>
              </ul>
            </li>
          </ol>
        </div>
      </div>

      <div class="card wide">
        <div class="card-head"><h2>Daily spending calendar</h2></div>
        <SpendingCalendar :days="r.days" :first="first" :last="history.span.last" />
      </div>
    </template>
  </section>
</template>

<style scoped>
.insights { display: grid; gap: 1.25rem; }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }
h1 { margin: 0; font-size: 1.6rem; letter-spacing: -0.02em; }
.sub { margin: 0.2rem 0 0; color: var(--ink-soft); }
.controls { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; }
.seg button, .ghost, .chip { font: inherit; border: 0; background: var(--paper); color: var(--ink); padding: 0.4rem 0.8rem; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--rule); }
.seg button[aria-pressed='true'] { background: var(--ink); color: var(--paper); }
.ghost { border: 1px solid var(--rule); border-radius: 8px; }
.ghost:disabled { opacity: 0.5; cursor: progress; }
.chip { border-radius: 99px; background: var(--mist); font-size: 0.82rem; padding: 0.2rem 0.65rem; }
.error { background: var(--warn-bg); color: var(--warn-ink); padding: 0.75rem 1rem; border-radius: 8px; margin: 0; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.tile, .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; }
.tile { padding: 1rem 1.2rem; display: grid; gap: 0.15rem; animation: rise 0.4s ease both; }
.tile:nth-child(2) { animation-delay: 0.05s; } .tile:nth-child(3) { animation-delay: 0.1s; } .tile:nth-child(4) { animation-delay: 0.15s; }
.tile span { color: var(--ink-soft); font-size: 0.85rem; }
.tile strong { font-size: 1.45rem; font-weight: 650; letter-spacing: -0.01em; text-transform: capitalize; }
.tile small { font-size: 0.9rem; }
.card { padding: 1.1rem 1.3rem; min-width: 0; }
.card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.card-head small { color: var(--ink-soft); }
h2 { font-size: 1.02rem; margin: 0; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
.empty { color: var(--ink-soft); }
.cats { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.7rem; }
.cat-row, .meta { display: flex; justify-content: space-between; gap: 1rem; }
.name small { color: var(--ink-soft); font-size: 0.78rem; margin-left: 0.3rem; }
.track { height: 6px; background: var(--mist); border-radius: 3px; margin: 0.3rem 0 0.2rem; overflow: hidden; }
.track span { display: block; height: 100%; background: var(--expense); border-radius: 3px; transition: width 0.45s ease; }
.meta { font-size: 0.78rem; color: var(--ink-soft); }
.delta.up { color: var(--expense); } .delta.down { color: var(--income); }
.opps { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
.opps li { display: grid; grid-template-columns: 2rem 1fr auto; gap: 0.75rem; align-items: start; padding: 0.7rem; border-radius: 10px; background: var(--mist); }
.opps p { margin: 0.1rem 0 0; color: var(--ink-soft); font-size: 0.85rem; }
.icon { width: 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center; background: var(--paper); font-weight: 700; color: var(--accent); }
.overspent-month .icon { color: var(--expense); }
.opps .amount { font-weight: 600; white-space: nowrap; }
.opps small { color: var(--ink-soft); font-weight: 400; }
.recurring { margin-top: 0.8rem; }
.recurring summary { cursor: pointer; color: var(--accent); }
.recurring table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.88rem; }
.recurring th, .recurring td { text-align: left; font-weight: 400; padding: 0.35rem 0; border-bottom: 1px solid var(--rule); }
.recurring td.amount { text-align: right; }
.recurring small { color: var(--ink-soft); margin-left: 0.3rem; }
.days { list-style: none; margin: 0; padding: 0; }
.days button { width: 100%; display: grid; grid-template-columns: 1.6rem 1fr auto; gap: 0.6rem; align-items: center; padding: 0.55rem 0.2rem; font: inherit; color: inherit; background: none; border: 0; border-bottom: 1px solid var(--rule); cursor: pointer; text-align: left; }
.days button:hover { background: var(--mist); }
.days small { color: var(--ink-soft); margin-left: 0.3rem; }
.rank { width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--mist); display: grid; place-items: center; font-size: 0.78rem; font-weight: 600; }
.day-list { list-style: none; margin: 0; padding: 0.3rem 0 0.5rem 2.2rem; font-size: 0.86rem; }
.day-list li { display: flex; justify-content: space-between; padding: 0.2rem 0; color: var(--ink-soft); }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) { .tile { animation: none; } }
@media (max-width: 1000px) { .tiles { grid-template-columns: repeat(2, 1fr); } .grid { grid-template-columns: 1fr; } }
</style>
