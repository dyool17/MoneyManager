# Close "does not do yet" gaps

Objective: resolve the app's missing capabilities point by point, plus install docs and an installed beta. Branch: `feat/close-gaps` (from `feat/phase2-dashboard`).
Delivery: ask-on-risk. Runners: `pnpm test` (app/), `cargo test` (app/src-tauri).

## Specs

- S1: "dejes instrucciones para instalacion y dejes instalada la version beta" — docs/INSTALL.md, scripts/install-beta.sh, beta installed for the user.
- S2: Budgets view (from summary budgets).
- S3: Book selector (multiBooks / mbid).
- S4: Local export of the loaded period (generated on the desktop, no phone POST).
- S5: Writes — create/edit/delete transactions, transfers, accounts, cards — with confirmation before each change and a mandatory backup first. Contracts from money-manager-mcp.
- S6: Restore backup on phone — destructive; decision pending with user.
- Not in scope (assumption, told to user): removing the LAN-only restriction.

## Tasks

- [x] T1 (S1) install script + docs + installed AppImage — inline
- [x] T2 (S2) budgets view — inline
- [x] T3 (S3) book selector — inline
- [x] T4 (S4) local export (CSV with BOM, formula-safe, saved to Downloads) — inline
- [ ] T5 (S5) writes — inline, high risk (item 1) → independent verifier
- [ ] T6 (S6) restore — pending decision

## Log

- L1 (2026-10-20): "listo, quiero que avancemos a resolver lo que no hace aun, punto a punto. y dejes instrucciones para instalacion y  dejes instalada la version beta."
- L2: Beta 0.1.0-beta.1 built (AppImage 83 MiB, deb 3.4 MiB) and installed to ~/.local/opt/money-manager; smoke launch stayed up 15 s.
- L3: T2 budgets (pace marker, over/ahead states), T3 book selector (period queries only; dashboard/assets/cards are not per book on the server), T4 CSV export. pnpm test 26/26, cargo test 10/10.
