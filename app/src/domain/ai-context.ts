import type { Movement } from './types'
import { analyze } from './insights'
import { cushionMonths, futureCommitments, greenStreak, healthScore, mainGroupShares, outliers, projectMonth, volatility } from './health'
import { budgetHistory, type MonthBudget } from './budget-history'

/**
 * The text the assistant reads. Built only from deterministic reports so every figure
 * matches the screens. Transaction descriptions are left out unless `includeDetails`.
 */

export interface ContextInput {
  movements: Movement[]
  first: string
  last: string
  currency: string
  liquid: number | null
  debts: number | null
  budgets: MonthBudget[]
  includeDetails: boolean
}

const n = (v: number) => (Math.round(v * 100) / 100).toFixed(2)
/** Descriptions go in as one quoted line so a note cannot pose as instructions on its own line. */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(/"/g, "'").slice(0, 120)
const pct = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v * 1000) / 10}%`)

export function buildContext(input: ContextInput): string {
  const inRange = input.movements.filter((m) => m.date >= input.first && m.date <= input.last)
  const r = analyze(input.movements, input.first, input.last)
  const months = r.months.map((m) => m.month)
  const averageIncome = r.months.reduce((a, m) => a + m.income, 0) / (r.months.length || 1)
  const cushion = input.liquid === null ? null : cushionMonths(input.liquid, r.averageExpense)
  const vol = volatility(r.months.filter((m) => m.month < input.last.slice(0, 7)))
  const score = healthScore({ savingsRate: r.savingsRate, cushion, cardDebt: Math.abs(input.debts ?? 0), averageIncome, volatility: vol, months: r.months })
  const projection = projectMonth(input.movements, input.last, r.months)
  const commitments = futureCommitments(input.movements, input.last)
  const budgets = budgetHistory(input.budgets.filter((b) => b.month >= input.first.slice(0, 7)))
  const lines: string[] = []
  const add = (s = '') => lines.push(s)

  add(`# Financial reports (${input.first} to ${input.last}, amounts in ${input.currency || 'main currency'})`)
  add()
  add('## Overview')
  add(`- Average monthly spending: ${n(r.averageExpense)}; average monthly income: ${n(averageIncome)}; savings rate: ${pct(r.savingsRate)}`)
  add(`- Health score: ${score.total}/100 (${score.parts.map((p) => `${p.label} ${p.points}/${p.max}`).join(', ')})`)
  if (input.liquid !== null) add(`- Spendable balance: ${n(input.liquid)}; emergency cushion: ${cushion === null ? 'n/a' : `${cushion} months`}`)
  if (input.debts !== null) add(`- Total debt: ${n(Math.abs(input.debts))} (${averageIncome > 0 ? pct(Math.abs(input.debts) / averageIncome) : 'n/a'} of monthly income)`)
  add(`- Monthly spending variation: ${vol === null ? 'n/a' : pct(vol)}; current streak of months with money left over: ${greenStreak(r.months, input.last)}`)
  if (projection) add(`- This month so far: spent ${n(projection.spent)} with ${pct(projection.elapsed)} of the month gone; projected month end ${n(projection.projected)} (average ${n(projection.average)}, income ${n(projection.income)})`)
  add()
  add('## Months (income / spending / net)')
  for (const m of r.months) add(`- ${m.month}: ${n(m.income)} / ${n(m.expense)} / ${n(m.net)}`)
  add()
  add('## Spending by main group (share now, share in the three months before)')
  for (const g of mainGroupShares(inRange, months)) add(`- ${g.name}: ${n(g.total)} (${pct(g.share)}, before ${pct(g.previousShare)})`)
  add()
  add('## Top categories (total, share, count, monthly change vs the three months before)')
  for (const c of r.categories.slice(0, 20)) {
    const ch = r.changes.find((x) => x.name === c.name)
    add(`- ${c.name}${c.group ? ` [${c.group}]` : ''}: ${n(c.total)}, ${pct(c.share)}, ${c.count} expenses${ch && ch.previous ? `, change ${ch.change >= 0 ? '+' : ''}${n(ch.change)}/month` : ''}`)
  }
  add()
  add('## Weekdays (average spending per day)')
  add(r.weekdays.map((w) => `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][w.weekday]} ${n(w.average)}`).join(', '))
  add()
  add('## Days with most spending')
  for (const d of r.topDays) add(`- ${d.date}: ${n(d.total)} in ${d.count} expenses`)
  add()
  add(`## Repeating charges (${r.recurring.length})`)
  for (const c of r.recurring.slice(0, 25)) add(`- ${input.includeDetails ? oneLine(c.label) : c.category}: ${n(c.amount)} in ${c.months} months`)
  add()
  add('## Scheduled future expenses per month')
  add(commitments.map((c) => `${c.month} ${n(c.total)}`).join(', '))
  if (budgets.records.length) {
    add()
    add(`## Budget track record (within budget ${pct(budgets.overallHitRate)} of the time)`)
    for (const b of budgets.records) add(`- ${b.name}: over in ${b.over} of ${b.months} months, average excess ${n(b.averageOver)}`)
  }
  add()
  add('## Opportunities found by fixed rules')
  for (const o of r.opportunities.slice(0, 8)) add(`- ${o.title}: ${o.detail} (${n(o.monthly)})`)
  const odd = outliers(inRange)
  if (odd.length) {
    add()
    add('## Unusual expenses')
    for (const o of odd) add(`- ${o.movement.date} ${o.movement.subcategoryName || o.movement.categoryName}${input.includeDetails && o.movement.content ? ` "${oneLine(o.movement.content)}"` : ''}: ${n(o.movement.amount)} (${o.times}x typical)`)
  }
  if (input.includeDetails) {
    add()
    add('## Largest expenses of the last three months')
    const cutoff = months.slice(-3)[0] ?? ''
    for (const m of inRange.filter((m) => m.type === 'expense' && !m.isFuture && m.date >= cutoff).sort((a, b) => b.amount - a.amount).slice(0, 30)) {
      add(`- ${m.date} ${m.subcategoryName || m.categoryName}: "${oneLine(m.content ?? '')}" ${n(m.amount)}`)
    }
  }
  return lines.join('\n')
}

export const SYSTEM_PROMPT = `You are a personal finance analyst inside a desktop app. The user asks about their own money.
Rules:
- Answer in the language the user writes in.
- Base every figure on the reports below. Do not invent numbers; if something is missing, say so.
- Be concrete and brief: lead with the answer, then the numbers that support it, then one to three actions.
- Point out risks and strengths honestly. Do not recommend specific financial products.
- Use short paragraphs or bullet lists. No tables wider than four columns.`

export function systemPrompt(context: string): string {
  return `${SYSTEM_PROMPT}\n\n${context}`
}
