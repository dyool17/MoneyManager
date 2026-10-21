<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../Icon.vue'
import { useChat } from '../../stores/chat'
import { useNav } from '../../stores/nav'
import { useAiText } from '../../composables/aiText'
import { renderMarkdown } from '../../domain/markdown'
import { formatMoney } from '../../domain/format'
import type { MonthTotal } from '../../domain/insights'

/** The last complete month in one card: a fixed-rule headline, and an assistant-written report on request. */
const props = defineProps<{ months: MonthTotal[]; today: string }>()
const chat = useChat()
const nav = useNav()
const ai = useAiText()

const closed = computed(() => props.months.filter((m) => m.month < props.today.slice(0, 7)))
const month = computed(() => closed.value[closed.value.length - 1] ?? null)
const name = computed(() => (month.value ? new Date(`${month.value.month}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''))
const rank = computed(() => {
  if (!month.value) return 0
  return [...closed.value].sort((a, b) => a.net - b.net).findIndex((m) => m.month === month.value!.month) + 1
})
const headline = computed(() => {
  const m = month.value
  if (!m) return ''
  const place = rank.value === 1 ? 'the worst month in this period' : rank.value === 2 ? 'the second worst month in this period' : rank.value === closed.value.length ? 'the best month in this period' : ''
  return m.net < 0
    ? `${name.value} closed ${formatMoney(-m.net)} in the red${place ? `, ${place}` : ''}.`
    : `${name.value} closed with ${formatMoney(m.net)} left over${place ? `, ${place}` : ''}.`
})
const key = computed(() => `report:${month.value?.month}:${chat.context.length}`)
const report = computed(() => ai.get(key.value))
function write() {
  const language = typeof navigator !== 'undefined' ? navigator.language : 'en'
  ai.write(key.value,
    `Write my report for ${month.value!.month}: three short bullet points on what happened that month (income, spending, the categories that moved most against earlier months), then one line starting with "Next:" with the single most useful action. ` +
    `Use only figures from the reports or from lookups. Write in the language of this locale: ${language}.`,
    `Report for ${name.value}`)
}
</script>

<template>
  <section v-if="month" class="card report ai-surface" aria-label="Monthly report">
    <div class="head">
      <span class="tag"><Icon name="sparkle" :size="14" />{{ name }} report</span>
      <button v-if="chat.ready && report.state === 'ready'" type="button" class="quiet" @click="write">Rewrite</button>
    </div>
    <h2>{{ headline }}</h2>
    <p class="muted">Income {{ formatMoney(month.income) }} · spending {{ formatMoney(month.expense) }}</p>
    <div v-if="report.state === 'ready'" class="md" v-html="renderMarkdown(report.text)" />
    <p v-else-if="report.state === 'loading'" class="muted">Writing the report…</p>
    <p v-else-if="report.state === 'failed'" class="muted">The assistant could not write the report: {{ report.error }}</p>
    <div v-if="chat.ready" class="actions">
      <button v-if="report.state !== 'ready' && report.state !== 'loading'" type="button" @click="write">Write the report</button>
      <button type="button" class="quiet" @click="nav.ask(`Let's talk about ${name}. What should I learn from it?`, `Report for ${name}`)">Discuss in chat</button>
    </div>
  </section>
</template>

<style scoped>
.report { display: flex; flex-direction: column; gap: 0.6rem; }
.head { display: flex; justify-content: space-between; align-items: center; }
.tag { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ai-accent); }
h2 { margin: 0; font-family: var(--font-display); font-size: 1.35rem; line-height: 1.3; }
p { margin: 0; }
.md { font-size: 0.93rem; line-height: 1.55; color: var(--ai-ink); }
.md :deep(ul) { margin: 0.2rem 0 0.4rem; padding-left: 1.15rem; display: grid; gap: 0.3rem; }
.md :deep(p) { margin: 0 0 0.4rem; }
.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.2rem; }
.actions button, .quiet { background: var(--ai-raise); border-color: var(--ai-line); color: var(--ai-ink); }
.quiet { background: transparent; color: var(--ai-accent); }
</style>
