# Local database with git-like sync

Objective: phase 2 of the plan agreed on 2026-10-23 — keep the whole history in a local database, and sync it with the phone through a reviewable "incoming / outgoing" view where the user confirms every change. The phone stays the source of truth. Work on `main` (user's standing preference). High risk (stored data): every unit is test-first, the closing check includes an independent verification. Tests: Vitest, `cargo test`, `vue-tsc --noEmit`, i18n catalog guard.

## Specs

- S1. "tengamos una db local con toda la info". A local SQLite database in the app data directory holds every movement of the current book with its phone id, plus per-month sync state (last read, content fingerprint). It survives restarts and works without the phone.
- S2. Bootstrap: the database can be filled from a `.mmbak` the user exports from the phone (whole history) or from the phone month by month. Before anything is written the user sees how many movements will be added per month and confirms.
- S3. "con un motor de sincronizacion y desde la app poder ver como si fuera git, cuantas transacciones enviamos y cuantas traemos e ir confirmando". Pull: the app reads months from the phone (the recent 3 months on every connection; any range on demand, e.g. a deep scan of all months) and compares them with the database by id. Incoming changes are grouped as new / modified (with the changed fields, old → new) / deleted on the phone, per month, with counts. Nothing is written to the database until the user accepts — all, per month or per movement; rejected or postponed changes stay listed until the next read.
- S4. Push: outgoing changes are the existing pending changes (outbox), shown in the same view with their count and sent only when the user confirms, exactly as today. After a confirmed send, the next read brings the phone's version back as incoming so the database never assumes a write succeeded.
- S5. Conflicts: a movement that changed on the phone and also has a pending outgoing change is shown as a conflict; the user chooses which side wins. Nothing is resolved automatically.
- S6. Source comparison is normalized so representation differences never look like changes: transfer amounts compared as absolute values (the phone sends transfer-outs negative, backups positive); the backup's transfer-in leg (type 4) is not a separate movement; the backup's soft-deleted rows (IS_DEL) are deletions; the phone appends the installment counter to notes ("Motorbike ((5/18))") while backups keep it in CARD_DIVIDE_MONTH_STR, so a trailing ((n/m)) is not part of the note. Measured on real data 2026-10-23: backup 2026-10-20 vs phone 2026-10-21, October: 83 shared ids, after normalization 6 real amount edits, 1 deletion, 19 new.
- S7. Once the database has data, reports and the advisor read their history from it (all months, not only what the phone session loaded); the current month still refreshes from the phone when connected.
- S8. The phone is never written by sync; only the existing confirmed outbox writes. Reading respects the phone's limits (one request at a time, whole months, the server stops when the phone locks): a read can be cancelled and resumed without losing what was already compared.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S3, S5, S6 | worker | done | 6b81f65 |
| T2 | S1, S2 | worker | done | 63fa2aa |
| T3 | S2, S3, S4, S8 | worker | done | 8945a57 |
| T4 | S3, S4, S5 | worker | done | 91129a4 |
| T5 | S7 | inline | pending | history and advisor read from the database |
| T6 | S1-S8 | inline + verify | pending | live read-only pull against the phone, independent verification, build, install, launch |

## Log

- L1 (2026-10-23): "que opinas que tengamos una db local con toda la info, con un motor de sincronizacion y desde la app poder ver como si fuera git, cuantas transacciones enviamos y cuantas traemos e ir confirmando. la ia tendria acceso a metricas y estadisticas deterministas generadas por periodos y agrupadas. ..." Phase order agreed: "si hagemole"; phase 1 (milestones) done and tested by the user: "probado. continua".
- L2 (2026-10-23): Premise check, read-only, no phone access: phone ids equal backup `INOUTCOME.uid` (83 of 101 October rows shared between the 2026-10-20 backup and the 2026-10-21 connection snapshot). Representation differences found: transfer-outs negative on the phone and positive in the backup; backups also hold a type-4 transfer-in leg per transfer (17 in October) that the phone does not list. After normalizing those, the remaining differences are real changes (6 amount edits, 1 deletion, 19 new). Backups carry `UTIME` (modification time, ms); the phone does not. PC Manager limits (docs/PC-MANAGER-LIMITS.md): no change feed, whole-month reads, one request at a time, server stops when the phone locks, writes return no id. Storage decision (parent, technical): SQLite through `rusqlite` (bundled) on the Rust side with thin Tauri commands; comparison logic stays in pure TypeScript domain code.
- L3 (2026-10-23): T1 done (worker, 12 tests) plus a parent fix. Real-data check (backup 2026-10-20 vs phone snapshot 2026-10-21, October) first gave 19 new / 9 modified / 1 deleted; 3 'modified' were false: the phone appends the installment counter to notes ("Furniture" -> "Furniture ((7/10))"). Normalization added test-first (RED, GREEN). Result now 19 new / 6 modified (1 date, 5 amounts) / 1 deleted, matching the manual count. Suite 214/214. Contract-silent choices by the worker: summaries sorted chronologically; several pending ops on one id give one conflict each.
- L4 (2026-10-23): T2 done (worker): app/src-tauri/src/db.rs with rusqlite 0.40.2 (bundled), schema v1, WAL, connection per command inside spawn_blocking with a 5 s busy timeout, all-or-nothing apply; app/src/infrastructure/local-db.ts wrappers. Parent review asked for a readability pass (16 lines over 160 chars, rustfmt not installed and not installed): hand-reformatted; SQL verified identical after whitespace normalization. cargo test 43 passed, vitest 217 passed, vue-tsc clean.
- L5 (2026-10-23): T3 done (worker, store + fingerprint, 12 store tests). Parent review: accept builds one batch, conflicts excluded from 'all', month metadata only for fully accepted months, generation token guards scope switches — accepted. Deviation fixed by the parent: the last known scope was memory-only, so after a restart a backup could not be previewed without the phone (contract: 'once a scope is known from a previous connection'); now persisted under mm.sync.scope.v1, test-first. Contract-silent choices: log shows the last 50 entries; a new preview source replaces the previous source's preview; partially accepted months keep no month metadata. Suite 231/231.
- L6 (2026-10-23): T4 done (worker): Sync screen with nav badges (incoming / outgoing), status, recent / range reads with cancel and progress, backup preview, incoming per month with field diffs, conflicts with phone-wins / keep-mine, outgoing through the existing PendingChanges component, git-log-like history, Help, Spanish catalog. Parent review: the database status and log only loaded after an acceptance, so opening the screen showed nothing stored; added `refresh()` to the store (test-first, incl. error path) and the screen calls it when the scope is known. Suite 236/236, vue-tsc clean, vite build ok (chunk-size warning only).
- L7 (2026-10-23): T5 done inline. history.fromSession reads older months from the database when it holds rows for the scope (dbStatus > 0) and only the current month onwards (incl. scheduled entries) from the phone; phone rows win over stored rows by id; empty or unreadable database (browser, tests) falls back to the previous whole-span phone read. New `fromCanonical` maps stored rows back to report movements. The advisor needs no change: its 24-month window is already loaded, so `extend` stops asking the phone for old months. One existing history test relied on the phone read starting synchronously; it now waits for the read to start (same assertion). Suite 240/240, vue-tsc clean. Known gap: after accepting changes the in-memory report history refreshes on the next load, not instantly.

## Contract for T1 (pure domain, `app/src/domain/sync.ts`)

```ts
/** A movement in the form both sources are compared in. */
export interface CanonicalMovement {
  id: string; date: string; type: MovementType; amount: number /* absolute, cents */
  assetId: string; toAssetId?: string; categoryId?: string; subcategoryId?: string
  content?: string; detail?: string
  /** Display only, never compared: names change when the user renames things. */
  accountName: string; categoryName?: string; subcategoryName?: string
}
export function canonical(m: Movement): CanonicalMovement | null
//  - amount = |amount| rounded to cents (transfer-outs come negative from the phone, positive from backups)
//  - backup transfer-in legs (type 'transfer-in', rawCode '4') → null: the phone lists each transfer once
//  - subcategoryId equal to categoryId, '' or 'null' → undefined (backups repeat the top-level id; the phone leaves it empty)
//  - content/detail trimmed, '' → undefined
//  - future-dated (scheduled) movements are kept; they are phone data too
export type ComparedField = 'date' | 'type' | 'amount' | 'assetId' | 'toAssetId' | 'categoryId' | 'subcategoryId' | 'content' | 'detail'
export interface FieldChange { field: ComparedField; from: string | number | undefined; to: string | number | undefined }
export interface IncomingChange {
  kind: 'new' | 'modified' | 'deleted'; id: string; month: string /* 'YYYY-MM' of the phone date, or the local date for deletions */
  local?: CanonicalMovement; remote?: CanonicalMovement; changes: FieldChange[] // empty for new/deleted
}
export function diffMonth(month: string, local: CanonicalMovement[], remote: CanonicalMovement[]): IncomingChange[]
//  - compares by id; a movement whose date moved to another month appears as 'modified' in the month that read it (remote side) and must not also be reported 'deleted' in its old month: diffMonth receives only that month's rows, so the engine (T3) passes local rows of the read month plus local rows with the same ids as remote rows
//  - stable order: new, modified, deleted; then date, id
export interface Conflict { change: IncomingChange; pending: { id: string; label: string } }
export function conflicts(changes: IncomingChange[], outbox: { id: string; label: string; op: WriteOp }[]): Conflict[]
//  - a change conflicts when a pending update/delete targets the same movement id (update-transaction/update-transfer `id`, delete-transactions `ids`)
export function summarize(changes: IncomingChange[]): { month: string; new: number; modified: number; deleted: number }[]
```

## Contract for T2 (Rust store + TypeScript wrapper)

- Dependency: `rusqlite` with the `bundled` feature (no system SQLite needed on Linux or Windows). File `<app data dir>/money.db`, WAL mode, `PRAGMA user_version` migrations (version 1 = this schema). Only this module opens the file.
- Schema v1 (all rows keyed by `scope` = phone origin + "|" + book id, so two phones or books never mix):
  - `movements(scope, id, month, date, type, amount_cents INTEGER, asset_id, to_asset_id, category_id, subcategory_id, content, detail, account_name, category_name, subcategory_name, PRIMARY KEY(scope, id))`, index on `(scope, month)`.
  - `months(scope, month, read_at, fingerprint, rows, PRIMARY KEY(scope, month))` — last accepted read of each month.
  - `sync_log(scope, at, source /* 'phone' | 'backup' */, added, modified, deleted, months TEXT /* JSON list */)` — one row per accepted batch: the "git log".
- Amounts cross the boundary as numbers in currency units (cents in storage, converted exactly: `round(amount * 100)`).
- Tauri commands (async, errors as strings):
  - `db_status(scope) -> { movements: number, months: { month, readAt, fingerprint, rows }[], lastSync: string | null }`
  - `db_movements(scope, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD') -> CanonicalMovement[]` (the T1 shape, ordered by date, id)
  - `db_apply(scope, batch: { source, upserts: CanonicalMovement[], deletes: string[], months: { month, readAt, fingerprint, rows }[], counts: { added, modified, deleted } }) -> { applied: number }` — ONE transaction: all or nothing; a failure leaves the file unchanged.
  - `db_log(scope, limit) -> { at, source, added, modified, deleted, months: string[] }[]` newest first.
- `app/src/infrastructure/local-db.ts`: typed wrappers over `invoke` with the same names in camelCase (`dbStatus`, `dbMovements`, `dbApply`, `dbLog`), plus a `scopeOf(origin, bookId)` helper. Outside Tauri (browser preview, tests) they reject with a clear error.

## Contract for T3 (sync engine store `app/src/stores/sync.ts`)

- Scope: `scopeOf(phone origin, session.bookId)` (origin as `useAccountMetadata().scope` computes it). Demo data never syncs: every action is disabled with a clear reason when `session.source !== 'phone'` (bootstrap from a backup file is allowed without a phone once a scope is known from a previous connection — if no scope is known, say so).
- `fingerprint(rows: CanonicalMovement[]): string` in app/src/domain/sync.ts: stable for the same set regardless of order (sort by id, hash the compared fields only, e.g. FNV-1a over a canonical JSON string).
- Reading (S3, S8): `read(months: string[])` reads whole months from the phone one at a time through the session client, in order, with `progress { done, total, current }`; `cancel()` stops after the month in flight; a phone error (offline, phone locked, timeout) stops the read with a message and keeps every month already compared. For each month: local rows = all local rows of that month plus local rows whose id appears in the remote month (dates can move between months; load the scope's local rows once per read with `dbMovements(scope, '0000-01-01', '9999-12-31')`). Results replace that month's pending changes in memory. `readRecent()` = current month and the 2 before; called automatically after a successful phone connection (reads only — nothing is applied).
- Pending (S3): `pending: Map<month, IncomingChange[]>` plus the remote rows and fingerprint per month, `summary` (T1 `summarize`), `conflicts` (T1 `conflicts` against the outbox items that are still pending or unconfirmed).
- Accepting (S3, S5): `accept(ids: string[] | 'all', month?: string)` builds ONE `dbApply` batch: upserts = remote rows of accepted new/modified changes, deletes = ids of accepted deleted changes, counts, and the `months` metadata (readAt, fingerprint, rows) only for months whose every pending change is accepted in this batch or that had none. Conflicting changes are excluded from 'all' and must be accepted by id, which means "the phone wins". `keepLocal(id)` drops a conflicting change from pending without writing (the outgoing change stays queued). After a successful apply the accepted changes leave pending and `status`/`log` refresh; on failure nothing leaves pending and the error is shown.
- Bootstrap (S2): `previewBackup(file)` reads a `.mmbak` with the existing `loadBackupHistory`, canonicalizes and diffs every month it contains against the database, and fills `pending` with source 'backup' (nothing written); the same `accept` writes it with `source: 'backup'`. Rows missing from a backup month that exist locally are deletions, because backups omit soft-deleted rows.
- Outgoing (S4): `outgoing` = outbox items count by status; sending stays `useOutbox().sendAll()` and is only triggered by the user.
- Never call a phone write. Never apply anything without an explicit `accept`.
