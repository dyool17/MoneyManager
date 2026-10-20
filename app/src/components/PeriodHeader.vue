<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '../stores/session'
import { formatDate, monthLabel, shiftMonth } from '../domain/format'

const session = useSession()
const label = computed(() => monthLabel(session.period.startDate))
const busy = computed(() => session.status === 'loading')
</script>

<template>
  <header>
    <div class="nav">
      <button aria-label="Previous month" :disabled="busy" @click="session.setPeriod(shiftMonth(session.period.startDate, -1))">‹</button>
      <h1>{{ label }}</h1>
      <button aria-label="Next month" :disabled="busy" @click="session.setPeriod(shiftMonth(session.period.startDate, 1))">›</button>
    </div>
    <p>
      {{ formatDate(session.period.startDate) }} to {{ formatDate(session.period.endDate) }}<template
        v-if="session.loadedAt">, loaded at {{ session.loadedAt.toLocaleTimeString() }}</template>
      <button class="link" :disabled="busy" @click="session.refresh()">Refresh</button>
    </p>
  </header>
</template>

<style scoped>
header { margin-bottom: 1.75rem; }
.nav { display: flex; align-items: center; gap: 0.75rem; }
h1 {
  margin: 0;
  font-size: 2.6rem;
  font-weight: 650;
  letter-spacing: -0.03em;
  text-transform: capitalize;
  min-width: 12ch;
}
.nav button { font-size: 1.4rem; line-height: 1; padding: 0.2rem 0.65rem; }
p { margin: 0.25rem 0 0; color: var(--ink-soft); }
.link { border: none; background: none; color: var(--accent); padding: 0 0 0 0.75rem; }
</style>
