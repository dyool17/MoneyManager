# Open on stored data when the phone is not connected

Objective: when the app starts and a local database holds history for the last synced phone and book, open on that stored data instead of demo data. Work on `main`. Tests: Vitest, `vue-tsc --noEmit`, i18n catalog guard. Never write to the phone; never write the database from this feature.

## Specs

- S1. "datos guardados" (answer to: "si reinicias la app sin el teléfono, los reportes abren con datos demo aunque la DB tenga tu historia. ¿Prefieres que la app arranque con tus datos guardados cuando existan?"). At startup: if the remembered sync scope (`mm.sync.scope.v1`, format "origin|bookId") has movements in the local database, the session opens on source `stored`; otherwise on `demo` as today. The user can still connect the phone or open demo data from Settings.
- S2. Stored source behavior: movements for any period come from the database (`dbMovements`); the period summary (income, expense, net, totals by category) is computed from those movements, with budgets unknown (0); categories, subcategories and accounts for filters and names come from the stored movements; the book is the one in the scope. Balances, net worth, accounts and cards are not stored: the Money screen says they need the phone instead of showing demo numbers. All writes stay disabled (only `phone` writes), and Sync reads stay disabled with the existing reason.
- S3. The shell says where the data comes from: status "Stored data" with the last sync time (from the database status), different from "Demo data" and "Phone connected". Reports, Today, Spending, Analysis, Milestones and the advisor work on stored data.
- S4. Connecting the phone later replaces the stored source exactly as connecting replaces demo data today; failures keep the current data.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1-S4 | worker | pending | |
| T2 | S1-S4 | inline | pending | build, install, launch |

## Log

- L1 (2026-10-23): User, answering the parent's question: "3. datos guardados."
- L2 (2026-10-23): Design (parent, technical): session `Source` gains `'stored'`; a `StoredClient implements MoneyManagerClient` (app/src/domain/types.ts:143) in app/src/infrastructure/stored-client.ts reads the database through app/src/infrastructure/local-db.ts; pure builders for InitData and Summary from movements in app/src/domain/stored.ts; App.vue startup picks stored or demo; components that branch on `session.source === 'demo'` or `'phone'` get a correct `stored` branch (metadata scope must resolve to the scope's origin so budgets, life events, decisions and history use the phone's local data).
- L3 (2026-10-23): T1 done (worker): domain/stored.ts builders, StoredClient (read-only, no fabricated balances), session source 'stored' with commit-on-success, metadata scope resolves to the phone origin, App startup picks stored when the remembered scope has rows, shell shows 'Stored data' + last sync, Money screen explains balances need the phone. Spec-silent choices: book name falls back to its id, missing names use ids, cash/card split 0, database unavailable -> demo. Parent checked: no database or phone writes in the stored path; writes stay phone-only. Suite 266/266, vue-tsc clean.
