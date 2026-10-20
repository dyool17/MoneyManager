//! Local backups taken right after connecting to the phone.
//!
//! Each backup is a new timestamped folder holding:
//! - `money.sqlite`: the app's own full backup, restorable from the phone,
//!   kept only when it really is a SQLite file;
//! - `snapshot/`: the raw read responses, as a readable fallback record;
//! - `manifest.json`: what was saved and why anything is missing.
//!
//! Nothing here sends data to the phone, and files are written only inside
//! the folder this module creates.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::pcmanager::{Endpoint, PcManager, ReadParams};

const SQLITE_MAGIC: &[u8] = b"SQLite format 3\0";

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case", tag = "status")]
pub enum SqliteOutcome {
    Saved { bytes: usize },
    Empty,
    NotSqlite { bytes: usize },
    Failed { reason: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotFile {
    pub name: String,
    pub bytes: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupReport {
    pub folder: String,
    pub created_at: String,
    pub source: String,
    pub sqlite: SqliteOutcome,
    pub snapshot: Vec<SnapshotFile>,
    pub snapshot_errors: Vec<String>,
}

pub fn classify_sqlite(bytes: &[u8]) -> SqliteOutcome {
    if bytes.is_empty() {
        SqliteOutcome::Empty
    } else if bytes.starts_with(SQLITE_MAGIC) {
        SqliteOutcome::Saved { bytes: bytes.len() }
    } else {
        SqliteOutcome::NotSqlite { bytes: bytes.len() }
    }
}

/// Creates a fresh folder; never reuses or overwrites an existing one.
fn new_folder(root: &Path, stamp: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(root).map_err(|e| format!("Cannot create backup folder: {e}"))?;
    for n in 0..100 {
        let name = if n == 0 { format!("backup-{stamp}") } else { format!("backup-{stamp}-{n}") };
        let dir = root.join(name);
        match fs::create_dir(&dir) {
            Ok(()) => return Ok(dir),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Cannot create backup folder: {e}")),
        }
    }
    Err("Too many backups with the same timestamp".into())
}

fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::write(path, bytes).map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

pub async fn take(
    pc: &PcManager,
    root: &Path,
    base_url: &str,
    period: &ReadParams,
) -> Result<BackupReport, String> {
    let now = chrono::Local::now();
    let dir = new_folder(root, &now.format("%Y%m%d-%H%M%S").to_string())?;

    let sqlite = match pc.read_bytes(base_url, Endpoint::SqliteBackup).await {
        Ok(bytes) => {
            let outcome = classify_sqlite(&bytes);
            if matches!(outcome, SqliteOutcome::Saved { .. }) {
                write(&dir.join("money.sqlite"), &bytes)?;
            }
            outcome
        }
        Err(reason) => SqliteOutcome::Failed { reason },
    };

    let snap_dir = dir.join("snapshot");
    fs::create_dir(&snap_dir).map_err(|e| format!("Cannot create snapshot folder: {e}"))?;
    let none = ReadParams::default();
    let reads: [(Endpoint, &ReadParams, &str); 6] = [
        (Endpoint::InitData, &none, "init-data.json5"),
        (Endpoint::Dashboard, &none, "dashboard.json5"),
        (Endpoint::Assets, &none, "assets.json5"),
        (Endpoint::Cards, &none, "cards.json5"),
        (Endpoint::SummaryByPeriod, period, "summary.json5"),
        (Endpoint::MovementsByPeriod, period, "movements.xml"),
    ];
    let mut snapshot = Vec::new();
    let mut snapshot_errors = Vec::new();
    for (endpoint, params, name) in reads {
        match pc.read(base_url, endpoint, params).await {
            Ok(text) => {
                write(&snap_dir.join(name), text.as_bytes())?;
                snapshot.push(SnapshotFile { name: name.to_string(), bytes: text.len() });
            }
            Err(e) => snapshot_errors.push(format!("{name}: {e}")),
        }
    }

    let report = BackupReport {
        folder: dir.display().to_string(),
        created_at: now.to_rfc3339(),
        source: base_url.to_string(),
        sqlite,
        snapshot,
        snapshot_errors,
    };
    let manifest = serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?;
    write(&dir.join("manifest.json"), &manifest)?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_backup_bodies() {
        assert_eq!(classify_sqlite(b""), SqliteOutcome::Empty);
        assert_eq!(classify_sqlite(b"<html>no</html>"), SqliteOutcome::NotSqlite { bytes: 15 });
        let mut db = SQLITE_MAGIC.to_vec();
        db.extend_from_slice(&[0; 84]);
        assert_eq!(classify_sqlite(&db), SqliteOutcome::Saved { bytes: 100 });
    }

    /// Minimal PC Manager stand-in: answers each GET by path, records request lines.
    fn mock_server(sqlite: Vec<u8>) -> (String, std::sync::Arc<std::sync::Mutex<Vec<String>>>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let log = seen.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap();
                let head = String::from_utf8_lossy(&buf[..n]).lines().next().unwrap_or("").to_string();
                log.lock().unwrap().push(head.clone());
                let body: Vec<u8> = if head.contains("/money.sqlite") {
                    sqlite.clone()
                } else if head.contains("getDataByPeriod") {
                    b"<dataset></dataset>".to_vec()
                } else if head.contains("getAssetData") || head.contains("getCardData") {
                    b"[]".to_vec()
                } else {
                    b"{ ok: 1 }".to_vec()
                };
                let mut res = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).into_bytes();
                res.extend(body);
                stream.write_all(&res).unwrap();
            }
        });
        (base, seen)
    }

    fn period() -> ReadParams {
        ReadParams {
            start_date: Some("2026-08-01".into()),
            end_date: Some("2026-08-31".into()),
            mbid: Some("1".into()),
            asset_id: None,
        }
    }

    #[test]
    fn saves_sqlite_snapshot_and_manifest_using_only_get() {
        let mut db = SQLITE_MAGIC.to_vec();
        db.extend_from_slice(b"payload");
        let (base, seen) = mock_server(db.clone());
        let root = std::env::temp_dir().join(format!("mm-backup-e2e-{}", std::process::id()));
        let report = tauri::async_runtime::block_on(take(&PcManager::new(), &root, &base, &period())).unwrap();

        let dir = PathBuf::from(&report.folder);
        assert_eq!(report.sqlite, SqliteOutcome::Saved { bytes: db.len() });
        assert_eq!(fs::read(dir.join("money.sqlite")).unwrap(), db);
        assert_eq!(report.snapshot.len(), 6);
        assert!(report.snapshot_errors.is_empty());
        assert!(dir.join("snapshot/movements.xml").exists());
        assert!(dir.join("manifest.json").exists());
        let requests = seen.lock().unwrap().clone();
        assert_eq!(requests.len(), 7);
        assert!(requests.iter().all(|r| r.starts_with("GET /moneyBook/")), "{requests:?}");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn empty_sqlite_is_reported_and_not_saved() {
        let (base, _) = mock_server(Vec::new());
        let root = std::env::temp_dir().join(format!("mm-backup-empty-{}", std::process::id()));
        let report = tauri::async_runtime::block_on(take(&PcManager::new(), &root, &base, &period())).unwrap();
        assert_eq!(report.sqlite, SqliteOutcome::Empty);
        assert!(!PathBuf::from(&report.folder).join("money.sqlite").exists());
        assert_eq!(report.snapshot.len(), 6);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn never_reuses_a_folder() {
        let root = std::env::temp_dir().join(format!("mm-backup-test-{}", std::process::id()));
        let a = new_folder(&root, "20260101-000000").unwrap();
        let b = new_folder(&root, "20260101-000000").unwrap();
        assert_ne!(a, b);
        assert!(b.ends_with("backup-20260101-000000-1"));
        fs::remove_dir_all(&root).unwrap();
    }
}
