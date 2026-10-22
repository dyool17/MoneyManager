<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { t, intlLocale } from '../i18n'
import { useSession } from '../stores/session'
import { useOutbox } from '../stores/outbox'
import { useHistory } from '../stores/history'
import { useChat } from '../stores/chat'
import { suggestCategory } from '../domain/suggest'
import { formatDate, formatMoney } from '../domain/format'
import { todayIso } from '../domain/period'
import type { AssetItem, CardItem, Movement } from '../domain/types'
import type { WriteOp } from '../infrastructure/client'

export type Draft =
  | { kind: 'transaction'; initial?: Movement }
  | { kind: 'transfer'; initial?: Movement }
  | { kind: 'delete-transactions'; rows: Movement[] }
  | { kind: 'asset'; initial?: AssetItem; groupId?: string }
  | { kind: 'delete-asset'; id: string; name: string; isCard: boolean }
  | { kind: 'card'; initial?: CardItem }

const props = defineProps<{ draft: Draft }>()
const emit = defineEmits<{ close: [] }>()
const session = useSession()
const outbox = useOutbox()
const dialog = ref<HTMLDialogElement | null>(null)
const step = ref<'edit' | 'review' | 'sending' | 'done' | 'queued'>('edit')
const error = ref<string | null>(null)
const queued = ref(false)

onMounted(() => {
  dialog.value?.showModal()
  if (props.draft.kind === 'delete-transactions' || props.draft.kind === 'delete-asset') step.value = 'review'
})

const accounts = computed(() => session.init?.accounts ?? [])
const groups = computed(() => session.init?.accountGroups ?? [])
const nameOf = (id: string) => accounts.value.find((a) => a.id === id)?.name ?? id
const allCategories = computed(() => ({
  income: session.init?.incomeCategories ?? [],
  expense: session.init?.expenseCategories ?? [],
}))

// One form model; each kind uses the fields it needs.
const d = props.draft
const m = d.kind === 'transaction' || d.kind === 'transfer' ? d.initial : undefined
const form = reactive({
  date: m?.date ?? todayIso(),
  kind: (m?.type === 'income' ? 'income' : 'expense') as 'income' | 'expense',
  assetId: m?.assetId ?? accounts.value[0]?.id ?? '',
  toAssetId: m?.toAssetId ?? '',
  categoryId: m?.categoryId ?? '',
  subcategoryId: m?.subcategoryId ?? '',
  amount: m ? Math.abs(m.amount) : (null as number | null),
  note: m?.content ?? '',
  detail: m?.detail ?? '',
  name: d.kind === 'asset' || d.kind === 'card' ? d.initial?.name ?? '' : '',
  groupId: d.kind === 'asset' ? d.groupId ?? groups.value[0]?.id ?? '' : '',
  balance: d.kind === 'asset' ? d.initial?.balance ?? 0 : 0,
  linkAssetId: d.kind === 'card' ? d.initial?.linkedAssetId ?? '' : '',
  closingDay: d.kind === 'card' ? Number(d.initial?.closingDay ?? 1) : 1,
  paymentDay: d.kind === 'card' ? Number(d.initial?.paymentDay ?? 1) : 1,
  outstanding: d.kind === 'card' ? d.initial?.outstanding ?? 0 : 0,
})

// Transfers are edited through their outgoing row; an incoming row edits the same transfer.
if (d.kind === 'transfer' && m?.type === 'transfer-in' && m.toAssetId) {
  form.assetId = m.toAssetId
  form.toAssetId = m.assetId
}

