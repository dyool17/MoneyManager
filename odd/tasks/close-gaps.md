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
- S7: "agrega el pendiente de revision de metadata de cuentas, en la app movil se pude marcar una cuenta como que contabiliza o no el total, de caso estar marcadas como que no suma no se toma en cuenta al calcular en valor neto. empecemos por esto luego continua"
- S8 (S7 example): "neto actual 44513.75, cuenta 'CxC'  no suma, por tener en false el switch de 'include in totals' tiene 550. la app esta en 192.168.1.161:8080"
- S9: "podriamos solicitar el mmbak cada vez que se cambio agrego algo respecto a las cuentas, asi mapeamos esa metadata y aplicamos eso a la data recibida, o podiramos agregar una configuracion por cuenta y ahi uno manualmente cambiar si una cuenta se considera para totales o no y que tipo de moneda. me sigues?"
- S10: "ambas" — accepts both native-backup metadata import and manual per-account configuration, as offered in the preceding conversation.
- Not in scope (assumption, told to user): removing the LAN-only restriction.

## Tasks

- [x] T1 (S1) install script + docs + installed AppImage — inline
- [x] T2 (S2) budgets view — inline
- [x] T3 (S3) book selector — inline
- [x] T4 (S4) local export (CSV with BOM, formula-safe, saved to Downloads) — inline
- [x] T7 (S7-S10) metadata model, local overrides and current-total calculation — inline; RED missing module, GREEN 5 focused / 31 suite tests; commit pending
- [ ] T8 (S9,S10) read-only native SQLite metadata import — in progress; inline; Risk: item 5 (SQLite WASM dependency), independent verifier at unit end; commit pending
- [ ] T9 (S7-S10) metadata persistence and account configuration UI, current net-worth integration and docs — pending; inline; commit pending
- [ ] T5 (S5) writes — pending after T7; pre-existing uncommitted implementation, high risk (item 1) → independent verifier
- [ ] T6 (S6) restore — blocked on explicit user decision authorizing destructive restoration

## Log

