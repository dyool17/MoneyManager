//! Typed write operations against MoneyManager PC Manager.
//!
//! Each operation is a closed enum variant with validated fields; there is no
//! generic POST. Contracts follow money-manager-mcp (form-urlencoded POST under
//! `/moneyBook`). Writes are sent once and never retried, because a timed-out
//! write may already have been applied on the phone.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionFields {
    pub date: String,
    pub asset_id: String,
    /// Payment-type name from init data (the server expects the name).
    pub pay_type: String,
    pub category_id: String,
    pub category_name: String,
    pub subcategory_id: Option<String>,
    pub subcategory_name: Option<String>,
    pub amount: f64,
    /// "income" or "expense".
    pub kind: String,
    pub note: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferFields {
    pub date: String,
    pub from_asset_id: String,
    pub from_asset_name: String,
    pub to_asset_id: String,
    pub to_asset_name: String,
    pub amount: f64,
    pub note: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetFields {
    pub group_id: String,
    pub group_name: String,
    pub name: String,
    pub balance: f64,
    pub link_asset_id: Option<String>,
    pub link_asset_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardFields {
    pub name: String,
    pub link_asset_id: String,
    pub link_asset_name: String,
    /// The server hangs if either day is missing and resets omitted days on
    /// update, so both are always required and always sent.
    pub closing_day: u8,
    pub payment_day: u8,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "op", rename_all = "kebab-case", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum WriteOp {
    CreateTransaction { fields: TransactionFields },
    UpdateTransaction { id: String, fields: TransactionFields },
    DeleteTransactions { ids: Vec<String> },
    CreateTransfer { fields: TransferFields },
    /// `id` is the Transfer-Out row id. The server replaces the transfer with a new id.
    UpdateTransfer { id: String, fields: TransferFields },
    CreateAsset { fields: AssetFields },
    UpdateAsset { asset_id: String, fields: AssetFields },
    /// Removes an account or a card.
    DeleteAsset { asset_id: String },
    CreateCard {
        fields: CardFields,
        #[serde(rename = "outstanding")]
        not_pay_money: f64,
    },
    UpdateCard { asset_id: String, fields: CardFields },
}

pub struct Request {
    pub path: &'static str,
    pub form: Vec<(&'static str, String)>,
}

/// Accepts only well-formed, real calendar dates in `YYYY-MM-DD`.
fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10
        || b[4] != b'-'
        || b[7] != b'-'
        || !b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let year: i32 = s[0..4].parse().unwrap_or(0);
    let month: u32 = s[5..7].parse().unwrap_or(0);
    let day: u32 = s[8..10].parse().unwrap_or(0);
    if !(1..=12).contains(&month) || day == 0 {
        return false;
    }
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    day <= days
}

fn id(name: &str, v: &str) -> Result<String, String> {
    let ok = !v.is_empty()
        && v.len() <= 64
        && v.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_');
    if ok { Ok(v.to_string()) } else { Err(format!("Invalid {name}")) }
}

fn text(name: &str, v: &str, required: bool) -> Result<String, String> {
    let t = v.trim();
    if required && t.is_empty() {
        return Err(format!("{name} is required"));
    }
    if t.chars().count() > 500 || t.chars().any(|c| c.is_control() && c != '\n') {
        return Err(format!("{name} has invalid characters or is too long"));
    }
    Ok(t.to_string())
}

fn opt(name: &str, v: &Option<String>) -> Result<String, String> {
    text(name, v.as_deref().unwrap_or(""), false)
}

fn money(name: &str, v: f64, positive: bool) -> Result<String, String> {
    if !v.is_finite() || v.abs() > 1e12 {
        return Err(format!("{name} is not a valid amount"));
    }
    if positive && v <= 0.0 {
        return Err(format!("{name} must be greater than 0"));
    }
    // Round to cents; the server takes plain decimals without separators.
    Ok(format!("{:.2}", (v * 100.0).round() / 100.0))
}

fn day(name: &str, v: u8) -> Result<String, String> {
    if (1..=31).contains(&v) { Ok(v.to_string()) } else { Err(format!("{name} must be between 1 and 31")) }
}

fn date(v: &str) -> Result<String, String> {
    if is_date(v) { Ok(v.to_string()) } else { Err("Date must use YYYY-MM-DD".into()) }
}

fn transaction_form(f: &TransactionFields) -> Result<Vec<(&'static str, String)>, String> {
    let (code, label) = match f.kind.as_str() {
        "income" => ("0", "Income"),
        "expense" => ("1", "Expense"),
        _ => return Err("Type must be income or expense".into()),
    };
    let sub_id = match f.subcategory_id.as_deref() {
        Some(s) if !s.is_empty() => id("subcategory", s)?,
        _ => String::new(),
    };
    Ok(vec![
        ("mbDate", date(&f.date)?),
        ("assetId", id("account", &f.asset_id)?),
        ("payType", text("Account name", &f.pay_type, true)?),
        ("mcid", id("category", &f.category_id)?),
        ("mbCategory", text("Category name", &f.category_name, true)?),
        ("mcscid", sub_id),
        ("subCategory", opt("Subcategory name", &f.subcategory_name)?),
        ("mbCash", money("Amount", f.amount, true)?),
        ("inOutCode", code.to_string()),
        ("inOutType", label.to_string()),
        ("mbContent", opt("Note", &f.note)?),
        ("mbDetailContent", opt("Detail", &f.detail)?),
    ])
}

fn transfer_form(f: &TransferFields) -> Result<Vec<(&'static str, String)>, String> {
    if f.from_asset_id == f.to_asset_id {
        return Err("Choose two different accounts".into());
    }
    Ok(vec![
        ("moveDate", date(&f.date)?),
        ("fromAssetId", id("source account", &f.from_asset_id)?),
        ("fromAssetName", text("Source account", &f.from_asset_name, true)?),
        ("toAssetId", id("destination account", &f.to_asset_id)?),
        ("toAssetName", text("Destination account", &f.to_asset_name, true)?),
        ("moveMoney", money("Amount", f.amount, true)?),
        ("moneyContent", opt("Note", &f.note)?),
        ("mbDetailContent", opt("Detail", &f.detail)?),
    ])
}

fn asset_form(f: &AssetFields) -> Result<Vec<(&'static str, String)>, String> {
    let link_id = match f.link_asset_id.as_deref() {
        Some(s) if !s.is_empty() => id("linked account", s)?,
        _ => String::new(),
    };
    Ok(vec![
        ("assetGroupId", id("group", &f.group_id)?),
        ("assetGroupName", text("Group", &f.group_name, true)?),
        ("assetName", text("Account name", &f.name, true)?),
        ("assetMoney", money("Balance", f.balance, false)?),
        ("linkAssetId", link_id),
        ("linkAssetName", opt("Linked account", &f.link_asset_name)?),
    ])
}

fn card_form(f: &CardFields) -> Result<Vec<(&'static str, String)>, String> {
    Ok(vec![
        ("cardName", text("Card name", &f.name, true)?),
        ("linkAssetId", id("payment account", &f.link_asset_id)?),
        ("linkAssetName", text("Payment account", &f.link_asset_name, true)?),
        ("jungsanDay", day("Statement day", f.closing_day)?),
        ("paymentDay", day("Payment day", f.payment_day)?),
    ])
}

impl WriteOp {
    /// Validates the operation and builds its form body.
    pub fn request(&self) -> Result<Request, String> {
        let (path, form) = match self {
            WriteOp::CreateTransaction { fields } => ("create", transaction_form(fields)?),
            WriteOp::UpdateTransaction { id: tid, fields } => {
                let mut form = vec![("id", id("transaction", tid)?)];
                form.extend(transaction_form(fields)?);
                ("update", form)
            }
            WriteOp::DeleteTransactions { ids } => {
                if ids.is_empty() || ids.len() > 500 {
                    return Err("Select between 1 and 500 transactions".into());
                }
                let joined = ids.iter().map(|v| id("transaction", v)).collect::<Result<Vec<_>, _>>()?;
                ("delete", vec![("ids", format!(":{}", joined.join(":")))])
            }
            WriteOp::CreateTransfer { fields } => ("moveAsset", transfer_form(fields)?),
            WriteOp::UpdateTransfer { id: tid, fields } => {
                let mut form = vec![("id", id("transfer", tid)?)];
                form.extend(transfer_form(fields)?);
                ("modifyMoveAsset", form)
            }
            WriteOp::CreateAsset { fields } => ("assetAdd", asset_form(fields)?),
            WriteOp::UpdateAsset { asset_id, fields } => {
                let mut form = vec![("assetId", id("account", asset_id)?)];
                form.extend(asset_form(fields)?);
                ("assetModify", form)
            }
            WriteOp::DeleteAsset { asset_id } => ("removeAsset", vec![("assetId", id("account", asset_id)?)]),
            WriteOp::CreateCard { fields, not_pay_money } => {
                let mut form = card_form(fields)?;
                form.push(("notPayMoney", money("Amount to pay", *not_pay_money, false)?));
                ("addAssetCard", form)
            }
            WriteOp::UpdateCard { asset_id, fields } => {
                let mut form = vec![("assetId", id("card", asset_id)?)];
                form.extend(card_form(fields)?);
                ("modifyCard", form)
            }
        };
        Ok(Request { path, form })
    }
}

/// Success unless the body explicitly says `success: false` or `result: 'fail'`.
pub fn is_failure(body: &str) -> Option<String> {
    let compact: String = body.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_lowercase();
    let failed = compact.contains("success:false")
        || compact.contains("\"success\":false")
        || compact.contains("result:'fail'")
        || compact.contains("result:\"fail\"")
        || compact.contains("\"result\":\"fail\"");
    failed.then(|| {
        let snippet: String = body.chars().take(200).collect();
        format!("The phone rejected the change: {snippet}")
    })
}

/// A body that is not a recognised answer is reported as unconfirmed, never as applied.
///
/// The server answers with a JavaScript object. Plain text (for example `ERROR`)
/// carries no confirmation, so the user must check the phone before retrying.
pub fn is_unconfirmed(body: &str) -> Option<String> {
    let trimmed = body.trim();
    if trimmed.is_empty() || trimmed.starts_with('{') || trimmed.starts_with('[') {
        return None;
    }
    let snippet: String = trimmed.chars().take(200).collect();
    Some(format!("The phone did not confirm the change (answered: {snippet}). Check the phone before trying again."))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tx() -> TransactionFields {
        TransactionFields {
            date: "2026-08-02".into(),
            asset_id: "credit".into(),
            pay_type: "Credit Card".into(),
            category_id: "expense-variable".into(),
            category_name: "Variable".into(),
            subcategory_id: Some("food".into()),
            subcategory_name: Some("Food".into()),
            amount: 120.5,
            kind: "expense".into(),
            note: Some("Groceries".into()),
            detail: None,
        }
    }

    fn get<'a>(r: &'a Request, key: &str) -> &'a str {
        &r.form.iter().find(|(k, _)| *k == key).unwrap().1
    }

    #[test]
    fn builds_transaction_create_form() {
        let r = WriteOp::CreateTransaction { fields: tx() }.request().unwrap();
        assert_eq!(r.path, "create");
        assert_eq!(get(&r, "mbCash"), "120.50");
        assert_eq!(get(&r, "inOutCode"), "1");
        assert_eq!(get(&r, "inOutType"), "Expense");
        assert_eq!(get(&r, "mbDetailContent"), "");
        assert_eq!(r.form.len(), 12);
    }

    #[test]
    fn update_sends_id_and_every_field() {
        let r = WriteOp::UpdateTransaction { id: "abc".into(), fields: tx() }.request().unwrap();
        assert_eq!((r.path, get(&r, "id")), ("update", "abc"));
        assert_eq!(r.form.len(), 13);
    }

    #[test]
    fn rejects_invalid_transactions() {
        let mut f = tx();
        f.amount = 0.0;
        assert!(WriteOp::CreateTransaction { fields: f }.request().is_err());
        let mut f = tx();
        f.kind = "transfer".into();
        assert!(WriteOp::CreateTransaction { fields: f }.request().is_err());
        let mut f = tx();
        f.date = "02/08/2026".into();
        assert!(WriteOp::CreateTransaction { fields: f }.request().is_err());
        let mut f = tx();
        f.asset_id = "a&b=1".into();
        assert!(WriteOp::CreateTransaction { fields: f }.request().is_err());
        let mut f = tx();
        f.amount = f64::NAN;
        assert!(WriteOp::CreateTransaction { fields: f }.request().is_err());
    }

    #[test]
    fn joins_delete_ids() {
        let r = WriteOp::DeleteTransactions { ids: vec!["a".into(), "b".into()] }.request().unwrap();
        assert_eq!((r.path, get(&r, "ids")), ("delete", ":a:b"));
        assert!(WriteOp::DeleteTransactions { ids: vec![] }.request().is_err());
        assert!(WriteOp::DeleteTransactions { ids: vec!["a:b".into()] }.request().is_err());
    }

    #[test]
    fn transfer_needs_two_accounts() {
        let f = TransferFields {
            date: "2026-08-03".into(),
            from_asset_id: "checking".into(),
            from_asset_name: "Checking".into(),
            to_asset_id: "checking".into(),
            to_asset_name: "Checking".into(),
            amount: 10.0,
            note: None,
            detail: None,
        };
        assert!(WriteOp::CreateTransfer { fields: f.clone() }.request().is_err());
        let ok = TransferFields { to_asset_id: "cash".into(), to_asset_name: "Cash".into(), ..f };
        let r = WriteOp::UpdateTransfer { id: "t1".into(), fields: ok }.request().unwrap();
        assert_eq!((r.path, get(&r, "id"), get(&r, "moveMoney")), ("modifyMoveAsset", "t1", "10.00"));
    }

    #[test]
    fn card_always_sends_both_days() {
        let fields = CardFields {
            name: "Visa".into(),
            link_asset_id: "checking".into(),
            link_asset_name: "Checking".into(),
            closing_day: 1,
            payment_day: 15,
        };
        let r = WriteOp::UpdateCard { asset_id: "credit".into(), fields: fields.clone() }.request().unwrap();
        assert_eq!((get(&r, "jungsanDay"), get(&r, "paymentDay")), ("1", "15"));
        let bad = CardFields { payment_day: 0, ..fields };
        assert!(WriteOp::CreateCard { fields: bad, not_pay_money: 0.0 }.request().is_err());
    }

    #[test]
    fn rejects_unknown_ops_and_fields() {
        assert!(serde_json::from_str::<WriteOp>(r#"{"op":"upload-sql-file"}"#).is_err());
        assert!(serde_json::from_str::<WriteOp>(r#"{"op":"delete-asset","assetId":"a","path":"x"}"#).is_err());
        let op: WriteOp = serde_json::from_str(r#"{"op":"delete-asset","assetId":"cash"}"#).unwrap();
        assert_eq!(op.request().unwrap().path, "removeAsset");
    }

    #[test]
    fn detects_failure_bodies() {
        assert!(is_failure("").is_none());
        assert!(is_failure("{ success: true }").is_none());
        assert!(is_failure("{ success: false, message: 'x' }").is_some());
        assert!(is_failure("{result:'fail'}").is_some());
        assert!(is_failure("{\"success\": false}").is_some());
    }
}

#[cfg(test)]
mod e2e {
    use super::*;
    use crate::pcmanager::PcManager;
    use std::io::{Read, Write};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    /// Answers every request with `reply`, recording the raw requests.
    fn server(reply: &'static str) -> (String, Arc<Mutex<Vec<String>>>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                stream.set_read_timeout(Some(Duration::from_millis(300))).unwrap();
                let mut raw = Vec::new();
                let mut buf = [0u8; 4096];
                while let Ok(n) = stream.read(&mut buf) {
                    if n == 0 { break; }
                    raw.extend_from_slice(&buf[..n]);
                    let text = String::from_utf8_lossy(&raw);
                    if let Some(head_end) = text.find("\r\n\r\n") {
                        let len = text[..head_end]
                            .lines()
                            .find_map(|l| l.to_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(0)))
                            .unwrap_or(0);
                        if raw.len() >= head_end + 4 + len { break; }
                    }
                }
                log.lock().unwrap().push(String::from_utf8_lossy(&raw).to_string());
                let res = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}", reply.len());
                stream.write_all(res.as_bytes()).unwrap();
            }
        });
        (base, seen)
    }

    fn op() -> WriteOp {
        WriteOp::DeleteTransactions { ids: vec!["a1".into(), "b2".into()] }
    }

    #[test]
    fn refuses_writes_without_a_recent_backup() {
        let (base, seen) = server("{success:true}");
        let pc = PcManager::new();
        assert!(pc.require_recent_backup(&base, Duration::from_secs(60)).is_err());
        pc.record_backup(&base);
        assert!(pc.require_recent_backup(&base, Duration::from_secs(60)).is_ok());
        assert!(pc.require_recent_backup(&base, Duration::ZERO).is_err());
        assert!(seen.lock().unwrap().is_empty());
    }

    #[test]
    fn posts_form_once_and_reports_rejection_without_retry() {
        let (base, seen) = server("{ success: false, message: 'locked' }");
        let pc = PcManager::new();
        let req = op().request().unwrap();
        let err = tauri::async_runtime::block_on(pc.write(&base, &req)).unwrap_err();
        assert!(err.message.contains("rejected"), "{err}");
        let requests = seen.lock().unwrap().clone();
        assert_eq!(requests.len(), 1, "writes must never be retried");
        assert!(requests[0].starts_with("POST /moneyBook/delete "));
        assert!(requests[0].to_lowercase().contains("content-type: application/x-www-form-urlencoded"));
        assert!(requests[0].ends_with("ids=%3Aa1%3Ab2"), "{}", requests[0]);
    }

    #[test]
    fn empty_body_counts_as_applied() {
        let (base, _) = server("");
        let pc = PcManager::new();
        assert!(tauri::async_runtime::block_on(pc.write(&base, &op().request().unwrap())).is_ok());
    }

    #[test]
    fn server_errors_are_reported_once_without_retry() {
        let (base, seen) = server("ERROR");
        let pc = PcManager::new();
        let err = tauri::async_runtime::block_on(pc.write(&base, &op().request().unwrap())).unwrap_err();
        assert!(err.message.contains("did not confirm"), "{err}");
        assert_eq!(seen.lock().unwrap().len(), 1, "writes must never be retried");
    }

    #[test]
    fn structured_answers_count_as_applied() {
        let (base, _) = server("{ success: true }");
        let pc = PcManager::new();
        assert!(tauri::async_runtime::block_on(pc.write(&base, &op().request().unwrap())).is_ok());
    }

    #[test]
    fn error_kinds_separate_never_sent_from_unknown_outcome() {
        use crate::WriteErrorKind;
        let pc = PcManager::new();

        // Nothing listening: the request never left, so it can be sent later.
        let dead = "http://127.0.0.1:1";
        let err = tauri::async_runtime::block_on(pc.write(dead, &op().request().unwrap())).unwrap_err();
        assert_eq!(err.kind, WriteErrorKind::Offline, "{}", err.message);

        // A body the app cannot recognise may or may not have been applied.
        let (base, _) = server("ERROR");
        let err = tauri::async_runtime::block_on(pc.write(&base, &op().request().unwrap())).unwrap_err();
        assert_eq!(err.kind, WriteErrorKind::Unconfirmed, "{}", err.message);

        // An explicit refusal is a refusal, not an unknown outcome.
        let (base, _) = server("{ success: false }");
        let err = tauri::async_runtime::block_on(pc.write(&base, &op().request().unwrap())).unwrap_err();
        assert_eq!(err.kind, WriteErrorKind::Rejected, "{}", err.message);
    }

    #[test]
    fn backup_gate_is_scoped_to_the_same_phone_and_port() {
        let (base, _) = server("{success:true}");
        let pc = PcManager::new();
        pc.record_backup(&base);
        let other_port = base.replace("127.0.0.1", "127.0.0.1:1");
        assert!(pc.require_recent_backup(&base, Duration::from_secs(60)).is_ok());
        assert!(pc.require_recent_backup(&other_port, Duration::from_secs(60)).is_err());
    }
}

#[cfg(test)]
mod validation {
    use super::*;

    fn tx() -> TransactionFields {
        TransactionFields {
            date: "2026-08-02".into(),
            asset_id: "credit".into(),
            pay_type: "Credit Card".into(),
            category_id: "expense-variable".into(),
            category_name: "Variable".into(),
            subcategory_id: Some("food".into()),
            subcategory_name: Some("Food".into()),
            amount: 120.5,
            kind: "expense".into(),
            note: Some("Groceries".into()),
            detail: None,
        }
    }

    #[test]
    fn accepts_only_real_calendar_dates() {
        for good in ["2026-08-02", "2024-02-29", "2026-12-31", "2000-02-29"] {
            assert!(is_date(good), "{good} should be accepted");
        }
        for bad in ["2026-13-45", "2026-00-10", "2026-02-30", "2023-02-29", "2026-08-00", "2026-8-02", "26-08-02", "2026/08/02"] {
            assert!(!is_date(bad), "{bad} should be rejected");
        }
    }

    #[test]
    fn rejects_non_calendar_dates_in_every_write() {
        let mut f = tx();
        f.date = "2026-13-45".into();
        assert!(WriteOp::CreateTransaction { fields: f }.request().is_err());
        let mut f = tx();
        f.date = "2026-02-30".into();
        assert!(WriteOp::UpdateTransaction { id: "a".into(), fields: f }.request().is_err());
        let transfer = TransferFields {
            date: "2026-13-01".into(),
            from_asset_id: "a".into(),
            from_asset_name: "A".into(),
            to_asset_id: "b".into(),
            to_asset_name: "B".into(),
            amount: 1.0,
            note: None,
            detail: None,
        };
        assert!(WriteOp::CreateTransfer { fields: transfer }.request().is_err());
    }

    #[test]
    fn bounds_amounts_text_and_ids() {
        let mut f = tx();
        f.amount = 1e12;
        assert!(WriteOp::CreateTransaction { fields: f.clone() }.request().is_ok());
        f.amount = 1e12 + 1.0;
        assert!(WriteOp::CreateTransaction { fields: f.clone() }.request().is_err());
        f.amount = 0.0;
        assert!(WriteOp::CreateTransaction { fields: f.clone() }.request().is_err());
        f.amount = f64::NAN;
        assert!(WriteOp::CreateTransaction { fields: f.clone() }.request().is_err());
        f.amount = f64::INFINITY;
        assert!(WriteOp::CreateTransaction { fields: f }.request().is_err());
        assert!(id("account", "a:b").is_err());
        assert!(id("account", "a&b").is_err());
        assert!(id("account", "a b").is_err());
        assert!(id("account", "a/b").is_err());
        assert!(id("account", &"a".repeat(65)).is_err());
        assert!(id("account", &"a".repeat(64)).is_ok());
        assert!(text("Note", &"x".repeat(501), false).is_err());
        assert!(text("Note", &"x".repeat(500), false).is_ok());
        assert!(text("Note", "bad\u{7}char", false).is_err());
        assert!(text("Note", "line\nbreak", false).is_ok());
        assert!(text("Note", "  ", true).is_err());
    }

    #[test]
    fn bounds_days_and_deleted_ids() {
        let fields = CardFields {
            name: "Visa".into(),
            link_asset_id: "checking".into(),
            link_asset_name: "Checking".into(),
            closing_day: 31,
            payment_day: 1,
        };
        assert!(WriteOp::UpdateCard { asset_id: "c".into(), fields: fields.clone() }.request().is_ok());
        assert!(WriteOp::UpdateCard { asset_id: "c".into(), fields: CardFields { closing_day: 0, ..fields.clone() } }.request().is_err());
        assert!(WriteOp::UpdateCard { asset_id: "c".into(), fields: CardFields { payment_day: 32, ..fields.clone() } }.request().is_err());
        assert!(WriteOp::DeleteTransactions { ids: vec!["a".into(); 501] }.request().is_err());
        assert!(WriteOp::DeleteTransactions { ids: vec!["a".into(); 500] }.request().is_ok());
    }

    #[test]
    fn detects_failure_bodies_in_any_casing() {
        assert!(is_failure("{ SUCCESS: false }").is_some());
        assert!(is_failure("{\"SUCCESS\":false}").is_some());
        assert!(is_failure("{result: 'fail'}").is_some());
        assert!(is_failure("{\"result\":\"FAIL\"}").is_some());
        assert!(is_failure("{success:true}").is_none());
        assert!(is_failure("{result:'ok'}").is_none());
    }

    #[test]
    fn treats_only_unstructured_bodies_as_unconfirmed() {
        assert!(is_unconfirmed("ERROR").is_some());
        assert!(is_unconfirmed("  Internal Server Error  ").is_some());
        assert!(is_unconfirmed("").is_none());
        assert!(is_unconfirmed("   ").is_none());
        assert!(is_unconfirmed("{ success: true }").is_none());
        assert!(is_unconfirmed("[1,2]").is_none());
    }
}
