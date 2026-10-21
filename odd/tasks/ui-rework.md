# UI rework

Objective: implement the approved rework prototype (https://claude.ai/artifact/WrZBpQhNAV6X5gfjkMmfSj): 4 screens, new visual system, AI in more places. Branch `feat/ui-rework`. Delivery: single branch, work-unit commits. Tests: Vitest, `pnpm build`.

## Specs

- S1. "no me gusta la UI, piensa en un rework completo. investiga o usa tools no se. pero mejora la integra la IA en más partes no solo el chat. propon ideas" → approved prototype ("ok implementalo").
- S2. Navigation: 4 screens Today, Money, Spending, Analysis; Settings (connection, account metadata, AI settings, backup, pending changes) and Help secondary. Ask bar with Ctrl+K on every screen (jump to a screen or ask).
- S3. Visual system as in the prototype: light ground #F3F4F6, white cards, ink #111318, indigo accent #3F51D9, orange #C2410C for negatives, Inter + Space Grotesk tabular figures, bundled locally (CSP blocks Google Fonts). Dark theme derived from the same tokens.
- S4. Today: AI brief (3 lines, suggested questions, open in chat), safe to spend per day, month-end projection, KPI row (spent vs income, 12-month savings rate, health score, already scheduled), month pace chart (this month vs typical, projection), Needs attention list with "Why?".
- S5. Money: net worth hero + history, unified sortable accounts table (bank, cards, loans) with share bars, account detail panel.
- S6. Spending: filter pills (range, category, account, type), categories with budget marks, movements table (sortable, add/edit/delete via existing confirmation flow).
- S7. Analysis: health score breakdown, monthly AI report, income vs spending chart, risks, opportunities, patterns (existing Insights reports), goal planner.
- S8. AI everywhere: contextual Ask side panel that knows the current view, "Explain" on charts, "Why?" on alerts, AI brief, monthly report, category suggestion when adding a movement, goal plan, "which charges can I cancel". AI only proposes and explains; figures come from deterministic reports; phone changes always confirmed. Without AI configured, AI controls are hidden and the app works.
- S9. Help and README describe the new layout.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2, S3, S8 (Ask panel) | inline | done | fe441b9 |
| T2 | S4 | inline | done | c510cb3 |
| T3 | S5 | delegated (parallel with T4, T5) | done | bcc47f4 (+ card-sign fix in the next commit) |
| T4 | S6 | delegated (parallel) | done | 9923990 |
| T5 | S7 | delegated (parallel) | done | 5d4a1bc |
| T6 | S8 | inline | done | 459c97b |
| T7 | S2 (Settings), S9 | inline | done | 5db7b84 |

Route evidence: T3-T5 are independent screens with disjoint new files, each several hundred lines → Writer trigger (a), Sonnet medium per the user's cost constraint ("si metes opus a todo me quemas la cuenta").

## Log

- L1 (2026-10-21): "no me gusta la UI, piensa en un rework completo. investiga o usa tools no se. pero mejora la integra la IA en más partes no solo el chat. propon ideas"
- L2: prototype approved: "ok implementalo".
- L3: T1 shell, T2 Today inline; T3-T5 by three parallel Sonnet writers (disjoint surfaces), each passed vue-tsc + tests; parent visual check in light/dark with a mocked assistant. Fixes: cards always count as debt on Money (demo reports card debt positive; the metadata totals still add a positive card as an asset — pre-existing, left for a phone check), filter pill borders, empty-month report headline.
- L4: Risk items: 5 (new dependency: @fontsource-variable/inter and space-grotesk, bundled locally because the CSP blocks Google Fonts). Independent verifier launched at feature end.
- Pending: live phone check of card sign and history extension; AI features only exercised with a mocked provider in the browser.
- L5: Independent verifier (Sonnet, medium): S2-S9 met, no blockers, no baseline feature lost; vue-tsc, 127 tests and build pass. Advisory fixed in 2b65fb2 ("See transactions" opens Spending filtered to that account). Advisory kept: the Today brief asks the assistant once per app start or context change without a click.
