import type { Movement } from './types'
import { analyze } from './insights'
import { cushionMonths, futureCommitments, greenStreak, healthScore, mainGroupShares, outliers, projectMonth, volatility } from './health'
import { budgetHistory, type MonthBudget } from './budget-history'
import { describeEvents, excludeOneOffFromBaseline, type LifeEvent } from './life-events'
import { detectPatterns } from './patterns'
import { forecast } from './forecast'
import { budgetAmount, evaluateBudgets, type BudgetMode, type BudgetPlan } from './budget-plan'
import { elapsedShare } from './budget'
import { findBadDecisions, type BigReason } from './bad-decisions'

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
  /** User-recorded life events; labels go in only when `includeDetails` is on. */
  events?: LifeEvent[]
  /** Budgets imported from a phone backup and the mode chosen per category. */
  plan?: BudgetPlan | null
  modes?: Record<string, BudgetMode>
}

const BIG: Record<BigReason, string> = {
  outlier: 'far above its usual cost',
  'large-share': 'large share of its budget',
  'over-budget': 'pushes its budget over',
}
const STATE = { ok: 'on track', ahead: 'spending fast', over: 'over budget' } as const
const whole = (v: number) => String(Math.round(v))
const times = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v * 100) / 100}x typical`)

/**
 * What turns the reports into advice: the month-by-month history per category, the patterns
 * found in it, the income pattern, the rhythm inside a month, a forecast, the imported budgets
 * and the expenses flagged by fixed rules.
 */
function advisorSections(input: ContextInput, add: (s?: string) => void) {
  const events = input.events ?? []
  const p = detectPatterns(input.movements, input.first, input.last, events)
  if (p.categories.length) {
    add()
    add('## Spending by category per month (whole units, oldest first)')
    add(`Months: ${p.months.join(', ')}`)
    for (const c of p.categories.slice(0, 25)) add(`- ${c.name}${c.group ? ` [${c.group}]` : ''}: ${c.monthly.map(whole).join(', ')}`)
    add()
    add('## Patterns by category (typical = median month without one-off life events; trend = change per month over the last 12 months; seasonal = calendar months that repeat as spikes)')
    for (const c of p.categories.slice(0, 25)) {
      add(`- ${c.name}${c.group ? ` [${c.group}]` : ''}: typical ${n(c.typical)}, trend ${c.trend === null ? 'n/a' : `${c.trend >= 0 ? '+' : ''}${n(c.trend)}/month`}, volatility ${pct(c.volatility)}, seasonal ${c.seasonal.length ? c.seasonal.join(', ') : 'none'}, last 3 months ${times(c.recentVsTypical)}`)
    }
  }
  add()
  add('## Income pattern')
  add(`- Typical monthly income: ${n(p.income.typical)} (variation ${pct(p.income.volatility)})`)
  for (const s of p.income.sources) add(`- ${input.includeDetails ? `"${oneLine(s.label)}"` : 'Regular source'}: ${n(s.typical)} around day ${s.day}, in ${s.months} months`)
  add()
  add('## Spending rhythm inside the month')
  add(`- Share of a month's spending done by day 10: ${pct(p.rhythm.byDay10)}; by day 20: ${pct(p.rhythm.byDay20)}`)

  const f = forecast({ patterns: p, movements: input.movements, today: input.last, events, plan: input.plan ?? null })
  add()
  add('## Forecast (current month and the next 6; estimates from the patterns, not targets)')
  add('Basis per line: typical month, seasonal uplift, trend, entries already scheduled on the phone, life events.')
  for (const m of f.months) {
    const top = [...m.lines].sort((a, b) => b.amount - a.amount).slice(0, 6)
    add(`- ${m.month}: spending ${n(m.expense)}, income ${n(m.income)}, net ${n(m.net)}; largest: ${top.map((l) => `${l.name} ${whole(l.amount)} (${l.basis.join('+')})`).join(', ')}`)
  }
  add(`Cumulative net over the forecast: ${n(f.cumulativeNet)}`)

  const month = input.last.slice(0, 7)
  const plan = input.plan
  if (plan?.budgets.length) {
    const statuses = evaluateBudgets(plan, input.movements, month, input.modes ?? {}, elapsedShare({ startDate: `${month}-01`, endDate: `${month}-31` }, input.last))
    add()
    add(`## Imported budgets (from a phone backup of ${plan.importedAt.slice(0, 10)}; annual = judged on January to date)`)
    for (const s of statuses) {
      const b = plan.budgets.find((x) => x.categoryId === s.categoryId)!
      const window = s.mode === 'annual' ? 'so far this year' : 'this month'
      add(`- ${s.name}${s.parent ? ` [${s.parent}]` : ''}: ${s.mode}, spent ${n(s.judgedSpent)} of ${n(s.judgedBudget)} ${window}, ${STATE[s.state]}; ${n(budgetAmount(b, month))} per month`)
    }
  }
  const flags = findBadDecisions({ movements: input.movements, plan: plan ?? null, modes: input.modes ?? {}, events, month })
  if (flags.length) {
    add()
    add('## Possible bad decisions flagged by fixed rules (big, unexplained, discretionary; this month)')
    for (const d of flags.slice(0, 15)) {
      const m = d.movement
      add(`- ${m.date} ${m.subcategoryName || m.categoryName || 'Uncategorized'}${input.includeDetails && m.content ? ` "${oneLine(m.content)}"` : ''}: ${n(m.amount)} (${d.big.map((b) => BIG[b]).join(', ')})`)
    }
  }
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
  const projection = projectMonth(input.movements, input.last, excludeOneOffFromBaseline(r.months, input.events ?? [], input.movements))
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
  else add('- Spendable balance and emergency cushion: unknown (no account balances in this data); the cushion part of the score counts it as 0, so do not call it a fact.')
  if (input.debts === null) add('- Total debt: unknown; the debt part of the score assumes no debt, so do not call it a strength.')
  else add(`- Total debt: ${n(Math.abs(input.debts))} (${averageIncome > 0 ? pct(Math.abs(input.debts) / averageIncome) : 'n/a'} of monthly income)`)
  add(`- Monthly spending variation: ${vol === null ? 'n/a' : pct(vol)}; current streak of months with money left over: ${greenStreak(r.months, input.last)}`)
  if (projection) add(`- This month so far: spent ${n(projection.spent)} with ${pct(projection.elapsed)} of the month gone; projected month end ${n(projection.projected)} (past months averaged ${n(projection.average)} spending; expected income ${n(projection.income)}, received so far ${n(r.months.find((m) => m.month === input.last.slice(0, 7))?.income ?? 0)})`)
  add()
  add('## Months (income / spending / net)')
  for (const m of r.months) add(`- ${m.month}: ${n(m.income)} / ${n(m.expense)} / ${n(m.net)}`)
  advisorSections(input, add)
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
  add('## Scheduled future expenses per month (entries already saved for future dates, such as installments; not total expected spending)')
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
  const eventNames = new Map<string, string>()
  for (const m of input.movements) {
    if (m.categoryId && m.categoryName) eventNames.set(m.categoryId, m.categoryName)
    if (m.subcategoryId && m.subcategoryName) eventNames.set(m.subcategoryId, m.subcategoryName)
  }
  const events = describeEvents(input.events ?? [], input.first, input.last, input.includeDetails, eventNames)
  if (events.length) {
    add()
    for (const e of events) add(e)
  }
  return lines.join('\n')
}

