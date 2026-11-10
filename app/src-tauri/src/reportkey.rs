//! M79: the one time "Is this safe to go live" report, sold through Dodo like Pro (T17) and switched off with it. A
//! purchase gives a Dodo license key for the report product (`products.report` in billing.*.json). Pasted on the Share
//! report panel, it is activated once and tied to the open project on this Mac: that project's report can then be saved
//! again whenever its checks change. A report key never turns on Pro, and a Pro key is never taken for a report key.
//!
//! The same rules as Pro: the key lives in the Keychain (`report-licenses`), never in a page, an address, a log or an error;
//! only Dodo's public activate endpoint is called (no API key); with payments off every function here refuses before it
//! touches the network or the Keychain, and saving a report works exactly as before (nothing is gated). The answer on
//! screen, the checks and the go live check are never sold: only saving the shareable file is, and only while payments
//! are on and the plan does not include it (Pro includes it: `PRO_INCLUDES_REPORT`, the founder's call to confirm).
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use crate::license::{activate_body, checkout_url, deactivate_body, key_ok, read_activate, Answer, Billing, Term, Transport, Vault};

/// The Keychain item that holds this Mac's report keys (service `keystore::service()`).
pub const ACCOUNT: &str = "report-licenses";
/// Pro (and its trial) include the report. [founder] to confirm; a paying person is never charged twice meanwhile.
pub const PRO_INCLUDES_REPORT: bool = true;
/// At most this many report keys are kept on one Mac.
pub const MAX_KEYS: usize = 200;

/// One activated report key. project: the folder it was bought for, as this Mac names it (kept only in the Keychain).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReportKey { pub key: String, pub instance: String, pub project: String, pub at: u64 }

pub fn load(v: &dyn Vault) -> Result<Vec<ReportKey>, ()> {
    Ok(v.get(ACCOUNT)?.as_deref().and_then(|t| serde_json::from_str::<Vec<ReportKey>>(t).ok()).unwrap_or_default())
}
/// Whether a report key on this Mac covers this project.
pub fn covered(v: &dyn Vault, project: &str) -> Result<bool, ()> { Ok(!project.is_empty() && load(v)?.iter().any(|k| k.project == project)) }

/// Whether saving the report may go ahead: always with payments off; with them on, when the plan includes it or a report
/// key covers this project. A Keychain that cannot be read never blocks (the caller passes covered true then).
pub fn save_allowed(payments_on: bool, plan_includes: bool, covered: bool) -> bool { !payments_on || plan_includes || covered }

/// What the Share report panel hears. With payments off: only `paymentsOn: false`, and the panel shows nothing new.
pub fn status_json(b: &Billing, plan_includes: bool, covered: bool) -> Value {
    if !b.payments_on() { return json!({ "paymentsOn": false, "needed": false, "checkout": false }); }
    json!({ "paymentsOn": true, "needed": !save_allowed(true, plan_includes, covered), "checkout": checkout_url(b, Term::Report).is_ok() })
}

