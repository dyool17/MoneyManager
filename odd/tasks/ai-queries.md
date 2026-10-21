# AI chat data queries

Objective: let the chat assistant look up data beyond the summary through a fixed, read-only query menu. Branch `feat/ai-queries`. Delivery: single branch. Tests: Vitest, `cargo test`.

## Specs

- S1. "quiero que el agente de ai cuente con mas acceso a la data no solo al resumen generado. podemos usar el mcp o que el mismo agente consulte el celular (cuando sea necesario)"
- S2. Chosen design ("si, dale con el menú de consultas"): fixed read-only queries (movements by text/category/account/date, totals by category/month/account/weekday, one day's detail). The assistant asks with a query block; the app runs it on loaded history, fetches older months from the phone when needed, and returns the result before the final answer. Same for Claude, Codex and OpenCode Go. Never writes.
- S3. Descriptions (shop names, notes) and text search follow "Share transaction descriptions".
- S4. Bounded: at most 3 lookup rounds per question, at most 50 rows per result, at most 24 months back.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2-S4 | inline | done | 5c55212 |
| T2 | S1, S2 | inline | done | 5c55212 |

## Log

- L1 (2026-10-20): "quiero que el agente de ai cuente con mas acceso a la data no solo al resumen generado. podemos usar el mcp o que el mismo agente consulte el celular (cuando sea necesario)"
- L2: "si, dale con el menú de consultas". Route inline: one dependent unit, no writer trigger.
- L3: Live eval (minimax-m3.1-flash-free, backup data): Uber 2026 (4 trips, Q143.54), Transporte Jan-Jun 2025 (older months via lookup), day 2026-02-11 (5 items, Q13,736.11) all matched. Fixes: accept bare JSON / json fences; results carry totals so the model does not add by hand. Browser mock: Enter clears box, "Looking up" indicator, lookups listed under answer. 91 Vitest pass.
- Pending: phone-side `extend` (older months from the phone) not exercised live; Claude/Codex not run with lookups.
