<script setup lang="ts">
import { useSession } from '../stores/session'
import { useOutbox } from '../stores/outbox'
const session = useSession()
const outbox = useOutbox()
</script>

<template>
  <div v-if="session.status === 'loading'" class="banner quiet" role="status">Loading from {{ session.source === 'demo' ? 'demo data' : 'your phone' }}…</div>
  <div v-else-if="session.error" class="banner" role="alert">
    <strong>{{ session.status === 'invalid-response' ? 'The phone sent data this app cannot read.' : 'Could not load data.' }}</strong>
    <span>{{ session.error }}</span>
    <span v-if="session.source === 'phone'">PC Manager stops when the phone is locked or you switch apps. Open Money Manager on the phone and keep it on screen.</span>
    <span>The figures below are from the last successful load.</span>
    <button @click="session.refresh()">Try again</button>
  </div>
  <div v-else-if="outbox.pending.length" class="banner pending" role="status">
    <strong>{{ outbox.pending.length }} change(s) waiting for the phone.</strong>
    <span>They were not sent. Open Money Manager on the phone and use <b>Sync pending changes</b>.</span>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  border-radius: 8px;
  background: var(--warn-bg);
  color: var(--warn-ink);
}
.banner button { margin-left: auto; }
.quiet { background: transparent; color: var(--ink-soft); padding: 0 0 0.75rem; }
.pending { background: var(--warn-bg); color: var(--warn-ink); }
</style>
