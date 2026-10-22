<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, intlLocale } from '../../i18n'
import { useSort } from '../../composables/sort'
import { formatMoney } from '../../domain/format'
import { filterAccountRows, type AccountFilter, type AccountRow } from '../../domain/money'
import SortTh from '../SortTh.vue'

const props = defineProps<{ rows: AccountRow[]; selected: string | null; canAdd: boolean }>()
defineEmits<{ select: [id: string]; 'add-account': []; 'add-card': [] }>()

const FILTERS: { id: AccountFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'bank', label: 'Cash and bank' }, { id: 'card', label: 'Cards' }, { id: 'loan', label: 'Loans' },
]
const filter = ref<AccountFilter>('all')
const visible = computed(() => filterAccountRows(props.rows, filter.value))
const sort = useSort(visible, {
  name: (r: AccountRow) => r.name,
  type: (r: AccountRow) => r.type,
  share: (r: AccountRow) => r.share,
  balance: (r: AccountRow) => r.balance,
})
</script>

<template>
  <section class="card" :aria-label="t('Accounts')">
    <div class="card-head">
      <h2>{{ t('Accounts') }}</h2>
      <div class="acts">
        <template v-if="canAdd">
          <button @click="$emit('add-account')">{{ t('Add account') }}</button>
          <button @click="$emit('add-card')">{{ t('Add card') }}</button>
        </template>
        <div class="seg" role="group" :aria-label="t('Filter accounts')">
          <button v-for="f in FILTERS" :key="f.id" type="button" :aria-pressed="filter === f.id" @click="filter = f.id">{{ t(f.label) }}</button>
        </div>
      </div>
    </div>
    <p v-if="!visible.length" class="muted">{{ t('No accounts found.') }}</p>
    <div v-else class="scroll">
      <table>
        <thead><tr>
          <SortTh :sort="sort" by="name">{{ t('Account') }}</SortTh>
          <SortTh :sort="sort" by="type">{{ t('Type') }}</SortTh>
          <SortTh :sort="sort" by="share">{{ t('Share') }}</SortTh>
          <SortTh :sort="sort" by="balance" num>{{ t('Balance') }}</SortTh>
        </tr></thead>
        <tbody>
          <tr v-for="r in sort.sorted.value" :key="r.id" :class="{ on: r.id === selected }" :aria-selected="r.id === selected">
            <th scope="row">
              <button type="button" class="pick" :aria-current="r.id === selected" @click="$emit('select', r.id)">
                <span class="dot" :style="{ background: r.color ?? 'var(--neutral-mark)' }" aria-hidden="true" />{{ r.name }}
              </button>
            </th>
            <td class="muted">{{ r.kind === 'card' ? t('Credit card') : r.type }}</td>
            <td class="share">
              <div class="track" aria-hidden="true"><span :style="{ width: `${r.share}%`, background: r.balance < 0 ? 'var(--expense)' : undefined }" /></div>
              <span class="muted num">{{ Math.round(r.share).toLocaleString(intlLocale()) }}%</span>
            </td>
            <td :class="['num', 'bal', r.balance < 0 ? 'expense' : '']">{{ formatMoney(r.balance) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.acts { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: flex-end; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 30rem; }
th, td { padding: 0.55rem 0.5rem; border-bottom: 1px solid var(--rule); text-align: left; font-weight: 400; }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: none; }
tbody tr:hover, tr.on { background: var(--hover); }
.pick { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 0.6rem; font-weight: 500; }
.pick:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
.dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; flex: none; }
.share { display: flex; align-items: center; gap: 0.6rem; min-width: 8rem; border-bottom: 1px solid var(--rule); }
tbody tr:last-child .share { border-bottom: none; }
.share .track { flex: 1; min-width: 3rem; }
.share .num { font-size: 0.85rem; width: 2.6rem; text-align: right; }
td.bal { text-align: right; font-weight: 600; }
h2 { margin: 0; }
</style>
