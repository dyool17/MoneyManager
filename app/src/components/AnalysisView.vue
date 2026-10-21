<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useHistory } from '../stores/history'
import { useSession } from '../stores/session'
import { useNav } from '../stores/nav'
import { analyze } from '../domain/insights'
import { formatDate } from '../domain/format'
import OverviewTab from './analysis/OverviewTab.vue'
import RisksTab from './analysis/RisksTab.vue'
import OpportunitiesTab from './analysis/OpportunitiesTab.vue'
import PatternsTab from './analysis/PatternsTab.vue'

type Tab = 'overview' | 'risks' | 'opportunities' | 'patterns'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'risks', label: 'Risks' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'patterns', label: 'Patterns' },
]
const RANGES = [3, 6, 12] as const

const history = useHistory()
const session = useSession()
const nav = useNav()
const range = ref<number>(12)
const tab = ref<Tab>(TABS.some((t) => t.id === nav.section) ? (nav.section as Tab) : 'overview')
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
const last = computed(() => history.span.last)
const r = computed(() => (first.value ? analyze(history.movements, first.value, history.span.last) : null))

watch(() => nav.section, (s) => { if (TABS.some((t) => t.id === s)) tab.value = s as Tab })
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
  <section class="analysis">
    <header class="an-top">
      <div>
        <h1>Analysis</h1>
        <p class="muted an-sub">
          <template v-if="history.state === 'ready'">
            {{ history.source === 'backup' ? 'From a backup file' : session.source === 'demo' ? 'From demo data' : 'Live from your phone' }}
            · {{ formatDate(first) }} – {{ formatDate(history.span.last) }}
          </template>
          <template v-else-if="history.state === 'loading'">Reading your history…</template>
          <template v-else>Health, risks, opportunities and patterns.</template>
        </p>
      </div>
      <div class="an-controls">
        <div class="seg" role="group" aria-label="Range">
          <button v-for="n in RANGES" :key="n" type="button" :aria-pressed="range === n" @click="range = n">{{ n }}M</button>
        </div>
        <button type="button" :disabled="history.state === 'loading'" @click="loadFromSession">Reload</button>
        <button type="button" @click="fileInput?.click()">Open backup…</button>
        <input ref="fileInput" type="file" accept=".mmbak,.sqlite" hidden @change="onFile" />
      </div>
    </header>

    <div class="seg an-tabs" role="tablist" aria-label="Analysis sections">
      <button v-for="t in TABS" :id="`an-tab-${t.id}`" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :aria-controls="`an-panel-${t.id}`" @click="tab = t.id">{{ t.label }}</button>
    </div>

    <p v-if="history.state === 'failed'" class="an-error" role="alert">
      Could not read the history: {{ history.error }}. Connect the phone and press Reload, or open a backup.
    </p>
    <p v-else-if="!r && history.state !== 'loading'" class="muted">No history loaded yet. Connect the phone or open a backup.</p>

    <div v-if="r" :id="`an-panel-${tab}`" role="tabpanel" :aria-labelledby="`an-tab-${tab}`" class="an-panel">
      <OverviewTab v-if="tab === 'overview'" :r="r" :first="first" :last="last" @tab="tab = $event" />
      <RisksTab v-else-if="tab === 'risks'" :r="r" :first="first" :last="last" />
      <OpportunitiesTab v-else-if="tab === 'opportunities'" :r="r" :first="first" :last="last" />
      <PatternsTab v-else :r="r" :first="first" :last="last" />
    </div>
  </section>
</template>

<style>
/* Shared by the Analysis tabs (unscoped on purpose, all under .analysis). */
.analysis { display: grid; gap: 1.25rem; }
.analysis h1 { margin: 0; font-size: 1.6rem; letter-spacing: -0.02em; }
.analysis h3 { margin: 0; font-size: 1rem; }
.an-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }
.an-sub { margin: 0.2rem 0 0; }
.an-controls { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
.an-tabs { justify-self: start; max-width: 100%; overflow-x: auto; }
.an-error { background: var(--warn-bg); color: var(--warn-ink); padding: 0.75rem 1rem; border-radius: var(--radius); margin: 0; }
.an-panel, .an-stack { display: grid; gap: 1.25rem; min-width: 0; }
.an-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
.an-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem; }
.analysis .card { min-width: 0; }
.analysis .card-head { flex-wrap: wrap; }
.analysis .card-head .actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.an-note { font-size: 0.85rem; margin: 0.4rem 0 0; }
.an-scroll { overflow-x: auto; }
.an-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.an-table th, .an-table td { text-align: left; font-weight: 400; padding: 0.5rem 0.6rem 0.5rem 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
.an-table td { white-space: nowrap; }
.an-table td.amount, .an-table th.num { text-align: right; }
.an-table th small { display: block; color: var(--ink-soft); font-size: 0.76rem; }
.an-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
.an-row { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 0.75rem; align-items: center; padding: 0.7rem 0; border-bottom: 1px solid var(--rule); }
.an-row:last-child { border-bottom: 0; }
.an-row p { margin: 0.1rem 0 0; font-size: 0.85rem; color: var(--ink-soft); }
.tone-2 { color: var(--expense); }
.tone-1 { color: var(--warn-ink); }
@media (max-width: 1000px) { .an-grid2, .an-grid3 { grid-template-columns: 1fr; } }
</style>
