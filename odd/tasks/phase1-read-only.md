# Phase 1 — Read-only vertical slice

Objective: Tauri 2 + Vue 3 desktop UI over MoneyManager PC Manager, GET-only. Branch: `feat/phase1-read-only`.
Delivery: ask-on-risk. Test runner: `pnpm vitest run` (app/), `cargo test` (app/src-tauri).

## Specs

- S1: "usar este repo para complementar: https://github.com/shahlaukik/money-manager-mcp" — used as contract reference only (user chose "primera"), ported to typed Tauri commands; no Node sidecar.
- S2: "empecemos con la fase 1 solo lectura" — Fase 1 of `docs/moneymanager-tauri-vue-plan.md`: IP/port config, connection test, `getInitData`, period summary, movements table, network/server-off errors.
- S3: All app requests are `GET`; no code accepts an arbitrary HTTP method or URL path (endpoint allowlist in Rust).
- S4: Non-strict JS objects parsed as JSON5, XML parsed without executing content; no `eval`.
- S5: Month-split movement queries neither lose nor duplicate ids; future charges flagged explicitly.
- S6: Fixture client and live client implement the same `MoneyManagerClient` interface; UI works offline.
- S7: Invalid responses show an error and do not overwrite previous state.

## Tasks

- [x] T1 (S4,S5,S6) domain types, parsers, fixture client, month split — inline
- [x] T2 (S3) Rust GET-only command with endpoint allowlist + LAN URL validation — inline
- [x] T3 (S2,S6,S7) Vue UI: connection, summary, movements — inline

## Log

- L1 (2026-10-20): "vamos a usar este repo para complementar: https://github.com/shahlaukik/money-manager-mcp, recuerda el objetivo es otorgarle a moneyManager una interfaz bonita donde se pueda utilizar todas las herramientas que ofrece la ap en modo pc"
- L2: "primera, pero si empecemos con la fase 1 solo lectura"
- L3: Rust installed via rustup; git init. Linux Tauri system libs (webkit2gtk-4.1, gtk3, rsvg2) missing — need sudo by user.
- L4: T1+T3 done. `pnpm test` 12/12, `pnpm build` OK, UI checked in browser with demo data. RED not observed separately (tests written alongside code).
- L5: Demo mode ignores month changes for the summary (single fixture); expected.
- L6: libs installed by user; `cargo test` 4/4. Independent verifier: S3/S4/S7 PASS, no blockers. Advisories: overlapping loadPeriod race, port 80 rejected.
- L7 (2026-10-20): "to nice, sigamos con lo siguiente" → Fase 2 on branch `feat/phase2-dashboard`: Rust allowlist +4 read endpoints (dashboard, assets, cards, asset trend; `cargo test` 5/5), parsers + client methods (`pnpm test` 19/19), views Net worth, Accounts (tree + monthly trend + month transactions), Credit cards. Store now ignores stale overlapping loads (fixes L6 advisory). Checked in browser with demo data.
- L8 (2026-10-20): "necesito algun tipo de reespaldo, cuando conecte el celular y descarge la data para lectura que guarde un bkp o un archivo que en caso la cague pueda utilizar la carga masiva para reestablecer el estado inicial" → user chose B + A ("si"): on each phone connect, GET `/moneyBook/money.sqlite`, save only if header is `SQLite format 3\0`; always save raw snapshot (6 read endpoints) + manifest.json in `<app data>/backups/backup-<timestamp>/`. App never restores; user restores from the phone. `cargo test` 9/9 incl. mock-server e2e asserting only GET requests.