export const SYSTEM_PROMPT = `You are the user's personal financial advisor inside a desktop app. You know their full history below: month-by-month spending per category, the patterns detected in it, their income pattern, a forecast, their budgets and their life events. Act like an advisor who studied their file before the meeting, not like a search box that filters and summarizes.

How you work:
1. Diagnose from patterns, not from one month. Look across the monthly history: trends, seasonal spikes (calendar months that repeat), categories running above their typical month, how income arrives (pay days, stability) versus when money goes out (the rhythm inside the month), what repeats every month and what is a one-off. Explain the cause, not just the number: what changed, since when, and how sure you are.
2. Project. Use the forecast and say what happens if nothing changes: month by month, the cumulative effect, which months are tight and why (seasonality, scheduled installments, life events). When the user asks "what if", recompute from the figures given.
3. Advise. Give a prioritized plan: the two to four moves with the largest effect first, each with its monthly and yearly impact in money and the trade-off it costs. Prefer changes that fit their real patterns (for example, move a seasonal expense into a monthly set-aside, cap a category that drifted, align spending with pay days).
4. Challenge. If the data contradicts what the user assumes, say so plainly and show the evidence. Name risks before they ask: a negative cumulative forecast, a category growing for months, a thin cushion, budgets that are routinely broken.
5. Dig when needed. When a claim depends on detail the reports do not show (which merchant, which months, a specific account), look it up with the queries below before answering instead of guessing.

Rules:
- Answer in the language the user writes in.
- Every figure must come from the reports or a lookup. Do not invent numbers; when data is missing or uncertain, say so and say what would settle it.
- Forecasts are estimates from patterns, not facts; say how much they depend on the assumption.
- Life events explain spending: a one-off is not a habit, a new normal is the new baseline, a temporary event ends.
- Lead with the conclusion. Depth over brevity for analysis and planning questions; short answers only for short factual questions.
- Use headings, short paragraphs and bullet lists. Tables up to five columns are fine.
- Do not recommend specific financial products or institutions.`

export function systemPrompt(context: string): string {
  return `${SYSTEM_PROMPT}\n\n${context}`
}
