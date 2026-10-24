//! Local accepted history only. Opening a connection per blocking command avoids
//! holding a runtime lock across awaits; SQLite serializes transactional writers.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::Manager;

type Result<T> = std::result::Result<T, String>;

fn err(e: impl ToString) -> String {
    e.to_string()
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Movement {
    pub id: String,
    pub date: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub amount: f64,
    pub asset_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subcategory_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub account_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subcategory_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Month {
    pub month: String,
    pub read_at: String,
    pub fingerprint: String,
    pub rows: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Counts {
    pub added: u32,
    pub modified: u32,
    pub deleted: u32,
}

#[derive(Debug, Deserialize)]
pub struct Batch {
    pub source: String,
    pub upserts: Vec<Movement>,
    pub deletes: Vec<String>,
    pub months: Vec<Month>,
    pub counts: Counts,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub movements: u32,
    pub months: Vec<Month>,
    pub last_sync: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Applied {
    pub applied: usize,
}

#[derive(Debug, Serialize)]
pub struct Log {
    pub at: String,
    pub source: String,
    pub added: u32,
    pub modified: u32,
    pub deleted: u32,
    pub months: Vec<String>,
}

/// Opens the local history file in WAL mode and migrates its schema.
pub fn open(dir: &Path) -> Result<Connection> {
    std::fs::create_dir_all(dir).map_err(err)?;
    let mut c = Connection::open(dir.join("money.db")).map_err(err)?;
    c.busy_timeout(std::time::Duration::from_secs(5)).map_err(err)?;
    c.pragma_update(None, "journal_mode", "WAL").map_err(err)?;
    migrate(&mut c)?;
    Ok(c)
}

/// Creates schema v1 for an empty database; rejects unknown schema versions.
pub fn migrate(c: &mut Connection) -> Result<()> {
    let tx = c.transaction().map_err(err)?;
    let version: i64 = tx
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(err)?;
    match version {
        0 => tx.execute_batch(
            r#"
            CREATE TABLE movements(
                scope TEXT NOT NULL,
                id TEXT NOT NULL CHECK(length(id)>0),
                month TEXT NOT NULL,
                date TEXT NOT NULL,
                type TEXT NOT NULL,
                amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer'),
                asset_id TEXT NOT NULL,
                to_asset_id TEXT,
                category_id TEXT,
                subcategory_id TEXT,
                content TEXT,
                detail TEXT,
                account_name TEXT NOT NULL,
                category_name TEXT,
                subcategory_name TEXT,
                PRIMARY KEY(scope,id)
            );
            CREATE INDEX movements_month ON movements(scope,month);
            CREATE TABLE months(
                scope TEXT NOT NULL,
                month TEXT NOT NULL CHECK(
                    month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
                    AND substr(month,6,2) BETWEEN '01' AND '12'
                ),
                read_at TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                rows INTEGER NOT NULL CHECK(rows>=0),
                PRIMARY KEY(scope,month)
            );
            CREATE TABLE sync_log(
                scope TEXT NOT NULL,
                at TEXT NOT NULL,
                source TEXT NOT NULL CHECK(source IN ('phone','backup')),
                added INTEGER NOT NULL,
                modified INTEGER NOT NULL,
                deleted INTEGER NOT NULL,
                months TEXT NOT NULL
            );
            PRAGMA user_version=1;
            "#,
        ).map_err(err)?,
        1 => (),
        _ => return Err(format!("Unsupported database schema version: {version}")),
    }
    tx.commit().map_err(err)
}

/// Reads one scope's movements in an inclusive date range, ordered by date and id.
pub fn movements(c: &Connection, scope: &str, from: &str, to: &str) -> Result<Vec<Movement>> {
    let mut stmt = c.prepare(
        r#"
        SELECT id,date,type,amount_cents,asset_id,to_asset_id,category_id,
               subcategory_id,content,detail,account_name,category_name,subcategory_name
        FROM movements
        WHERE scope=?1 AND date>=?2 AND date<=?3
        ORDER BY date,id
        "#,
    ).map_err(err)?;
    let rows = stmt.query_map(
        params![
            scope,
            from,
            to,
        ],
        |r| Ok(Movement {
            id: r.get(0)?,
            date: r.get(1)?,
            kind: r.get(2)?,
            amount: r.get::<_, i64>(3)? as f64 / 100.0,
            asset_id: r.get(4)?,
            to_asset_id: r.get(5)?,
            category_id: r.get(6)?,
            subcategory_id: r.get(7)?,
            content: r.get(8)?,
            detail: r.get(9)?,
            account_name: r.get(10)?,
            category_name: r.get(11)?,
            subcategory_name: r.get(12)?,
        }),
    ).map_err(err)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(err)
}

/// Reads consistent movement counts, accepted months and the last sync timestamp.
pub fn status(c: &Connection, scope: &str) -> Result<Status> {
    // One read transaction keeps counts, month metadata and lastSync consistent.
    let tx = c.unchecked_transaction().map_err(err)?;
    let movements = tx.query_row(
        "SELECT count(*) FROM movements WHERE scope=?1",
        [scope],
        |r| r.get(0),
    ).map_err(err)?;
    let months = {
        let mut stmt = tx.prepare(
            r#"
            SELECT month,read_at,fingerprint,rows
            FROM months WHERE scope=?1 ORDER BY month
            "#,
        ).map_err(err)?;
        stmt.query_map([scope], |r| Ok(Month {
            month: r.get(0)?,
            read_at: r.get(1)?,
            fingerprint: r.get(2)?,
            rows: r.get(3)?,
        }))
        .map_err(err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(err)?
    };
    let last_sync = log(&tx, scope, 1)?.first().map(|l| l.at.clone());
    tx.commit().map_err(err)?;
    Ok(Status {
        movements,
        months,
        last_sync,
    })
}

/// Returns accepted batches newest first, bounded by the requested limit.
pub fn log(c: &Connection, scope: &str, limit: u32) -> Result<Vec<Log>> {
    let mut stmt = c.prepare(
        r#"
        SELECT at,source,added,modified,deleted,months
        FROM sync_log WHERE scope=?1 ORDER BY rowid DESC LIMIT ?2
        "#,
    ).map_err(err)?;
    let rows = stmt.query_map(
        params![
            scope,
            limit,
        ],
        |r| {
            let json: String = r.get(5)?;
            let months = serde_json::from_str(&json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    5,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;
            Ok(Log {
                at: r.get(0)?,
                source: r.get(1)?,
                added: r.get(2)?,
                modified: r.get(3)?,
                deleted: r.get(4)?,
                months,
            })
        },
    ).map_err(err)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(err)
}

/// Commits accepted movements, month metadata and one log entry atomically.
pub fn apply(c: &mut Connection, scope: &str, batch: Batch) -> Result<Applied> {
    let tx = c.transaction().map_err(err)?;
    let mut applied = 0;
    for id in &batch.deletes {
        applied += tx.execute(
            "DELETE FROM movements WHERE scope=?1 AND id=?2",
            params![
                scope,
                id,
            ],
        ).map_err(err)?;
    }
    for m in &batch.upserts {
        let cents = (m.amount * 100.0).round();
        if !cents.is_finite() || cents < 0.0 || cents >= i64::MAX as f64 {
            return Err("Amount must be finite, nonnegative and fit in integer cents".into());
        }
        let date = chrono::NaiveDate::parse_from_str(&m.date, "%Y-%m-%d").map_err(err)?;
        if date.format("%Y-%m-%d").to_string() != m.date {
            return Err("Date must be YYYY-MM-DD".into());
        }
        tx.execute(
            r#"
            INSERT INTO movements VALUES (
                ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15
            )
            ON CONFLICT(scope,id) DO UPDATE SET
                month=excluded.month,
                date=excluded.date,
                type=excluded.type,
                amount_cents=excluded.amount_cents,
                asset_id=excluded.asset_id,
                to_asset_id=excluded.to_asset_id,
                category_id=excluded.category_id,
                subcategory_id=excluded.subcategory_id,
                content=excluded.content,
                detail=excluded.detail,
                account_name=excluded.account_name,
                category_name=excluded.category_name,
                subcategory_name=excluded.subcategory_name
            "#,
            params![
                scope,
                m.id,
                &m.date[..7],
                m.date,
                m.kind,
                cents as i64,
                m.asset_id,
                m.to_asset_id,
                m.category_id,
                m.subcategory_id,
                m.content,
                m.detail,
                m.account_name,
                m.category_name,
                m.subcategory_name,
            ],
        ).map_err(err)?;
        applied += 1;
    }
    for m in &batch.months {
        tx.execute(
            r#"
            INSERT INTO months VALUES (?1,?2,?3,?4,?5)
            ON CONFLICT(scope,month) DO UPDATE SET
                read_at=excluded.read_at,
                fingerprint=excluded.fingerprint,
                rows=excluded.rows
            "#,
            params![
                scope,
                m.month,
                m.read_at,
                m.fingerprint,
                m.rows,
            ],
        ).map_err(err)?;
    }
    let months = serde_json::to_string(
        &batch.months.iter().map(|m| &m.month).collect::<Vec<_>>(),
    ).map_err(err)?;
    tx.execute(
        "INSERT INTO sync_log VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![
            scope,
            chrono::Utc::now().to_rfc3339(),
            batch.source,
            batch.counts.added,
            batch.counts.modified,
            batch.counts.deleted,
            months,
        ],
    ).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(Applied {
        applied,
    })
}

async fn blocking<T: Send + 'static>(
    app: tauri::AppHandle,
    work: impl FnOnce(&mut Connection) -> Result<T> + Send + 'static,
) -> Result<T> {
    let dir = app.path().app_data_dir().map_err(|e| format!("No app data folder: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || work(&mut open(&dir)?))
        .await
        .map_err(err)?
}

/// Reads the local database status without blocking the async runtime.
#[tauri::command]
pub async fn db_status(app: tauri::AppHandle, scope: String) -> Result<Status> {
    blocking(app, move |c| status(c, &scope)).await
}

/// Reads the requested local date range without blocking the async runtime.
#[tauri::command]
pub async fn db_movements(
    app: tauri::AppHandle,
    scope: String,
    from: String,
    to: String,
) -> Result<Vec<Movement>> {
    blocking(app, move |c| movements(c, &scope, &from, &to)).await
}

/// Applies one accepted batch without blocking the async runtime.
#[tauri::command]
pub async fn db_apply(app: tauri::AppHandle, scope: String, batch: Batch) -> Result<Applied> {
    blocking(app, move |c| apply(c, &scope, batch)).await
}

/// Reads the local sync log without blocking the async runtime.
#[tauri::command]
pub async fn db_log(app: tauri::AppHandle, scope: String, limit: u32) -> Result<Vec<Log>> {
    blocking(app, move |c| log(c, &scope, limit)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn movement(id: &str, date: &str, amount: f64) -> Movement {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "date": date,
            "type": "expense",
            "amount": amount,
            "assetId": "cash",
            "accountName": "Cash",
        })).unwrap()
    }

    fn batch(items: Vec<Movement>) -> Batch {
        serde_json::from_value(serde_json::json!({
            "source": "backup",
            "upserts": items,
            "deletes": [],
            "months": [{
                "month": "2026-10",
                "readAt": "2026-10-23",
                "fingerprint": "abc",
                "rows": 3,
            }],
            "counts": {
                "added": 3,
                "modified": 0,
                "deleted": 0,
            },
        })).unwrap()
    }

    fn snapshot(c: &Connection, scope: &str) -> serde_json::Value {
        serde_json::json!([
            status(c, scope).unwrap(),
            movements(c, scope, "0000-01-01", "9999-12-31").unwrap(),
            log(c, scope, 100).unwrap(),
        ])
    }

    #[test]
    fn migration_reopen_and_wal() {
        let dir = std::env::temp_dir().join(format!(
            "money-db-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap(),
        ));
        std::fs::create_dir(&dir).unwrap();
        std::fs::File::create(dir.join("money.db")).unwrap();
        {
            let mut c = open(&dir).unwrap();
            assert_eq!(
                c.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0)).unwrap(),
                1,
            );
            assert_eq!(
                c.query_row("PRAGMA journal_mode", [], |r| r.get::<_, String>(0)).unwrap(),
                "wal",
            );
            apply(&mut c, "a", batch(vec![movement("1", "2026-10-01", 1.0)])).unwrap();
        }
        {
            let c = open(&dir).unwrap();
            assert_eq!(status(&c, "a").unwrap().movements, 1);
        }
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn operations_atomicity_scopes_ranges_and_cents() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        assert_eq!(status(&c, "a").unwrap().last_sync, None);
        let result = apply(
            &mut c,
            "a",
            batch(vec![
                movement("b", "2026-10-02", 0.1 + 0.2),
                movement("a", "2026-10-02", 1234.56),
                movement("c", "2026-10-03", 10500.0),
            ]),
        ).unwrap();
        assert_eq!(result.applied, 3);
        let rows = movements(&c, "a", "2026-10-02", "2026-10-03").unwrap();
        assert_eq!(
            rows.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
            vec!["a", "b", "c"],
        );
        assert_eq!(
            rows.iter().map(|m| m.amount).collect::<Vec<_>>(),
            vec![1234.56, 0.3, 10500.0],
        );
        assert_eq!(movements(&c, "a", "2026-10-03", "2026-10-03").unwrap().len(), 1);
        assert_eq!(status(&c, "a").unwrap().months.len(), 1);
        assert_eq!(
            status(&c, "a").unwrap().last_sync,
            Some(log(&c, "a", 1).unwrap()[0].at.clone()),
        );
        let before = snapshot(&c, "a");
        let mut bad = batch(vec![
            movement("ok", "2026-10-02", 5.0),
            movement("", "2026-10-02", 4.0),
        ]);
        bad.deletes = vec!["a".into()];
        assert!(apply(&mut c, "a", bad).is_err());
        assert_eq!(snapshot(&c, "a"), before);
        // Fail after movement writes and an accepted month update: both roll back.
        let mut bad_month = batch(vec![movement("late", "2026-10-02", 5.0)]);
        bad_month.months[0].fingerprint = "must roll back".into();
        bad_month.months.push(Month {
            month: "2026-13".into(),
            read_at: "today".into(),
            fingerprint: "bad".into(),
            rows: 0,
        });
        assert!(apply(&mut c, "a", bad_month).is_err());
        assert_eq!(snapshot(&c, "a"), before);
        let first = log(&c, "a", 1).unwrap();
        assert_eq!(first[0].source, "backup");
        assert_eq!((first[0].added, first[0].modified, first[0].deleted), (3, 0, 0));
        apply(&mut c, "other", batch(vec![movement("a", "2026-10-01", 99.0)])).unwrap();
        assert_eq!(snapshot(&c, "a"), before);
        let mut update = batch(vec![movement("a", "2026-10-02", 2.0)]);
        update.deletes = vec!["b".into()];
        update.counts = Counts {
            added: 0,
            modified: 1,
            deleted: 1,
        };
        update.months[0].fingerprint = "new".into();
        assert_eq!(apply(&mut c, "a", update).unwrap().applied, 2);
        let entries = log(&c, "a", 1).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!((entries[0].added, entries[0].modified, entries[0].deleted), (0, 1, 1));
        assert_eq!(entries[0].months, vec!["2026-10"]);
        assert_eq!(log(&c, "a", 100).unwrap().len(), 2);
        assert_eq!(log(&c, "a", 0).unwrap().len(), 0);
        assert_eq!(status(&c, "a").unwrap().movements, 2);
        assert_eq!(status(&c, "a").unwrap().months[0].fingerprint, "new");
        assert_eq!(movements(&c, "other", "2026-01-01", "2026-12-31").unwrap()[0].amount, 99.0);
        assert_eq!(status(&c, "absent").unwrap().movements, 0);
        assert!(log(&c, "absent", 10).unwrap().is_empty());
    }
}

#[cfg(test)]
mod verifier_probes {
    use super::*;
    fn batch() -> Batch {
        serde_json::from_value(serde_json::json!({
          "source":"phone", "upserts":[{"id":"x","date":"2026-10-01","type":"expense","amount":12.34,"assetId":"cash","accountName":"Cash"}],
          "deletes":[], "months":[], "counts":{"added":1,"modified":0,"deleted":0}
        })).unwrap()
    }
    #[test]
    fn rejected_batches_preserve_main_and_wal_bytes() {
        let dir = std::env::temp_dir().join(format!(
            "verifier-db-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap(),
        ));
        std::fs::create_dir(&dir).unwrap();
        let mut c = open(&dir).unwrap();
        apply(&mut c, "a", batch()).unwrap();
        let snapshot = || (std::fs::read(dir.join("money.db")).unwrap(), std::fs::read(dir.join("money.db-wal")).unwrap());
        let before = snapshot();
        for bad in ["source", "date", "amount", "month"] {
            let mut b = batch(); b.deletes.push("x".into()); b.upserts[0].id = "new".into();
            match bad {
              "source" => b.source = "invalid".into(),
              "date" => b.upserts[0].date = "2026-02-30".into(),
              "amount" => b.upserts[0].amount = -1.0,
              _ => b.months.push(Month {month:"2026-13".into(), read_at:"today".into(), fingerprint:"x".into(), rows:1}),
            }
            assert!(apply(&mut c,"a",b).is_err(), "{bad}");
            assert_eq!(snapshot(),before,"{bad}");
            assert_eq!(status(&c,"a").unwrap().movements,1);
            assert_eq!(status(&c,"other").unwrap().movements,0);
        }
        drop(c);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn newer_schema_is_not_downgraded() {
        let mut c = Connection::open_in_memory().unwrap();
        c.pragma_update(None,"user_version",2).unwrap();
        assert_eq!(migrate(&mut c).unwrap_err(),"Unsupported database schema version: 2");
        assert_eq!(c.pragma_query_value(None,"user_version",|r|r.get::<_,i64>(0)).unwrap(),2);
    }
}