/// Turn a pasted report key on for this project. Refused with no network call while payments are off or the report
/// product is not filled in. A key that is not the report product's is given back at once (wrongProduct), so it never
/// uses an activation. A key already used for another project here is refused (reportUsed); for the same project it is
/// already on.
pub fn activate(b: &Billing, t: &dyn Transport, v: &dyn Vault, raw: &str, project: &str, name: &str, now: u64) -> Result<(), &'static str> {
    if !b.payments_on() { return Err("paymentsOff"); }
    if b.report.is_empty() { return Err("notReady"); }
    if project.is_empty() { return Err("notCard"); }
    let key = key_ok(raw)?;
    let mut keys = load(v).map_err(|_| "keychain")?;
    if let Some(k) = keys.iter().find(|k| k.key == key) { return if k.project == project { Ok(()) } else { Err("reportUsed") }; }
    if keys.len() >= MAX_KEYS { return Err("keychain"); }
    let a = match read_activate(t.post_json(&format!("{}/licenses/activate", b.api), &activate_body(&key, name))) {
        Answer::Activated(a) => a,
        Answer::NotActive => return Err("inactive"),
        Answer::NotFound => return Err("notFound"),
        Answer::LimitReached => return Err("reportUsed"),
        _ => return Err("unreachable"),
    };
    if a.product != b.report {
        let _ = t.post_json(&format!("{}/licenses/deactivate", b.api), &deactivate_body(&key, &a.instance));
        return Err("wrongProduct");
    }
    keys.push(ReportKey { key, instance: a.instance, project: project.to_string(), at: now });
    let text = serde_json::to_string(&keys).map_err(|_| "keychain")?;
    if v.set(ACCOUNT, &text).is_err() {
        let k = keys.pop().expect("just pushed");
        let _ = t.post_json(&format!("{}/licenses/deactivate", b.api), &deactivate_body(&k.key, &k.instance));
        return Err("keychain");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::tests::{on, Fake, Mem, NoNet, NoVault};
    use crate::license::{parse_billing, Mode, TEST_FILE};

    const KEY: &str = "RPT-1A2B-3C4D-5E6F";
    fn sold() -> Billing { let mut b = on(); b.report = "pdt_report".into(); b }
    fn activated(product: &str) -> String { json!({ "id": "lki_r1", "product": { "product_id": product }, "customer": { "email": "a@b.c" } }).to_string() }

    #[test]
    fn with_payments_off_nothing_is_asked_nothing_is_read_and_saving_works_as_before() {
        let off = parse_billing(TEST_FILE, Mode::Test).unwrap();
        assert_eq!(activate(&off, &NoNet, &NoVault, KEY, "/p", "n", 1), Err("paymentsOff"));
        assert_eq!(status_json(&off, false, false), json!({ "paymentsOn": false, "needed": false, "checkout": false }));
        assert!(save_allowed(false, false, false), "nobody is gated while payments are off");
        assert_eq!(activate(&on(), &NoNet, &NoVault, KEY, "/p", "n", 1), Err("notReady"), "no report product filled in: not ready, nothing asked");
    }
    #[test]
    fn a_report_key_covers_its_own_project_only_and_never_turns_on_pro() {
        let (b, v) = (sold(), Mem::default());
        let t = Fake::with(vec![Some((201, &activated("pdt_report")))]);
        assert_eq!(activate(&b, &t, &v, &format!("  {KEY}\n"), "/Users/me/shop", "Squibby Mac AB12", 7), Ok(()));
        // Only the key and the made up name went to Dodo's public activate endpoint.
        let calls = t.calls.borrow();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "https://test.dodopayments.com/licenses/activate");
        assert!(!calls[0].1.contains("shop"), "the project never reaches Dodo");
        drop(calls);
        assert_eq!(covered(&v, "/Users/me/shop"), Ok(true));
        assert_eq!(covered(&v, "/Users/me/other"), Ok(false));
        assert!(v.items.borrow().get(crate::license::ACCOUNT).is_none(), "the Pro item is untouched");
        // The same key again: for the same project it is already on; for another it is refused, with no call.
        assert_eq!(activate(&b, &NoNet, &v, KEY, "/Users/me/shop", "n", 8), Ok(()));
        assert_eq!(activate(&b, &NoNet, &v, KEY, "/Users/me/other", "n", 8), Err("reportUsed"));
        assert_eq!(status_json(&b, false, true)["needed"], false);
        assert_eq!(status_json(&b, false, false)["needed"], true);
        assert_eq!(status_json(&b, PRO_INCLUDES_REPORT, false)["needed"], false, "Pro includes the report");
    }
    #[test]
    fn a_pro_key_is_not_a_report_key_and_its_activation_is_given_back() {
        let (b, v) = (sold(), Mem::default());
        let t = Fake::with(vec![Some((201, &activated("pdt_month"))), Some((200, "{}"))]);
        assert_eq!(activate(&b, &t, &v, KEY, "/p", "n", 1), Err("wrongProduct"));
        assert_eq!(t.calls.borrow()[1].0, "https://test.dodopayments.com/licenses/deactivate");
        assert_eq!(covered(&v, "/p"), Ok(false));
    }
    #[test]
    fn dodo_answers_and_a_failed_keychain() {
        let b = sold();
        for (reply, want) in [(None, "unreachable"), (Some((422, "{}")), "reportUsed"), (Some((404, "{\"code\":\"NOT_FOUND\",\"message\":\"x\"}")), "notFound"), (Some((403, "<html>")), "unreachable")] {
            let t = Fake::with(vec![reply.map(|(c, s)| (c, s))]);
            assert_eq!(activate(&b, &t, &Mem::default(), KEY, "/p", "n", 1), Err(want));
        }
        let broken = Mem { broken: true, ..Default::default() };
        assert_eq!(activate(&b, &NoNet, &broken, KEY, "/p", "n", 1), Err("keychain"));
        assert_eq!(activate(&b, &NoNet, &Mem::default(), "x", "/p", "n", 1), Err("keyShape"));
    }
}
