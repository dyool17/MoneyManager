<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSession } from './stores/session'
import ConnectionPanel from './components/ConnectionPanel.vue'
import PeriodHeader from './components/PeriodHeader.vue'
import SummaryView from './components/SummaryView.vue'
import MovementsTable from './components/MovementsTable.vue'
import StatusBanner from './components/StatusBanner.vue'

type View = 'summary' | 'movements' | 'connection'
const session = useSession()
const view = ref<View>('summary')

onMounted(() => session.connect('demo'))
</script>

<template>
  <div class="shell">
    <nav class="rail" aria-label="Main">
      <div class="book">
        <strong>{{ session.init?.currentBook.name ?? 'Money Manager' }}</strong>
        <span :class="['source', session.source]">
          {{ session.source === 'demo' ? 'Demo data' : session.address }}
        </span>
      </div>
      <button :aria-current="view === 'summary'" @click="view = 'summary'">Summary</button>
      <button :aria-current="view === 'movements'" @click="view = 'movements'">Transactions</button>
      <button :aria-current="view === 'connection'" @click="view = 'connection'">Connect phone</button>
      <p class="readonly">Read-only. Nothing on your phone is changed.</p>
    </nav>

    <main>
      <StatusBanner />
      <ConnectionPanel v-if="view === 'connection'" @connected="view = 'summary'" />
      <template v-else-if="session.init">
        <PeriodHeader />
        <SummaryView v-if="view === 'summary'" />
        <MovementsTable v-else />
      </template>
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}
.rail {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1.25rem 0.75rem;
  border-right: 1px solid var(--rule);
  background: var(--paper);
}
.book {
  display: flex;
  flex-direction: column;
  padding: 0 0.5rem 1.25rem;
}
.book strong { font-size: 1.05rem; }
.source { font-size: 0.8rem; color: var(--ink-soft); }
.source.phone { color: var(--income); }
.rail button {
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.5rem;
}
.rail button[aria-current='true'] {
  background: var(--mist);
  font-weight: 600;
}
.readonly {
  margin-top: auto;
  padding: 0 0.5rem;
  font-size: 0.8rem;
  color: var(--ink-soft);
}
main {
  padding: 1.5rem 2.5rem 3rem;
  max-width: 1200px;
  width: 100%;
}
@media (max-width: 720px) {
  .shell { grid-template-columns: 1fr; }
  .rail { flex-direction: row; flex-wrap: wrap; border-right: none; border-bottom: 1px solid var(--rule); }
  .readonly { display: none; }
  main { padding: 1rem; }
}
</style>
