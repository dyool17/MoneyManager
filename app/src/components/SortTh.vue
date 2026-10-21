<script setup lang="ts">
/** A column header that sorts its table; pass the object returned by useSort. */
const props = defineProps<{ sort: { ariaSort: (k: never) => 'none' | 'ascending' | 'descending'; toggle: (k: never) => void }; by: string; num?: boolean }>()
const state = () => props.sort.ariaSort(props.by as never)
</script>

<template>
  <th scope="col" :class="{ num }" :aria-sort="state()">
    <button type="button" class="sort" @click="sort.toggle(by as never)">
      <slot />
      <span class="arrow" aria-hidden="true">{{ state() === 'ascending' ? '▲' : state() === 'descending' ? '▼' : '↕' }}</span>
    </button>
  </th>
</template>

<style scoped>
th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); font-weight: 600; white-space: nowrap; }
th.num { text-align: right; }
.sort { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; font: inherit; color: inherit; }
.sort:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
.arrow { font-size: 0.7em; opacity: 0.35; }
th[aria-sort='ascending'] .arrow, th[aria-sort='descending'] .arrow { opacity: 1; color: var(--accent); }
.sort:hover .arrow { opacity: 0.8; }
th.num .sort { flex-direction: row-reverse; }
</style>
