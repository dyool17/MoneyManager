# Local database with git-like sync

Objective: phase 2 of the plan agreed on 2026-10-23 — keep the whole history in a local database, and sync it with the phone through a reviewable "incoming / outgoing" view where the user confirms every change. The phone stays the source of truth. Work on `main` (user's standing preference). High risk (stored data): every unit is test-first, the closing check includes an independent verification. Tests: Vitest, `cargo test`, `vue-tsc --noEmit`, i18n catalog guard.

## Specs

- S1. "tengamos una db local con toda la info". A local SQLite database in the app data directory holds every movement of the current book with its phone id, plus per-month sync state (last read, content fingerprint). It survives restarts and works without the phone.
- S2. Bootstrap: the database can be filled from a `.mmbak` the user exports from the phone (whole history) or from the phone month by month. Before anything is written the user sees how many movements will be added per month and confirms.
- S3. "con un motor de sincronizacion y desde la app poder ver como si fuera git, cuantas transacciones enviamos y cuantas traemos e ir confirmando". Pull: the app reads months from the phone (the recent 3 months on every connection; any range on demand, e.g. a deep scan of all months) and compares them with the database by id. Incoming changes are grouped as new / modified (with the changed fields, old → new) / deleted on the phone, per month, with counts. Nothing is written to the database until the user accepts — all, per month or per movement; rejected or postponed changes stay listed until the next read.
- S4. Push: outgoing changes are the existing pending changes (outbox), shown in the same view with their count and sent only when the user confirms, exactly as today. After a confirmed send, the next read brings the phone's version back as incoming so the database never assumes a write succeeded.
- S5. Conflicts: a movement that changed on the phone and also has a pending outgoing change is shown as a conflict; the user chooses which side wins. Nothing is resolved automatically.
- S6. Source comparison is normalized so representation differences never look like changes: transfer amounts compared as absolute values (the phone sends transfer-outs negative, backups positive); the backup's transfer-in leg (type 4) is not a separate movement; the backup's soft-deleted rows (IS_DEL) are deletions. Measured on real data 2026-10-23: backup 2026-10-20 vs phone 2026-10-21, October: 83 shared ids, after normalization 6 real amount edits, 1 deletion, 19 new.
- S7. Once the database has data, reports and the advisor read their history from it (all months, not only what the phone session loaded); the current month still refreshes from the phone when connected.
- S8. The phone is never written by sync; only the existing confirmed outbox writes. Reading respects the phone's limits (one request at a time, whole months, the server stops when the phone locks): a read can be cancelled and resumed without losing what was already compared.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S3, S5, S6 | worker | pending | domain: canonical movement + month diff + conflicts |
| T2 | S1, S2 | worker | pending | Rust SQLite store + Tauri commands |
| T3 | S2, S3, S4, S8 | worker | pending | sync engine store (read, compare, hold, apply, resume) + bootstrap |
| T4 | S3, S4, S5 | worker | pending | Sync screen (incoming / outgoing / conflicts) |
| T5 | S7 | inline | pending | history and advisor read from the database |
| T6 | S1-S8 | inline + verify | pending | live read-only pull against the phone, independent verification, build, install, launch |

## Log

- L1 (2026-10-23): "que opinas que tengamos una db local con toda la info, con un motor de sincronizacion y desde la app poder ver como si fuera git, cuantas transacciones enviamos y cuantas traemos e ir confirmando. la ia tendria acceso a metricas y estadisticas deterministas generadas por periodos y agrupadas. ..." Phase order agreed: "si hagemole"; phase 1 (milestones) done and tested by the user: "probado. continua".
- L2 (2026-10-23): Premise check, read-only, no phone access: phone ids equal backup `INOUTCOME.uid` (83 of 101 October rows shared between the 2026-10-20 backup and the 2026-10-21 connection snapshot). Representation differences found: transfer-outs negative on the phone and positive in the backup; backups also hold a type-4 transfer-in leg per transfer (17 in October) that the phone does not list. After normalizing those, the remaining differences are real changes (6 amount edits, 1 deletion, 19 new). Backups carry `UTIME` (modification time, ms); the phone does not. PC Manager limits (docs/PC-MANAGER-LIMITS.md): no change feed, whole-month reads, one request at a time, server stops when the phone locks, writes return no id. Storage decision (parent, technical): SQLite through `rusqlite` (bundled) on the Rust side with thin Tauri commands; comparison logic stays in pure TypeScript domain code.
