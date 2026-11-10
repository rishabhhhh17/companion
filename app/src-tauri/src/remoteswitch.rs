//! M79: the remote payments switch (the payments spec, section 14). Payments are on only when the build's own file says so
//! (`paymentsOn` in billing.*.json), the file can sell, AND this switch says `{"payments": true}` in so many words. Anything
//! else is off: no address, no answer, a timeout, a status that is not 200, a body that is not that JSON, a body too big.
//! Off means everyone keeps everything and no checkout shows to anyone (F25, rule 13).
//!
//! It is asked only when the file's own switch is on and the file names an address (`Billing::asks_remote`), so with
//! today's files (both off, no address) nothing is ever asked anywhere. It sends nothing about the person: a plain GET of
//! one https address, with no cookie, no key and no id, through the Mac's own curl with nothing of the app's environment.
//! The answer is read once as Squibby starts. A yes stays for this run; a later no is heard at the next start.
use std::sync::atomic::{AtomicBool, Ordering::SeqCst};

/// The largest answer read. The switch's answer is a few bytes.
pub const MAX_BODY: usize = 4096;

static YES: AtomicBool = AtomicBool::new(false);
/// Whether the switch said yes this run (license::billing reads it).
pub fn said_yes() -> bool { YES.load(SeqCst) }
fn set(yes: bool) { YES.store(yes, SeqCst); }

/// Whether an answer turns payments on: status 200 and a JSON object whose `payments` is the value true. Nothing else.
pub fn answer_says_on(reply: Option<(u16, String)>) -> bool {
    let Some((code, body)) = reply else { return false };
    if code != 200 || body.len() > MAX_BODY { return false; }
    serde_json::from_str::<serde_json::Value>(&body).ok().and_then(|v| v.as_object().and_then(|o| o.get("payments").cloned())) == Some(serde_json::Value::Bool(true))
}

/// One GET, replaceable so no test reaches the network.
pub trait Get { fn get(&self, url: &str) -> Option<(u16, String)>; }
/// The Mac's own curl: `-q` so no ~/.curlrc is read, https only, 10 seconds at most, no redirects followed.
pub struct Curl;
pub fn curl_args(url: &str) -> Vec<String> {
    ["-q", "-sS", "--proto", "=https", "--max-time", "10", "--max-filesize", "4096", "-H", "Accept: application/json", "-w", "\n%{http_code}", url].iter().map(|s| s.to_string()).collect()
}
impl Get for Curl {
    fn get(&self, url: &str) -> Option<(u16, String)> {
        crate::license::https_host(url)?;
        let out = std::process::Command::new("/usr/bin/curl").args(curl_args(url)).env_clear().env("PATH", "/usr/bin:/bin")
            .stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null()).output().ok()?;
        crate::license::read_curl(&String::from_utf8_lossy(&out.stdout))
    }
}

/// Ask the switch once, if this build may ask it at all, and remember the answer for this run. Gives whether payments are
/// on now. Never asks with the file's switch off or no address.
pub fn ask(b: &crate::license::Billing, net: &dyn Get) -> bool {
    if !b.asks_remote() { set(false); return false; }
    let yes = answer_says_on(net.get(&b.remote));
    set(yes);
    yes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::{parse_billing, Mode, LIVE_FILE, TEST_FILE};
    use std::cell::RefCell;

    struct Fake { answer: Option<(u16, String)>, asked: RefCell<Vec<String>> }
    impl Get for Fake { fn get(&self, url: &str) -> Option<(u16, String)> { self.asked.borrow_mut().push(url.into()); self.answer.clone() } }
    struct NoNet;
    impl Get for NoNet { fn get(&self, _: &str) -> Option<(u16, String)> { panic!("the network was used") } }
    fn file(on: bool, remote: &str) -> crate::license::Billing {
        let mut v: serde_json::Value = serde_json::from_str(TEST_FILE).unwrap();
        v["paymentsOn"] = serde_json::json!(on); v["remoteSwitchUrl"] = serde_json::json!(remote); v["products"]["monthly"] = serde_json::json!("pdt_month");
        parse_billing(&v.to_string(), Mode::Test).unwrap()
    }

    #[test]
    fn only_a_plain_yes_turns_payments_on() {
        assert!(answer_says_on(Some((200, "{\"payments\": true}".into()))));
        assert!(answer_says_on(Some((200, "{\"payments\":true,\"note\":\"x\"}".into()))));
        for (code, body) in [(200, "{\"payments\": \"true\"}"), (200, "{\"payments\": 1}"), (200, "{\"payments\": false}"), (200, "{}"), (200, "true"), (200, "<html>yes</html>"), (200, ""), (201, "{\"payments\": true}"), (302, "{\"payments\": true}"), (500, "{\"payments\": true}")] {
            assert!(!answer_says_on(Some((code, body.into()))), "{code} {body}");
        }
        assert!(!answer_says_on(None), "no answer is off");
        assert!(!answer_says_on(Some((200, format!("{{\"payments\": true, \"pad\": \"{}\"}}", "x".repeat(MAX_BODY))))), "too big is off");
    }
    #[test]
    fn todays_files_never_ask_and_stay_off() {
        for (text, mode) in [(TEST_FILE, Mode::Test), (LIVE_FILE, Mode::Live)] {
            let b = parse_billing(text, mode).unwrap();
            assert!(b.remote.is_empty() && !b.asks_remote(), "{mode:?}");
            assert!(!ask(&b, &NoNet));
            assert!(!b.payments_on());
        }
        assert!(!crate::license::billing().payments_on());
    }
    #[test]
    fn the_file_switch_comes_first_then_the_remote_answer() {
        // The file's switch off: never asked, whatever the address.
        assert!(!ask(&file(false, "https://switch.test.example.com/payments.json"), &NoNet));
        // On, with no address: never asked.
        assert!(!ask(&file(true, ""), &NoNet));
        // On, with an address: asked once, by GET, and only a yes turns it on.
        let net = Fake { answer: Some((200, "{\"payments\": false}".into())), asked: RefCell::new(vec![]) };
        assert!(!ask(&file(true, "https://switch.test.example.com/payments.json"), &net));
        assert_eq!(net.asked.borrow().as_slice(), ["https://switch.test.example.com/payments.json"]);
        let net = Fake { answer: None, asked: RefCell::new(vec![]) };
        assert!(!ask(&file(true, "https://switch.test.example.com/payments.json"), &net), "offline is off");
        set(false);
    }
    #[test]
    fn the_address_is_https_and_a_live_build_never_names_a_test_host() {
        let with = |text: &str, mode: Mode, url: &str| { let mut v: serde_json::Value = serde_json::from_str(text).unwrap(); v["remoteSwitchUrl"] = serde_json::json!(url); parse_billing(&v.to_string(), mode) };
        for bad in ["http://switch.example.com/x", "switch.example.com", "https://user@switch.example.com/x", "https://switch.example.com:8443/x"] { assert!(with(TEST_FILE, Mode::Test, bad).is_none(), "{bad}"); }
        assert!(with(LIVE_FILE, Mode::Live, "https://switch.test.example.com/x").is_none());
        assert!(with(LIVE_FILE, Mode::Live, "https://squibby.example.com/switch.json").is_some());
        // curl: https only, no settings file, a short time limit, nothing of the person.
        let a = curl_args("https://x.example.com/s.json");
        assert_eq!(a[0], "-q"); assert!(a.windows(2).any(|w| w == ["--proto", "=https"])); assert!(!a.iter().any(|x| x.contains("Cookie") || x.contains("Authorization") || x == "-X"));
    }
}
