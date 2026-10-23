<script setup lang="ts">
import type { IncomingChange } from '../../domain/sync'
import { formatDate, formatMoney } from '../../domain/format'
import { t } from '../../i18n'
import { fieldValue } from './presentation'
defineProps<{ change: IncomingChange }>()
</script>

<template>
  <div class="change">
    <strong>{{ t(change.kind) }}</strong>
    <span>{{ formatDate((change.remote ?? change.local)!.date) }}</span>
    <span>{{ (change.remote ?? change.local)!.accountName }}</span>
    <span>{{ [(change.remote ?? change.local)!.categoryName, (change.remote ?? change.local)!.subcategoryName].filter(Boolean).join(' / ') }}</span>
    <strong>{{ formatMoney((change.remote ?? change.local)!.amount) }}</strong>
    <span>{{ (change.remote ?? change.local)!.content }}</span>
    <span>{{ (change.remote ?? change.local)!.detail }}</span>
    <ul v-if="change.changes.length">
      <li v-for="field in change.changes" :key="field.field">
        {{ t(field.field) }}: <del>{{ fieldValue(field.field, field.from) }}</del> → <ins>{{ fieldValue(field.field, field.to) }}</ins>
      </li>
    </ul>
    <slot />
  </div>
</template>

<style scoped>
.change { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem 1rem; padding: .8rem 0; border-top: 1px solid var(--rule); overflow-wrap: anywhere; }
ul { flex-basis: 100%; margin: 0; padding-left: 1.2rem; }
ins { text-decoration: none; color: var(--income); }
</style>
