<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { t, intlLocale } from '../i18n'
import { useSort } from '../composables/sort'
import SortTh from './SortTh.vue'
import { useAccountMetadata } from '../stores/metadata'
import { loadNativeMetadata } from '../infrastructure/native-metadata'
import { formatMoney } from '../domain/format'

const metadata = useAccountMetadata()
const busy = ref(false), error = ref(''), message = ref(''), selected = ref('')
const form = reactive({ base: '', include: true, currency: '', rate: null as number | null })
const selectedName = computed(() => metadata.rows.find(r => r.id === selected.value)?.name)
watch(() => metadata.scope, () => { selected.value = ''; error.value = ''; message.value = '' })
function choose(id: string) {
  selected.value = id
  const m = metadata.settingsFor(id)
  Object.assign(form, { base: metadata.state.baseCurrency, include: m?.includeInTotals ?? true,
    currency: m?.currency ?? metadata.state.baseCurrency, rate: m?.rate ?? (metadata.state.baseCurrency ? 1 : null) })
  error.value = ''; message.value = ''
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  const scope = metadata.scope
  busy.value = true; error.value = ''; message.value = ''
  try {
    const snapshot = await loadNativeMetadata(file)
    if (scope !== metadata.scope) throw new Error('Connection changed. Select the backup again for this phone.')
    metadata.acceptImport(snapshot)
    selected.value = ''
    message.value = 'Metadata imported. Local overrides were preserved. No phone data was changed.'
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false; input.value = '' }
}
function save(reset = false) {
  error.value = ''; message.value = ''
  try {
    metadata.saveOverride(selected.value, reset ? null : {
      includeInTotals: form.include, currency: form.currency.trim().toUpperCase(), rate: Number(form.rate),
    }, form.base.trim().toUpperCase())
    message.value = reset ? 'Local override removed. Imported settings apply if available.' : 'Local settings saved. Nothing was sent to your phone.'
    selected.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
const include = (id: string) => { const x = metadata.settingsFor(id); return x ? (x.includeInTotals ? 'Yes' : 'No') : 'Pending' }
const metaSort = useSort(() => metadata.rows, { name: (r) => r.name, include: (r) => include(r.id), currency: (r) => metadata.settingsFor(r.id)?.currency ?? null, rate: (r) => metadata.settingsFor(r.id)?.rate ?? null, source: (r) => metadata.sourceOf(r.id) })
</script>

<template>
  <section>
    <h1>{{ t('Account metadata') }}</h1>
    <p>{{ t('Import a phone backup as a base, or configure each account manually. Local overrides take priority and survive imports.') }}</p>
    <p>{{ t('These settings affect desktop totals only. They do not change the phone, its accounts or its transactions.') }}</p>
    <div class="card">
      <label for="metadata-backup">{{ t('Import metadata from .mmbak / .sqlite') }}</label>
      <input id="metadata-backup" type="file" accept=".mmbak,.sqlite,.sqlite3" :disabled="busy || !metadata.rows.length" @change="importFile" />
      <p class="muted">{{ busy ? t('Reading metadata locally…') : t('Read in memory; the backup is not uploaded or stored. Maximum 64 MiB.') }}</p>
      <p v-if="metadata.state.imported" class="muted">{{ t('Last import: {date}', { date: new Date(metadata.state.imported.importedAt).toLocaleString(intlLocale()) }) }}</p>
      <p>{{ t('After adding accounts or changing account settings on the phone, import a fresh backup or update the local settings below. PC Manager cannot reliably report switch or currency changes.') }}</p>
      <p v-if="metadata.totals.missing.length" role="status">{{ t('{n} account(s) need metadata before corrected totals are available.', { n: metadata.totals.missing.length.toLocaleString(intlLocale()) }) }}</p>
      <p v-if="metadata.changedAccounts.length" role="status">{{ t('Account names changed since import. Review their settings or import a fresh backup.') }}</p>
    </div>
    <p v-if="metadata.storageError" class="error" role="alert">{{ t(metadata.storageError) }}</p>
    <p v-if="error" class="error" role="alert">{{ t(error) }}</p>
    <p v-if="message" role="status">{{ t(message) }}</p>
    <p v-if="!metadata.rows.length">{{ t('Connect the phone to load accounts first.') }}</p>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><SortTh :sort="metaSort" by="name">{{ t('Account') }}</SortTh><SortTh :sort="metaSort" by="include">{{ t('Include in totals') }}</SortTh><SortTh :sort="metaSort" by="currency">{{ t('Currency') }}</SortTh><SortTh :sort="metaSort" by="rate" num>{{ t('Rate to {currency}', { currency: metadata.state.baseCurrency || t('base') }) }}</SortTh><SortTh :sort="metaSort" by="source">{{ t('Source') }}</SortTh><th></th></tr></thead>
        <tbody><tr v-for="row in metaSort.sorted.value" :key="row.id">
          <th scope="row">{{ row.name }}</th>
          <td>{{ metadata.settingsFor(row.id) ? metadata.settingsFor(row.id)!.includeInTotals ? t('Yes') : t('No') : t('Pending') }}</td>
          <td>{{ metadata.settingsFor(row.id)?.currency ?? '—' }}</td>
          <td>{{ metadata.settingsFor(row.id)?.rate?.toLocaleString(intlLocale(), { maximumSignificantDigits: 15 }) ?? '—' }}</td>
          <td>{{ t(metadata.sourceOf(row.id)) }}</td>
          <td><button :aria-label="t('Configure {name}', { name: row.name })" @click="choose(row.id)">{{ t('Configure') }}</button></td>
        </tr></tbody>
      </table>
    </div>
    <form v-if="selected" class="card editor" @submit.prevent="save()">
      <h2>{{ selectedName }}</h2>
      <label>{{ t('Base currency (ISO code)') }}
        <input v-model="form.base" maxlength="3" pattern="[A-Za-z]{3}" placeholder="GTQ" :readonly="!!metadata.state.baseCurrency" required />
      </label>
      <label><input v-model="form.include" type="checkbox" /> {{ t('Include in totals') }}</label>
      <label>{{ t('Account currency (ISO code)') }}
        <input v-model="form.currency" maxlength="3" pattern="[A-Za-z]{3}" placeholder="USD" required />
      </label>
      <label>{{ t('Base currency units per 1 account currency unit') }}
        <input v-model.number="form.rate" type="number" min="0.000000001" step="any" required />
      </label>
      <p class="muted">{{ t('For example, 1 USD = 7.78 GTQ means rate 7.78. Base currency rate must be 1.') }}</p>
      <div class="actions">
        <button type="button" @click="selected = ''">{{ t('Cancel') }}</button>
        <button v-if="metadata.sourceOf(selected) === 'Local override'" type="button" @click="save(true)">{{ t('Use imported settings') }}</button>
        <button class="primary" type="submit">{{ t('Save local settings') }}</button>
      </div>
    </form>
    <p v-if="metadata.totals.netWorth !== null"><strong>{{ t('Current net worth: {amount} {currency}', { amount: formatMoney(metadata.totals.netWorth), currency: metadata.state.baseCurrency }) }}</strong></p>
  </section>
</template>

<style scoped>
h1 { margin-top: 0; }
.card { border: 1px solid var(--rule); border-radius: 12px; padding: 1rem; margin: 1rem 0; background: var(--paper); }
.muted { color: var(--ink-soft); font-size: 0.85rem; }
.error { color: var(--expense); }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--rule); }
.editor { max-width: 34rem; display: grid; gap: 0.8rem; }
.editor label { display: grid; gap: 0.3rem; }
.editor label:has(input[type='checkbox']) { display: flex; }
.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
</style>
