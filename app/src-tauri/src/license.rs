//! Pro on this Mac (F25, T17): a Dodo license key, activated here and kept in the Keychain. There is no account and no
//! server of ours. Dodo's activate, validate and deactivate license endpoints are public (no API key), so the app carries no
//! secret. Checkout and the billing portal open in the person's own browser (rules 2 and 9): no card form, no login form,
//! no webview here.
//!
//! The parts that decide things are plain code, tested without a network (docs/design/2026-10-31-dodo-payments-spec.md
//! sections 5, 8, 9 and 13): the request bodies, reading Dodo's answers, the decide function and the grace clock. Every HTTP
//! call goes through `Transport`, which tests replace; the real one is the Mac's own curl with the request body (which holds
//! the key) on its standard input, never on its command line, as google.rs does. The key is never logged, never sent to the
//! engine, never put in an address or an error. A page sees only its last 4 characters.
//!
//! Payments off (F25, the switch in billing.*.json): every command here refuses before it touches the network or the
//! Keychain, the status says "off", and the engine is told nothing is gated. The app behaves as it did before Pro existed.
//!
//! Only a definite answer from Dodo changes the plan. A network failure, a timeout, a 5xx or a 429 is "unknown" and never
//! "invalid": the last known plan stays until 14 days pass with no successful check (section 8).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// The Keychain item that holds the key (service `keystore::service()`, so tests use their own `companion-test-*` one).
pub const ACCOUNT: &str = "pro-license";

pub const DAY: u64 = 86_400;
/// No successful check for this long: a quiet warning (day 10).
pub const WARN_AFTER: u64 = 10 * DAY;
/// No successful check for this long: new tasks follow the Free rules (day 14). Running tasks are never touched.
pub const FREE_AFTER: u64 = 14 * DAY;
/// A key Dodo says is not active is rechecked once a day for this long (on hold and paused keys come back).
pub const INACTIVE_RECHECK_FOR: u64 = 30 * DAY;
/// How often an active key is checked, and how far each check may move from that, either way.
pub const CHECK_EVERY: u64 = 12 * 3600;
pub const JITTER: u64 = 30 * 60;
/// The first check after launch, in seconds. Launch never waits for it.
pub const FIRST_CHECK_SECS: u64 = 10;

/// Why a command did not do what was asked. Only these words ever leave this module; the page turns each into the
/// person's words (app/src/strings.ts). None of them carries the key.
pub const REASONS: &[&str] = &["paymentsOff", "notReady", "keyShape", "notFound", "inactive", "limit", "wrongProduct", "unreachable", "keychain", "noKey", "trialUsed", "alreadyPro", "notCard", "portalNotReady", "browser"];

// ---------- the build's billing settings (billing.test.json, billing.live.json) ----------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode { Test, Live }

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct File {
    #[allow(dead_code)] about: Option<String>,
    mode: String,
    payments_on: bool,
    api_host: String,
    checkout_host: String,
    portal_host: String,
    business_id: String,
    products: Products,
    redirect_url: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Products { monthly: String, yearly: String }

/// The settings this build sells Pro with. Hosts are build settings, never a person's setting (section 5). Empty means
/// not filled in yet: the founder makes the products in Dodo and copies the ids here.
#[derive(Clone, Debug, PartialEq)]
pub struct Billing {
    pub mode: Mode,
    switch_on: bool,
    pub api: String,
    pub checkout: String,
    pub portal: String,
    pub business_id: String,
    pub monthly: String,
    pub yearly: String,
    pub redirect: String,
}

impl Billing {
    /// Payments off, nothing filled in: what a damaged or unsafe file gives.
    pub fn off(mode: Mode) -> Billing {
        Billing { mode, switch_on: false, api: String::new(), checkout: String::new(), portal: String::new(), business_id: String::new(), monthly: String::new(), yearly: String::new(), redirect: String::new() }
    }
    /// Whether payments are on. On only when the founder switched them on and the file can sell Pro (an API host and at
    /// least one product id). Anything less fails open: nobody is gated (section 14, payments switch).
    pub fn payments_on(&self) -> bool { self.switch_on && !self.api.is_empty() && (!self.monthly.is_empty() || !self.yearly.is_empty()) }
    /// The configured Pro product ids.
    pub fn pro_ids(&self) -> Vec<&str> { [self.monthly.as_str(), self.yearly.as_str()].into_iter().filter(|s| !s.is_empty()).collect() }
}

/// The first label of a host is "test" (or a label says test), as Dodo's test hosts are: test.dodopayments.com,
/// test.customer.dodopayments.com.
pub fn is_test_host(host: &str) -> bool { host.split('.').any(|l| l == "test" || l.starts_with("test-") || l.ends_with("-test")) }
/// Dodo's live hosts (section 12).
pub const LIVE_HOSTS: &[&str] = &["live.dodopayments.com", "checkout.dodopayments.com", "customer.dodopayments.com"];
pub fn is_live_host(host: &str) -> bool { LIVE_HOSTS.contains(&host) }

/// The host of an https address, or None when it is not a plain https address.
pub fn https_host(url: &str) -> Option<&str> {
    let rest = url.strip_prefix("https://")?;
    if url.len() > 300 || url.chars().any(|c| c.is_whitespace() || c.is_control()) { return None; }
    let host = rest.split(['/', '?', '#']).next()?;
    if host.is_empty() || host.contains('@') || host.contains(':') || !host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') { return None; }
    Some(host)
}
/// A host setting: empty, or an https address with nothing after the host (a trailing slash is dropped).
fn origin(s: &str) -> Option<String> {
    let s = s.trim().trim_end_matches('/');
    if s.is_empty() { return Some(String::new()); }
    let host = https_host(s)?;
    (s == format!("https://{host}")).then(|| s.to_string())
}
/// An id Dodo made (pdt_..., bus_...): letters, digits and underscores, or empty.
fn id_ok(s: &str) -> bool { s.is_empty() || (s.len() <= 80 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')) }

/// The settings file, refused (None) unless every address is https, it is the mode this build expects, a test file names
/// only test hosts and a live file no test host. A refused file means payments off.
pub fn parse_billing(text: &str, expect: Mode) -> Option<Billing> {
    let f: File = serde_json::from_str(text).ok()?;
    let mode = match f.mode.as_str() { "test" => Mode::Test, "live" => Mode::Live, _ => return None };
    if mode != expect { return None; }
    let (api, checkout, portal) = (origin(&f.api_host)?, origin(&f.checkout_host)?, origin(&f.portal_host)?);
    for h in [&api, &checkout, &portal].into_iter().filter(|h| !h.is_empty()) {
        let host = https_host(h)?;
        match mode { Mode::Test => if !is_test_host(host) || is_live_host(host) { return None; }, Mode::Live => if is_test_host(host) { return None; } }
    }
    let redirect = f.redirect_url.trim().to_string();
    if !redirect.is_empty() {
        let host = https_host(&redirect)?;
        if mode == Mode::Live && is_test_host(host) { return None; }
    }
    let (business_id, monthly, yearly) = (f.business_id.trim().to_string(), f.products.monthly.trim().to_string(), f.products.yearly.trim().to_string());
    if ![&business_id, &monthly, &yearly].iter().all(|s| id_ok(s)) { return None; }
    Some(Billing { mode, switch_on: f.payments_on, api, checkout, portal, business_id, monthly, yearly, redirect })
}

pub const TEST_FILE: &str = include_str!("../billing.test.json");
pub const LIVE_FILE: &str = include_str!("../billing.live.json");
/// Development builds sell in Dodo's test mode, release builds in live mode.
pub fn build_mode() -> Mode { if cfg!(debug_assertions) { Mode::Test } else { Mode::Live } }
/// This build's settings, read once. A file that does not parse means payments off.
pub fn billing() -> &'static Billing {
    static B: std::sync::OnceLock<Billing> = std::sync::OnceLock::new();
    B.get_or_init(|| { let m = build_mode(); parse_billing(if m == Mode::Test { TEST_FILE } else { LIVE_FILE }, m).unwrap_or_else(|| Billing::off(m)) })
}

/// Monthly or yearly, as Get Pro offers them (yearly first).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Term { Yearly, Monthly }
impl Term { pub fn from_word(w: &str) -> Option<Term> { match w { "yearly" => Some(Term::Yearly), "monthly" => Some(Term::Monthly), _ => None } } }

fn enc(s: &str) -> String { s.bytes().map(|c| match c { b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (c as char).to_string(), _ => format!("%{c:02X}") }).collect() }

/// Dodo's static checkout link (section 4): `{checkoutHost}/buy/{product_id}?quantity=1&redirect_url=...`. Not ready (the
/// page says checkout is not ready yet) while payments are off or the host or the id is not filled in.
pub fn checkout_url(b: &Billing, term: Term) -> Result<String, &'static str> {
    if !b.payments_on() { return Err("paymentsOff"); }
    let id = match term { Term::Yearly => &b.yearly, Term::Monthly => &b.monthly };
    if b.checkout.is_empty() || id.is_empty() { return Err("notReady"); }
    let mut u = format!("{}/buy/{}?quantity=1", b.checkout, enc(id));
    if !b.redirect.is_empty() { u.push_str(&format!("&redirect_url={}", enc(&b.redirect))); }
    Ok(u)
}
/// Dodo's static portal login, `{portalHost}/login/{business_id}` (section 7).
pub fn portal_url(b: &Billing) -> Result<String, &'static str> {
    if !b.payments_on() { return Err("paymentsOff"); }
    if b.portal.is_empty() || b.business_id.is_empty() { return Err("notReady"); }
    Ok(format!("{}/login/{}", b.portal, enc(&b.business_id)))
}

// ---------- requests ----------

pub fn activate_body(key: &str, name: &str) -> String { json!({ "license_key": key, "name": name }).to_string() }
pub fn validate_body(key: &str, instance: &str) -> String { json!({ "license_key": key, "license_key_instance_id": instance }).to_string() }
pub fn deactivate_body(key: &str, instance: &str) -> String { json!({ "license_key": key, "license_key_instance_id": instance }).to_string() }

