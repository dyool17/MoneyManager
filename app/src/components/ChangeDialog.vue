<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useSession } from '../stores/session'
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
const dialog = ref<HTMLDialogElement | null>(null)
const step = ref<'edit' | 'review' | 'sending' | 'done'>('edit')
const error = ref<string | null>(null)

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
const isEdit = computed(() =>
  (d.kind === 'transaction' || d.kind === 'transfer' || d.kind === 'asset' || d.kind === 'card') && !!d.initial,
)

const title = computed(() => {
  switch (d.kind) {
    case 'transaction': return isEdit.value ? 'Edit transaction' : 'Add transaction'
    case 'transfer': return isEdit.value ? 'Edit transfer' : 'Add transfer'
    case 'delete-transactions': return d.rows.length === 1 ? 'Delete transaction' : `Delete ${d.rows.length} transactions`
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
        `${f.kind === 'income' ? 'Income' : 'Expense'} of ${formatMoney(f.amount)} on ${formatDate(f.date)}`,
        `Account: ${f.payType}`,
        `Category: ${f.categoryName}${f.subcategoryName ? ` / ${f.subcategoryName}` : ''}`,
        ...(f.note ? [`Note: ${f.note}`] : []),
      ]
    }
    case 'create-transfer':
    case 'update-transfer': {
      const f = op.fields
      return [
        `Move ${formatMoney(f.amount)} on ${formatDate(f.date)}`,
        `From ${f.fromAssetName} to ${f.toAssetName}`,
        ...(op.op === 'update-transfer' ? ['The phone replaces the transfer with a new one.'] : []),
      ]
    }
    case 'delete-transactions':
      return (d.kind === 'delete-transactions' ? d.rows : []).map(
        (r) => `${formatDate(r.date)}  ${r.content ?? r.categoryName ?? ''}  ${formatMoney(r.amount)}`,
      )
    case 'create-asset':
    case 'update-asset':
      return [`${op.fields.name} in ${op.fields.groupName}`, `Balance: ${formatMoney(op.fields.balance)}`]
    case 'delete-asset':
      return [
        d.kind === 'delete-asset' ? d.name : '',
        'Not confirmed: what the phone does with the transactions recorded in it. Check them after deleting.',
      ]
    case 'create-card':
    case 'update-card':
      return [
        op.fields.name,
        `Paid from ${op.fields.linkAssetName}`,
        `Statement closes on day ${op.fields.closingDay}, payment due on day ${op.fields.paymentDay}`,
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
    <h2 id="change-title">{{ title }}</h2>

    <form v-if="step === 'edit'" class="grid" @submit.prevent="review">
      <template v-if="draft.kind === 'transaction'">
        <div class="seg" role="radiogroup" aria-label="Type">
          <label><input v-model="form.kind" type="radio" value="expense" @change="form.categoryId = ''" /> Expense</label>
          <label><input v-model="form.kind" type="radio" value="income" @change="form.categoryId = ''" /> Income</label>
        </div>
        <label>Date <input id="f-date" v-model="form.date" type="date" required /></label>
        <label>Amount <input id="f-amount" v-model.number="form.amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Account
          <select id="f-account" v-model="form.assetId"><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option></select>
        </label>
        <label>Category
          <select id="f-category" v-model="form.categoryId" @change="form.subcategoryId = ''">
            <option value="" disabled>Choose…</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label v-if="subcategories.length">Subcategory
          <select id="f-sub" v-model="form.subcategoryId">
            <option value="">None</option>
            <option v-for="s in subcategories" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label class="wide">Note <input id="f-note" v-model="form.note" maxlength="500" /></label>
        <label class="wide">Detail <input id="f-detail" v-model="form.detail" maxlength="500" /></label>
      </template>

      <template v-else-if="draft.kind === 'transfer'">
        <label>Date <input id="t-date" v-model="form.date" type="date" required /></label>
        <label>Amount <input id="t-amount" v-model.number="form.amount" type="number" min="0.01" step="0.01" required /></label>
        <label>From
          <select id="t-from" v-model="form.assetId"><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option></select>
        </label>
        <label>To
          <select id="t-to" v-model="form.toAssetId">
            <option value="" disabled>Choose…</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label class="wide">Note <input id="t-note" v-model="form.note" maxlength="500" /></label>
      </template>

      <template v-else-if="draft.kind === 'asset'">
        <label class="wide">Name <input id="a-name" v-model="form.name" maxlength="100" required /></label>
        <label>Group
          <select id="a-group" v-model="form.groupId"><option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option></select>
        </label>
        <label>Balance <input id="a-balance" v-model.number="form.balance" type="number" step="0.01" /></label>
      </template>

      <template v-else-if="draft.kind === 'card'">
        <label class="wide">Card name <input id="c-name" v-model="form.name" maxlength="100" required /></label>
        <label class="wide">Paid from
          <select id="c-link" v-model="form.linkAssetId">
            <option value="" disabled>Choose…</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label>Statement closes (day) <input id="c-close" v-model.number="form.closingDay" type="number" min="1" max="31" required /></label>
        <label>Payment due (day) <input id="c-pay" v-model.number="form.paymentDay" type="number" min="1" max="31" required /></label>
        <label v-if="!isEdit">Amount to pay now <input id="c-out" v-model.number="form.outstanding" type="number" step="0.01" /></label>
      </template>

      <p v-if="error" class="error wide" role="alert">{{ error }}</p>
      <div class="actions wide">
        <button type="button" @click="close">Cancel</button>
        <button class="primary" type="submit">Review change</button>
      </div>
    </form>

    <div v-else-if="step === 'review' || step === 'sending'">
      <p class="lead">{{ destructive ? 'This will permanently remove from your phone:' : 'This will be saved on your phone:' }}</p>
      <ul class="summary"><li v-for="line in summary" :key="line">{{ line }}</li></ul>
      <p v-if="!session.canWrite()" class="error">
        A backup from the last 30 minutes is needed first. Go to Connect phone and choose Back up now.
      </p>
      <p v-else-if="session.backup?.sqlite.status !== 'saved'" class="warn">
        Your latest backup has only the readable snapshot, not the full phone backup. You may not be able to undo this.
      </p>
      <label v-if="destructive" class="typed">Type <b>delete</b> to confirm
        <input id="confirm-typed" v-model="typed" autocomplete="off" />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" :disabled="step === 'sending'" @click="draft.kind.startsWith('delete') ? close() : (step = 'edit')">
          {{ draft.kind.startsWith('delete') ? 'Cancel' : 'Back' }}
        </button>
        <button
          :class="destructive ? 'danger' : 'primary'"
          :disabled="step === 'sending' || !session.canWrite() || (destructive && typed.trim().toLowerCase() !== 'delete')"
          @click="confirm"
        >
          {{ step === 'sending' ? 'Saving on phone…' : destructive ? 'Delete' : 'Save on phone' }}
        </button>
      </div>
    </div>

    <div v-else>
      <p class="ok">Done. The data was reloaded from your phone.</p>
      <div class="actions"><button class="primary" @click="close">Close</button></div>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(34rem, calc(100vw - 2rem)); border: 1px solid var(--rule); border-radius: 12px; background: var(--paper); color: var(--ink); padding: 1.5rem; }
dialog::backdrop { background: rgb(0 0 0 / 0.45); }
h2 { margin: 0 0 1rem; font-size: 1.25rem; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem; }
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
