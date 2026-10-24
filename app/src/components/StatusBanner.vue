<script setup lang="ts">
import { t } from '../i18n'
import { useSession } from '../stores/session'
import { useOutbox } from '../stores/outbox'
const session = useSession()
const outbox = useOutbox()
</script>

<template>
  <div v-if="session.status === 'loading'" class="banner quiet" role="status">{{ session.source === 'demo' ? t('Loading from demo data…') : session.source === 'stored' ? t('Loading stored data…') : t('Loading from your phone…') }}</div>
  <div v-else-if="session.error" class="banner" role="alert">
    <strong>{{ session.status === 'invalid-response' ? t('The phone sent data this app cannot read.') : t('Could not load data.') }}</strong>
    <span>{{ t(session.error) }}</span>
    <span v-if="session.source === 'phone'">{{ t('PC Manager stops when the phone is locked or you switch apps. Open Money Manager on the phone and keep it on screen.') }}</span>
    <span>{{ t('The figures below are from the last successful load.') }}</span>
    <button @click="session.refresh()">{{ t('Try again') }}</button>
  </div>
  <div v-else-if="outbox.pending.length" class="banner pending" role="status">
    <strong>{{ t('{n} change(s) waiting for the phone.', { n: outbox.pending.length }) }}</strong>
    <span>{{ t('They were not sent. Open Money Manager on the phone and use') }} <b>{{ t('Sync pending changes') }}</b>.</span>
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