/// The name this Mac's activation gets: the product's name (protocol/names.json), " Mac " and 4 random characters. Never
/// the Mac's own name, so nothing about the person or the machine reaches Dodo.
pub fn instance_name(random: [u8; 4]) -> String {
    const SET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    format!("{} Mac {}", crate::names::product(), random.iter().map(|b| SET[(*b as usize) % SET.len()] as char).collect::<String>())
}
pub fn random4() -> [u8; 4] { let mut b = [0u8; 4]; unsafe { libc::arc4random_buf(b.as_mut_ptr() as *mut libc::c_void, b.len()) }; b }

/// A license key as Dodo issues them: letters, digits, dashes and underscores. Never repeated back in an error.
pub fn key_ok(raw: &str) -> Result<String, &'static str> {
    let k = raw.trim();
    if k.len() < 6 || k.len() > 128 || !k.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') { return Err("keyShape"); }
    Ok(k.to_string())
}

// ---------- the network, replaceable ----------

/// One POST with a JSON body. Gives back the HTTP status and the body, or None when no answer came (no network, a
/// timeout, curl could not run). Tests replace it, so no test ever reaches Dodo.
pub trait Transport { fn post_json(&self, url: &str, body: &str) -> Option<(u16, String)>; }

/// The Mac's own curl. `-q` first so a ~/.curlrc cannot add tracing; the body (with the key) goes on standard input.
pub struct Curl;
/// curl's arguments: the address and fixed flags only. The key is never among them (a command line can be read by any
/// program on the Mac).
pub fn curl_args(url: &str) -> Vec<String> {
    ["-q", "-sS", "--proto", "=https", "--max-time", "20", "-X", "POST", "-H", "Content-Type: application/json", "-H", "Accept: application/json", "--data-binary", "@-", "-w", "\n%{http_code}", url].iter().map(|s| s.to_string()).collect()
}
/// What curl printed: the body, then a line with the status. 000 (no answer) is None.
pub fn read_curl(out: &str) -> Option<(u16, String)> {
    let (body, code) = out.rsplit_once('\n').unwrap_or(("", out));
    let code: u16 = code.trim().parse().ok()?;
    (code >= 100).then(|| (code, body.to_string()))
}
impl Transport for Curl {
    fn post_json(&self, url: &str, body: &str) -> Option<(u16, String)> { post_json_with("/usr/bin/curl", url, body) }
}
/// `post_json` with the program named (tests give a stand in that prints what it was given). curl reads no settings file
/// (-q) and starts with nothing of the app's environment but a plain PATH, as google.rs does: SSLKEYLOGFILE, CURL_CA_BUNDLE,
/// SSL_CERT_FILE, CURL_HOME and the proxy variables, set for the person's session by another program, never see the key.
pub fn post_json_with(program: &str, url: &str, body: &str) -> Option<(u16, String)> {
    use std::io::Write;
    if https_host(url).is_none() { return None; }
    let mut child = std::process::Command::new(program).args(curl_args(url)).env_clear().env("PATH", "/usr/bin:/bin")
        .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).spawn().ok()?;
    child.stdin.take()?.write_all(body.as_bytes()).ok()?;
    let out = child.wait_with_output().ok()?;
    read_curl(&String::from_utf8_lossy(&out.stdout))
}

// ---------- Dodo's answers ----------

/// What an activation keeps: Dodo's instance id (lki_...), the product and the email. Never the name or phone number.
#[derive(Clone, Debug, PartialEq)]
pub struct Activation { pub instance: String, pub product: String, pub email: String }

#[derive(Clone, Debug, PartialEq)]
pub enum Answer {
    /// activate: 200 or 201 with an instance.
    Activated(Activation),
    /// validate: valid true. deactivate: done.
    Valid,
    /// validate: valid false, or 403 (the key is turned off: cancelled, expired, on hold, paused, or a plan change).
    NotActive,
    /// 404: Dodo does not know that key (or instance).
    NotFound,
    /// 422 on activate: the key is already on its activation limit.
    LimitReached,
    /// No answer, a timeout, 5xx, 429, or anything not understood. Never taken for "invalid".
    Unknown,
}

fn parse(body: &str) -> Value { serde_json::from_str(body).unwrap_or(Value::Null) }

/// Whether a 403 or 404 came from Dodo itself: its error answers are a JSON object with a `code` or a `message`. A proxy,
/// a firewall, a captive portal, a Cloudflare challenge or a moved route also answer 403 or 404, with an empty body or a
/// web page; that is no answer about the key, so it stays "unknown" and never turns a paying person's Pro off (section 8).
/// [verify] in test mode (V1): the exact shape of Dodo's 403 and 404 bodies.
pub fn from_dodo(body: &str) -> bool {
    parse(body).as_object().is_some_and(|o| ["code", "message"].iter().any(|k| o.get(*k).is_some_and(|v| v.as_str().is_some_and(|s| !s.trim().is_empty()))))
}
/// A 403 or a 404 as an answer about the key, or Unknown when it did not come from Dodo.
fn refusal(code: u16, body: &str) -> Answer {
    if !from_dodo(body) { return Answer::Unknown; }
    if code == 403 { Answer::NotActive } else { Answer::NotFound }
}

pub fn read_activate(reply: Option<(u16, String)>) -> Answer {
    let Some((code, body)) = reply else { return Answer::Unknown };
    match code {
        200 | 201 => {
            let v = parse(&body);
            let s = |p: &str| v.pointer(p).and_then(Value::as_str).unwrap_or("").trim().to_string();
            let (instance, product, email) = (s("/id"), s("/product/product_id"), s("/customer/email"));
            if instance.is_empty() || product.is_empty() || !id_ok(&instance) || !id_ok(&product) { return Answer::Unknown; }
            Answer::Activated(Activation { instance, product, email: email.chars().take(200).collect() })
        }
        403 | 404 => refusal(code, &body),
        422 => Answer::LimitReached,
        _ => Answer::Unknown,
    }
}
pub fn read_validate(reply: Option<(u16, String)>) -> Answer {
    let Some((code, body)) = reply else { return Answer::Unknown };
    match code {
        200 => match parse(&body).get("valid").and_then(Value::as_bool) { Some(true) => Answer::Valid, Some(false) => Answer::NotActive, None => Answer::Unknown },
        403 | 404 => refusal(code, &body),
        _ => Answer::Unknown,
    }
}
pub fn read_deactivate(reply: Option<(u16, String)>) -> Answer {
    let Some((code, body)) = reply else { return Answer::Unknown };
    match code { 200..=204 => Answer::Valid, 403 | 404 => refusal(code, &body), _ => Answer::Unknown }
}

// ---------- what is kept ----------

/// The `pro-license` Keychain item. Times are seconds since 1970. `latest_seen`: the latest clock time seen, so a clock
/// turned back never makes a check look newer. `inactive_since`: when Dodo last said the key is not active.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stored {
    pub key: String,
    pub instance: String,
    pub product: String,
    pub email: String,
    pub last_ok: u64,
    pub latest_seen: u64,
    pub last_try: u64,
    pub inactive_since: Option<u64>,
}
impl Stored {
    pub fn to_json(&self) -> String { serde_json::to_string(self).unwrap_or_default() }
    pub fn from_json(s: &str) -> Option<Stored> { serde_json::from_str::<Stored>(s).ok().filter(|s| !s.key.is_empty() && !s.instance.is_empty()) }
    /// The later of the clock and the latest time seen.
    pub fn now(&self, now: u64) -> u64 { now.max(self.latest_seen) }
    pub fn last4(&self) -> String { let c: Vec<char> = self.key.chars().collect(); c[c.len().saturating_sub(4)..].iter().collect() }
}

/// "rishabh@gmail.com" -> "r…@gmail.com". What a page shows after the first confirmation.
pub fn mask_email(e: &str) -> String {
    match e.split_once('@') { Some((user, domain)) if !user.is_empty() => format!("{}…@{domain}", user.chars().next().unwrap_or('?')), _ => String::new() }
}

/// The Keychain, replaceable. `get` tells "no such item" (Ok(None)) apart from a look that failed (Err).
pub trait Vault {
    fn get(&self, account: &str) -> Result<Option<String>, ()>;
    fn set(&self, account: &str, value: &str) -> Result<(), ()>;
    /// True when the item is gone afterwards (also when there was none).
    fn delete(&self, account: &str) -> bool;
}
/// The app's own Keychain service (`keystore::service()`, never a product named one, so a rename orphans nothing).
pub struct Keychain { pub service: String }
impl Keychain { pub fn new() -> Keychain { Keychain { service: crate::keystore::service() } } }
#[cfg(target_os = "macos")]
impl Vault for Keychain {
    fn get(&self, account: &str) -> Result<Option<String>, ()> {
        match security_framework::passwords::get_generic_password(&self.service, account) {
            Ok(b) => String::from_utf8(b).map(Some).map_err(|_| ()),
            Err(e) if e.code() == crate::keystore::ITEM_NOT_FOUND => Ok(None),
            Err(_) => Err(()),
        }
    }
    fn set(&self, account: &str, value: &str) -> Result<(), ()> { security_framework::passwords::set_generic_password(&self.service, account, value.as_bytes()).map_err(|_| ()) }
    fn delete(&self, account: &str) -> bool { crate::keystore::delete_item(&self.service, account) || crate::keystore::gone(&self.service, account) }
}
#[cfg(not(target_os = "macos"))]
impl Vault for Keychain {
    fn get(&self, _: &str) -> Result<Option<String>, ()> { Ok(None) }
    fn set(&self, _: &str, _: &str) -> Result<(), ()> { Err(()) }
    fn delete(&self, _: &str) -> bool { true }
}

pub fn load(v: &dyn Vault) -> Result<Option<Stored>, ()> { Ok(v.get(ACCOUNT)?.as_deref().and_then(Stored::from_json)) }

// ---------- the clock Pro is judged by ----------

/// A clock that never runs backwards while the app runs (sections 6 and 8). `anchor` is (a time, the monotonic seconds when
/// it was taken). The first look anchors at the later of the wall clock and the latest time the items saw; after that,
/// real time passed (a monotonic count that goes on through sleep) is added to it. So turning the clock back neither adds
/// days to the trial or the grace period nor pauses them: they keep running in real time. A later wall clock, or a later
/// time seen, anchors again.
pub fn steady_now(anchor: &mut Option<(u64, u64)>, clock: u64, seen: u64, mono: u64) -> u64 {
    let ran = anchor.map_or(0, |(at, then)| at.saturating_add(mono.saturating_sub(then)));
    let now = clock.max(seen).max(ran);
    if anchor.is_none() || now > ran { *anchor = Some((now, mono)); }
    now
}

