//! Opt-in test against a real phone.
//!
//! It never runs with `cargo test`: the test is `#[ignore]` and also requires
//! `MM_LIVE_PHONE=1` plus `MM_PHONE_URL`. It exercises the real pipeline the
//! app uses: take a backup, create one movement, read it back, delete it and
//! read it back again. The note marks the row so a leftover can be found.
//!
//! Run: `MM_LIVE_PHONE=1 MM_PHONE_URL=http://192.168.1.161:8080 \
//!       cargo test live_phone -- --ignored --nocapture`

use crate::backup;
use crate::pcmanager::{Endpoint, PcManager, ReadParams};
use crate::writes::{is_failure, TransactionFields, WriteOp};
use chrono::Datelike;
use std::path::PathBuf;

const NOTE: &str = "PRUEBA AUTOMATICA MM";

fn live_base() -> Option<String> {
    if std::env::var("MM_LIVE_PHONE").as_deref() != Ok("1") {
        return None;
    }
    std::env::var("MM_PHONE_URL").ok()
}

/// Extracts the first `mcid`/`mcname` pair of a category list in the init body.
fn category(body: &str, list: &str) -> Option<(String, String)> {
    let start = body.find(list)? + list.len();
    let rest = &body[start..];
    let id_at = rest.find("mcid:'")? + 6;
    let id_end = rest[id_at..].find('\'')? + id_at;
    let name_at = rest[id_at..].find("mcname:'")? + 6 + id_at;
    let name_end = rest[name_at..].find('\'')? + name_at;
    Some((rest[id_at..id_end].to_string(), rest[name_at..name_end].to_string()))
}

/// Extracts the first account id/name pair from `assetNames`.
fn account(body: &str) -> Option<(String, String)> {
    let start = body.find("assetNames:[")? + 11;
    let rest = &body[start..];
    let id_at = rest.find("assetId:'")? + 9;
    let id_end = rest[id_at..].find('\'')? + id_at;
    let name_at = rest[id_at..].find("assetName:'")? + 11 + id_at;
    let name_end = rest[name_at..].find('\'')? + name_at;
    Some((rest[id_at..id_end].to_string(), rest[name_at..name_end].to_string()))
}

/// Returns the ids of the movements whose note matches, from the movements XML.
fn movement_ids(xml: &str, note: &str) -> Vec<String> {
    let mut ids = Vec::new();
    for row in xml.split("<row>").skip(1) {
        if !row.contains(note) {
            continue;
        }
        if let Some(at) = row.find("<id>") {
            let rest = &row[at + 4..];
            if let Some(end) = rest.find("</id>") {
                ids.push(rest[..end].to_string());
            }
        }
    }
    ids
}

#[test]
#[ignore = "requires a real phone; set MM_LIVE_PHONE=1 and MM_PHONE_URL"]
fn live_phone_create_then_delete_one_movement() {
    let Some(base) = live_base() else {
        eprintln!("skipped: MM_LIVE_PHONE is not 1");
        return;
    };
    let pc = PcManager::new();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    // The phone's PC Manager hangs when endDate is exactly today, so the
    // period is the whole month, which is what the app queries.
    let now = chrono::Local::now().date_naive();
    let start = now.with_day(1).unwrap().format("%Y-%m-%d").to_string();
    let (mut year, mut month) = (now.year(), now.month());
    month += 1;
    if month > 12 {
        month = 1;
        year += 1;
    }
    let end = (chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let period = ReadParams {
        start_date: Some(start.clone()),
        end_date: Some(end.clone()),
        mbid: Some("1".into()),
        asset_id: Some(String::new()),
    };
    println!("period {start}..{end} (today {today})");

    // 1. Real backup, exactly like the app does before any change.
    let root = std::env::temp_dir().join(format!("mm-live-{}", std::process::id()));
    let report = tauri::async_runtime::block_on(backup::take(&pc, &root, &base, &period)).unwrap();
    println!("backup: {:?}", report.sqlite);
    assert!(report.snapshot_errors.is_empty(), "{:?}", report.snapshot_errors);
    pc.require_recent_backup(&base, crate::pcmanager::BACKUP_MAX_AGE)
        .expect("backup must unlock writes");

    // 2. Read the real account and category ids from the phone.
    let init = tauri::async_runtime::block_on(pc.read(&base, Endpoint::InitData, &ReadParams::default())).unwrap();
    let (account_id, account_name) = account(&init).expect("an account");
    let (category_id, category_name) = category(&init, "category_1:").expect("an expense category");
    println!("account {account_id} {account_name} | category {category_id} {category_name}");

    // 3. Create one movement through the same validated path the app uses.
    let fields = TransactionFields {
        date: today.clone(),
        asset_id: account_id,
        pay_type: account_name,
        category_id,
        category_name,
        subcategory_id: None,
        subcategory_name: None,
        amount: 0.01,
        kind: "expense".into(),
        note: Some(NOTE.into()),
        detail: Some("verificacion automatica".into()),
    };
    let req = WriteOp::CreateTransaction { fields }.request().unwrap();
    let body = tauri::async_runtime::block_on(pc.write(&base, &req)).unwrap();
    println!("create answer: {body}");
    assert!(is_failure(&body).is_none(), "create was rejected: {body}");

    // 4. The movement must be readable from the phone.
    let xml = tauri::async_runtime::block_on(pc.read(&base, Endpoint::MovementsByPeriod, &period)).unwrap();
    let ids = movement_ids(&xml, NOTE);
    assert_eq!(ids.len(), 1, "expected exactly one test movement, got {ids:?}");
    let created = ids[0].clone();

    // 5. Delete it through the same path.
    let req = WriteOp::DeleteTransactions { ids: vec![created.clone()] }.request().unwrap();
    let body = tauri::async_runtime::block_on(pc.write(&base, &req)).unwrap();
    println!("delete answer: {body}");
    assert!(is_failure(&body).is_none(), "delete was rejected: {body}");

    // 6. It must be gone.
    let xml = tauri::async_runtime::block_on(pc.read(&base, Endpoint::MovementsByPeriod, &period)).unwrap();
    let left = movement_ids(&xml, NOTE);
    assert!(left.is_empty(), "test movement still present: {left:?}");
    println!("live phone create+delete OK, movement {created} removed");

    let _ = std::fs::remove_dir_all(PathBuf::from(&root));
}
