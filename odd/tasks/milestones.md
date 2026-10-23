# Milestones: affected and relieved categories, confirmed bad decisions and an impact timeline

Objective: phase 1 of the plan agreed on 2026-10-23 — a module to create and edit personal milestones (life events) with the categories they push up and the ones they relieve, confirm bad decisions, and a timeline of both with their money impact. Local data only. Work on `main` (user's standing preference). Phases 2 (local DB + git-like sync) and 3 (materialized metrics for the AI) are separate features. Tests: Vitest, `vue-tsc --noEmit`, i18n catalog guard. Never write to the phone.

## Specs

- S1. Model: "poder seleccionar las categorias que sufrieron o se veran afectadas y cuales aliviadas". A milestone keeps `categoryIds` as the affected categories (spending goes up) and adds `relieved` (spending goes down) and optional `expected` (expected monthly change per category id, a positive amount). At least one affected or relieved category. Saved milestones from before this change load unchanged (no relieved, no expected).
- S2. Editor: "un modulo de para crear y editar los hitos personales". A dedicated screen "Milestones" (Spanish "Hitos") in the main navigation lists every milestone and lets the user create, edit every field (note, kind, start, optional end, each category as affected / relieved / not involved, optional expected amount per involved category) and delete with confirmation. The Spending card links to it instead of having its own form.
- S3. Confirmed bad decisions: a flagged expense can be confirmed as a bad decision (in addition to dismiss or turn into a milestone). A confirmation stores a local snapshot (movement id, date, amount, category id and name, note) so it survives when that month is no longer loaded; it can be undone.
- S4. Timeline: "quiero algo como poder ver la timeline de hitos/malas decisiones confirmadas con el total de dinero asi ver como afectaron a mi economia". On the Milestones screen, newest first: each milestone (date range, kind, categories) with its estimated money impact, and each confirmed bad decision with its amount; totals: money lost to confirmed bad decisions, net estimated impact of milestones (cost minus relief), and both per year.
- S5. Milestone impact is an estimate and the screen says so: for each involved category, actual spending inside the milestone window (to today if open) minus its baseline — the category's median month in the 6 whole months before the start, prorated to the window length. Affected: positive delta is extra cost. Relieved: baseline minus actual is relief. Net = extra cost − relief. Categories without 3 months of history before the start report "not enough history" and are left out of the net.
- S6. Assistant: the milestone lines name relieved categories, and the context adds the confirmed bad decisions (amounts and categories; notes only when descriptions are shared) and each milestone's estimated impact.
- S7. Existing behavior holds: affected categories keep explaining spikes for the bad-decision classifier and the one-off baseline exclusion; relieved categories never explain a spike. A new-normal milestone restarts the forecast baseline of affected and relieved categories; a temporary milestone's in-window average applies to both.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1, S3 (domain/store), S5, S7 | worker | pending | |
| T2 | S2, S3 (UI), S4 | worker | pending | |
| T3 | S6 | inline | pending | |
| T4 | S1-S7 | inline | pending | build, install, launch |

## Log

- L1 (2026-10-23): "que opinas que tengamos una db local con toda la info, con un motor de sincronizacion y desde la app poder ver como si fuera git, cuantas transacciones enviamos y cuantas traemos e ir confirmando. la ia tendria acceso a metricas y estadisticas deterministas generadas por periodos y agrupadas. ademas quiero un modulo de para crear y editar los hitos personales poder seleccionar las categorias que sufrieron o se veran afectadas y cuales aliviadas, quiero algo como poder ver la timeline de hitos/malas decisiones confirmadas con el total de dinero asi ver como afectaron a mi economia"
- L2 (2026-10-23): Parent proposed three phases (1 milestones + timeline, 2 local DB + git-like sync, 3 materialized metrics) and recommended phase 1 first. User: "si hagemole". Model decision (parent, technical): keep `categoryIds` as affected for backward compatibility; add `relieved` and `expected`.

## Contract for T1

- `app/src/domain/life-events.ts`: `LifeEvent` gains `relieved?: string[]` and `expected?: Record<string, number>`; `validateLifeEvents` accepts both (relieved: non-empty string ids; expected: finite amounts > 0 keyed by an involved id), requires at least one affected or relieved id, and still loads old saved events; add `involves(e, m)` (date inside and the movement's category or subcategory is affected or relieved) next to `coversMovement` (affected only, unchanged); `describeEvents` adds "relieves X" when present.
- `app/src/domain/milestone-impact.ts`: `eventImpact(event, movements, today): { categories: { id: string; name: string; direction: 'affected' | 'relieved'; actual: number; baseline: number | null; delta: number | null }[]; extraCost: number; relief: number; net: number; windowDays: number; open: boolean }` per S5; `timeline(input: { events, confirmed, movements, today }): { items: (…event item… | …decision item…)[] newest first; totals: { lostToDecisions: number; milestoneNet: number; byYear: { year: string; lostToDecisions: number; milestoneNet: number }[] } }`.
- `app/src/stores/decisions.ts`: add confirmations: `confirm(snapshot)`, `unconfirm(id)`, `confirmed` list, persisted in the same key with validation (old saved state with only `dismissed` still loads). A confirmed flag no longer shows as a pending flag.
- `app/src/domain/forecast.ts`: S7 — use `involves` where the forecast applies new-normal and temporary milestones.
