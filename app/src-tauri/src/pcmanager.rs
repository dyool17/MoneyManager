//! Read-only access to the MoneyManager PC Manager server.
//!
//! Reads are GET requests to the endpoints listed in [`Endpoint`]. Writes are
//! POST requests built only from a validated [`crate::writes::WriteOp`].
//! There is no generic request command.

use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;
use url::Url;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum Endpoint {
    #[serde(rename = "getInitData")]
    InitData,
    #[serde(rename = "getSummaryDataByPeriod")]
    SummaryByPeriod,
    #[serde(rename = "getDataByPeriod")]
    MovementsByPeriod,
    #[serde(rename = "getDashBoardData")]
    Dashboard,
    #[serde(rename = "getAssetData")]
    Assets,
    #[serde(rename = "getCardData")]
    Cards,
    #[serde(rename = "getEachAssetChartData")]
    AssetTrend,
    /// Full app backup. Binary, so it is only reachable through the backup
    /// command, never from `mm_read`.
    #[serde(skip)]
    SqliteBackup,
}

impl Endpoint {
    fn path(self) -> &'static str {
        match self {
            Endpoint::InitData => "getInitData",
            Endpoint::SummaryByPeriod => "getSummaryDataByPeriod",
            Endpoint::MovementsByPeriod => "getDataByPeriod",
            Endpoint::Dashboard => "getDashBoardData",
            Endpoint::Assets => "getAssetData",
            Endpoint::Cards => "getCardData",
            Endpoint::AssetTrend => "getEachAssetChartData",
            Endpoint::SqliteBackup => "money.sqlite",
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadParams {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub mbid: Option<String>,
    pub asset_id: Option<String>,
}

fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn is_id(s: &str) -> bool {
    s.len() <= 64 && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

/// Accepts only `http://<private-or-loopback IPv4>:<port>` with no path, query or credentials.
pub fn validate_base_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "Invalid address".to_string())?;
    if url.scheme() != "http" {
        return Err("Address must start with http://".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Address must not contain credentials".into());
    }
    if url.query().is_some() || url.fragment().is_some() || !matches!(url.path(), "" | "/") {
        return Err("Address must be only http://IP:PORT".into());
    }
    let ip: Ipv4Addr = url
        .host_str()
        .and_then(|h| h.parse().ok())
        .ok_or("Host must be a LAN IPv4 address")?;
    if !(ip.is_private() || ip.is_loopback()) {
        return Err("Host must be on the local network".into());
    }
    if url.port().is_none() {
        return Err("Address must include the port shown by PC Manager".into());
    }
    Ok(url)
}

/// Builds the GET URL for an allowed endpoint, validating every parameter.
pub fn build_url(base: &str, endpoint: Endpoint, params: &ReadParams) -> Result<Url, String> {
    let mut url = validate_base_url(base)?;
    url.set_path(&format!("/moneyBook/{}", endpoint.path()));

    let needs_period = matches!(endpoint, Endpoint::SummaryByPeriod | Endpoint::MovementsByPeriod);
    let mut query: Vec<(&str, &str)> = Vec::new();
    if needs_period {
        for (key, value) in [("startDate", &params.start_date), ("endDate", &params.end_date)] {
            let v = value.as_deref().filter(|v| is_date(v)).ok_or(format!("{key} must be YYYY-MM-DD"))?;
            query.push((key, v));
        }
        let mbid = params.mbid.as_deref().filter(|v| !v.is_empty() && is_id(v)).ok_or("Invalid mbid")?;
        query.push(("mbid", mbid));
    }
    if endpoint == Endpoint::MovementsByPeriod {
        let asset = params.asset_id.as_deref().unwrap_or("");
        if !is_id(asset) {
            return Err("Invalid assetId".into());
        }
        query.push(("assetId", asset));
    }
    if endpoint == Endpoint::AssetTrend {
        let asset = params.asset_id.as_deref().filter(|v| !v.is_empty() && is_id(v)).ok_or("Invalid assetId")?;
        query.push(("assetId", asset));
    }
    if !query.is_empty() {
        url.query_pairs_mut().extend_pairs(query);
    }
    Ok(url)
}

/// Writes are refused unless a backup of the same phone was taken this recently.
pub const BACKUP_MAX_AGE: Duration = Duration::from_secs(30 * 60);

pub struct PcManager {
    http: reqwest::Client,
    backups: Mutex<HashMap<String, Instant>>,
}

impl PcManager {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .cookie_store(true)
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("HTTP client");
        Self { http, backups: Mutex::new(HashMap::new()) }
    }

    pub fn record_backup(&self, base: &str) {
        if let Ok(url) = validate_base_url(base) {
            self.backups.lock().unwrap().insert(url.to_string(), Instant::now());
        }
    }

    /// Ok when a backup of this phone was taken within `max_age`.
    pub fn require_recent_backup(&self, base: &str, max_age: Duration) -> Result<(), String> {
        let url = validate_base_url(base)?;
        match self.backups.lock().unwrap().get(url.as_str()) {
            Some(t) if t.elapsed() <= max_age => Ok(()),
            _ => Err("Take a backup before changing data on the phone (Connect phone, then Back up now)".into()),
        }
    }

    /// Sends one write. Never retried: a timed-out write may already be applied.
    pub async fn write(&self, base: &str, req: &crate::writes::Request) -> Result<String, String> {
        let mut url = validate_base_url(base)?;
        url.set_path(&format!("/moneyBook/{}", req.path));
        let res = self.http.post(url).form(&req.form).send().await.map_err(|e| {
            if e.is_timeout() {
                "The phone did not confirm the change in time. Refresh to check whether it was saved before trying again.".to_string()
            } else if e.is_connect() {
                "Cannot reach PC Manager. Nothing was changed.".to_string()
            } else {
                format!("Network error: {e}")
            }
        })?;
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(format!("PC Manager answered HTTP {}", status.as_u16()));
        }
        if let Some(reason) = crate::writes::is_failure(&body) {
            return Err(reason);
        }
        if let Some(reason) = crate::writes::is_unconfirmed(&body) {
            return Err(reason);
        }
        Ok(body)
    }

