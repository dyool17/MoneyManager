<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, intlLocale } from '../i18n'
import { useOutbox, type QueuedChange } from '../stores/outbox'
import { formatDate, formatMoney } from '../domain/format'
import { useSession } from '../stores/session'

const outbox = useOutbox()
const session = useSession()
const result = ref<{ sent: number; failed: number; error: string } | null>(null)
const message = computed(() => !result.value ? '' : result.value.failed
  ? t('{sent} sent, {failed} could not be sent. {error}', { sent: result.value.sent.toLocaleString(intlLocale()), failed: result.value.failed.toLocaleString(intlLocale()), error: t(result.value.error) })
  : t('{n} change(s) sent to the phone.', { n: result.value.sent.toLocaleString(intlLocale()) }))

// Stored labels mix app wording with user text. Translate only the wording;
// render structured fields where available so dates also follow the locale.
function changeLabel(change: QueuedChange): string {
  const op = change.op
  switch (op.op) {
    case 'create-transaction':
    case 'update-transaction': {
      const f = op.fields
      return [
        f.kind === 'income'
          ? t('Income of {amount} on {date}', { amount: formatMoney(f.amount), date: formatDate(f.date) })
          : t('Expense of {amount} on {date}', { amount: formatMoney(f.amount), date: formatDate(f.date) }),
        t('Account: {name}', { name: f.payType }),
        t('Category: {name}', { name: [f.categoryName, f.subcategoryName].filter(Boolean).join(' / ') }),
        ...(f.note ? [t('Note: {note}', { note: f.note })] : []),
      ].join(' · ')
    }
    case 'create-transfer':
    case 'update-transfer': {
      const f = op.fields
      return [
        t('Move {amount} on {date}', { amount: formatMoney(f.amount), date: formatDate(f.date) }),
        t('From {from} to {to}', { from: f.fromAssetName, to: f.toAssetName }),
        ...(op.op === 'update-transfer' ? [t('The phone replaces the transfer with a new one.')] : []),
      ].join(' · ')
    }
    case 'create-asset':
    case 'update-asset':
      return [t('{name} in {group}', { name: op.fields.name, group: op.fields.groupName }), t('Balance: {amount}', { amount: formatMoney(op.fields.balance) })].join(' · ')
    case 'create-card':
    case 'update-card':
      return [op.fields.name, t('Paid from {name}', { name: op.fields.linkAssetName }), t('Statement closes on day {closing}, payment due on day {payment}', { closing: op.fields.closingDay.toLocaleString(intlLocale()), payment: op.fields.paymentDay.toLocaleString(intlLocale()) })].join(' · ')
    case 'delete-asset':
      return change.label.replace('Not confirmed: what the phone does with the transactions recorded in it. Check them after deleting.', t('Not confirmed: what the phone does with the transactions recorded in it. Check them after deleting.'))
    case 'delete-transactions':
      // Only IDs survive in the operation; keep the recorded user-data summary.
      return change.label
  }
}

/** A send needs the phone on screen and a backup taken after it came back. */
const blocked = computed(() => {
  if (session.source !== 'phone') return t('Connect your phone to sync.')
  if (!session.canWrite()) return t('Take a backup (Back up now) before syncing.')
  return ''
})

async function sync() {
  result.value = null
  const outcome = await outbox.sendAll(session.address)
  result.value = { ...outcome, error: outbox.lastError }
}
</script>

<template>
  <section v-if="outbox.pending.length || outbox.unconfirmed.length">
    <h2>{{ t('Pending changes') }}</h2>

    <div v-if="outbox.pending.length" class="card">
      <h3>{{ t('Waiting for the phone') }}</h3>
      <p class="muted">{{ t('These changes never left the computer, so they can be sent when the phone is reachable again.') }}</p>
      <ul>
        <li v-for="c in outbox.pending" :key="c.id">
          {{ changeLabel(c) }} <span class="muted">{{ new Date(c.createdAt).toLocaleString(intlLocale()) }}</span>
        </li>
      </ul>
      <p v-if="blocked" class="warn">{{ blocked }}</p>
      <button class="primary" :disabled="!!blocked || outbox.sending" @click="sync">
        {{ outbox.sending ? t('Sending…') : t('Sync pending changes') }}
      </button>
    </div>

    <div v-if="outbox.unconfirmed.length" class="card">
      <h3>{{ t('Check on the phone') }}</h3>
      <p class="muted">{{ t('The phone did not answer, so these changes may or may not have been applied. They are never sent again by themselves.') }}</p>
      <ul>
        <li v-for="c in outbox.unconfirmed" :key="c.id">
          {{ changeLabel(c) }} <span class="muted">{{ new Date(c.createdAt).toLocaleString(intlLocale()) }}</span>
          <button class="link" @click="outbox.discard(c.id)">{{ t('Mark as reviewed') }}</button>
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
