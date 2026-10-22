import { computed, type Ref } from 'vue'
import { t, intlLocale } from '../../i18n'
import { useSession } from '../../stores/session'
import { useAccountMetadata } from '../../stores/metadata'
import { useLiquid } from '../../composables/liquid'
import type { Insights } from '../../domain/insights'
import type { Movement } from '../../domain/types'
import {
  cushionMonths, futureCommitments, healthScore, outliers, projectMonth, volatility,
} from '../../domain/health'
import { formatMoney } from '../../domain/format'
import { scoreWord, unknownPartKeys } from './score-label'

export interface RiskItem {
  key: string
  title: string
  value: string
  detail: string
  /** 0 = fine, 1 = watch, 2 = act. Always also shown as text, never color alone. */
  severity: 0 | 1 | 2
}

/** Shared numbers behind the score and the risk reports, so Overview and Risks agree. */
export function useHealth(r: Ref<Insights>, movements: Ref<Movement[]>, first: Ref<string>, last: Ref<string>) {
  const session = useSession()
  const metadata = useAccountMetadata()
  const { groups, liquid, toggle } = useLiquid()

  /** Unknown (null) when no balances are loaded, rather than a fake zero months. */
  const cushion = computed(() => (groups.value.length ? cushionMonths(liquid.value, r.value.averageExpense) : null))
  const cardDebt = computed(() => Math.abs(metadata.totals.debts ?? session.dashboard?.debts ?? 0))
  const averageIncome = computed(() => r.value.months.reduce((a, m) => a + m.income, 0) / (r.value.months.length || 1))
  const vol = computed(() => volatility(r.value.months.filter((m) => m.month < last.value.slice(0, 7))))
  const score = computed(() => {
    const result = healthScore({ savingsRate: r.value.savingsRate, cushion: cushion.value, cardDebt: cardDebt.value, averageIncome: averageIncome.value, volatility: vol.value, months: r.value.months })
    const green = r.value.months.filter((m) => m.net > 0).length
    const text: Record<string, { label: string; detail: string }> = {
      savings: { label: t('Savings rate'), detail: t('Full points at 20% of income saved.') },
      cushion: { label: t('Emergency cushion'), detail: t('Full points at 6 months of spending covered.') },
      debt: { label: t('Debt load'), detail: t('Full points with no debt; none at one month of income.') },
      steady: { label: t('Steady spending'), detail: t('Full points when monthly spend varies 10% or less.') },
      green: { label: t('Months in the green'), detail: t('{green} of {total} months ended with money left over.', { green, total: r.value.months.length }) },
    }
    return { ...result, parts: result.parts.map((part) => ({ ...part, ...text[part.key] })) }
  })
  const word = computed(() => {
    const words = { Fragile: t('Fragile'), Fair: t('Fair'), Solid: t('Solid'), Strong: t('Strong') }
    return words[scoreWord(score.value.total)]
  })
  const unknown = computed(() => unknownPartKeys({ savingsRate: r.value.savingsRate, cushion: cushion.value, averageIncome: averageIncome.value, volatility: vol.value }))

  const inSpan = computed(() => movements.value.filter((m) => m.date >= first.value && m.date <= last.value))
  const odd = computed(() => outliers(inSpan.value))
  const projection = computed(() => projectMonth(movements.value, last.value, r.value.months))
  const commitments = computed(() => futureCommitments(movements.value, last.value))
  const committedTotal = computed(() => commitments.value.reduce((a, c) => a + c.total, 0))
  const nextMonths = computed(() => commitments.value.slice(0, 3).reduce((a, c) => a + c.total, 0) / 3)

  /** The same rules the Risks tab uses to color its numbers, ranked for the Overview summary. */
  const riskItems = computed<RiskItem[]>(() => {
    const items: RiskItem[] = []
    const c = cushion.value
    if (c !== null) {
      items.push({ key: 'cushion', title: t('Emergency cushion'), value: t('{n} months', { n: c.toLocaleString(intlLocale(), { maximumFractionDigits: 1 }) }), detail: t('Aim for 3 to 6 months of spending.'), severity: c >= 6 ? 0 : c >= 3 ? 1 : 2 })
    }
    const p = projection.value
    if (p) {
      items.push({ key: 'projection', title: t('Month-end projection'), value: formatMoney(p.projected), detail: p.projected > p.income ? t('On track to spend more than you earn.') : p.projected > p.average ? t('Above your usual month.') : t('In line with your usual month.'), severity: p.projected > p.income ? 2 : p.projected > p.average ? 1 : 0 })
    }
    if (averageIncome.value > 0) {
      const load = cardDebt.value / averageIncome.value
      items.push({ key: 'debt', title: t('Debt load'), value: `${Math.round(load * 100)}%`, detail: t('Owed compared with average monthly income.'), severity: cardDebt.value === 0 ? 0 : load > 0.5 ? 2 : load > 0.3 ? 1 : 0 })
    }
    if (odd.value.length) {
      items.push({ key: 'odd', title: t('Unusual expenses'), value: String(odd.value.length), detail: t('Far above what that category usually costs.'), severity: 1 })
    }
    return items
  })
  const topRisks = computed(() => riskItems.value.filter((i) => i.severity > 0).sort((a, b) => b.severity - a.severity).slice(0, 3))

  return { groups, liquid, toggle, cushion, cardDebt, averageIncome, vol, score, word, unknown, odd, projection, commitments, committedTotal, nextMonths, riskItems, topRisks }
}