    pub async fn read(&self, base: &str, endpoint: Endpoint, params: &ReadParams) -> Result<String, String> {
        let res = self.get(base, endpoint, params, None).await?;
        res.text().await.map_err(|e| format!("Could not read response: {e}"))
    }

    /// Downloads a binary read endpoint. Larger timeout: backups can be big.
    pub async fn read_bytes(&self, base: &str, endpoint: Endpoint) -> Result<Vec<u8>, String> {
        let res = self.get(base, endpoint, &ReadParams::default(), Some(Duration::from_secs(180))).await?;
        let bytes = res.bytes().await.map_err(|e| format!("Could not read response: {e}"))?;
        Ok(bytes.to_vec())
    }

    async fn get(
        &self,
        base: &str,
        endpoint: Endpoint,
        params: &ReadParams,
        timeout: Option<Duration>,
    ) -> Result<reqwest::Response, String> {
        let url = build_url(base, endpoint, params)?;
        let mut req = self.http.get(url);
        if let Some(t) = timeout {
            req = req.timeout(t);
        }
        let res = req.send().await.map_err(|e| {
            if e.is_timeout() {
                "PC Manager did not answer in time".to_string()
            } else if e.is_connect() {
                "Cannot reach PC Manager. Is it started on the phone and on the same Wi-Fi?".to_string()
            } else {
                format!("Network error: {e}")
            }
        })?;
        let status = res.status();
        if !status.is_success() {
            return Err(format!("PC Manager answered HTTP {}", status.as_u16()));
        }
        Ok(res)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_lan_addresses_only() {
        assert!(validate_base_url("http://192.168.1.161:8080").is_ok());
        assert!(validate_base_url("http://10.0.0.2:8888/").is_ok());
        assert!(validate_base_url("http://127.0.0.1:8888").is_ok());
        for bad in [
            "https://192.168.1.2:8080",
            "http://8.8.8.8:8080",
            "http://example.com:8080",
            "http://192.168.1.2",
            "http://192.168.1.2:8080/moneyBook/create",
            "http://u:p@192.168.1.2:8080",
            "http://192.168.1.2:8080?x=1",
        ] {
            assert!(validate_base_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn builds_only_allowlisted_read_paths() {
        let p = ReadParams {
            start_date: Some("2026-08-01".into()),
            end_date: Some("2026-08-31".into()),
            mbid: Some("1".into()),
            asset_id: None,
        };
        let url = build_url("http://192.168.1.2:8080", Endpoint::MovementsByPeriod, &p).unwrap();
        assert_eq!(
            url.as_str(),
            "http://192.168.1.2:8080/moneyBook/getDataByPeriod?startDate=2026-08-01&endDate=2026-08-31&mbid=1&assetId="
        );
        let init = build_url("http://192.168.1.2:8080", Endpoint::InitData, &ReadParams::default()).unwrap();
        assert_eq!(init.as_str(), "http://192.168.1.2:8080/moneyBook/getInitData");
    }

    #[test]
    fn builds_phase2_read_paths() {
        let base = "http://192.168.1.2:8080";
        let none = ReadParams::default();
        for (e, path) in [
            (Endpoint::Dashboard, "getDashBoardData"),
            (Endpoint::Assets, "getAssetData"),
            (Endpoint::Cards, "getCardData"),
        ] {
            assert_eq!(build_url(base, e, &none).unwrap().as_str(), format!("{base}/moneyBook/{path}"));
        }
        let trend = ReadParams { asset_id: Some("cash".into()), ..ReadParams::default() };
        assert_eq!(
            build_url(base, Endpoint::AssetTrend, &trend).unwrap().as_str(),
            format!("{base}/moneyBook/getEachAssetChartData?assetId=cash")
        );
        assert!(build_url(base, Endpoint::AssetTrend, &none).is_err());
    }

    #[test]
    fn rejects_unknown_endpoints_and_fields() {
        assert!(serde_json::from_str::<Endpoint>("\"create\"").is_err());
        assert!(serde_json::from_str::<Endpoint>("\"uploadSqlFile\"").is_err());
        assert!(serde_json::from_str::<Endpoint>("\"money.sqlite\"").is_err());
        assert!(serde_json::from_str::<Endpoint>("\"SqliteBackup\"").is_err());
        assert!(serde_json::from_str::<ReadParams>(r#"{"method":"POST"}"#).is_err());
    }

    #[test]
    fn rejects_injected_params() {
        let p = ReadParams {
            start_date: Some("2026-08-01&x=1".into()),
            end_date: Some("2026-08-31".into()),
            mbid: Some("1".into()),
            asset_id: None,
        };
        assert!(build_url("http://192.168.1.2:8080", Endpoint::SummaryByPeriod, &p).is_err());
        let p = ReadParams { asset_id: Some("a/../b".into()), ..ReadParams { start_date: Some("2026-08-01".into()), end_date: Some("2026-08-31".into()), mbid: Some("1".into()), asset_id: None } };
        assert!(build_url("http://192.168.1.2:8080", Endpoint::MovementsByPeriod, &p).is_err());
    }
}
