import type { Opportunity } from '../../domain/insights'
import { monthLabel } from '../../domain/format'
import { t, intlLocale } from '../../i18n'

/** Translate only domain-owned templates; category names remain untouched parameters. */
export function opportunityTitle(o: Opportunity): string {
  if (o.month) return t('Spent more than earned in {month}', { month: monthLabel(o.month + '-01') })
  if (o.kind === 'rising' && o.title.endsWith(' is growing')) return t('{name} is growing', { name: o.title.slice(0, -' is growing'.length) })
  const count = /^(\d+) (repeating charges|small purchases)$/.exec(o.title)
  if (count) return o.kind === 'recurring'
    ? t('{n} repeating charges', { n: Number(count[1]).toLocaleString(intlLocale()) })
    : t('{n} small purchases', { n: Number(count[1]).toLocaleString(intlLocale()) })
  return o.title
}

export function opportunityDetail(o: Opportunity): string {
  if (o.kind === 'rising') {
    const match = /^(\d+)% more per month than the three months before\.$/.exec(o.detail)
    if (match) return t('{n}% more per month than the three months before.', { n: Number(match[1]).toLocaleString(intlLocale()) })
  }
  if (o.kind === 'recurring') return t('Subscriptions and fixed bills average this much per month. Cancelling one you no longer use saves every month.')
  if (o.kind === 'overspent-month') return t('Expenses passed income for that month.')
  if (o.kind === 'small-purchases') {
    const match = /^Purchases under (\d+) in the last (\d+) months add up quickly\.$/.exec(o.detail)
    if (match) return t('Purchases under {amount} in the last {n} months add up quickly.', { amount: Number(match[1]).toLocaleString(intlLocale()), n: Number(match[2]).toLocaleString(intlLocale()) })
  }
  return o.detail
}
