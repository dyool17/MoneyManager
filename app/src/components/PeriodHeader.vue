<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '../stores/session'
import { formatDate, monthLabel, shiftMonth } from '../domain/format'

/** Compact month navigation used in screen headers. */
const session = useSession()
const label = computed(() => monthLabel(session.period.startDate))
const busy = computed(() => session.status === 'loading')
const range = computed(() => `${formatDate(session.period.startDate)} to ${formatDate(session.period.endDate)}`)
</script>

<template>
  <div class="period">
    <div class="nav">
      <button aria-label="Previous month" :disabled="busy" @click="session.setPeriod(shiftMonth(session.period.startDate, -1))">‹</button>
      <strong class="month" :title="range">{{ label }}</strong>
      <button aria-label="Next month" :disabled="busy" @click="session.setPeriod(shiftMonth(session.period.startDate, 1))">›</button>
    </div>
    <button class="link" :disabled="busy" :title="session.loadedAt ? `Loaded at ${session.loadedAt.toLocaleTimeString()}` : range" @click="session.refresh()">Refresh</button>
  </div>
</template>

<style scoped>
.period { display: inline-flex; align-items: center; gap: 0.5rem; }
.nav { display: inline-flex; align-items: center; gap: 0.35rem; }
.month { min-width: 9ch; text-align: center; text-transform: capitalize; font-weight: 600; }
.nav button { line-height: 1; padding: 0.3rem 0.65rem; font-size: 1.1rem; }
.link { border: none; background: none; color: var(--accent); padding: 0 0.35rem; }
</style>
