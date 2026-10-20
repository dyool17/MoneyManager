<script setup lang="ts">
import { computed, ref } from 'vue'
import { useOutbox } from '../stores/outbox'
import { useSession } from '../stores/session'

const outbox = useOutbox()
const session = useSession()
const message = ref('')

/** A send needs the phone on screen and a backup taken after it came back. */
const blocked = computed(() => {
  if (session.source !== 'phone') return 'Connect your phone to sync.'
  if (!session.canWrite()) return 'Take a backup (Back up now) before syncing.'
  return ''
})

async function sync() {
  message.value = ''
  const result = await outbox.sendAll(session.address)
  message.value = result.failed
    ? `${result.sent} sent, ${result.failed} could not be sent. ${outbox.lastError}`
    : `${result.sent} change(s) sent to the phone.`
}
</script>

<template>
  <section v-if="outbox.pending.length || outbox.unconfirmed.length">
    <h2>Pending changes</h2>

    <div v-if="outbox.pending.length" class="card">
      <h3>Waiting for the phone</h3>
      <p class="muted">These changes never left the computer, so they can be sent when the phone is reachable again.</p>
      <ul>
        <li v-for="c in outbox.pending" :key="c.id">
          {{ c.label }} <span class="muted">{{ new Date(c.createdAt).toLocaleString() }}</span>
        </li>
      </ul>
      <p v-if="blocked" class="warn">{{ blocked }}</p>
      <button class="primary" :disabled="!!blocked || outbox.sending" @click="sync">
        {{ outbox.sending ? 'Sending…' : 'Sync pending changes' }}
      </button>
    </div>

    <div v-if="outbox.unconfirmed.length" class="card">
      <h3>Check on the phone</h3>
      <p class="muted">The phone did not answer, so these changes may or may not have been applied. They are never sent again by themselves.</p>
      <ul>
        <li v-for="c in outbox.unconfirmed" :key="c.id">
          {{ c.label }} <span class="muted">{{ new Date(c.createdAt).toLocaleString() }}</span>
          <button class="link" @click="outbox.discard(c.id)">Mark as reviewed</button>
        </li>
      </ul>
    </div>

    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>

<style scoped>
h2 { margin-top: 0; }
.card { border: 1px solid var(--rule); border-radius: 12px; padding: 1rem 1.25rem; margin: 0 0 1rem; background: var(--paper); }
h3 { margin: 0 0 0.5rem; font-size: 1rem; }
.muted { color: var(--ink-soft); font-size: 0.85rem; }
.warn { color: var(--warn-ink); }
ul { margin: 0.5rem 0 0.75rem; padding-left: 1.2rem; }
li { margin-bottom: 0.25rem; }
.link { background: none; border: none; color: var(--accent); text-decoration: underline; cursor: pointer; padding: 0 0 0 0.5rem; }
</style>