const categories = computed(() => allCategories.value[form.kind])
const subcategories = computed(() => categories.value.find((c) => c.id === form.categoryId)?.subcategories ?? [])
// Category suggestions: first from the user's own history, then (if allowed) the assistant.
const history = useHistory()
const chat = useChat()
const known = computed(() => {
  const seen = new Set<string>()
  return [...history.movements, ...session.movements].filter((x) => !seen.has(x.id) && seen.add(x.id))
})
const suggestion = computed(() => {
  if (props.draft.kind !== 'transaction') return null
  const s = suggestCategory(form.note, form.kind, known.value)
  return s && (s.categoryId !== form.categoryId || (s.subcategoryId ?? '') !== form.subcategoryId) ? s : null
})
function useSuggestion() {
  const s = suggestion.value
  if (!s) return
  form.categoryId = s.categoryId
  form.subcategoryId = s.subcategoryId ?? ''
  if (!isEdit.value && accounts.value.some((a) => a.id === s.assetId)) form.assetId = s.assetId
}
const aiSuggest = ref<{ state: 'idle' | 'asking' | 'none' | 'failed'; text?: string }>({ state: 'idle' })
const canAskAi = computed(() => props.draft.kind === 'transaction' && chat.ready && chat.settings.includeDetails && form.note.trim().length >= 3 && !suggestion.value && !form.categoryId)
async function askAiCategory() {
  aiSuggest.value = { state: 'asking' }
  const options = categories.value.map((c) => `- ${c.name}${c.subcategories.length ? `: ${c.subcategories.map((x) => x.name).join(', ')}` : ''}`).join('\n')
  try {
    const answer = await chat.oneShot(
      `Pick the best category for a new ${form.kind} with the note "${form.note.replace(/"/g, "'")}". Choose only from this list (category: subcategories):\n${options}\n` +
      'Reply with JSON only, no lookups: {"category":"<exact category name>","subcategory":"<exact subcategory name or empty>"}',
    )
    const json = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1)) as { category?: string; subcategory?: string }
    const cat = categories.value.find((c) => c.name === json.category)
    if (!cat) { aiSuggest.value = { state: 'none' }; return }
    form.categoryId = cat.id
    form.subcategoryId = cat.subcategories.find((x) => x.name === json.subcategory)?.id ?? ''
    aiSuggest.value = { state: 'idle', text: [cat.name, json.subcategory].filter(Boolean).join(' › ') }
  } catch {
    aiSuggest.value = { state: 'failed' }
  }
}

const isEdit = computed(() =>
  (d.kind === 'transaction' || d.kind === 'transfer' || d.kind === 'asset' || d.kind === 'card') && !!d.initial,
)

const title = computed(() => {
  switch (d.kind) {
    case 'transaction': return isEdit.value ? 'Edit transaction' : 'Add transaction'
    case 'transfer': return isEdit.value ? 'Edit transfer' : 'Add transfer'
    case 'delete-transactions': return d.rows.length === 1 ? 'Delete transaction' : t('Delete {n} transactions', { n: d.rows.length.toLocaleString(intlLocale()) })
    case 'asset': return isEdit.value ? 'Edit account' : 'Add account'
    case 'delete-asset': return d.isCard ? 'Delete card' : 'Delete account'
    case 'card': return isEdit.value ? 'Edit card' : 'Add card'
  }
  return ''
})

/** Builds the exact change, or returns a message telling what to fix. */
function build(): WriteOp | string {
  const amount = Number(form.amount)
  switch (d.kind) {
    case 'transaction': {
      const cat = categories.value.find((c) => c.id === form.categoryId)
      if (!form.assetId) return 'Choose an account.'
      if (!cat) return 'Choose a category.'
      if (!(amount > 0)) return 'Enter an amount greater than 0.'
      const sub = subcategories.value.find((s) => s.id === form.subcategoryId)
      const fields = {
        date: form.date, assetId: form.assetId, payType: nameOf(form.assetId),
        categoryId: cat.id, categoryName: cat.name, subcategoryId: sub?.id, subcategoryName: sub?.name,
        amount, kind: form.kind, note: form.note, detail: form.detail,
      }
      return d.initial ? { op: 'update-transaction', id: d.initial.id, fields } : { op: 'create-transaction', fields }
    }
    case 'transfer': {
      if (!form.assetId || !form.toAssetId) return 'Choose both accounts.'
      if (form.assetId === form.toAssetId) return 'Choose two different accounts.'
      if (!(amount > 0)) return 'Enter an amount greater than 0.'
      const fields = {
        date: form.date, fromAssetId: form.assetId, fromAssetName: nameOf(form.assetId),
        toAssetId: form.toAssetId, toAssetName: nameOf(form.toAssetId), amount, note: form.note, detail: form.detail,
      }
      if (!d.initial) return { op: 'create-transfer', fields }
      // The server edits a transfer through its outgoing row.
      const outId = d.initial.type === 'transfer-out' ? d.initial.id : null
      if (!outId) return 'Edit this transfer from its outgoing row (the one with the negative amount).'
      return { op: 'update-transfer', id: outId, fields }
    }
    case 'delete-transactions':
      return { op: 'delete-transactions', ids: d.rows.map((r) => r.id) }
    case 'asset': {
      const group = groups.value.find((g) => g.id === form.groupId)
      if (!group) return 'Choose a group.'
      if (!form.name.trim()) return 'Enter a name.'
      if (!Number.isFinite(Number(form.balance))) return 'Enter a valid balance.'
      const fields = { groupId: group.id, groupName: group.name, name: form.name, balance: Number(form.balance) }
      return d.initial ? { op: 'update-asset', assetId: d.initial.id, fields } : { op: 'create-asset', fields }
    }
    case 'delete-asset':
      return { op: 'delete-asset', assetId: d.id }
    case 'card': {
      if (!form.name.trim()) return 'Enter a card name.'
      if (!form.linkAssetId) return 'Choose the account the card is paid from.'
      const day = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31
      if (!day(form.closingDay) || !day(form.paymentDay)) return 'Days must be between 1 and 31.'
      const fields = {
        name: form.name, linkAssetId: form.linkAssetId, linkAssetName: nameOf(form.linkAssetId),
        closingDay: form.closingDay, paymentDay: form.paymentDay,
      }
      return d.initial
        ? { op: 'update-card', assetId: d.initial.id, fields }
        : { op: 'create-card', fields, outstanding: Number(form.outstanding) || 0 }
    }
  }
  return 'Unknown change.'
}

