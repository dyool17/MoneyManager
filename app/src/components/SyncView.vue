<script setup lang="ts">
import { ref, watch } from 'vue'
import { t, intlLocale } from '../i18n'
import { useSync } from '../stores/sync'
import { useOutbox } from '../stores/outbox'
import PendingChanges from './PendingChanges.vue'
import ChangeRow from './sync/ChangeRow.vue'
import { monthsBetween, scopeLabel } from './sync/presentation'

const sync = useSync()
// Show what the database already holds as soon as the screen opens or the phone/book changes.
watch(() => sync.scope, () => { void sync.refresh() }, { immediate: true })
const outbox = useOutbox()
const from = ref('')
const to = ref(new Date().toISOString().slice(0, 7))
</script>

<template>
  <section class="sync">
    <header>
      <h1>{{ t('Sync') }}</h1>
      <p>{{ t('Phone: {phone} · Book: {book}', scopeLabel(sync.scope)) }}</p>
      <p v-if="sync.status">{{ t('{movements} movements stored · {months} months synced', { movements: sync.status.movements, months: sync.status.months.length }) }}</p>
      <p v-else>{{ t('Database status is available after accepting a comparison.') }}</p>
      <p>{{ t('Last sync: {time}', { time: sync.status?.lastSync ? new Date(sync.status.lastSync).toLocaleString(intlLocale()) : t('Not yet synced') }) }}</p>
    </header>

    <div class="card">
      <div class="actions">
        <button :disabled="!!sync.disabledReason || sync.reading || sync.applying" @click="sync.readRecent()">{{ t('Check recent months') }}</button>
        <label>{{ t('Preview a backup…') }}
          <input type="file" accept=".mmbak,.sqlite" :disabled="sync.reading || sync.applying" @change="($event.target as HTMLInputElement).files?.[0] && sync.previewBackup(($event.target as HTMLInputElement).files![0]!)" />
        </label>
      </div>
      <details>
        <summary>{{ t('Check all months…') }}</summary>
        <div class="actions">
          <label>{{ t('From month') }} <input v-model="from" type="month" /></label>
          <label>{{ t('To month') }} <input v-model="to" type="month" /></label>
          <button :disabled="!!sync.disabledReason || sync.reading || sync.applying || !monthsBetween(from, to).length" @click="sync.read(monthsBetween(from, to))">{{ t('Check selected months') }}</button>
        </div>
        <p v-if="!monthsBetween(from, to).length">{{ t('Choose a valid start and end month in chronological order.') }}</p>
      </details>
      <p v-if="sync.reading" role="status">
        {{ t('Month {current} of {total} ({month})', { current: Math.min(sync.progress.done + 1, sync.progress.total), total: sync.progress.total, month: sync.progress.current ?? '—' }) }}
        <button @click="sync.cancel()">{{ t('Cancel') }}</button>
      </p>
      <p v-if="sync.disabledReason">{{ t(sync.disabledReason) }}</p>
      <p v-if="sync.error" role="alert">{{ t(sync.error) }}</p>
    </div>

    <section class="card">
      <h2>{{ t('↓ Incoming') }}</h2>
      <p>{{ t('Nothing is written to the database until you accept. Sync never writes to the phone.') }}</p>
      <button :disabled="sync.reading || sync.applying || !sync.pending.size" @click="sync.accept('all')">{{ t('Accept all (excluding conflicts)') }}</button>
      <p v-if="!sync.summary.length">{{ t('No incoming changes to review.') }}</p>
      <details v-for="month in sync.summary" :key="month.month">
        <summary>{{ month.month }} · {{ t(sync.previews.get(month.month)?.source === 'backup' ? 'Backup' : 'Phone') }} · {{ t('+{added} new · ~{modified} modified · −{deleted} deleted', { added: month.new, modified: month.modified, deleted: month.deleted }) }}</summary>
        <button :disabled="sync.reading || sync.applying" @click="sync.accept('all', month.month)">{{ t('Accept month (excluding conflicts)') }}</button>
        <template v-for="change in sync.pending.get(month.month)" :key="change.id">
          <ChangeRow v-if="!sync.conflicts.some(c => c.change.id === change.id)" :change="change">
            <button :disabled="sync.reading || sync.applying" @click="sync.accept([change.id], month.month)">{{ t('Accept change') }}</button>
          </ChangeRow>
        </template>
      </details>
    </section>

    <section class="card">
      <h2>{{ t('Conflicts') }} · {{ sync.conflicts.length }}</h2>
      <p v-if="!sync.conflicts.length">{{ t('No conflicts to resolve.') }}</p>
      <article v-for="conflict in sync.conflicts" :key="`${conflict.change.id}-${conflict.pending.id}`">
        <p>{{ t('Pending outgoing: {label}', { label: conflict.pending.label }) }}</p>
        <ChangeRow :change="conflict.change">
          <button :disabled="sync.reading || sync.applying" @click="sync.accept([conflict.change.id])">{{ t("Use the phone's version") }}</button>
          <button :disabled="sync.reading || sync.applying" @click="sync.keepLocal(conflict.change.id)">{{ t('Keep my pending change') }}</button>
        </ChangeRow>
      </article>
    </section>

    <section class="card">
      <h2>{{ t('↑ Outgoing') }}</h2>
      <p>{{ t('{pending} pending · {unconfirmed} unconfirmed', sync.outgoing) }}</p>
      <p>{{ t("After sending, the next check brings the phone's version back as incoming.") }}</p>
      <details v-if="outbox.items.length">
        <summary>{{ t('Review pending changes') }}</summary>
        <PendingChanges />
      </details>
    </section>

    <section class="card">
      <h2>{{ t('Sync history') }}</h2>
      <p v-if="!sync.log.length">{{ t('No accepted sync batches yet.') }}</p>
      <ol class="history">
        <li v-for="(entry, index) in sync.log" :key="index">
          <time>{{ new Date(entry.at).toLocaleString(intlLocale()) }}</time> · {{ t(entry.source === 'phone' ? 'Phone' : 'Backup') }}
          <strong>+{{ entry.added }} ~{{ entry.modified }} −{{ entry.deleted }}</strong>
          <span>{{ t('Months: {months}', { months: entry.months.join(', ') }) }}</span>
        </li>
      </ol>
    </section>
  </section>
</template>

<style scoped>
.sync { display: grid; gap: 1rem; max-width: 1100px; }
h1, h2 { margin: 0 0 .5rem; }
h1 { font-size: 1.6rem; }
h2 { font-size: 1.1rem; }
p { color: var(--ink-soft); }
.card { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 1.2rem; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; }
label { display: grid; gap: .25rem; }
input { max-width: 100%; }
details { margin-top: 1rem; }
summary { cursor: pointer; margin-bottom: .7rem; }
.history { list-style: none; padding: 0 0 0 1rem; border-left: 2px solid var(--rule); }
.history li { display: flex; flex-wrap: wrap; gap: .5rem; padding: .75rem 0; }
</style>