/// What the Keychain holds for Pro, read once, and the time to judge it by.
#[derive(Clone, Debug, PartialEq)]
pub struct Read { pub key: Option<Stored>, pub trial: Option<crate::trial::Trial>, pub now: u64 }

/// Reads the key and the trial, and the steady time (the later of the clock, both items' latest time seen and the real
/// time run since). The trial's latest time seen is written back at most once an hour. Err: the Keychain could not be
/// read, which is never taken for "no key" or "no trial": the plan stays as it was (`plan_from`, `tick_after`).
pub fn read(v: &dyn Vault, clock: u64, mono: u64, anchor: &mut Option<(u64, u64)>) -> Result<Read, ()> {
    let key = load(v)?;
    let mut trial = crate::trial::peek(v)?;
    let seen = key.as_ref().map_or(0, |s| s.latest_seen).max(trial.as_ref().map_or(0, |t| t.latest_seen));
    let now = steady_now(anchor, clock, seen, mono);
    if let Some(t) = trial.as_mut() { if t.seen(now) { let _ = v.set(crate::trial::ACCOUNT, &t.to_json()); } }
    Ok(Read { key, trial, now })
}

// ---------- deciding ----------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Plan { Free, Trial, Pro }
impl Plan { pub fn word(self) -> &'static str { match self { Plan::Free => "free", Plan::Trial => "trial", Plan::Pro => "pro" } } }

/// How the saved key stands now.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyCheck { Ok, Overdue, Offline, Inactive }
impl KeyCheck { pub fn word(self) -> &'static str { match self { KeyCheck::Ok => "ok", KeyCheck::Overdue => "overdue", KeyCheck::Offline => "offline", KeyCheck::Inactive => "inactive" } } }

/// Dodo's last definite answer, and the grace clock measured from the last successful check: day 10 warns, day 14 sends
/// new tasks to the Free rules.
pub fn key_check(s: &Stored, now: u64) -> KeyCheck {
    if s.inactive_since.is_some() { return KeyCheck::Inactive; }
    let age = s.now(now).saturating_sub(s.last_ok);
    if age >= FREE_AFTER { KeyCheck::Offline } else if age >= WARN_AFTER { KeyCheck::Overdue } else { KeyCheck::Ok }
}

/// The Plan card's state (section 9a).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State { Off, Free, Trial, TrialEnded, Pro, ProOverdue, ProOffline, Inactive }
impl State {
    pub fn word(self) -> &'static str {
        match self { State::Off => "off", State::Free => "free", State::Trial => "trial", State::TrialEnded => "trialEnded", State::Pro => "pro", State::ProOverdue => "proOverdue", State::ProOffline => "proOffline", State::Inactive => "inactive" }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Decision { pub plan: Plan, pub state: State, pub trial_ends_at: Option<u64> }

/// How long the Plan card says the trial ended, after it did. Then the Free rows of 9a show again.
pub const TRIAL_ENDED_NEWS: u64 = 7 * DAY;

/// Pro or Free for new tasks on this Mac, from the saved key and the trial. Payments off: Free, and nothing is gated
/// (the engine is told paymentsOn false). A key that checks out wins; then a trial still running; otherwise Free.
pub fn decide(payments_on: bool, key: Option<&Stored>, trial: Option<&crate::trial::Trial>, now: u64) -> Decision {
    if !payments_on { return Decision { plan: Plan::Free, state: State::Off, trial_ends_at: None }; }
    let check = key.map(|s| key_check(s, now));
    let trial_on = trial.is_some_and(|t| t.active(now));
    let plan = if matches!(check, Some(KeyCheck::Ok | KeyCheck::Overdue)) { Plan::Pro } else if trial_on { Plan::Trial } else { Plan::Free };
    let state = match check {
        Some(KeyCheck::Ok) => State::Pro,
        Some(KeyCheck::Overdue) => State::ProOverdue,
        Some(KeyCheck::Offline) => State::ProOffline,
        Some(KeyCheck::Inactive) => State::Inactive,
        None if trial_on => State::Trial,
        // The trial's end is news for a week; after that the card is the plain Free one again (with the trial used).
        None if trial.is_some_and(|t| t.now(now) < t.ends_at().saturating_add(TRIAL_ENDED_NEWS)) => State::TrialEnded,
        None => State::Free,
    };
    Decision { plan, state, trial_ends_at: if plan == Plan::Trial { trial.map(|t| t.ends_at()) } else { None } }
}

/// A validate answer, applied to the saved key. Only a definite answer changes anything: valid resets the grace clock and
/// clears the inactive mark; not active or not found marks it inactive (the key is kept, for the daily recheck); unknown
/// changes nothing but the time of the try.
pub fn apply_validate(s: &mut Stored, a: &Answer, now: u64) {
    let now = s.now(now);
    s.latest_seen = now;
    s.last_try = now;
    match a {
        Answer::Valid => { s.last_ok = now; s.inactive_since = None; }
        Answer::NotActive | Answer::NotFound => { s.inactive_since.get_or_insert(now); }
        _ => {}
    }
}

/// When the next regular check of an active key is: 12 hours, moved by up to half an hour either way.
pub fn next_check_at(now: u64, random: u32) -> u64 { now + CHECK_EVERY - JITTER + (random as u64 % (2 * JITTER + 1)) }

/// Whether the timer should check the key now. An inactive key: once a day, for 30 days from when Dodo first said so.
/// An active one: when its next regular check is due.
pub fn check_due(s: &Stored, now: u64, next_at: u64) -> bool {
    let now = s.now(now);
    match s.inactive_since {
        Some(since) => now.saturating_sub(since) <= INACTIVE_RECHECK_FOR && now >= s.last_try.saturating_add(DAY),
        None => now >= next_at,
    }
}

/// What the timer does on one tick.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tick { Stop, Check, Wait }
/// The timer runs only while payments are on and there is a key to check or a trial to end. It reaches Dodo only for a key.
pub fn tick(payments_on: bool, key: Option<&Stored>, trial: Option<&crate::trial::Trial>, now: u64, next_at: u64) -> Tick {
    if !payments_on { return Tick::Stop; }
    match key {
        Some(s) if check_due(s, now, next_at) => Tick::Check,
        Some(s) if s.inactive_since.is_none() || s.now(now).saturating_sub(s.inactive_since.unwrap_or(0)) <= INACTIVE_RECHECK_FOR => Tick::Wait,
        // A trial running, or one whose end is still news: the timer keeps the pages and the engine told.
        _ if trial.is_some_and(|t| t.now(now) < t.ends_at().saturating_add(TRIAL_ENDED_NEWS)) => Tick::Wait,
        _ => Tick::Stop,
    }
}
/// One tick from what was read. A Keychain that could not be read waits and looks again: it never stops the timer.
pub fn tick_after(payments_on: bool, r: &Result<Read, ()>, next_at: u64) -> Tick {
    match r { Ok(r) => tick(payments_on, r.key.as_ref(), r.trial.as_ref(), r.now, next_at), Err(()) => if payments_on { Tick::Wait } else { Tick::Stop } }
}
/// How long the timer sleeps: 15 minutes, or until just after a running trial ends, so the pages and the engine hear the
/// end on time.
pub const TICK_EVERY: u64 = 15 * 60;
pub fn sleep_for(r: &Result<Read, ()>) -> u64 {
    let end = r.as_ref().ok().and_then(|r| r.trial.as_ref().filter(|t| t.active(r.now)).map(|t| t.ends_at().saturating_sub(t.now(r.now)) + 1));
    end.map_or(TICK_EVERY, |e| e.clamp(1, TICK_EVERY))
}

/// The status and the plan from what was read. A Keychain that could not be read keeps the last ones decided (`last`), so
/// a paying person is never sent to the Free rules because a look failed; the engine is told nothing new (None). With no
/// plan decided yet, the pages hear the calm "keychain" state, which gates nothing, and the engine is still told nothing
/// (it gates nothing until it hears a plan).
pub fn plan_from(b: &Billing, r: Result<&Read, ()>, last: &mut Option<(Value, Decision)>) -> (Value, Option<Decision>) {
    if !b.payments_on() { return (off_status(), Some(decide(false, None, None, 0))); }
    match r {
        Ok(r) => {
            let out = (status_json(b, r.key.as_ref(), r.trial.as_ref(), r.now), decide(true, r.key.as_ref(), r.trial.as_ref(), r.now));
            *last = Some(out.clone());
            (out.0, Some(out.1))
        }
        Err(()) => match last { Some((v, _)) => (v.clone(), None), None => (keychain_status(b), None) },
    }
}
/// The status while the Keychain cannot say: nothing gated, nothing offered, Check again.
pub fn keychain_status(b: &Billing) -> Value {
    json!({ "paymentsOn": true, "plan": "free", "state": "keychain", "key": null, "trial": null, "trialUsed": true,
        "checkout": { "yearly": checkout_url(b, Term::Yearly).is_ok(), "monthly": checkout_url(b, Term::Monthly).is_ok() }, "portal": portal_url(b).is_ok() })
}

// ---------- what a page sees ----------

/// The status a page builds the Plan card from (section 9a). Never the key: only its last 4 characters, and the email
/// masked.
pub fn status_json(b: &Billing, key: Option<&Stored>, trial: Option<&crate::trial::Trial>, now: u64) -> Value {
    let on = b.payments_on();
    let d = decide(on, key, trial, now);
    if !on { return off_status(); }
    json!({
        "paymentsOn": true,
        "plan": d.plan.word(),
        "state": d.state.word(),
        "key": key.map(|s| json!({ "last4": s.last4(), "email": mask_email(&s.email), "check": key_check(s, now).word(), "daysSinceCheck": s.now(now).saturating_sub(s.last_ok) / DAY })),
        "trial": trial.map(|t| json!({ "startedAt": iso(t.started_at), "endsAt": iso(t.ends_at()), "daysLeft": t.days_left(now), "ended": !t.active(now) })),
        "trialUsed": trial.is_some(),
        "checkout": { "yearly": checkout_url(b, Term::Yearly).is_ok(), "monthly": checkout_url(b, Term::Monthly).is_ok() },
        "portal": portal_url(b).is_ok(),
    })
}
/// The status with payments off: no plan row, nothing read from the Keychain.
pub fn off_status() -> Value {
    json!({ "paymentsOn": false, "plan": "free", "state": "off", "key": null, "trial": null, "trialUsed": false, "checkout": { "yearly": false, "monthly": false }, "portal": false })
}

/// Seconds since 1970 as "2026-11-14T09:30:00Z".
pub fn iso(secs: u64) -> String {
    let (days, rem) = ((secs / DAY) as i64, secs % DAY);
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

// ---------- the flows, with the network and the Keychain passed in ----------

/// Turn on Pro with a pasted key. Refused with no network call while payments are off or the products are not filled in.
/// A wrong product's activation is given back at once, so it does not use one of the key's Macs. On success the key, the
/// instance id, the product and the email are kept (never the name or phone number). A key saved before (a plan change
/// issues a new key) is let go at Dodo afterwards, as well as it can be.
pub fn activate(b: &Billing, t: &dyn Transport, v: &dyn Vault, raw: &str, name: &str, now: u64) -> Result<Stored, &'static str> {
    if !b.payments_on() { return Err("paymentsOff"); }
    if b.pro_ids().is_empty() { return Err("notReady"); }
    let key = key_ok(raw)?;
    let before = v.get(ACCOUNT).map_err(|_| "keychain")?.as_deref().and_then(Stored::from_json);
    let answer = read_activate(t.post_json(&format!("{}/licenses/activate", b.api), &activate_body(&key, name)));
    let a = match answer {
        Answer::Activated(a) => a,
        Answer::NotActive => return Err("inactive"),
        Answer::NotFound => return Err("notFound"),
        Answer::LimitReached => return Err("limit"),
        _ => return Err("unreachable"),
    };
    if !b.pro_ids().contains(&a.product.as_str()) {
        let _ = t.post_json(&format!("{}/licenses/deactivate", b.api), &deactivate_body(&key, &a.instance));
        return Err("wrongProduct");
    }
    // One time for all three, the later of the clock and the old key's latest time seen: a fresh key starts with a fresh
    // check, never in grace because the clock was set back.
    let seen = before.as_ref().map_or(now, |p| p.now(now));
    let s = Stored { key, instance: a.instance, product: a.product, email: a.email, last_ok: seen, latest_seen: seen, last_try: seen, inactive_since: None };
    if v.set(ACCOUNT, &s.to_json()).is_err() {
        let _ = t.post_json(&format!("{}/licenses/deactivate", b.api), &deactivate_body(&s.key, &s.instance));
        return Err("keychain");
    }
    if let Some(p) = before.filter(|p| p.key != s.key || p.instance != s.instance) {
        let _ = t.post_json(&format!("{}/licenses/deactivate", b.api), &deactivate_body(&p.key, &p.instance));
    }
    Ok(s)
}

/// Check the saved key with Dodo now (the timer, or Check again). Gives the key as it stands afterwards.
pub fn check(b: &Billing, t: &dyn Transport, v: &dyn Vault, now: u64) -> Result<Stored, &'static str> {
    if !b.payments_on() { return Err("paymentsOff"); }
    let mut s = load(v).map_err(|_| "keychain")?.ok_or("noKey")?;
    let answer = read_validate(t.post_json(&format!("{}/licenses/validate", b.api), &validate_body(&s.key, &s.instance)));
    apply_validate(&mut s, &answer, now);
    v.set(ACCOUNT, &s.to_json()).map_err(|_| "keychain")?;
    Ok(s)
}

/// Use Pro on another Mac: let this Mac's activation go at Dodo, then delete the item. Without an answer from Dodo the
/// key stays, so it can be tried again (the activation would otherwise stay counted).
pub fn deactivate(b: &Billing, t: &dyn Transport, v: &dyn Vault) -> Result<(), &'static str> {
    if !b.payments_on() { return Err("paymentsOff"); }
    let s = load(v).map_err(|_| "keychain")?.ok_or("noKey")?;
    match read_deactivate(t.post_json(&format!("{}/licenses/deactivate", b.api), &deactivate_body(&s.key, &s.instance))) {
        Answer::Valid | Answer::NotFound | Answer::NotActive => if v.delete(ACCOUNT) { Ok(()) } else { Err("keychain") },
        _ => Err("unreachable"),
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    /// A Keychain in memory.
    #[derive(Default)]
    pub struct Mem { pub items: RefCell<BTreeMap<String, String>>, pub broken: bool }
    impl Vault for Mem {
        fn get(&self, a: &str) -> Result<Option<String>, ()> { if self.broken { Err(()) } else { Ok(self.items.borrow().get(a).cloned()) } }
        fn set(&self, a: &str, v: &str) -> Result<(), ()> { if self.broken { return Err(()); } self.items.borrow_mut().insert(a.into(), v.into()); Ok(()) }
        fn delete(&self, a: &str) -> bool { self.items.borrow_mut().remove(a); true }
    }
    /// A Keychain no call may reach.
    pub struct NoVault;
    impl Vault for NoVault {
        fn get(&self, _: &str) -> Result<Option<String>, ()> { panic!("the Keychain was read") }
        fn set(&self, _: &str, _: &str) -> Result<(), ()> { panic!("the Keychain was written") }
        fn delete(&self, _: &str) -> bool { panic!("the Keychain was changed") }
    }
    /// Dodo, played back: each call takes the next answer and is recorded.
    #[derive(Default)]
    pub struct Fake { pub answers: RefCell<Vec<Option<(u16, String)>>>, pub calls: RefCell<Vec<(String, String)>> }
    impl Fake { pub fn with(a: Vec<Option<(u16, &str)>>) -> Fake { Fake { answers: RefCell::new(a.into_iter().rev().map(|x| x.map(|(c, b)| (c, b.to_string()))).collect()), calls: RefCell::new(vec![]) } } }
    impl Transport for Fake {
        fn post_json(&self, url: &str, body: &str) -> Option<(u16, String)> { self.calls.borrow_mut().push((url.into(), body.into())); self.answers.borrow_mut().pop().flatten() }
    }
    /// A network no call may reach.
    pub struct NoNet;
    impl Transport for NoNet { fn post_json(&self, _: &str, _: &str) -> Option<(u16, String)> { panic!("the network was used") } }

    pub fn on() -> Billing {
        let mut b = parse_billing(TEST_FILE, Mode::Test).unwrap();
        b.switch_on = true; b.monthly = "pdt_month".into(); b.yearly = "pdt_year".into(); b.business_id = "bus_1".into(); b.checkout = "https://test.checkout.dodopayments.com".into();
        b
    }
    const KEY: &str = "SQB-1A2B-3C4D-5E6F-WXYZ";
    /// Dodo's own error answers are JSON with a code and a message ([verify] V1 their exact shape).
    const DODO_403: &str = "{\"code\":\"FORBIDDEN\",\"message\":\"License key is not active\"}";
    const DODO_404: &str = "{\"code\":\"NOT_FOUND\",\"message\":\"License key not found\"}";
    const T0: u64 = 1_793_000_000;
    fn activated(product: &str) -> String {
        json!({ "id": "lki_123", "business_id": "bus_1", "created_at": "2026-10-31T00:00:00Z", "license_key_id": "lic_9", "name": "x",
            "customer": { "customer_id": "cus_1", "email": "rishabh@gmail.com", "name": "Rishabh K", "phone_number": "+91 99999 00000" },
            "product": { "product_id": product, "name": "Pro Monthly" } }).to_string()
    }
    fn stored(last_ok: u64) -> Stored { Stored { key: KEY.into(), instance: "lki_123".into(), product: "pdt_month".into(), email: "rishabh@gmail.com".into(), last_ok, latest_seen: last_ok, last_try: last_ok, inactive_since: None } }

    // ----- the settings files -----

    #[test]
    fn both_shipped_files_parse_with_payments_off_and_no_ids_invented() {
        for (text, mode) in [(TEST_FILE, Mode::Test), (LIVE_FILE, Mode::Live)] {
            let b = parse_billing(text, mode).unwrap_or_else(|| panic!("{mode:?} file is refused"));
            assert!(!b.switch_on && !b.payments_on(), "{mode:?}: payments stay off until the founder switches them on");
            assert!(b.monthly.is_empty() && b.yearly.is_empty() && b.business_id.is_empty() && b.redirect.is_empty(), "{mode:?}: ids come from the founder's Dodo dashboard");
        }
        let t = parse_billing(TEST_FILE, Mode::Test).unwrap();
        assert_eq!((t.api.as_str(), t.portal.as_str(), t.checkout.as_str()), ("https://test.dodopayments.com", "https://test.customer.dodopayments.com", ""), "the test checkout host is not documented (V0)");
        let l = parse_billing(LIVE_FILE, Mode::Live).unwrap();
        assert_eq!((l.api.as_str(), l.checkout.as_str(), l.portal.as_str()), ("https://live.dodopayments.com", "https://checkout.dodopayments.com", "https://customer.dodopayments.com"));
        assert_eq!(billing().mode, Mode::Test, "a test build reads the test file");
        assert!(!billing().payments_on());
    }
    #[test]
    fn no_live_file_holds_a_test_host_and_no_test_file_a_live_host() {
        let with = |text: &str, key: &str, val: &str| { let mut v: Value = serde_json::from_str(text).unwrap(); v[key] = json!(val); v.to_string() };
        for key in ["apiHost", "checkoutHost", "portalHost"] {
            for h in ["https://test.dodopayments.com", "https://test.customer.dodopayments.com", "https://checkout.test.dodopayments.com"] {
                assert!(parse_billing(&with(LIVE_FILE, key, h), Mode::Live).is_none(), "live {key} = {h}");
            }
            for h in LIVE_HOSTS { assert!(parse_billing(&with(TEST_FILE, key, &format!("https://{h}")), Mode::Test).is_none(), "test {key} = {h}"); }
            assert!(parse_billing(&with(TEST_FILE, key, "https://example.com"), Mode::Test).is_none(), "a test file names only test hosts");
        }
        assert!(parse_billing(&with(LIVE_FILE, "redirectUrl", "https://test.example.com/thanks"), Mode::Live).is_none());
        // The shipped files, host by host.
        for h in [&parse_billing(LIVE_FILE, Mode::Live).unwrap().api, &parse_billing(LIVE_FILE, Mode::Live).unwrap().checkout, &parse_billing(LIVE_FILE, Mode::Live).unwrap().portal] { assert!(!is_test_host(https_host(h).unwrap())); }
        let t = parse_billing(TEST_FILE, Mode::Test).unwrap();
        for h in [&t.api, &t.portal] { let h = https_host(h).unwrap(); assert!(is_test_host(h) && !is_live_host(h)); }
    }
    #[test]
    fn every_address_must_be_https_and_the_mode_must_match_the_build() {
        let with = |key: &str, val: &str| { let mut v: Value = serde_json::from_str(TEST_FILE).unwrap(); v[key] = json!(val); v.to_string() };
        for bad in ["http://test.dodopayments.com", "test.dodopayments.com", "https://test.dodopayments.com/api", "https://user@test.dodopayments.com", "https://test.dodopayments.com:8443", "https://test.dodo payments.com", "ftp://test.x", "https://"] {
            assert!(parse_billing(&with("apiHost", bad), Mode::Test).is_none(), "{bad}");
        }
        assert!(parse_billing(&with("redirectUrl", "http://x.test.example/thanks"), Mode::Test).is_none());
        assert!(parse_billing(&with("redirectUrl", "squibby://pro"), Mode::Test).is_none(), "phase 2 only");
        assert!(parse_billing(&with("apiHost", "https://test.dodopayments.com/"), Mode::Test).is_some(), "a trailing slash is fine");
        assert!(parse_billing(TEST_FILE, Mode::Live).is_none() && parse_billing(LIVE_FILE, Mode::Test).is_none(), "each build reads only its own mode");
        assert!(parse_billing("{", Mode::Test).is_none() && parse_billing("", Mode::Live).is_none());
        assert!(parse_billing(&with("extra", "x"), Mode::Test).is_none(), "an unknown setting is refused");
        let mut v: Value = serde_json::from_str(TEST_FILE).unwrap(); v["products"]["monthly"] = json!("pdt_1/../x"); assert!(parse_billing(&v.to_string(), Mode::Test).is_none());
    }
    #[test]
    fn payments_switched_on_without_a_product_or_an_api_host_stay_off() {
        let mut b = on(); assert!(b.payments_on());
        b.monthly.clear(); b.yearly.clear(); assert!(!b.payments_on(), "nothing to sell: fail open");
        let mut b = on(); b.api.clear(); assert!(!b.payments_on());
        let mut b = on(); b.switch_on = false; assert!(!b.payments_on());
    }
    #[test]
    fn checkout_and_portal_open_dodos_own_pages_and_are_calm_when_not_ready() {
        let b = on();
        assert_eq!(checkout_url(&b, Term::Yearly).unwrap(), "https://test.checkout.dodopayments.com/buy/pdt_year?quantity=1");
        let mut r = on(); r.redirect = "https://example.test/thanks?a=1".into();
        assert_eq!(checkout_url(&r, Term::Monthly).unwrap(), "https://test.checkout.dodopayments.com/buy/pdt_month?quantity=1&redirect_url=https%3A%2F%2Fexample.test%2Fthanks%3Fa%3D1");
        assert_eq!(portal_url(&b).unwrap(), "https://test.customer.dodopayments.com/login/bus_1");
        let mut n = on(); n.checkout.clear(); assert_eq!(checkout_url(&n, Term::Yearly), Err("notReady"));
        let mut n = on(); n.yearly.clear(); assert_eq!(checkout_url(&n, Term::Yearly), Err("notReady")); assert!(checkout_url(&n, Term::Monthly).is_ok());
        let mut n = on(); n.business_id.clear(); assert_eq!(portal_url(&n), Err("notReady"));
        let off = parse_billing(TEST_FILE, Mode::Test).unwrap();
        assert_eq!((checkout_url(&off, Term::Yearly), portal_url(&off)), (Err("paymentsOff"), Err("paymentsOff")));
        assert_eq!((Term::from_word("yearly"), Term::from_word("monthly"), Term::from_word("weekly")), (Some(Term::Yearly), Some(Term::Monthly), None));
    }

    // ----- requests -----

    #[test]
    fn the_request_bodies_carry_only_the_key_the_instance_name_and_the_instance_id() {
        let a: Value = serde_json::from_str(&activate_body(KEY, "Squibby Mac AB12")).unwrap();
        assert_eq!(a, json!({ "license_key": KEY, "name": "Squibby Mac AB12" }));
        assert_eq!(serde_json::from_str::<Value>(&validate_body(KEY, "lki_1")).unwrap(), json!({ "license_key": KEY, "license_key_instance_id": "lki_1" }));
        assert_eq!(serde_json::from_str::<Value>(&deactivate_body(KEY, "lki_1")).unwrap(), json!({ "license_key": KEY, "license_key_instance_id": "lki_1" }));
        // Quotes in a key cannot break the JSON.
        assert_eq!(serde_json::from_str::<Value>(&activate_body("a\"b", "n")).unwrap()["license_key"], "a\"b");
    }
    #[test]
    fn the_instance_name_is_the_product_mac_and_four_random_characters_never_the_macs_name() {
        let n = instance_name([0, 1, 31, 200]);
        let product = crate::names::product();
        let rest = n.strip_prefix(&format!("{product} Mac ")).unwrap_or_else(|| panic!("{n}"));
        assert!(rest.len() == 4 && rest.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()), "{n}");
        assert!(instance_name(random4()).starts_with(&format!("{product} Mac ")));
        // The code reads no machine name, and names no product itself (rule 21).
        let src = include_str!("license.rs"); let code = &src[..src.find("#[cfg(test)]\npub mod tests").unwrap()];
        for never in ["scutil", "ComputerName", "hostname", "gethostname", "LocalHostName"] { assert!(!code.contains(never), "{never}"); }
        assert!(!code.contains(product), "the product's name comes from protocol/names.json");
    }
    #[test]
    fn the_key_goes_on_curls_standard_input_never_its_command_line() {
        let args = curl_args("https://test.dodopayments.com/licenses/activate");
        assert_eq!(args[0], "-q", "a ~/.curlrc is not read");
        assert!(args.windows(2).any(|w| w[0] == "--data-binary" && w[1] == "@-"));
        assert!(args.windows(2).any(|w| w[0] == "--proto" && w[1] == "=https"));
        assert!(!args.iter().any(|a| a.contains(KEY) || a.contains("license_key")));
        let src = include_str!("license.rs");
        let post = &src[src.find("pub fn post_json_with").unwrap()..]; let post = &post[..post.find("\n}\n").unwrap()];
        assert!(post.contains(".args(curl_args(url))") && post.contains("write_all(body.as_bytes())"), "{post}");
        assert!(post.contains("stderr(std::process::Stdio::null())"));
        assert_eq!(read_curl("{\"valid\":true}\n200"), Some((200, "{\"valid\":true}".into())));
        assert_eq!(read_curl("\n000"), None);
        assert_eq!(read_curl(""), None);
        assert_eq!(read_curl("a\nb\n404"), Some((404, "a\nb".into())));
        assert_eq!(Curl.post_json("http://test.dodopayments.com/x", "{}"), None, "never a plain http address");
    }
    #[test]
    fn the_license_request_never_gives_curl_the_apps_environment() {
        // The key travels on curl's standard input, so curl must not be steered by what another program set for the session
        // (a TLS key log, another CA file, a proxy, a settings folder). A stand in prints its environment as the answer body.
        let dir = std::env::temp_dir().join(format!("license-curl-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("curl");
        std::fs::write(&fake, "#!/bin/sh\ncat >/dev/null\nfor a in \"$@\"; do echo \"arg:$a\"; done\n/usr/bin/env\nprintf '\\n200'\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(std::env::var_os("HOME").is_some(), "the test itself has a home folder to leak");
        let (code, out) = post_json_with(fake.to_str().unwrap(), "https://test.dodopayments.com/licenses/validate", "{}").unwrap();
        assert_eq!(code, 200);
        assert_eq!(out.lines().next(), Some("arg:-q"), "{out}");
        let env: Vec<&str> = out.lines().filter(|l| !l.starts_with("arg:") && l.contains('=')).collect(); // curl's -w argument holds a newline, so one echoed argument spans two lines
        // Failure messages name the variables only, never their values (the test's own environment can hold secrets).
        let names: Vec<&str> = env.iter().map(|l| l.split('=').next().unwrap_or("")).collect();
        assert!(env.contains(&"PATH=/usr/bin:/bin"), "{names:?}");
        for k in ["HOME", "CURL_HOME", "XDG_CONFIG_HOME", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "SSL_CERT_FILE", "CURL_CA_BUNDLE", "SSLKEYLOGFILE"] {
            assert!(!names.contains(&k), "{k} reached curl: {names:?}");
        }
        // Only what the shell running the stand in adds itself may be there besides PATH.
        assert!(names.iter().all(|n| ["PATH", "PWD", "SHLVL", "_"].contains(n)), "{names:?}");
        assert_eq!(post_json_with(fake.to_str().unwrap(), "http://test.dodopayments.com/x", "{}"), None, "never a plain http address");
        let _ = std::fs::remove_dir_all(&dir);
    }
    #[test]
    fn a_key_that_does_not_look_like_one_is_refused_without_repeating_it() {
        assert_eq!(key_ok(&format!("  {KEY}\n")).unwrap(), KEY);
        for bad in ["", "abc", "has space in it", "key;rm -rf ~", &"x".repeat(200)] { assert_eq!(key_ok(bad), Err("keyShape"), "{bad:?}"); }
    }

    // ----- answers -----

    #[test]
    fn each_activate_answer_is_read() {
        let a = read_activate(Some((201, activated("pdt_month"))));
        assert_eq!(a, Answer::Activated(Activation { instance: "lki_123".into(), product: "pdt_month".into(), email: "rishabh@gmail.com".into() }));
        assert_eq!(read_activate(Some((403, DODO_403.into()))), Answer::NotActive);
        assert_eq!(read_activate(Some((404, DODO_404.into()))), Answer::NotFound);
        assert_eq!(read_activate(Some((422, "{\"message\":\"limit\"}".into()))), Answer::LimitReached);
        assert_eq!(read_activate(Some((201, "{}".into()))), Answer::Unknown, "no instance: nothing to keep");
        assert_eq!(read_activate(Some((201, "not json".into()))), Answer::Unknown);
    }
    #[test]
    fn each_validate_answer_is_read() {
        assert_eq!(read_validate(Some((200, "{\"valid\":true}".into()))), Answer::Valid);
        assert_eq!(read_validate(Some((200, "{\"valid\":false}".into()))), Answer::NotActive);
        assert_eq!(read_validate(Some((403, DODO_403.into()))), Answer::NotActive);
        assert_eq!(read_validate(Some((404, DODO_404.into()))), Answer::NotFound);
        assert_eq!(read_validate(Some((200, "{}".into()))), Answer::Unknown);
    }
    #[test]
    fn network_failures_5xx_and_429_are_unknown_never_invalid() {
        for reply in [None, Some((500, "".to_string())), Some((502, "<html>".to_string())), Some((503, "".to_string())), Some((429, "{\"valid\":false}".to_string())), Some((401, "".to_string())), Some((302, "".to_string()))] {
            assert_eq!(read_validate(reply.clone()), Answer::Unknown, "{reply:?}");
            assert_eq!(read_activate(reply.clone()), Answer::Unknown, "{reply:?}");
            assert_eq!(read_deactivate(reply.clone()), Answer::Unknown, "{reply:?}");
        }
        // And an unknown answer never changes the plan.
        let mut s = stored(T0);
        apply_validate(&mut s, &Answer::Unknown, T0 + DAY);
        assert_eq!((s.last_ok, s.inactive_since, key_check(&s, T0 + DAY)), (T0, None, KeyCheck::Ok));
    }

    // ----- deciding and grace -----

    #[test]
    fn grace_day_9_shows_nothing_day_10_warns_day_14_sends_new_tasks_to_free_and_a_success_resets_it() {
        let s = stored(T0);
        assert_eq!(key_check(&s, T0 + 9 * DAY + DAY - 1), KeyCheck::Ok, "day 9");
        assert_eq!(decide(true, Some(&s), None, T0 + 9 * DAY).state, State::Pro);
        assert_eq!(key_check(&s, T0 + 10 * DAY), KeyCheck::Overdue);
        assert_eq!(decide(true, Some(&s), None, T0 + 10 * DAY), Decision { plan: Plan::Pro, state: State::ProOverdue, trial_ends_at: None }, "still Pro, with the warning");
        assert_eq!(key_check(&s, T0 + 14 * DAY - 1), KeyCheck::Overdue);
        assert_eq!(decide(true, Some(&s), None, T0 + 14 * DAY), Decision { plan: Plan::Free, state: State::ProOffline, trial_ends_at: None });
        let mut back = s.clone();
        apply_validate(&mut back, &Answer::Valid, T0 + 15 * DAY);
        assert_eq!(key_check(&back, T0 + 15 * DAY), KeyCheck::Ok);
        assert_eq!(decide(true, Some(&back), None, T0 + 15 * DAY).plan, Plan::Pro);
        assert_eq!(key_check(&back, T0 + 24 * DAY), KeyCheck::Ok, "the clock starts again from the success");
    }
    #[test]
    fn grace_counts_from_the_later_of_the_clock_and_the_latest_time_seen() {
        let mut s = stored(T0);
        apply_validate(&mut s, &Answer::Unknown, T0 + 12 * DAY);   // seen on day 12, no answer
        assert_eq!(key_check(&s, T0 + DAY), KeyCheck::Overdue, "turning the clock back to day 1 does not make the check newer");
    }
    #[test]
    fn an_inactive_key_is_kept_rechecked_daily_for_30_days_and_comes_back_on_valid_true() {
        let mut s = stored(T0);
        apply_validate(&mut s, &Answer::NotActive, T0 + DAY);
        assert_eq!(s.inactive_since, Some(T0 + DAY));
        assert_eq!(decide(true, Some(&s), None, T0 + DAY), Decision { plan: Plan::Free, state: State::Inactive, trial_ends_at: None });
        assert!(!check_due(&s, T0 + DAY + 3600, 0), "not again within the day");
        assert!(check_due(&s, T0 + 2 * DAY, u64::MAX), "once a day, whatever the 12 hour clock says");
        apply_validate(&mut s, &Answer::NotActive, T0 + 2 * DAY);
        assert_eq!(s.inactive_since, Some(T0 + DAY), "inactive since the first answer");
        assert!(check_due(&s, T0 + 30 * DAY, 0));
        assert!(!check_due(&s, T0 + 32 * DAY, 0), "30 days, then only Check again");
        assert_eq!(tick(true, Some(&s), None, T0 + 32 * DAY, 0), Tick::Stop);
        apply_validate(&mut s, &Answer::Valid, T0 + 20 * DAY);
        assert_eq!(decide(true, Some(&s), None, T0 + 20 * DAY).plan, Plan::Pro);
        // 404 on validate is a definite answer too: the key is kept, marked inactive.
        let mut g = stored(T0); apply_validate(&mut g, &Answer::NotFound, T0); assert_eq!(key_check(&g, T0), KeyCheck::Inactive);
    }
    #[test]
    fn regular_checks_come_every_12_hours_with_up_to_half_an_hour_either_way() {
        for r in [0u32, 1, 1800, 3600, u32::MAX, 123_456] {
            let n = next_check_at(T0, r);
            assert!(n >= T0 + CHECK_EVERY - JITTER && n <= T0 + CHECK_EVERY + JITTER, "{r}");
        }
        let s = stored(T0);
        assert!(check_due(&s, T0, 0), "the first check after launch");
        let next = next_check_at(T0, 7);
        assert!(!check_due(&s, T0 + 3600, next) && check_due(&s, next, next));
    }
    #[test]
    fn the_timer_runs_only_with_payments_on_and_a_key_or_a_trial_to_end_and_reaches_dodo_only_for_a_key() {
        let s = stored(T0);
        assert_eq!(tick(false, Some(&s), None, T0, 0), Tick::Stop);
        assert_eq!(tick(true, None, None, T0, 0), Tick::Stop);
        assert_eq!(tick(true, Some(&s), None, T0, 0), Tick::Check);
        assert_eq!(tick(true, Some(&s), None, T0, T0 + 10), Tick::Wait);
        let t = crate::trial::Trial { started_at: T0, latest_seen: T0 };
        assert_eq!(tick(true, None, Some(&t), T0, 0), Tick::Wait, "no key: no check, only the trial's end to notice");
        assert_eq!(tick(true, None, Some(&t), T0 + crate::trial::LENGTH, 0), Tick::Wait, "the end is news for a week: the pages hear it");
        assert_eq!(tick(true, None, Some(&t), T0 + crate::trial::LENGTH + TRIAL_ENDED_NEWS, 0), Tick::Stop);
        assert_eq!(tick(false, None, Some(&t), T0, 0), Tick::Stop);
    }
    #[test]
    fn a_running_trial_is_the_plan_until_a_key_checks_out_and_an_ended_one_says_so() {
        let t = crate::trial::Trial { started_at: T0, latest_seen: T0 };
        assert_eq!(decide(true, None, Some(&t), T0 + DAY), Decision { plan: Plan::Trial, state: State::Trial, trial_ends_at: Some(T0 + crate::trial::LENGTH) });
        assert_eq!(decide(true, None, Some(&t), T0 + crate::trial::LENGTH), Decision { plan: Plan::Free, state: State::TrialEnded, trial_ends_at: None });
        assert_eq!(decide(true, Some(&stored(T0)), Some(&t), T0 + DAY).plan, Plan::Pro);
        let mut off = stored(T0); off.inactive_since = Some(T0);
        assert_eq!(decide(true, Some(&off), Some(&t), T0 + DAY).plan, Plan::Trial, "a key not active does not end a running trial");
        assert_eq!(decide(true, None, None, T0), Decision { plan: Plan::Free, state: State::Free, trial_ends_at: None });
    }

    // ----- payments off: exactly as before Pro existed -----

    #[test]
    fn with_payments_off_nothing_reaches_dodo_or_the_keychain_and_nothing_is_gated() {
        let b = parse_billing(TEST_FILE, Mode::Test).unwrap();
        assert!(!b.payments_on());
        assert_eq!(activate(&b, &NoNet, &NoVault, KEY, "n", T0).unwrap_err(), "paymentsOff");
        assert_eq!(check(&b, &NoNet, &NoVault, T0).unwrap_err(), "paymentsOff");
        assert_eq!(deactivate(&b, &NoNet, &NoVault).unwrap_err(), "paymentsOff");
        assert_eq!(crate::trial::start(&NoVault, false, false, T0).unwrap_err(), "paymentsOff");
        assert_eq!(decide(false, Some(&stored(T0)), None, T0), Decision { plan: Plan::Free, state: State::Off, trial_ends_at: None });
        assert_eq!(status_json(&b, None, None, T0), off_status());
        assert_eq!(off_status()["paymentsOn"], false);
        assert_eq!(tick(false, Some(&stored(T0)), None, T0, 0), Tick::Stop, "no timer");
        let line = crate::runner::plan_state_line(&decide(false, None, None, T0), false, "p1");
        assert_eq!(line["paymentsOn"], false, "the engine gates nothing");
        assert_eq!(crate::wipe::pro_inventory(false, || panic!("looked"), || panic!("looked")), Value::Null, "no Pro question on Delete everything");
    }

    // ----- the flows -----

    #[test]
    fn activating_keeps_the_key_the_instance_the_product_and_the_email_and_drops_name_and_phone() {
        let (b, v) = (on(), Mem::default());
        let net = Fake::with(vec![Some((201, &activated("pdt_month")))]);
        let s = activate(&b, &net, &v, &format!(" {KEY} "), "Squibby Mac AB12", T0).unwrap();
        assert_eq!((s.instance.as_str(), s.product.as_str(), s.email.as_str(), s.last_ok), ("lki_123", "pdt_month", "rishabh@gmail.com", T0));
        let kept = v.items.borrow().get(ACCOUNT).cloned().unwrap();
        assert!(!kept.contains("Rishabh K") && !kept.contains("99999") && !kept.contains("phone") && !kept.contains("cus_1"), "{kept}");
        assert_eq!(Stored::from_json(&kept).unwrap(), s);
        let calls = net.calls.borrow();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "https://test.dodopayments.com/licenses/activate");
        assert!(!calls[0].0.contains(KEY), "never in an address");
        assert_eq!(decide(true, Some(&s), None, T0).plan, Plan::Pro);
    }
    #[test]
    fn a_wrong_product_is_refused_given_back_at_once_and_nothing_is_kept() {
        let (b, v) = (on(), Mem::default());
        let net = Fake::with(vec![Some((201, &activated("pdt_other_app"))), Some((200, "{}"))]);
        assert_eq!(activate(&b, &net, &v, KEY, "n", T0), Err("wrongProduct"));
        assert!(v.items.borrow().is_empty());
        let calls = net.calls.borrow();
        assert_eq!(calls[1].0, "https://test.dodopayments.com/licenses/deactivate");
        assert_eq!(serde_json::from_str::<Value>(&calls[1].1).unwrap()["license_key_instance_id"], "lki_123");
    }
    #[test]
    fn activation_refusals_store_nothing_and_say_why_in_a_word() {
        for (reply, why) in [(Some((404, DODO_404)), "notFound"), (Some((422, "{}")), "limit"), (Some((403, DODO_403)), "inactive"), (None, "unreachable"), (Some((503, "")), "unreachable"), (Some((429, "")), "unreachable"), (Some((403, "<html>")), "unreachable"), (Some((404, "")), "unreachable")] {
            let v = Mem::default();
            assert_eq!(activate(&on(), &Fake::with(vec![reply]), &v, KEY, "n", T0), Err(why), "{reply:?}");
            assert!(v.items.borrow().is_empty(), "{why}");
            assert!(REASONS.contains(&why));
        }
        assert_eq!(activate(&on(), &NoNet, &Mem::default(), "bad key!", "n", T0), Err("keyShape"), "checked before the network");
        let mut none = on(); none.monthly.clear(); none.yearly.clear(); none.switch_on = true;
        assert_eq!(activate(&none, &NoNet, &NoVault, KEY, "n", T0), Err("paymentsOff"), "nothing to sell");
        assert_eq!(activate(&on(), &NoNet, &Mem { broken: true, ..Default::default() }, KEY, "n", T0), Err("keychain"));
    }
    #[test]
    fn a_new_key_replaces_the_old_one_and_the_old_activation_is_let_go() {
        let (b, v) = (on(), Mem::default());
        let mut old = stored(T0); old.key = "OLD-KEY-1234".into(); old.instance = "lki_old".into(); old.inactive_since = Some(T0);
        v.set(ACCOUNT, &old.to_json()).unwrap();
        let net = Fake::with(vec![Some((201, &activated("pdt_year"))), Some((200, "{}"))]);
        let s = activate(&b, &net, &v, KEY, "n", T0 + DAY).unwrap();
        assert_eq!((s.key.as_str(), s.inactive_since), (KEY, None));
        let calls = net.calls.borrow();
        assert!(calls[1].0.ends_with("/licenses/deactivate") && calls[1].1.contains("lki_old"));
    }
    #[test]
    fn check_now_applies_dodos_answer_and_keeps_the_key_through_a_failure() {
        let (b, v) = (on(), Mem::default());
        v.set(ACCOUNT, &stored(T0).to_json()).unwrap();
        assert_eq!(check(&b, &Fake::with(vec![None]), &v, T0 + DAY).unwrap().last_ok, T0, "no answer: nothing changes but the try");
        let s = check(&b, &Fake::with(vec![Some((200, "{\"valid\":false}"))]), &v, T0 + 2 * DAY).unwrap();
        assert_eq!(s.inactive_since, Some(T0 + 2 * DAY));
        assert!(load(&v).unwrap().is_some(), "an inactive key is kept");
        let net = Fake::with(vec![Some((200, "{\"valid\":true}"))]);
        let s = check(&b, &net, &v, T0 + 3 * DAY).unwrap();
        assert_eq!((s.inactive_since, s.last_ok), (None, T0 + 3 * DAY));
        assert_eq!(net.calls.borrow()[0].0, "https://test.dodopayments.com/licenses/validate");
        assert_eq!(check(&b, &NoNet, &Mem::default(), T0), Err("noKey"));
    }
    #[test]
    fn use_pro_on_another_mac_lets_go_at_dodo_then_deletes_and_keeps_the_key_without_an_answer() {
        let (b, v) = (on(), Mem::default());
        v.set(ACCOUNT, &stored(T0).to_json()).unwrap();
        assert_eq!(deactivate(&b, &Fake::with(vec![None]), &v), Err("unreachable"));
        assert!(load(&v).unwrap().is_some(), "kept, so it can be tried again");
        let net = Fake::with(vec![Some((200, "{}"))]);
        assert_eq!(deactivate(&b, &net, &v), Ok(()));
        assert!(load(&v).unwrap().is_none());
        assert!(net.calls.borrow()[0].1.contains("lki_123"));
        assert_eq!(deactivate(&b, &NoNet, &v), Err("noKey"));
        // Dodo no longer knows it: gone here too.
        v.set(ACCOUNT, &stored(T0).to_json()).unwrap();
        assert_eq!(deactivate(&b, &Fake::with(vec![Some((404, DODO_404))]), &v), Ok(()));
        // A 404 that did not come from Dodo (a moved route, a proxy) keeps the key, so it can be tried again.
        v.set(ACCOUNT, &stored(T0).to_json()).unwrap();
        assert_eq!(deactivate(&b, &Fake::with(vec![Some((404, "<html>Not Found</html>"))]), &v), Err("unreachable"));
        assert!(load(&v).unwrap().is_some());
    }
    #[test]
    fn a_page_sees_the_last_four_characters_and_a_masked_email_never_the_key() {
        let b = on();
        let s = stored(T0);
        let v = status_json(&b, Some(&s), None, T0 + DAY);
        let text = v.to_string();
        assert!(!text.contains(KEY) && !text.contains("1A2B") && !text.contains("lki_123") && !text.contains("rishabh@"), "{text}");
        assert_eq!(v["key"]["last4"], "WXYZ");
        assert_eq!(v["key"]["email"], "r…@gmail.com");
        assert_eq!((v["plan"].as_str(), v["state"].as_str(), v["key"]["check"].as_str()), (Some("pro"), Some("pro"), Some("ok")));
        assert_eq!(v["checkout"], json!({ "yearly": true, "monthly": true }));
        assert_eq!(mask_email("nobody"), "");
        let t = crate::trial::Trial { started_at: T0, latest_seen: T0 };
        let v = status_json(&b, None, Some(&t), T0 + 5 * DAY);
        assert_eq!((v["state"].as_str(), v["trial"]["daysLeft"].as_u64(), v["trialUsed"].as_bool()), (Some("trial"), Some(9), Some(true)));
        assert_eq!(v["trial"]["endsAt"], iso(T0 + crate::trial::LENGTH));
    }
    #[test]
    fn times_are_written_the_way_the_engine_reads_them() {
        assert_eq!(iso(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(iso(1_793_000_000), "2026-10-26T07:33:20Z");
        assert_eq!(iso(4_107_542_399), "2100-02-28T23:59:59Z");
    }
    #[test]
    fn only_the_shell_reads_the_item_through_keystore_service_and_its_own_account() {
        assert_eq!(ACCOUNT, "pro-license");
        assert_eq!(crate::trial::ACCOUNT, "pro-trial");
        let src = include_str!("license.rs");
        assert!(src.contains("Keychain { service: crate::keystore::service() }"));
        // The engine and the log never see the key: neither is reached from this module.
        let code = &src[..src.find("#[cfg(test)]\npub mod tests").unwrap()];
        for never in ["crate::log(", "Runner", "send_line", "println!", "eprintln!"] { assert!(!code.contains(never), "{never}"); }
    }
    fn body_of<'a>(src: &'a str, head: &str) -> &'a str { let b = &src[src.find(head).unwrap_or_else(|| panic!("{head}"))..]; &b[..b.find("\n}\n").unwrap()] }
    #[test]
    fn with_payments_off_the_shell_starts_no_timer_reads_nothing_and_asks_nothing_on_delete_everything() {
        let main = include_str!("main.rs");
        let timer = body_of(main, "fn start_plan_timer(");
        assert!(timer.contains("if !license::billing().payments_on() || PRO_TIMER.swap(true, SeqCst) { return; }"), "{timer}");
        assert!(timer.find("payments_on()").unwrap() < timer.find("std::thread::spawn").unwrap(), "no thread with payments off");
        let now = body_of(main, "fn plan_now(");
        assert!(now.find("if !b.payments_on() { return (license::off_status()").unwrap() < now.find("pro_read()").unwrap(), "no Keychain look with payments off");
        let push = body_of(main, "fn plan_push(");
        assert!(push.contains("if on { let _ = a.emit(\"plan-status\""), "the pages hear nothing new with payments off");
        let inv = body_of(main, "async fn data_inventory(");
        assert!(inv.contains("wipe::pro_inventory(license::billing().payments_on(),"));
        // Every command the pages call goes through the functions above, which refuse with payments off before the network.
        for (cmd, via) in [("async fn license_activate(", "license::activate("), ("async fn license_check_now(", "license::check("), ("async fn license_deactivate(", "license::deactivate("), ("fn plan_open_checkout(", "license::checkout_url("), ("fn plan_open_portal(", "license::portal_url("), ("async fn trial_start(", "trial::start(")] {
            assert!(body_of(main, cmd).contains(via), "{cmd}");
        }
    }
    #[test]
    fn only_home_may_change_pro_and_every_command_is_registered() {
        let main = include_str!("main.rs");
        for cmd in ["async fn license_activate(", "async fn license_check_now(", "async fn license_deactivate(", "fn plan_open_checkout(", "fn plan_open_portal(", "async fn trial_start("] {
            let b = body_of(main, cmd);
            let gate = b.find("if settings::only_card(window.label()).is_err() { return Err(\"notCard\".into()); }").unwrap_or_else(|| panic!("{cmd}: no window check"));
            assert!(gate < b.find("license::").or(b.find("trial::")).unwrap(), "{cmd}: checked first");
        }
        let at = main.find("generate_handler![").unwrap(); let reg = &main[at..at + main[at..].find("])").unwrap()];
        for c in ["license_status", "license_activate", "license_check_now", "license_deactivate", "plan_open_checkout", "plan_open_portal", "trial_start"] { assert!(reg.contains(c), "{c}"); }
        // Logs carry only reason words, never the key.
        for line in main.lines().filter(|l| l.contains("log(\"pro_")) { assert!(!line.contains("key") || line.contains("key_check"), "{line}"); }
    }

    // ----- what the reviewers found (31 Oct 2026) -----

    #[test]
    fn a_403_or_404_that_did_not_come_from_dodo_is_unknown_and_never_turns_pro_off() {
        for body in ["", "<html><body>Access denied</body></html>", "Forbidden", "{}", "[]", "{\"code\":\"\"}", "{\"error\":\"blocked\"}", "null"] {
            for code in [403u16, 404] {
                let reply = Some((code, body.to_string()));
                assert_eq!(read_validate(reply.clone()), Answer::Unknown, "{code} {body:?}");
                assert_eq!(read_activate(reply.clone()), Answer::Unknown, "{code} {body:?}");
                assert_eq!(read_deactivate(reply), Answer::Unknown, "{code} {body:?}");
            }
        }
        assert!(from_dodo(DODO_403) && from_dodo("{\"message\":\"x\"}") && from_dodo("{\"code\":\"X\"}"));
        // Through the whole check: a firewall's 403 leaves a paying person on Pro.
        let (b, v) = (on(), Mem::default());
        v.set(ACCOUNT, &stored(T0).to_json()).unwrap();
        let s = check(&b, &Fake::with(vec![Some((403, "<html>"))]), &v, T0 + DAY).unwrap();
        assert_eq!((s.inactive_since, decide(true, Some(&s), None, T0 + DAY).plan), (None, Plan::Pro));
    }
    #[test]
    fn a_keychain_that_cannot_be_read_keeps_the_last_plan_and_the_timer_waits() {
        let b = on();
        let broken = Mem { broken: true, ..Default::default() };
        let mut anchor = None;
        let r = read(&broken, T0, 0, &mut anchor);
        assert!(r.is_err(), "a failed look is never \"no key\"");
        // Nothing decided yet: the calm keychain state, which gates nothing, and the engine is told nothing.
        let mut last = None;
        let (st, d) = plan_from(&b, Err(()), &mut last);
        assert_eq!((st["state"].as_str(), st["paymentsOn"].as_bool(), d), (Some("keychain"), Some(true), None));
        // A Pro person: decided once from a good look, then the Keychain fails.
        let good = Mem::default(); good.set(ACCOUNT, &stored(T0).to_json()).unwrap();
        let r = read(&good, T0 + DAY, 0, &mut None).unwrap();
        let (st, d) = plan_from(&b, Ok(&r), &mut last);
        assert_eq!((st["state"].as_str(), d.map(|d| d.plan)), (Some("pro"), Some(Plan::Pro)));
        let (st, d) = plan_from(&b, Err(()), &mut last);
        assert_eq!((st["state"].as_str(), st["plan"].as_str(), d), (Some("pro"), Some("pro"), None), "the last plan stays and nothing new is pushed");
        // The timer waits on a failed look; it never stops, and never checks.
        assert_eq!(tick_after(true, &Err(()), 0), Tick::Wait);
        assert_eq!(tick_after(false, &Err(()), 0), Tick::Stop);
        assert_eq!(tick_after(true, &read(&good, T0 + DAY, 0, &mut None), 0), Tick::Check);
        // A trial already used stays used when the look fails: Try Pro free is not offered.
        assert_eq!(keychain_status(&b)["trialUsed"], true);
        // Payments off: nothing is read at all.
        let off = parse_billing(TEST_FILE, Mode::Test).unwrap();
        assert_eq!(plan_from(&off, Err(()), &mut None).0, off_status());
    }
    #[test]
    fn turning_the_clock_back_neither_adds_days_nor_pauses_the_trial_or_the_grace() {
        // Day 13 of the trial, the clock set back 30 days, then 2 real days pass.
        let v = Mem::default();
        crate::trial::start(&v, true, false, T0).unwrap();
        let mut anchor = None;
        let r = read(&v, T0 + 13 * DAY, 0, &mut anchor).unwrap();
        assert_eq!(r.trial.as_ref().unwrap().days_left(r.now), 1);
        let back = T0 + 13 * DAY - 30 * DAY;
        let r = read(&v, back, 60, &mut anchor).unwrap();
        assert_eq!(r.trial.as_ref().unwrap().days_left(r.now), 1, "no days added");
        let r = read(&v, back + 2 * DAY, 60 + 2 * DAY, &mut anchor).unwrap();
        assert!(!r.trial.as_ref().unwrap().active(r.now), "it ended on time, in real time");
        assert_eq!(decide(true, None, r.trial.as_ref(), r.now).plan, Plan::Free);
        // After a relaunch (a new anchor) the latest time seen still holds, and real time moves it on.
        let mut fresh = None;
        let r = read(&v, back + 2 * DAY, 5, &mut fresh).unwrap();
        assert!(!r.trial.unwrap().active(r.now));
        // The grace clock too: a key checked on day 0, the clock set back, 15 real days pass.
        let k = Mem::default(); k.set(ACCOUNT, &stored(T0).to_json()).unwrap();
        let mut a = None;
        let _ = read(&k, T0, 0, &mut a).unwrap();
        let r = read(&k, T0 - 40 * DAY, 15 * DAY, &mut a).unwrap();
        assert_eq!(key_check(r.key.as_ref().unwrap(), r.now), KeyCheck::Offline);
        // The steady clock follows a later wall clock at once.
        let mut a = None;
        assert_eq!(steady_now(&mut a, T0, 0, 100), T0);
        assert_eq!(steady_now(&mut a, T0 + 50, 0, 110), T0 + 50);
        assert_eq!(steady_now(&mut a, T0 - 999, 0, 120), T0 + 60);
    }
    #[test]
    fn a_fresh_key_after_the_clock_was_set_back_starts_with_a_fresh_check_not_in_grace() {
        let (b, v) = (on(), Mem::default());
        let mut old = stored(T0 + 20 * DAY); old.key = "OLD-KEY-1234".into(); old.instance = "lki_old".into();
        v.set(ACCOUNT, &old.to_json()).unwrap();
        let s = activate(&b, &Fake::with(vec![Some((201, &activated("pdt_year"))), Some((200, "{}"))]), &v, KEY, "n", T0).unwrap();
        assert_eq!((s.last_ok, s.latest_seen, s.last_try), (T0 + 20 * DAY, T0 + 20 * DAY, T0 + 20 * DAY));
        assert_eq!(key_check(&s, T0), KeyCheck::Ok);
        assert_eq!(decide(true, Some(&s), None, T0).state, State::Pro);
    }
    #[test]
    fn the_trial_end_is_said_for_a_week_then_the_card_is_the_plain_free_one_and_the_timer_wakes_for_the_end() {
        let t = crate::trial::Trial { started_at: T0, latest_seen: T0 };
        let end = t.ends_at();
        assert_eq!(decide(true, None, Some(&t), end).state, State::TrialEnded);
        assert_eq!(decide(true, None, Some(&t), end + TRIAL_ENDED_NEWS - 1).state, State::TrialEnded);
        assert_eq!(decide(true, None, Some(&t), end + 30 * DAY), Decision { plan: Plan::Free, state: State::Free, trial_ends_at: None });
        let st = status_json(&on(), None, Some(&t), end + 30 * DAY);
        assert_eq!((st["state"].as_str(), st["trialUsed"].as_bool()), (Some("free"), Some(true)), "still used: never offered again");
        // The timer sleeps 15 minutes, or until just after a running trial ends.
        let r = |now: u64| Ok(Read { key: None, trial: Some(t.clone()), now });
        assert_eq!(sleep_for(&r(T0)), TICK_EVERY);
        assert_eq!(sleep_for(&r(end - 100)), 101);
        assert_eq!(sleep_for(&r(end)), TICK_EVERY);
        assert_eq!(sleep_for(&Err(())), TICK_EVERY);
    }
    #[test]
    fn the_shell_keeps_keychain_errors_apart_pushes_in_order_and_says_the_trial_end() {
        let main = include_str!("main.rs");
        let pro = &main[main.find("// ---------- Pro: the license key").unwrap()..main.find("// ---------- Draw it for me").unwrap()];
        assert!(!pro.contains(".ok().flatten()"), "a failed Keychain look is never taken for no key or no trial");
        let push = body_of(main, "fn plan_push(");
        let (lock_at, send_at, emit_at) = (push.find("let _one = pro_lock();").unwrap(), push.find("push_plan(").unwrap(), push.find("a.emit(\"plan-status\"").unwrap());
        assert!(lock_at < send_at && lock_at < emit_at && !push.contains("let (status, d) = { let _one"), "decided and sent under one lock");
        let timer = body_of(main, "fn start_plan_timer(");
        let stop = &timer[timer.find("license::Tick::Stop =>").unwrap()..];
        assert!(stop.find("plan_push(&a, false);").unwrap() < stop.find("return;").unwrap(), "the Stop path pushes once before it ends");
        assert!(timer.contains("license::tick_after(") && timer.contains("license::sleep_for(&r)"));
    }
    /// The real Keychain, under a throwaway service of its own (companion-test-*), never Squibby's own "companion" item.
    /// Run with --ignored.
    #[test]
    #[ignore]
    fn the_real_keychain_round_trip_uses_a_test_service_only() {
        let svc = format!("companion-test-pro-{}", std::process::id());
        let k = Keychain { service: svc.clone() };
        assert_ne!(k.service, crate::keystore::SERVICE);
        assert_eq!(k.get(ACCOUNT), Ok(None));
        k.set(ACCOUNT, &stored(T0).to_json()).unwrap();
        assert_eq!(load(&k).unwrap().unwrap(), stored(T0));
        assert!(k.delete(ACCOUNT));
        assert_eq!(k.get(ACCOUNT), Ok(None));
        assert!(k.delete(ACCOUNT), "nothing there is gone too");
    }
}