const pending = ref<WriteOp | null>(null)

/** Plain-language lines describing exactly what will change. */
const summary = computed<string[]>(() => {
  const op = pending.value
  if (!op) return []
  switch (op.op) {
    case 'create-transaction':
    case 'update-transaction': {
      const f = op.fields
      return [
        t('{kind} of {amount} on {date}', { kind: f.kind === 'income' ? t('Income') : t('Expense'), amount: formatMoney(f.amount), date: formatDate(f.date) }),
        t('Account: {name}', { name: f.payType }),
        t('Category: {name}', { name: `${f.categoryName}${f.subcategoryName ? ` / ${f.subcategoryName}` : ''}` }),
        ...(f.note ? [t('Note: {note}', { note: f.note })] : []),
      ]
    }
    case 'create-transfer':
    case 'update-transfer': {
      const f = op.fields
      return [
        t('Move {amount} on {date}', { amount: formatMoney(f.amount), date: formatDate(f.date) }),
        t('From {from} to {to}', { from: f.fromAssetName, to: f.toAssetName }),
        ...(op.op === 'update-transfer' ? [t('The phone replaces the transfer with a new one.')] : []),
      ]
    }
    case 'delete-transactions':
      return (d.kind === 'delete-transactions' ? d.rows : []).map(
        (r) => `${formatDate(r.date)}  ${r.content ?? r.categoryName ?? ''}  ${formatMoney(r.amount)}`,
      )
    case 'create-asset':
    case 'update-asset':
      return [t('{name} in {group}', { name: op.fields.name, group: op.fields.groupName }), t('Balance: {amount}', { amount: formatMoney(op.fields.balance) })]
    case 'delete-asset':
      return [
        d.kind === 'delete-asset' ? d.name : '',
        t('Not confirmed: what the phone does with the transactions recorded in it. Check them after deleting.'),
      ]
    case 'create-card':
    case 'update-card':
      return [
        op.fields.name,
        t('Paid from {name}', { name: op.fields.linkAssetName }),
        t('Statement closes on day {closing}, payment due on day {payment}', { closing: op.fields.closingDay.toLocaleString(intlLocale()), payment: op.fields.paymentDay.toLocaleString(intlLocale()) }),
      ]
  }
  return []
})

const destructive = computed(() => pending.value?.op === 'delete-transactions' || pending.value?.op === 'delete-asset')
const typed = ref('')

function review() {
  const result = build()
  if (typeof result === 'string') {
    error.value = result
    return
  }
  error.value = null
  pending.value = result
  step.value = 'review'
}

if (step.value === 'review' || d.kind === 'delete-transactions' || d.kind === 'delete-asset') {
  const result = build()
  if (typeof result !== 'string') pending.value = result
}

let sent = false
async function confirm() {
  if (!pending.value || sent) return
  sent = true // guards against a double click sending the change twice
  step.value = 'sending'
  error.value = null
  try {
    await session.write(pending.value)
    step.value = 'done'
  } catch (e) {
    const kind = (e as { kind?: string })?.kind
    if (kind === 'offline') {
      // The request never left this computer, so it waits in the outbox.
      outbox.recordFailure(pending.value, e, summary.value.join(' · '), session.address)
      queued.value = true
      step.value = 'queued'
      return
    }
    if (kind === 'unconfirmed' || kind === 'timeout') {
      // The phone may have applied it, so it is never sent again by itself.
      outbox.recordFailure(pending.value, e, summary.value.join(' · '), session.address)
    }
    error.value = e instanceof Error ? e.message : String(e)
    step.value = 'review'
    sent = false
  }
}