- L1 (2026-10-20): "listo, quiero que avancemos a resolver lo que no hace aun, punto a punto. y dejes instrucciones para instalacion y  dejes instalada la version beta."
- L2: Beta 0.1.0-beta.1 built (AppImage 83 MiB, deb 3.4 MiB) and installed to ~/.local/opt/money-manager; smoke launch stayed up 15 s.
- L3: T2 budgets (pace marker, over/ahead states), T3 book selector (period queries only; dashboard/assets/cards are not per book on the server), T4 CSV export. pnpm test 26/26, cargo test 10/10.
- L4: "agrega el pendiente de revision de metadata de cuentas, en la app movil se pude marcar una cuenta como que contabiliza o no el total, de caso estar marcadas como que no suma no se toma en cuenta al calcular en valor neto. empecemos por esto luego continua"
- L5: Reconciled branch feat/close-gaps at 2bb0135. Preserve pre-existing uncommitted T5 changes. T7 takes priority over T5; T6 still requires a separate destructive-restore decision. Current net worth comes directly from getDashBoardData.assetSummary.totalAsset; no local sum of account balances. Existing assets fixtures and observed form contracts do not identify an inclusion flag; do not invent a wire field or subtract balances twice.
- L6: Read-only explorer failed before returning evidence and was not retried. T7 needs current phone PC Manager URL and identification of an account already excluded from mobile totals, or sanitized getAssetData/getDashBoardData responses with the expected mobile net worth. No behavior changed and no tests run; implementation is blocked on missing contract evidence.
- L7: "neto actual 44513.75, cuenta 'CxC'  no suma, por tener en false el switch de 'include in totals' tiene 550. la app esta en 192.168.1.161:8080"
- L8: Authorized live GET reads succeeded: getDashBoardData.assetSummary = totalAsset 65901.4796, asset 70547.27960000001, debt -4645.8. Difference from reported mobile net worth: 21387.7296, not 550. getAssetData exposes CxC balance 550 but no inclusion field; getInitData exposes names/identifiers only for that account. GET money.sqlite returned HTTP 200 with zero bytes, so no SQLite metadata could be read. No POSTs, phone changes, or private payload fixtures saved.
- L9: Public official v330 asset.js exposes no include-in-totals control in account add/edit forms. assetDashBoard.js renders assetSummary directly; no account-filtering logic there. Sources: https://realbyteapps.net/dev_pcmanager/v330/js/asset.js and https://realbyteapps.net/dev_pcmanager/v330/js/assetDashBoard.js. These observations do not prove that no undocumented endpoint exists. Need a native mobile-exported backup made available explicitly for inspection, or a product decision for desktop-only exclusions; never hardcode CxC or subtract 550 from the remote net worth. T5 remains ordered after T7.
- L10: Only tracking documentation changed for this investigation. No meaningful RED/GREEN applies without an observed metadata contract; no application tests run or behavior claimed fixed.
- L11: User: "listo". Found user-provided MMGP(10-20-26-130528).mmbak at repository root. Header confirms SQLite, not ZIP (2719744 bytes). Inspected exclusively using an in-memory SQLite deserialize with PRAGMA query_only=ON; source file not modified. ASSETS contains uid, NIC_NAME, ZDATA, ZDATA1, ZDATA2, currencyUid and groupUid. CxC has ZDATA='0', ZDATA2='1', currencyUid='GTQ_GTQ'. ZDATA2 is a candidate exclusion indicator, not yet a confirmed general contract. Currency table has GTQ=1, USD=7.78, CLP=0.0083737. Do not commit the private backup or its contents.
- L12: Live read-only reconciliation failed with ECONNREFUSED at 192.168.1.161:8080; not retried. Offline exploratory transaction aggregates did not reproduce expected net worth and are not verification evidence. INOUTCOME.ZDATE is an epoch-millisecond string, not an ISO date; initial exploratory textual cutoffs were inapplicable. No field semantics or net-worth fix claimed. Need PC Manager running to reconcile live endpoint balances with native metadata before implementing; application tests not run.
- L13: User: "listo, prueba". Fresh authorized GET-only requests all returned HTTP 200. Matched live account IDs to in-memory backup ASSETS rows and currency rates. ZDATA2='0' account balances total 48857.55 unconverted, 49153.4292 after conversion. Sum live getAssetData group balances also equals 49153.4292: those groups already respect exclusions and currency conversion while child balances do not. CxC child balance 550, group Otros balance zero.
- L14: Included card child.notPayMoney sum is -4639.679999999988; net 49153.4292 - 4639.68 = 44513.7492, rounded 44513.75, exactly matching S8. Card group.notPayMoney is zero, so group card totals are not usable for this calculation. Dashboard still reports 65901.4796. Excluded card currently has zero outstanding; no evidence yet for handling a nonzero excluded-card debt from HTTP alone.
- L15: Investigation outcome verified by live reads, but application behavior is not changed and T7 is not complete. Correct per-account/card filtering and currency need metadata not exposed on the HTTP records. Recommend an optional native-backup metadata import (read only) rather than guessed flags or hardcoded account names. This adds a user-visible data source and needs user choice before implementation. Existing T5 changes preserved; no application tests run; only tracking doc changed.
- L16: "podriamos solicitar el mmbak cada vez que se cambio agrego algo respecto a las cuentas, asi mapeamos esa metadata y aplicamos eso a la data recibida, o podiramos agregar una configuracion por cuenta y ahi uno manualmente cambiar si una cuenta se considera para totales o no y que tipo de moneda. me sigues?"
- L17: "ambas". Accepted: import metadata as base, manual local overrides take priority and survive subsequent imports; new accounts remain pending configuration. No phone settings changed. Implementation decisions: metadata scoped to phone URL (not period book, since account endpoints are global), explicit base currency and positive exchange rate for manual settings; file selected by user and parsed in memory, only normalized metadata persisted, private .mmbak ignored by Git. Unknown accounts block corrected totals rather than silently assume inclusion/currency. Historical server charts remain labelled as server history; no historical recalculation from present metadata. Runtime metadata changes on the phone are not reliably detectable through HTTP; surface a refresh reminder and unknown/renamed accounts. Add T8/T9 after T7, then return to T5; T6 still needs separate authorization.
- L18: T7 implemented as pure metadata domain with validation, immutable imports, preserved/resettable overrides, missing-account handling and current currency-converted totals. Focused RED observed (module absent); corrected a synthetic fixture arithmetic typo during GREEN; final focused 5/5 and full frontend 31/31 passed. Private backup patterns now ignored. No phone changes. Risk: none for domain-only unit (no existing parser/helper changed).
