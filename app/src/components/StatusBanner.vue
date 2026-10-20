<script setup lang="ts">
import { useSession } from '../stores/session'
const session = useSession()
</script>

<template>
  <div v-if="session.status === 'loading'" class="banner quiet" role="status">Loading from {{ session.source === 'demo' ? 'demo data' : 'your phone' }}…</div>
  <div v-else-if="session.error" class="banner" role="alert">
    <strong>{{ session.status === 'invalid-response' ? 'The phone sent data this app cannot read.' : 'Could not load data.' }}</strong>
    <span>{{ session.error }}</span>
    <span>The figures below are from the last successful load.</span>
    <button @click="session.refresh()">Try again</button>
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
</style>
