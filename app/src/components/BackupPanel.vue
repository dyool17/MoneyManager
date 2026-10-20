<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '../stores/session'

const session = useSession()
const report = computed(() => session.backup)

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`

const sqliteMessage = computed(() => {
  const s = report.value?.sqlite
  if (!s) return ''
  switch (s.status) {
    case 'saved':
      return `Full backup saved (money.sqlite, ${kb(s.bytes)}). You can restore it from the phone app.`
    case 'empty':
      return 'The phone sent an empty full backup, so it was not saved. Only the readable snapshot is available.'
    case 'not-sqlite':
      return 'The phone sent something that is not a Money Manager backup, so it was not saved. Only the readable snapshot is available.'
    case 'failed':
      return `The full backup could not be downloaded: ${s.reason}. Only the readable snapshot is available.`
  }
  return ''
})
</script>

<template>
  <section class="backup" aria-live="polite">
    <h2>Backup</h2>
    <p v-if="session.source !== 'phone'" class="muted">Backups are taken automatically each time you connect your phone.</p>
    <template v-else>
      <p v-if="session.backupState === 'running'" class="muted">Saving a backup of your phone…</p>
      <p v-else-if="session.backupState === 'failed'" class="warn">Backup not saved: {{ session.backupError }}</p>
      <template v-else-if="report">
        <p :class="report.sqlite.status === 'saved' ? 'ok' : 'warn'">{{ sqliteMessage }}</p>
        <p class="muted">
          Snapshot: {{ report.snapshot.length }} files
          <template v-if="report.snapshotErrors.length">, {{ report.snapshotErrors.length }} could not be read</template>.
          Saved {{ new Date(report.createdAt).toLocaleString() }} in
        </p>
        <code>{{ report.folder }}</code>
        <details v-if="report.sqlite.status === 'saved'">
          <summary>How to restore</summary>
          <ol>
            <li>Copy <code>money.sqlite</code> from the folder above to your phone.</li>
            <li>In Money Manager on the phone, open the backup settings and restore from that file.</li>
            <li>The phone returns to exactly how it was when this backup was taken.</li>
          </ol>
        </details>
      </template>
      <button :disabled="session.backupState === 'running'" @click="session.backupNow()">Back up now</button>
    </template>
  </section>
</template>

<style scoped>
.backup { max-width: 34rem; margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); }
h2 { font-size: 1.15rem; margin: 0 0 0.75rem; }
p { margin: 0 0 0.5rem; }
.muted { color: var(--ink-soft); }
.ok { color: var(--income); }
.warn { color: var(--warn-ink); background: var(--warn-bg); padding: 0.6rem 0.8rem; border-radius: 8px; }
code { display: block; font-size: 0.85rem; word-break: break-all; background: var(--paper); border: 1px solid var(--rule); border-radius: 6px; padding: 0.4rem 0.6rem; margin-bottom: 0.75rem; user-select: all; }
li code { display: inline; padding: 0 0.25rem; border: none; }
details { margin-bottom: 0.75rem; }
ol { padding-left: 1.2rem; color: var(--ink-soft); }
</style>
