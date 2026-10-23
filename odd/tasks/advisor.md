# Financial advisor, not a summarizing chatbot

Objective: give the assistant the history, detected patterns and multi-month projections it needs to advise, and make it reason like a personal financial advisor. Work on `main` (user's standing preference for this personal app: "directo a main … seamos agiles … podemos deshacer"). Tests: Vitest, `vue-tsc --noEmit`. Never write to the phone.

## Specs

- S1. History: "no recibe ni utiliza el contexto historico". The assistant's context covers up to 24 months of history (everything loaded, capped at 24), not the 12-month aggregate it gets today; before answering, the chat loads up to 24 months from the phone when they are missing (reads only). Reports on screens keep their current spans.
- S2. Patterns: "quiero que detecte patrones de gastos". Deterministic, tested detection over that history, per category (subcategory when present) and for income:
  - a category × month spending table (every month in range, zero when nothing was spent);
  - typical month (median of months, life-event one-off spending excluded), trend (change per month over the last 12 months), volatility, and seasonality: calendar months that repeat as spikes (spend ≥ 1.6 × the category's typical month in that calendar month in at least one year, and a spike in the same calendar month of each year with data);
  - income pattern: typical monthly income, stability, regular sources (same label/category and similar amount in ≥ 3 months) with their usual day of month;
  - rhythm inside the month: average share of the month's spending done by day 10 and by day 20.
- S3. Projection: "que proyecte basandose en ellos y en la info". Forecast the next 6 whole months (and the rest of the current month) per category and in total: typical month, adjusted by the category's seasonality for that calendar month, its trend when clear, entries already scheduled on the phone for that month (counted once, never on top of the same recurring charge), active temporary life events and new-normal baselines, and imported budgets as a reference. Each forecast line states its basis. Includes projected income, net per month and the cumulative net over the horizon.
- S4. Advisor: "quiero un asesor financiero no un chatbot que filtre y summarice cosas." The system prompt makes the assistant a personal financial advisor: diagnose with evidence from the patterns, project, name risks and trade-offs, and give a prioritized plan with quantified monthly/yearly impact; challenge the user's assumptions when the data disagrees; use lookups proactively when a claim needs detail; no artificial brevity for analysis questions (the Today brief stays three sentences). The context also includes imported budgets with their monthly/annual mode and judged state, and the flagged possible bad decisions (descriptions only when "Share transaction descriptions" is on).
- S5. Privacy unchanged: only totals, categories and dates are sent unless the user shares descriptions; life-event labels stay behind the same toggle.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2 | worker | done | (this commit) |
| T2 | S3 | worker | done | (this commit) |
| T3 | S1, S4, S5 | inline | done | (this commit) |
| T4 | S1-S5 | inline | pending | real-backup context probe, build, install, launch |

## Log

- L1 (2026-10-23): "la IA no es lo que espero, es superficial. boba. no recibe ni utiliza el contexto historico, quiero que detecte patrones de gastos, que proyecte basandose en ellos y en la info, quiero un asesor financiero no un chatbot que filtre y summarice cosas."
- L2 (2026-10-23): Verified against the user's real backup (several thousand movements over about three years, incl. scheduled): today's context is ~6,060 chars / 109 lines of 12-month aggregates; per category only a yearly total and a 3-vs-3-month change, so no seasonality or trend is detectable; imported budgets, bad-decision flags, income pattern and multi-month projections are absent; SYSTEM_PROMPT asks to "Be concrete and brief … one to three actions". Design decided by the parent (technical, no product fork): pattern engine + forecast as pure domain modules, richer context, advisor prompt.
- L3 (2026-10-23): T1-T2 done by worker (patterns.ts, forecast.ts, 10 tests, suite 183/183). Worker assumptions: similar income = within 10% of median; clear trend = R² ≥ 0.6; rhythm interpolates between day-10/20 anchors; new-normal baseline averages covered months; income = max(typical, actual + scheduled). BudgetPlan is accepted by forecast() but not used: budgets are a reference, joined by category key in the context (T3), never a spending target. Real-backup probe: 24 months, 23 categories; two regular salary sources on fixed pay days; seasonality e.g. Comidas fuera 01,12, Regalos 04,07,10,12; Transporte recent 7.5x typical; rhythm 55% by day 10; the current month and the 6-month cumulative net are negative.
- L4 (2026-10-23): T3 done. ai-context.ts: advisorSections (category x month table, patterns, income pattern with source labels only when descriptions are shared, rhythm, 7-month forecast with basis and cumulative net, imported budgets with mode/state, flagged possible bad decisions with notes only when shared); SYSTEM_PROMPT rewritten as a personal financial advisor (diagnose patterns, project, prioritized plan with monthly/yearly impact, challenge assumptions, proactive lookups, depth over brevity). chat.ts: 24-month window (advisorStart), loads older months from the phone once via history.extend (reads only), passes the imported plan and modes. Tests: 4 new context tests + advisor window test; suite 187/187, vue-tsc clean. Real-backup probe: context 21.4k chars / 231 lines, 24 months, 20 budgets, 4 flags this month, no descriptions leaked. Watch item: one category forecasts a large February amount as seasonal (spiked in Feb two years running) - the line states its basis so the advisor can question it.

## Contract for T1-T2 (pure domain, no Vue, no stores)

`app/src/domain/patterns.ts`:
```ts
export interface CategoryPattern {
  key: string            // subcategoryId ?? categoryId ?? name; stable id used by budgets and life events
  name: string           // subcategory name, else category name
  group: string          // top-level category name ('' when none)
  monthly: number[]      // aligned with Patterns.months; 0 for months without spending
  total: number
  typical: number        // median month, one-off life-event spending excluded
  trend: number | null   // change per month over the last 12 months (least squares), null with < 6 months
  volatility: number | null // coefficient of variation of the months, null when typical is 0
  seasonal: string[]     // calendar months 'MM' that repeat as spikes (S2 rule)
  recentVsTypical: number | null // last 3 whole months average / typical
}
export interface IncomeSource { label: string; typical: number; months: number; day: number }
export interface IncomePattern { monthly: number[]; typical: number; volatility: number | null; sources: IncomeSource[] }
export interface Patterns {
  months: string[]       // every 'YYYY-MM' from first to the last whole month
  categories: CategoryPattern[] // expenses only, sorted by total desc
  income: IncomePattern
  rhythm: { byDay10: number | null; byDay20: number | null } // average share of a month's spending done by those days
}
export function detectPatterns(movements: Movement[], first: string, last: string, events?: LifeEvent[]): Patterns
```
`app/src/domain/forecast.ts`:
```ts
export type ForecastBasis = 'typical' | 'seasonal' | 'trend' | 'scheduled' | 'event' | 'new-normal'
export interface ForecastLine { key: string; name: string; amount: number; basis: ForecastBasis[] }
export interface ForecastMonth { month: string; expense: number; income: number; net: number; lines: ForecastLine[] }
export interface Forecast { months: ForecastMonth[]; cumulativeNet: number }
export function forecast(input: { patterns: Patterns; movements: Movement[]; today: string; horizon?: number /* default 6 */; events?: LifeEvent[]; plan?: BudgetPlan | null }): Forecast
```
`months[0]` is the current month: actual spending so far plus the forecast for the remaining days (use the month's rhythm share); then `horizon` whole months. Use existing helpers (`countable`, `monthRange`, `recurringCharges`, `futureCommitments`, life-events `coversMovement`) instead of re-implementing them. Transfers and future-dated entries are never history; future-dated entries are the "scheduled" input of their month.
