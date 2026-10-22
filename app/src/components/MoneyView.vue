<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, intlLocale } from '../i18n'
import { useSession } from '../stores/session'
import { useAccountMetadata } from '../stores/metadata'
import { useNav } from '../stores/nav'
import { buildAccountRows } from '../domain/money'
import NetWorthHero from './money/NetWorthHero.vue'
import AccountsTable from './money/AccountsTable.vue'
import AccountDetail from './money/AccountDetail.vue'
import ChangeDialog, { type Draft } from './ChangeDialog.vue'

const session = useSession()
const metadata = useAccountMetadata()
const nav = useNav()

const rows = computed(() => buildAccountRows(session.assets, session.cards))
const selectedId = ref<string | null>(null)
const selected = computed(() => rows.value.find((r) => r.id === selectedId.value) ?? rows.value[0] ?? null)

const draft = ref<Draft | null>(null)
function edit() {
  const a = selected.value
  if (!a) return
  if (a.kind === 'card') draft.value = { kind: 'card', initial: session.cards.flatMap((g) => g.items).find((c) => c.id === a.id) }
  else draft.value = { kind: 'asset', initial: session.assets.flatMap((g) => g.items).find((i) => i.id === a.id), groupId: session.assets.find((g) => g.items.some((i) => i.id === a.id))?.id }
}
function remove() {
  const a = selected.value
  if (a) draft.value = { kind: 'delete-asset', id: a.id, name: a.name, isCard: a.kind === 'card' }
}
</script>

<template>
  <section class="money">
    <h1>{{ t('Money') }}</h1>
    <p v-if="metadata.storageError" role="alert" class="warn">{{ t(metadata.storageError) }}</p>
    <p v-if="metadata.changedAccounts.length" role="status" class="warn">
      {{ t('Accounts changed since import. Review metadata or import a fresh backup.') }}
      <button @click="nav.go('settings', 'accounts')">{{ t('Review account settings') }}</button>
    </p>
    <p v-if="metadata.totals.missing.length && session.dashboard" role="status" class="warn">
      {{ t('{n} account(s) are missing configuration, so totals may be incomplete.', { n: metadata.totals.missing.length.toLocaleString(intlLocale()) }) }}
      <button @click="nav.go('settings', 'accounts')">{{ t('Configure accounts') }}</button>
    </p>
    <p v-if="session.source === 'phone'" class="muted">{{ t('Current totals use live balances and account metadata.') }}</p>

    <NetWorthHero @configure="nav.go('settings', 'accounts')" />

    <div class="grid">
      <AccountsTable :rows="rows" :selected="selected?.id ?? null" :can-add="session.source === 'phone'"
        @select="selectedId = $event" @add-account="draft = { kind: 'asset' }" @add-card="draft = { kind: 'card' }" />
      <AccountDetail v-if="selected" :account="selected" @edit="edit" @remove="remove" />
    </div>
    <ChangeDialog v-if="draft" :draft="draft" @close="draft = null" />
  </section>
</template>

<style scoped>
.money { display: flex; flex-direction: column; gap: 1.25rem; }
h1 { margin: 0; }
.muted { color: var(--ink-soft); margin: 0; }
.warn { margin: 0; padding: 0.7rem 1rem; border-radius: var(--radius); background: var(--warn-bg); color: var(--warn-ink); display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; }
.grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr); gap: 1.25rem; align-items: start; }
@media (max-width: 1000px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
