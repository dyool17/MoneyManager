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

type View = 'networth' | 'summary' | 'budgets' | 'movements' | 'accounts' | 'cards' | 'connection' | 'metadata'
const session = useSession()
const view = ref<View>('networth')

const NAV: { id: View; label: string }[] = [
  { id: 'networth', label: 'Net worth' },
  { id: 'summary', label: 'Monthly summary' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'movements', label: 'Transactions' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'cards', label: 'Credit cards' },
  { id: 'metadata', label: 'Account metadata' },
]
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
        {{ item.label }}
      </button>
      <button class="connect" :aria-current="view === 'connection'" @click="view = 'connection'">Connect phone</button>
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
        <NetWorthView v-if="view === 'networth'" @configure="view = 'metadata'" />
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
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.5rem;
}
.rail button[aria-current='true'] {
  background: var(--mist);
  font-weight: 600;
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
