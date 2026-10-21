<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney } from '../../domain/format'
import { categoryRows } from '../../domain/spending'
import type { CategoryTotal } from '../../domain/types'
import type { BudgetState } from '../../domain/budget'

const props = defineProps<{
  totals: CategoryTotal[]
  selected: string
  /** Expense rows are orange when over budget; income rows are plain. */
  kind: 'expense' | 'income'
  /** Pace label per budgeted category, from the budget report. */
  pace?: Record<string, BudgetState>
}>()
const emit = defineEmits<{ toggle: [name: string] }>()

const rows = computed(() => categoryRows(props.totals))
const PACE_LABEL: Record<BudgetState, string> = { ok: 'on track', ahead: 'spending fast', over: 'over budget' }
</script>

<template>
  <p v-if="!rows.length" class="muted empty">Nothing recorded for this filter.</p>
  <ul v-else class="rows">
    <li v-for="r in rows" :key="r.name">
      <button type="button" class="row" :aria-pressed="selected === r.name" @click="emit('toggle', r.name)">
        <span class="name">{{ r.name }}</span>
        <span class="bar" aria-hidden="true">
          <span :class="['fill', kind === 'income' ? 'inc' : r.state]" :style="{ width: `${r.width * 100}%` }" />
          <span v-if="r.tick !== null" class="tick" :style="{ left: `${r.tick * 100}%` }" />
        </span>
        <span class="num amount">{{ formatMoney(r.total) }}</span>
        <span v-if="r.percent !== null" :class="['note', r.state]">
          <template v-if="r.state === 'over'">over by {{ formatMoney(r.overBy) }}</template>
          <template v-else>{{ r.percent }}% of budget</template>
          <template v-if="pace?.[r.name]"> · {{ PACE_LABEL[pace[r.name]] }}</template>
        </span>
      </button>
    </li>
  </ul>
  <p v-if="kind === 'expense' && rows.length" class="legend muted">
    <span class="key"><i class="sw within" /> within budget</span>
    <span class="key"><i class="sw over" /> over budget</span>
    <span class="key"><i class="sw none" /> no budget</span>
    <span class="key"><i class="mark" /> budget</span>
  </p>
</template>

<style scoped>
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.15rem; }
.row { width: 100%; display: grid; grid-template-columns: minmax(6rem, 11rem) 1fr auto; gap: 0.2rem 1rem; align-items: center; text-align: left; border: 0; background: transparent; padding: 0.5rem 0.6rem; border-radius: 10px; }
.row:hover { background: var(--hover); }
.row[aria-pressed='true'] { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-line); }
.name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { position: relative; height: 8px; border-radius: 4px; background: var(--track); }
.fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--neutral-mark); }
.fill.within, .fill.inc { background: var(--accent); }
.fill.over { background: var(--expense); }
.tick { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--ink); border-radius: 1px; }
.amount { text-align: right; }
.note { grid-column: 2 / 4; font-size: 0.8rem; color: var(--ink-soft); }
.note.over { color: var(--expense); font-weight: 500; }
.legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1.1rem; margin: 0.9rem 0 0; font-size: 0.8rem; }
.key { display: inline-flex; align-items: center; gap: 0.35rem; }
.sw { width: 14px; height: 6px; border-radius: 3px; display: inline-block; }
.sw.within { background: var(--accent); }
.sw.over { background: var(--expense); }
.sw.none { background: var(--neutral-mark); }
.mark { width: 2px; height: 12px; background: var(--ink); display: inline-block; }
.empty { margin: 0; }
@media (max-width: 560px) {
  .row { grid-template-columns: 1fr auto; }
  .bar { grid-column: 1 / 3; order: 3; }
  .note { grid-column: 1 / 3; order: 4; }
}
</style>
