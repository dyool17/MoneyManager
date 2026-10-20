<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSession } from './stores/session'
import ConnectionPanel from './components/ConnectionPanel.vue'
import PeriodHeader from './components/PeriodHeader.vue'
import SummaryView from './components/SummaryView.vue'
import MovementsTable from './components/MovementsTable.vue'
import StatusBanner from './components/StatusBanner.vue'
import NetWorthView from './components/NetWorthView.vue'
import AccountsView from './components/AccountsView.vue'
import CardsView from './components/CardsView.vue'
import BudgetsView from './components/BudgetsView.vue'
import AccountMetadataView from './components/AccountMetadataView.vue'
import PendingChanges from './components/PendingChanges.vue'
import InsightsView from './components/InsightsView.vue'

type View = 'insights' | 'networth' | 'summary' | 'budgets' | 'movements' | 'accounts' | 'cards' | 'connection' | 'metadata'
const session = useSession()
const view = ref<View>('networth')

const NAV: { id: View; label: string }[] = [
  { id: 'networth', label: 'Net worth' },
  { id: 'insights', label: 'Insights' },
  { id: 'summary', label: 'Monthly summary' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'movements', label: 'Transactions' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'cards', label: 'Credit cards' },
  { id: 'metadata', label: 'Account metadata' },
]
/** 24px stroke icons, drawn inline so the rail needs no icon font. */
const ICONS: Record<View, string> = {
  insights: 'M4 19V9m5 10V5m5 14v-7m5 7V8',
  networth: 'M3 17l5-5 4 4 8-8M15 8h5v5',
  summary: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  budgets: 'M12 3a9 9 0 1 0 9 9h-9z M14 3.5A9 9 0 0 1 20.5 10H14z',
  movements: 'M7 7h13l-3-3M17 17H4l3 3',
  accounts: 'M3 10l9-6 9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18',
  cards: 'M3 6h18v12H3zM3 10h18M7 15h4',
  metadata: 'M4 6h16M4 12h16M4 18h10',
  connection: 'M8 3h8v18H8zM11 18h2',
}
const monthly = (v: View) => v === 'summary' || v === 'budgets' || v === 'movements' || v === 'accounts'

onMounted(() => session.connect('demo'))
</script>

<template>
  <div class="shell">
    <nav class="rail" aria-label="Main">
      <div class="book">
        <select
          v-if="(session.init?.books.length ?? 0) > 1"
          id="book"
          class="book-select"
          aria-label="Book"
          :value="session.bookId"
          :disabled="session.status === 'loading'"
          @change="session.setBook(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="b in session.init?.books" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <strong v-else>{{ session.init?.currentBook.name ?? 'Money Manager' }}</strong>
        <span :class="['source', session.source]">
          {{ session.source === 'demo' ? 'Demo data' : session.address }}
        </span>
      </div>
      <button v-for="item in NAV" :key="item.id" :aria-current="view === item.id" @click="view = item.id">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS[item.id]" /></svg>
        {{ item.label }}
      </button>
      <button class="connect" :aria-current="view === 'connection'" @click="view = 'connection'">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.connection" /></svg>
        Connect phone
      </button>
      <p class="readonly">
        <span v-if="session.backupState === 'done' && session.backup?.sqlite.status === 'saved'" class="saved">Backup saved</span>
        <span v-else-if="session.source === 'phone' && session.backupState !== 'running'" class="unsaved">No full backup yet</span>
        Changes are saved on your phone only after you confirm them.
      </p>
    </nav>

    <main>
      <StatusBanner />
      <ConnectionPanel v-if="view === 'connection'" @connected="view = 'networth'" />
      <template v-else-if="session.init">
        <PendingChanges />
        <PeriodHeader v-if="monthly(view)" />
        <InsightsView v-if="view === 'insights'" />
        <NetWorthView v-else-if="view === 'networth'" @configure="view = 'metadata'" />
        <SummaryView v-else-if="view === 'summary'" />
        <BudgetsView v-else-if="view === 'budgets'" />
        <MovementsTable v-else-if="view === 'movements'" />
        <AccountsView v-else-if="view === 'accounts'" />
        <CardsView v-else-if="view === 'cards'" />
        <AccountMetadataView v-else-if="view === 'metadata'" />
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
.book-select { font-weight: 600; margin-bottom: 0.2rem; }
.source { font-size: 0.8rem; color: var(--ink-soft); }
.source.phone { color: var(--income); }
.rail button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-align: left;
  border: none;
  border-radius: 8px;
  background: transparent;
  padding: 0.5rem 0.6rem;
  color: var(--ink-soft);
  transition: background 0.15s, color 0.15s;
}
.rail button:hover { background: var(--mist); color: var(--ink); }
.rail button svg { width: 1.1rem; height: 1.1rem; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.rail button[aria-current='true'] {
  background: color-mix(in oklab, var(--accent) 12%, var(--paper));
  color: var(--accent);
  font-weight: 600;
}
.rail button[aria-current='true']::before {
  content: '';
  position: absolute;
  left: -0.75rem;
  top: 0.35rem;
  bottom: 0.35rem;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}
.rail .connect { margin-top: 0.75rem; }
.saved, .unsaved { display: block; font-weight: 600; margin-bottom: 0.25rem; }
.saved { color: var(--income); }
.unsaved { color: var(--warn-ink); }
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