function close() {
  if (step.value === 'sending') return
  dialog.value?.close()
  emit('close')
}
</script>

<template>
  <dialog ref="dialog" aria-labelledby="change-title" @cancel.prevent="close">
    <h2 id="change-title">{{ t(title) }}</h2>

    <form v-if="step === 'edit'" class="grid" @submit.prevent="review">
      <template v-if="draft.kind === 'transaction'">
        <div class="seg" role="radiogroup" :aria-label="t('Type')">
          <label><input v-model="form.kind" type="radio" value="expense" @change="form.categoryId = ''" /> {{ t('Expense') }}</label>
          <label><input v-model="form.kind" type="radio" value="income" @change="form.categoryId = ''" /> {{ t('Income') }}</label>
        </div>
        <label>{{ t('Date') }} <input id="f-date" v-model="form.date" type="date" required /></label>
        <label>{{ t('Amount') }} <input id="f-amount" v-model.number="form.amount" type="number" min="0.01" step="0.01" required /></label>
        <label>{{ t('Account') }}
          <select id="f-account" v-model="form.assetId"><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option></select>
        </label>
        <label>{{ t('Category') }}
          <select id="f-category" v-model="form.categoryId" @change="form.subcategoryId = ''">
            <option value="" disabled>{{ t('Choose…') }}</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label v-if="subcategories.length">{{ t('Subcategory') }}
          <select id="f-sub" v-model="form.subcategoryId">
            <option value="">{{ t('None') }}</option>
            <option v-for="s in subcategories" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label class="wide">{{ t('Note') }} <input id="f-note" v-model="form.note" maxlength="500" /></label>
        <p v-if="suggestion" class="wide suggest" role="status">
          <span>{{ t('Suggested from your history:') }} <b>{{ suggestion.label }}</b> <small>{{ t('(used {n} {times})', { n: suggestion.count.toLocaleString(intlLocale()), times: suggestion.count === 1 ? t('time') : t('times') }) }}</small></span>
          <button type="button" @click="useSuggestion">{{ t('Use it') }}</button>
        </p>
        <p v-else-if="canAskAi || aiSuggest.state !== 'idle' || aiSuggest.text" class="wide suggest" role="status">
          <span v-if="aiSuggest.state === 'asking'">{{ t('Asking the assistant…') }}</span>
          <span v-else-if="aiSuggest.state === 'none'">{{ t('The assistant found no matching category.') }}</span>
          <span v-else-if="aiSuggest.state === 'failed'">{{ t('The assistant could not suggest a category.') }}</span>
          <span v-else-if="aiSuggest.text">{{ t('Filled in by the assistant: {category}. Check it before saving.', { category: aiSuggest.text }) }}</span>
          <span v-else>{{ t('No earlier movement has this note.') }}</span>
          <button v-if="canAskAi && aiSuggest.state !== 'asking'" type="button" @click="askAiCategory">{{ t('Ask the assistant') }}</button>
        </p>
        <label class="wide">{{ t('Detail') }} <input id="f-detail" v-model="form.detail" maxlength="500" /></label>
      </template>

      <template v-else-if="draft.kind === 'transfer'">
        <label>{{ t('Date') }} <input id="t-date" v-model="form.date" type="date" required /></label>
        <label>{{ t('Amount') }} <input id="t-amount" v-model.number="form.amount" type="number" min="0.01" step="0.01" required /></label>
        <label>{{ t('From') }}
          <select id="t-from" v-model="form.assetId"><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option></select>
        </label>
        <label>{{ t('To') }}
          <select id="t-to" v-model="form.toAssetId">
            <option value="" disabled>{{ t('Choose…') }}</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label class="wide">{{ t('Note') }} <input id="t-note" v-model="form.note" maxlength="500" /></label>
      </template>

      <template v-else-if="draft.kind === 'asset'">
        <label class="wide">{{ t('Name') }} <input id="a-name" v-model="form.name" maxlength="100" required /></label>
        <label>{{ t('Group') }}
          <select id="a-group" v-model="form.groupId"><option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option></select>
        </label>
        <label>{{ t('Balance') }} <input id="a-balance" v-model.number="form.balance" type="number" step="0.01" /></label>
      </template>

      <template v-else-if="draft.kind === 'card'">
        <label class="wide">{{ t('Card name') }} <input id="c-name" v-model="form.name" maxlength="100" required /></label>
        <label class="wide">{{ t('Paid from') }}
          <select id="c-link" v-model="form.linkAssetId">
            <option value="" disabled>{{ t('Choose…') }}</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label>{{ t('Statement closes (day)') }} <input id="c-close" v-model.number="form.closingDay" type="number" min="1" max="31" required /></label>
        <label>{{ t('Payment due (day)') }} <input id="c-pay" v-model.number="form.paymentDay" type="number" min="1" max="31" required /></label>
        <label v-if="!isEdit">{{ t('Amount to pay now') }} <input id="c-out" v-model.number="form.outstanding" type="number" step="0.01" /></label>
      </template>

      <p v-if="error" class="error wide" role="alert">{{ t(error) }}</p>
      <div class="actions wide">
        <button type="button" @click="close">{{ t('Cancel') }}</button>
        <button class="primary" type="submit">{{ t('Review change') }}</button>
      </div>
    </form>

    <div v-else-if="step === 'review' || step === 'sending'">
      <p class="lead">{{ destructive ? t('This will permanently remove from your phone:') : t('This will be saved on your phone:') }}</p>
      <ul class="summary"><li v-for="line in summary" :key="line">{{ line }}</li></ul>
      <p v-if="!session.canWrite()" class="error">
        {{ t('A backup from the last 30 minutes is needed first. Go to Connect phone and choose Back up now.') }}
      </p>
      <p v-else-if="session.backup?.sqlite.status !== 'saved'" class="warn">
        {{ t('Your latest backup has only the readable snapshot, not the full phone backup. You may not be able to undo this.') }}
      </p>
      <label v-if="destructive" class="typed">{{ t('Type {word} to confirm', { word: 'delete' }) }}
        <input id="confirm-typed" v-model="typed" autocomplete="off" />
      </label>
      <p v-if="error" class="error" role="alert">{{ t(error) }}</p>
      <div class="actions">
        <button type="button" :disabled="step === 'sending'" @click="draft.kind.startsWith('delete') ? close() : (step = 'edit')">
          {{ draft.kind.startsWith('delete') ? t('Cancel') : t('Back') }}
        </button>
        <button
          :class="destructive ? 'danger' : 'primary'"
          :disabled="step === 'sending' || !session.canWrite() || (destructive && typed.trim().toLowerCase() !== 'delete')"
          @click="confirm"
        >
          {{ step === 'sending' ? t('Saving on phone…') : destructive ? t('Delete') : t('Save on phone') }}
        </button>
      </div>
    </div>

    <div v-else-if="step === 'queued'">
      <p class="ok">{{ t('Saved on this computer, not sent yet.') }}</p>
      <p>{{ t('The phone was not reachable, so the change is waiting in') }} <b>{{ t('Pending changes') }}</b>.
        {{ t('Open Money Manager on the phone again and use') }} <b>{{ t('Sync pending changes') }}</b> {{ t('to send it.') }}</p>
      <div class="actions"><button class="primary" @click="close">{{ t('Close') }}</button></div>
    </div>

    <div v-else>
      <p class="ok">{{ t('Done. The data was reloaded from your phone.') }}</p>
      <div class="actions"><button class="primary" @click="close">{{ t('Close') }}</button></div>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(34rem, calc(100vw - 2rem)); border: 1px solid var(--rule); border-radius: 12px; background: var(--paper); color: var(--ink); padding: 1.5rem; }
