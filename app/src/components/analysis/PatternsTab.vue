<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Insights } from '../../domain/insights'
import { greenStreak, mainGroupShares } from '../../domain/health'
import { formatDate, formatMoney } from '../../domain/format'
import { useHistory } from '../../stores/history'
import BarChart from '../BarChart.vue'
import SpendingCalendar from '../SpendingCalendar.vue'
import AiButton from '../AiButton.vue'
import { useHealth } from './useHealth'

const props = defineProps<{ r: Insights; first: string; last: string }>()
const history = useHistory()
const r = computed(() => props.r)
const { vol } = useHealth(r, computed(() => history.movements), computed(() => props.first), computed(() => props.last))

const openDay = ref<string | null>(null)
const dayMovements = computed(() => (openDay.value ? history.movements.filter((m) => m.date === openDay.value && m.type === 'expense').sort((a, b) => b.amount - a.amount) : []))

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const weekdayRows = computed(() => props.r.weekdays.map((w) => ({ label: WEEKDAYS[w.weekday]!, values: { average: w.average } })))
const peakWeekday = computed(() => [...props.r.weekdays].sort((a, b) => b.average - a.average)[0])

const months = computed(() => props.r.months.map((m) => m.month))
const groupsShare = computed(() => mainGroupShares(history.movements.filter((m) => m.date >= props.first && m.date <= props.last), months.value))
const streak = computed(() => greenStreak(props.r.months, props.last))
const improved = computed(() => props.r.changes.filter((c) => c.change <= -1).sort((a, b) => a.change - b.change).slice(0, 3))
const subcategories = computed(() => props.r.categories.slice(0, 8))
const subMax = computed(() => Math.max(1, ...subcategories.value.map((s) => s.total)))
</script>

<template>
  <div class="an-stack">
    <div class="an-grid2">
      <div class="card">
        <div class="card-head">
          <h2>Top subcategories</h2>
          <AiButton question="Explain this chart" about="Top subcategories by spending" compact>Explain</AiButton>
        </div>
        <p v-if="!subcategories.length" class="muted">No spending in this span.</p>
        <ol class="an-list">
          <li v-for="s in subcategories" :key="s.name" class="pt-sub">
            <div class="pt-line"><span>{{ s.name }} <small v-if="s.group" class="muted">{{ s.group }}</small></span><span class="num amount">{{ formatMoney(s.total) }}</span></div>
            <div class="track"><span :style="{ width: `${(s.total / subMax) * 100}%` }" /></div>
          </li>
        </ol>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h2>Spending by day of the week</h2>
            <small v-if="peakWeekday" class="muted">{{ WEEKDAYS[peakWeekday.weekday] }} costs the most: {{ formatMoney(peakWeekday.average) }} on average</small>
          </div>
          <AiButton question="Explain this chart" about="Average spending per weekday" compact>Explain</AiButton>
        </div>
        <BarChart :rows="weekdayRows" :series="[{ key: 'average', label: 'Average', color: 'var(--accent)' }]" label="Average spending per weekday" :height="180" />
      </div>
    </div>

    <div class="an-grid2">
      <div class="card">
        <div class="card-head">
          <h2>Days you spent the most</h2>
          <AiButton question="What happened on the days I spent the most?" about="Highest spending days" compact>Why?</AiButton>
        </div>
        <ol class="an-list">
          <li v-for="(d, i) in r.topDays" :key="d.date">
            <button type="button" class="pt-day" :aria-expanded="openDay === d.date" @click="openDay = openDay === d.date ? null : d.date">
              <span class="pt-rank num">{{ i + 1 }}</span>
              <span>{{ formatDate(d.date) }} <small class="muted">{{ d.count }} {{ d.count === 1 ? 'expense' : 'expenses' }}</small></span>
              <span class="amount num expense">{{ formatMoney(d.total) }}</span>
            </button>
            <ul v-if="openDay === d.date" class="pt-day-list">
              <li v-for="m in dayMovements" :key="m.id">
                <span>{{ m.content || m.subcategoryName || m.categoryName }}</span>
                <span class="amount num">{{ formatMoney(m.amount) }}</span>
              </li>
            </ul>
          </li>
        </ol>
      </div>

      <div class="card">
        <div class="card-head"><h2>Strengths and weak spots</h2></div>
        <ul class="pt-signals">
          <li>
            <b>{{ streak }} {{ streak === 1 ? 'month' : 'months' }}</b> in a row with money left over
            <span class="pt-flag">{{ streak >= 3 ? 'Strength' : streak === 0 ? 'Weak spot' : 'Neutral' }}</span>
          </li>
          <li v-if="vol !== null">
            Monthly spend varies <b>{{ Math.round(vol * 100) }}%</b> around its average · {{ vol <= 0.15 ? 'steady' : vol >= 0.3 ? 'hard to predict' : 'moderate' }}
            <span class="pt-flag">{{ vol <= 0.15 ? 'Strength' : vol >= 0.3 ? 'Weak spot' : 'Neutral' }}</span>
          </li>
          <li v-for="c in improved" :key="c.name">
            <b>{{ c.name }}</b> down {{ formatMoney(-c.change) }}/mo vs the three months before
            <span class="pt-flag">Strength</span>
          </li>
          <li v-if="!improved.length" class="muted">No category dropped in the last three months.</li>
        </ul>
        <h3 class="pt-sub-title">How your spending splits</h3>
        <div v-for="g in groupsShare.slice(0, 5)" :key="g.name" class="pt-split">
          <div class="pt-line"><span>{{ g.name }}</span><b class="num">{{ Math.round(g.share * 100) }}%</b></div>
          <div class="track"><span :style="{ width: `${g.share * 100}%` }" /></div>
          <small v-if="g.previousShare !== null" class="muted">{{ Math.round(g.previousShare * 100) }}% in the three months before that</small>
        </div>
        <p v-if="groupsShare.length > 1" class="muted an-note">A high fixed share leaves little room to adjust when income drops.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Daily spending calendar</h2>
        <AiButton question="Explain this chart" about="Daily spending calendar" compact>Explain</AiButton>
      </div>
      <SpendingCalendar :days="r.days" :first="first" :last="last" />
    </div>
  </div>
</template>

<style scoped>
.pt-sub, .pt-split { display: grid; gap: 0.3rem; padding: 0.35rem 0; }
.pt-line { display: flex; justify-content: space-between; gap: 1rem; }
.pt-day { width: 100%; display: grid; grid-template-columns: 1.6rem 1fr auto; gap: 0.6rem; align-items: center; padding: 0.55rem 0.2rem; border: 0; border-bottom: 1px solid var(--rule); border-radius: 0; background: none; text-align: left; cursor: pointer; }
.pt-day:hover { background: var(--hover); }
.pt-rank { width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--hover); display: grid; place-items: center; font-size: 0.78rem; font-weight: 600; }
.pt-day-list { list-style: none; margin: 0; padding: 0.3rem 0 0.5rem 2.2rem; font-size: 0.86rem; }
.pt-day-list li { display: flex; justify-content: space-between; padding: 0.2rem 0; color: var(--ink-soft); }
.pt-signals { list-style: none; padding: 0; margin: 0 0 1rem; display: grid; gap: 0.5rem; }
.pt-signals li { padding: 0.6rem 0.8rem; border-radius: 10px; background: var(--mist); font-size: 0.9rem; display: flex; justify-content: space-between; gap: 0.75rem; align-items: baseline; flex-wrap: wrap; }
.pt-flag { font-size: 0.74rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-soft); }
.pt-sub-title { margin: 0.5rem 0; }
</style>
