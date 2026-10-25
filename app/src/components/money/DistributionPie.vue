<script setup lang="ts">
import { computed } from 'vue'
import { t, intlLocale } from '../../i18n'
import { formatMoney } from '../../domain/format'
import type { BalanceRow } from '../../domain/metadata'

const props = defineProps<{ title: string; rows: BalanceRow[]; currency: string }>()
const colors = ['var(--accent)', 'var(--income)', 'var(--expense)', 'var(--neutral-mark)', 'var(--ink-soft)']
const total = computed(() => props.rows.reduce((sum, row) => sum + row.amount, 0))
const magnitude = computed(() => props.rows.reduce((sum, row) => sum + Math.abs(row.amount), 0))
const slices = computed(() => {
  let offset = 0
  return props.rows.map((row, index) => {
    const percent = magnitude.value ? Math.abs(row.amount) / magnitude.value * 100 : 0
    const slice = { ...row, percent, offset, color: colors[index % colors.length] }
    offset += percent
    return slice
  })
})
const signed = (amount: number) => `${amount > 0 ? '+' : ''}${formatMoney(amount)} ${props.currency}`
const percentLabel = (value: number) => `${value.toLocaleString(intlLocale(), { maximumFractionDigits: 1 })}%`
</script>

<template>
  <section class="distribution-pie" :aria-label="title">
    <h3>{{ title }}</h3>
    <p class="num total">{{ signed(total) }}</p>
    <svg v-if="magnitude > 0" viewBox="0 0 100 100" role="img" :aria-label="title">
      <title>{{ title }}: {{ signed(total) }}</title>
      <circle v-for="(slice, index) in slices.filter(s => s.percent > 0)" :key="index" cx="50" cy="50" r="34" pathLength="100" fill="none" :stroke="slice.color" stroke-width="22" :stroke-dasharray="`${slice.percent} ${100 - slice.percent}`" :stroke-dashoffset="-slice.offset" transform="rotate(-90 50 50)" />
    </svg>
    <p v-else class="muted">{{ t('No nonzero balances.') }}</p>
    <ul>
      <li v-for="(slice, index) in slices" :key="index">
        <span class="swatch" :style="{ background: slice.color }" aria-hidden="true" />
        <span class="name">{{ slice.name }}</span>
        <span class="num">{{ signed(slice.amount) }} · {{ percentLabel(slice.percent) }}</span>
      </li>
    </ul>
    <p v-if="magnitude > 0" class="muted explanation">{{ t('Percentages use the sum of magnitudes in this chart, not net worth.') }}</p>
  </section>
</template>

<style scoped>
.distribution-pie { min-width: 0; }
h3, p { margin: 0.3rem 0; }
h3 { font-size: 1rem; }
.total { font-weight: 600; }
svg { display: block; width: min(100%, 10rem); margin: 0.5rem auto; }
ul { list-style: none; padding: 0; margin: 0.5rem 0; max-height: 14rem; overflow: auto; }
li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; padding: 0.25rem 0; }
.name { overflow-wrap: anywhere; flex: 1; min-width: 5rem; }
.swatch { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; flex: none; }
.explanation { font-size: 0.8rem; }
</style>