dialog::backdrop { background: rgb(0 0 0 / 0.45); }
h2 { margin: 0 0 1rem; font-size: 1.25rem; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem; }
.suggest { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; margin: -0.3rem 0 0; padding: 0.5rem 0.7rem; border-radius: 9px; background: var(--accent-soft); color: var(--accent-ink); font-size: 0.85rem; }
.suggest button { padding: 0.25rem 0.7rem; font-size: 0.82rem; }
.wide, .seg { grid-column: 1 / -1; }
label { display: grid; gap: 0.25rem; font-size: 0.85rem; color: var(--ink-soft); }
.seg { display: flex; gap: 1.25rem; }
.seg label { display: flex; align-items: center; gap: 0.35rem; color: var(--ink); font-size: 0.95rem; }
.actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
.lead { margin: 0 0 0.5rem; }
.summary { margin: 0 0 1rem; padding: 0.75rem 1rem 0.75rem 2rem; background: var(--mist); border-radius: 8px; display: grid; gap: 0.25rem; }
.typed { margin-bottom: 0.5rem; }
.error { color: var(--warn-ink); background: var(--warn-bg); padding: 0.5rem 0.75rem; border-radius: 6px; margin: 0.5rem 0 0; }
.warn { color: var(--warn-ink); font-size: 0.9rem; }
.ok { color: var(--income); }
.danger { background: var(--expense); border-color: var(--expense); color: #fff; }
@media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
</style>
