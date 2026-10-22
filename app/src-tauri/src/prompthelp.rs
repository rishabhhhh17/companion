//! The safety rules for Prompt help, as plain tested logic. Nothing here touches the screen or another app:
//! the real Accessibility read and the paste come in M5b and must go through these rules.
//!
//! Rules from the project: a read happens only on the hotkey, only after the "reading your text" indicator is lit,
//! never in a password field or a never-read app, only for an app the person allowed, and no text is ever logged.

use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

// ---------- apps that are never read ----------

/// Also left out of every picture Show me takes (macos_see.rs left_out_of_pictures), except System Settings.
pub(crate) const BUILT_IN_NEVER: &[&str] = &[
    "com.1password.1password", "com.agilebits.onepassword7", "com.agilebits.onepassword-osx", "com.bitwarden.desktop",
    "com.lastpass.lastpass", "com.dashlane.dashlane", "org.keepassxc.keepassxc", "com.apple.keychainaccess", "com.apple.Passwords",
    "com.nordsec.nordpass", "com.enpass.Enpass", "in.sinew.Enpass-Desktop", "com.apple.systempreferences", "com.apple.SecurityAgent",
];

/// One of the apps that are never read (password managers, Keychain Access, Passwords, System Settings, the system's own
/// password prompts). macOS ignores case in bundle ids, so this does too: the list can only refuse more, never less.
pub fn built_in_never(bundle_id: &str) -> bool { BUILT_IN_NEVER.iter().any(|b| b.eq_ignore_ascii_case(bundle_id)) }

#[derive(Default, Clone)]
pub struct Denylist { user: BTreeSet<String> }
impl Denylist {
    pub const fn empty() -> Denylist { Denylist { user: BTreeSet::new() } }
    #[cfg(test)]
    pub fn add(&mut self, bundle_id: &str) { if !bundle_id.is_empty() { self.user.insert(bundle_id.to_string()); } }
    #[cfg(test)]
    pub fn remove(&mut self, bundle_id: &str) { self.user.remove(bundle_id); }
    pub fn contains(&self, bundle_id: &str) -> bool { built_in_never(bundle_id) || self.user.contains(bundle_id) }
    /// The built in apps cannot be removed from the list, only the ones the person added.
    #[cfg(test)]
    pub fn user_apps(&self) -> Vec<String> { self.user.iter().cloned().collect() }
}

// ---------- asking once per app ----------

/// Once is the card's "Just this once" (used up by being used, never kept). Ask is Settings' "Ask each time": kept, so the
/// app stays in the list, and it asks every time, like an app with no answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Choice { Once, Always, Ask, Never }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision { Allow, Ask, Refuse }

#[derive(Default, Clone)]
pub struct Consent { map: BTreeMap<String, Choice> }
impl Consent {
    /// Asks what to do for this app right now. "Once" is used up by being used.
    pub fn decide(&mut self, bundle_id: &str) -> Decision {
        match self.map.get(bundle_id).copied() {
            None => Decision::Ask,
            Some(Choice::Always) => Decision::Allow,
            Some(Choice::Never) => Decision::Refuse,
            Some(Choice::Ask) => Decision::Ask,
            Some(Choice::Once) => { self.map.remove(bundle_id); Decision::Allow }
        }
    }
    pub fn record(&mut self, bundle_id: &str, c: Choice) { if !bundle_id.is_empty() { self.map.insert(bundle_id.to_string(), c); } }
    #[cfg(test)]
    pub fn forget(&mut self, bundle_id: &str) { self.map.remove(bundle_id); }
    /// "always", "ask" and "never" are kept on disk. "Once" never survives a restart. (A version before Settings had "ask"
    /// reads it as no answer, which also asks: the same meaning.)
    pub fn to_json(&self) -> Value {
        let m: BTreeMap<&String, &str> = self.map.iter().filter_map(|(k, v)| match v { Choice::Always => Some((k, "always")), Choice::Ask => Some((k, "ask")), Choice::Never => Some((k, "never")), Choice::Once => None }).collect();
        json!({ "apps": m })
    }
    pub fn from_json(v: &Value) -> Consent {
        let mut c = Consent::default();
        if let Some(o) = v.get("apps").and_then(Value::as_object) {
            for (k, val) in o {
                match val.as_str() { Some("always") => c.record(k, Choice::Always), Some("ask") => c.record(k, Choice::Ask), Some("never") => c.record(k, Choice::Never), _ => {} }
            }
        }
        c
    }
}

/// The name a file that could not be read or understood is moved to, beside the answers file.
pub const DAMAGED_ANSWERS: &str = "prompt_help.damaged.json";

/// Reads the answers file. No file is no answers, as it should be at first. A file that is there but cannot be read, or is not
/// the answers (not JSON, not an object), is moved aside as prompt_help.damaged.json, never overwritten by the next answer, so
/// the apps never to read are not lost for good by one bad read. True when that happened (the answers start empty).
pub fn load_answers(file: &std::path::Path) -> (Consent, bool) {
    let text = match std::fs::read(file) {
        Ok(b) => String::from_utf8(b).ok(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return (Consent::default(), false),
        Err(_) => None,
    };
    match text.and_then(|t| serde_json::from_str::<Value>(&t).ok()).filter(Value::is_object) {
        Some(v) => (Consent::from_json(&v), false),
        None => {
            if let Some(d) = file.parent() { let _ = std::fs::rename(file, d.join(DAMAGED_ANSWERS)); }
            (Consent::default(), true)
        }
    }
}

// ---------- the per app answers in Settings (ph.appAnswers, the registry T16) ----------

/// What Settings may do to the answers. Each comes from the page as `{ "op": ... }` through settings_set.
#[derive(Debug, Clone, PartialEq)]
pub enum AppsOp {
    /// Allow always, Ask each time or Never for one app. Loosening a never needs `confirmed` (the inline confirm).
    Answer { app: String, answer: Choice, confirmed: bool },
    /// Forget one app's answer (it asks again). Forgetting a never needs `confirmed`.
    Forget { app: String, confirmed: bool },
    /// Forget every answer except the apps never to read (those are protections, each removed only on its own).
    ForgetAll,
    /// Add the app in front to never read. `app` is the id the page showed the person ("Never read Notes?"); the shell
    /// changes it only while that app is still the one in front (only its bundle id is read, never its content).
    NeverFront { app: String },
}

/// The page's value as an operation; anything else is refused with the same code as any other custom value.
pub fn apps_op(v: &Value) -> Result<AppsOp, &'static str> {
    let app = || v.get("app").and_then(Value::as_str).map(str::to_string).ok_or("custom");
    let confirmed = v.get("confirmed").and_then(Value::as_bool).unwrap_or(false);
    match v.get("op").and_then(Value::as_str) {
        Some("answer") => {
            let answer = match v.get("answer").and_then(Value::as_str) { Some("always") => Choice::Always, Some("ask") => Choice::Ask, Some("never") => Choice::Never, _ => return Err("custom") };
            Ok(AppsOp::Answer { app: app()?, answer, confirmed })
        }
        Some("forget") => Ok(AppsOp::Forget { app: app()?, confirmed }),
        Some("forgetAll") => Ok(AppsOp::ForgetAll),
        Some("neverFront") => Ok(AppsOp::NeverFront { app: app()? }),
        _ => Err("custom"),
    }
}

/// An app's bundle id as macOS gives them (the same rule as everywhere in Settings).
fn app_id_ok(id: &str) -> bool { crate::settings::app_id_ok(id) }

impl Consent {
    /// Applies one change from Settings. The built in never list can never be changed or forgotten; a never the person
    /// added is loosened (another answer, or forgotten) only with `confirmed`; making anything stricter never needs it.
    /// Returns how many answers changed.
    pub fn change(&mut self, op: &AppsOp, front: &str) -> Result<usize, &'static str> {
        let loosens = |c: &Consent, app: &str| c.map.get(app) == Some(&Choice::Never);
        match op {
            AppsOp::Answer { app, answer, confirmed } => {
                if !app_id_ok(app) { return Err("notApp"); }
                if built_in_never(app) { return Err("builtIn"); }
                if *answer != Choice::Never && loosens(self, app) && !confirmed { return Err("confirm"); }
                self.record(app, *answer);
                Ok(1)
            }
            AppsOp::Forget { app, confirmed } => {
                if !app_id_ok(app) { return Err("notApp"); }
                if built_in_never(app) { return Err("builtIn"); }
                if loosens(self, app) && !confirmed { return Err("confirm"); }
                Ok(usize::from(self.map.remove(app).is_some()))
            }
            AppsOp::ForgetAll => {
                let before = self.map.len();
                self.map.retain(|_, c| *c == Choice::Never);
                Ok(before - self.map.len())
            }
            AppsOp::NeverFront { app } => {
                if front.is_empty() || front.starts_with("dev.companion") { return Err("ownApp"); }
                // Another app came to the front after the page named one: nothing changes, so only the app the person was
                // shown is ever added.
                if !app.eq_ignore_ascii_case(front) { return Err("frontChanged"); }
                if !app_id_ok(front) { return Err("notApp"); }
                if built_in_never(front) { return Ok(0); }
                self.record(front, Choice::Never);
                Ok(1)
            }
        }
    }
}

/// The rewrite style sent with a prompt (ph.style in Settings): "light" only when the person chose it, else "full".
pub fn style_of(v: &Value) -> &'static str { if v.as_str() == Some("light") { "light" } else { "full" } }

// ---------- may we read this field? ----------

#[derive(Debug, PartialEq, Eq)]
pub enum ReadVerdict { Ok, NeedConsent, RefuseSecureField, RefuseSecureInput, RefuseNeverApp, RefusedByYou }

impl ReadVerdict {
    pub fn plain(&self) -> &'static str {
        match self {
            ReadVerdict::Ok => "",
            ReadVerdict::NeedConsent => "Allow Prompt help to read the text box in this app?",
            ReadVerdict::RefuseSecureField => "This looks like a password box, so I did not read it.",
            ReadVerdict::RefuseSecureInput => "Your Mac is protecting what you type right now, so I did not read it.",
            ReadVerdict::RefuseNeverApp => "I never read this kind of app.",
            ReadVerdict::RefusedByYou => "You told me not to read in this app.",
        }
    }
    /// The same answer as a short code, for a page that has its own words for it (the error explainer).
    pub fn code(&self) -> &'static str {
        match self {
            ReadVerdict::Ok => "ok",
            ReadVerdict::NeedConsent => "consent",
            ReadVerdict::RefuseSecureField => "secure_field",
            ReadVerdict::RefuseSecureInput => "secure_input",
            ReadVerdict::RefuseNeverApp => "never_app",
            ReadVerdict::RefusedByYou => "refused_by_you",
        }
    }
}

/// `role` and `subrole` are the Accessibility names of the focused field.
pub fn read_verdict(role: &str, subrole: &str, secure_input_on: bool, bundle_id: &str, deny: &Denylist, consent: &mut Consent) -> ReadVerdict {
    // The strictest refusals come first and never reach the question about consent.
    if deny.contains(bundle_id) { return ReadVerdict::RefuseNeverApp; }
    if let Some(v) = secure_now(role, subrole, secure_input_on) { return v; }
    match consent.decide(bundle_id) { Decision::Allow => ReadVerdict::Ok, Decision::Ask => ReadVerdict::NeedConsent, Decision::Refuse => ReadVerdict::RefusedByYou }
}

// ---------- one request per read ----------

/// Each read is sent as its own request. A result is kept for Use it only when it answers the request still waiting: never
/// one cancelled since (Cancel, Stop everything, a newer press), and never an older box's rewrite over a newer box.
pub fn same_request(waiting: Option<&str>, answered: &str) -> bool { !answered.is_empty() && waiting == Some(answered) }

/// The refusals that depend on the box and the keyboard right now: never a password box, never during secure typing. Asked
/// at the press (read_verdict) and again right before reading, since the person may have moved to a password box or started
/// typing a password (sudo in Terminal) while a question about the app waited for its answer.
pub fn secure_now(role: &str, subrole: &str, secure_input_on: bool) -> Option<ReadVerdict> {
    if role == "AXSecureTextField" || subrole == "AXSecureTextField" { return Some(ReadVerdict::RefuseSecureField); }
    if secure_input_on { return Some(ReadVerdict::RefuseSecureInput); }
    None
}

// ---------- the indicator comes first ----------

#[derive(Default)]
pub struct ReadSession { lit: bool, read_done: bool }
impl ReadSession {
    pub fn indicator_on(&mut self) { self.lit = true; }
    /// The text may be read only after the indicator is lit, and only once per hotkey press.
    pub fn begin_read(&mut self) -> Result<(), &'static str> {
        if !self.lit { return Err("the indicator must be lit before any text is read"); }
        if self.read_done { return Err("one hotkey press reads once"); }
        self.read_done = true; Ok(())
    }
    pub fn finish(&mut self) { *self = ReadSession::default(); }
}

// ---------- putting the answer back ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Focus { pub pid: i32, pub element: u64 }

#[derive(Debug, PartialEq, Eq)]
pub enum PasteVerdict { Paste, CopyOnly(&'static str) }

pub fn paste_plan(at_read: Focus, now: Focus, handback_copy: bool, card_is_key: bool) -> PasteVerdict {
    if handback_copy { return PasteVerdict::CopyOnly("Copied. Press Cmd+V where you want it."); }
    if card_is_key { return PasteVerdict::CopyOnly("I copied it instead of pasting, so nothing lands in the wrong place. Press Cmd+V where you want it."); }
    if at_read.pid != now.pid { return PasteVerdict::CopyOnly("You moved to another app, so I copied the improved prompt instead. Press Cmd+V where you want it."); }
    if at_read.element != now.element { return PasteVerdict::CopyOnly("You moved to another box, so I copied the improved prompt instead. Press Cmd+V where you want it."); }
    PasteVerdict::Paste
}

/// Whether macOS lets Companion read the clipboard without showing an alert (read from the Mac by `access_behavior`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessBehavior { Allowed, Ask, Denied, Unknown }

#[derive(Debug, PartialEq, Eq)]
pub enum ClipboardPlan { SaveAndRestore, SkipAndTell(&'static str) }

/// The clipboard is saved and put back only when macOS will not show an alert for reading it.
pub fn clipboard_plan(b: AccessBehavior) -> ClipboardPlan {
    match b {
        AccessBehavior::Allowed => ClipboardPlan::SaveAndRestore,
        _ => ClipboardPlan::SkipAndTell("Your clipboard now holds the improved prompt."),
    }
}

/// What the card says when the person's clipboard was not saved, so they know what Cmd+V would paste now.
pub const NOW_HOLDS_IMPROVED: &str = "Your clipboard now holds the improved prompt.";
impl ClipboardPlan {
    /// The person's clipboard was not saved (macOS would ask, or it holds something private): say what it holds now.
    pub fn skip() -> ClipboardPlan { ClipboardPlan::SkipAndTell(NOW_HOLDS_IMPROVED) }
}

/// Clipboard type names that mark something private or short lived: the nspasteboard.org markers, and older markers some
/// password managers and clipboard tools still write. A password manager clears what it copied after a while, but only
/// if nobody has written to the clipboard since. Saving such a clipboard and putting it back would move the clipboard's
/// change number, so the manager would never clear it and the password would stay there with no time limit.
const PRIVATE_CLIPBOARD_TYPES: &[&str] = &[
    "org.nspasteboard.ConcealedType", "org.nspasteboard.TransientType", "org.nspasteboard.AutoGeneratedType",
    "com.agilebits.onepassword", "de.petermaurer.TransientPasteboardType", "com.typeit4me.clipping", "Pasteboard generator type", "net.antelle.keeweb",
];

/// May the clipboard be saved, given the names of what is on it (`types`, never its contents)? No when anything on it is
/// marked private or short lived. Type names are compared without regard to case, as macOS does.
pub fn may_save<S: AsRef<str>>(types: &[S]) -> bool {
    !types.iter().any(|t| PRIVATE_CLIPBOARD_TYPES.iter().any(|p| p.eq_ignore_ascii_case(t.as_ref())))
}

/// The whole clipboard rule: saved and put back only when macOS will not alert for reading it AND nothing on it is marked
/// private. `types` gives the names of what is on the clipboard (never its contents) and is asked for only when macOS
/// allows the read at all.
pub fn clipboard_plan_with(b: AccessBehavior, types: impl FnOnce() -> Vec<String>) -> ClipboardPlan {
    match clipboard_plan(b) {
        ClipboardPlan::SaveAndRestore if may_save(&types()) => ClipboardPlan::SaveAndRestore,
        _ => ClipboardPlan::skip(),
    }
}

/// What macOS says about Companion reading the clipboard: `NSPasteboard.accessBehavior` as its raw number (0 default,
/// 1 ask, 2 always allow, 3 always deny), or None on a macOS before 15.4, which has no such setting and no alert.
/// "Default" asks when a program reads the clipboard, so only "always allow" (the person's own choice in System
/// Settings) or an older macOS lets Companion save the clipboard and put it back.
pub fn access_behavior(raw: Option<isize>) -> AccessBehavior {
    match raw {
        None | Some(2) => AccessBehavior::Allowed,
        Some(0) | Some(1) => AccessBehavior::Ask,
        Some(3) => AccessBehavior::Denied,
        Some(_) => AccessBehavior::Unknown,
    }
}

/// How a paste back ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PasteOutcome {
    /// The text showed up in the box.
    Landed,
    /// Pasted, but the text could not be seen in the box afterwards.
    Unconfirmed,
    /// Not pasted: the text was left on the clipboard for the person to paste (they moved, or the box could not be reached).
    CopiedInstead,
    /// Not pasted: the person moved on (Stop, Dismiss, a new press) before the paste.
    Cancelled,
}

/// Put the person's own clipboard back? Only when it was saved (macOS lets Companion read it without an alert), only when
/// Companion's text has no job left there (it landed, or nothing was pasted because the person moved on), and only when
/// nothing else has written to the clipboard since Companion did (`ours` is its change number right after our write).
pub fn restore_after(plan: &ClipboardPlan, outcome: PasteOutcome, ours: isize, now: isize) -> bool {
    *plan == ClipboardPlan::SaveAndRestore && matches!(outcome, PasteOutcome::Landed | PasteOutcome::Cancelled) && ours == now
}

/// Whether a paste has really landed: the box now holds the text AND it changed from what it held before the paste. The
/// person's clipboard is given back only after this, so it must never say yes before the app has read the clipboard
/// (putting the original back into a box whose improved text starts with the same words would otherwise look done at once).
pub fn paste_seen(before: &str, now: &str, probe: &str) -> bool { now != before && now.contains(probe) }

/// Where a paste back goes in the box.
#[derive(Debug, PartialEq, Eq)]
pub enum PasteTarget {
    /// Select the whole box first. It holds this many UTF-16 units (the way the Mac counts text).
    WholeBox(usize),
    /// Paste over what is selected now: the selection that was read.
    Selection,
    /// Select exactly this range first: where the improved text went, so the original goes back in its place.
    Range { start: usize, len: usize },
    /// The improved text is no longer where it was put, so the box is not touched at all.
    NotFound,
}

/// What the card says when the original cannot go back in its place.
pub const ORIGINAL_NOT_FOUND: &str = "I could not put your original back in its place, so I left your text box alone and copied your original. Press Cmd+V where you want it.";

/// Where a paste back goes. Without a selection the whole box was read, so the whole box is replaced. With a selection,
/// using the improved text pastes over that selection only. Putting the original back after a selection replaces only
/// where the improved text went (`placed_at`, in UTF-16 units), and only when the box still holds exactly the improved
/// text there; otherwise nothing in the box is touched. `box_now` is what the box holds right now.
pub fn paste_target(had_selection: bool, restore: bool, box_now: &str, placed_at: Option<usize>, improved: Option<&str>) -> PasteTarget {
    if !had_selection { return PasteTarget::WholeBox(box_now.encode_utf16().count()); }
    if !restore { return PasteTarget::Selection; }
    let (Some(start), Some(improved)) = (placed_at, improved) else { return PasteTarget::NotFound };
    let (b, i): (Vec<u16>, Vec<u16>) = (box_now.encode_utf16().collect(), improved.encode_utf16().collect());
    match start.checked_add(i.len()) {
        Some(end) if !i.is_empty() && end <= b.len() && b[start..end] == i[..] => PasteTarget::Range { start, len: i.len() },
        _ => PasteTarget::NotFound,
    }
}

/// What the card says after a paste. `restore` is true when the person's original text was put back into the box.
/// The clipboard is mentioned only when it was not given back, so the person knows what Cmd+V would paste.
pub fn paste_words(restore: bool, landed: bool, plan: &ClipboardPlan) -> String {
    let head = match (landed, restore) {
        (true, true) => "Your original is back.",
        (true, false) => "Done.",
        (false, _) => "I pasted it, but could not confirm it landed. Please look at your text box.",
    };
    let tell = match plan {
        ClipboardPlan::SaveAndRestore if landed => "",
        _ if restore => "Your clipboard now holds your original text.",
        ClipboardPlan::SkipAndTell(m) => m,
        ClipboardPlan::SaveAndRestore => "Your clipboard now holds the improved prompt.",
    };
    format!("{head} {tell}").trim().to_string()
}

// ---------- logs never hold text ----------

/// What may be written about a read or a paste. There is no field for the text, so it cannot be logged by mistake.
pub fn log_line(kind: &str, bundle_id: &str, ms: u64, chars: usize, outcome: &str) -> Value {
    json!({ "ev": kind, "app": bundle_id, "ms": ms, "chars": chars, "outcome": outcome })
}

#[cfg(test)]
mod tests {
    use super::*;
    const APP: &str = "com.openai.codex";

    #[test] fn the_box_and_the_keyboard_are_checked_again_right_before_reading() {
        // After a question about the app was answered (or while a slow app wakes), the person may be in a password box now,
        // or typing a password in Terminal: never read then, whatever the app's answer says.
        assert_eq!(secure_now("AXSecureTextField", "", false), Some(ReadVerdict::RefuseSecureField));
        assert_eq!(secure_now("AXTextField", "AXSecureTextField", false), Some(ReadVerdict::RefuseSecureField));
        assert_eq!(secure_now("AXTextArea", "", true), Some(ReadVerdict::RefuseSecureInput));
        assert_eq!(secure_now("", "", true), Some(ReadVerdict::RefuseSecureInput), "no box found, but secure typing is on");
        assert_eq!(secure_now("AXTextArea", "", false), None);
        // The rules at the press ask the same question, so the two can never differ.
        let mut c = Consent::default(); c.record(APP, Choice::Always);
        for (role, sub, secure) in [("AXSecureTextField", "", false), ("AXTextArea", "", true), ("AXTextArea", "", false)] {
            let at_press = read_verdict(role, sub, secure, APP, &Denylist::default(), &mut c);
            assert_eq!(secure_now(role, sub, secure).unwrap_or(ReadVerdict::Ok), at_press, "{role} {secure}");
        }
        // Both readers ask it right before reading, and the reading itself never takes a password box.
        for (file, src, read) in [("phelp.rs", include_str!("phelp.rs"), "ax::read_ladder(pid)"), ("errhelp.rs", include_str!("errhelp.rs"), "ax::read_selection(pid)"), ("seclook.rs", include_str!("seclook.rs"), "ax::read_selection(pid)")] {
            let at = src.find(read).unwrap_or_else(|| panic!("{file}"));
            let before = &src[..at];
            let fun = &before[before.rfind("\nfn ").unwrap()..];
            assert!(fun.contains("rules::secure_now(") && fun.contains("ax::focused(pid)") && fun.contains("ax::secure_input_enabled()"), "{file}: {fun}");
        }
        let ax = include_str!("ax.rs");
        for f in ["pub fn read_ladder(", "pub fn read_selection("] {
            let b = &ax[ax.find(f).unwrap()..]; let b = &b[..b.find("\n}\n").unwrap()];
            assert!(b.contains("let f = focused(pid).filter(|f| !secure_field(f))?;"), "{f}: {b}");
        }
    }
    #[test] fn a_result_belongs_only_to_the_request_still_waiting() {
        // Each read is sent as its own request. A result is kept for Use it only when it answers the request waiting now:
        // never one cancelled since, and never an older box's rewrite over a newer box.
        assert!(same_request(Some("ph_2"), "ph_2"));
        assert!(!same_request(Some("ph_2"), "ph_1"), "an older press's answer");
        assert!(!same_request(None, "ph_1"), "nothing waits (cancelled, dismissed, stopped)");
        assert!(!same_request(Some(""), ""), "a request always has a name");
    }

    #[test] fn password_managers_and_system_settings_are_never_read() {
        let d = Denylist::default();
        for id in ["com.1password.1password", "com.bitwarden.desktop", "com.apple.keychainaccess", "org.keepassxc.keepassxc", "com.apple.Passwords"] { assert!(d.contains(id), "{id}"); }
        assert!(!d.contains(APP));
    }
    #[test] fn the_person_can_add_apps_but_not_remove_the_built_in_ones() {
        let mut d = Denylist::default();
        d.add("com.mybank.app"); assert!(d.contains("com.mybank.app"));
        d.remove("com.mybank.app"); assert!(!d.contains("com.mybank.app"));
        d.remove("com.1password.1password"); assert!(d.contains("com.1password.1password"));
        assert_eq!(d.user_apps(), Vec::<String>::new());
    }
    #[test] fn an_empty_id_is_not_added() { let mut d = Denylist::default(); d.add(""); assert!(d.user_apps().is_empty()); }

    #[test] fn a_new_app_asks_first() { assert_eq!(Consent::default().decide(APP), Decision::Ask); }
    #[test] fn always_allows_every_time_and_never_refuses_every_time() {
        let mut c = Consent::default();
        c.record(APP, Choice::Always); assert_eq!(c.decide(APP), Decision::Allow); assert_eq!(c.decide(APP), Decision::Allow);
        c.record("x.y", Choice::Never); assert_eq!(c.decide("x.y"), Decision::Refuse); assert_eq!(c.decide("x.y"), Decision::Refuse);
    }
    #[test] fn once_is_used_up_by_being_used() {
        let mut c = Consent::default();
        c.record(APP, Choice::Once);
        assert_eq!(c.decide(APP), Decision::Allow);
        assert_eq!(c.decide(APP), Decision::Ask);
    }
    #[test] fn a_choice_can_be_forgotten_and_asked_again() {
        let mut c = Consent::default(); c.record(APP, Choice::Never); c.forget(APP);
        assert_eq!(c.decide(APP), Decision::Ask);
    }
    #[test] fn only_always_and_never_are_saved_and_they_survive_a_restart() {
        let mut c = Consent::default();
        c.record("a.a", Choice::Always); c.record("b.b", Choice::Never); c.record("c.c", Choice::Once);
        let mut back = Consent::from_json(&c.to_json());
        assert_eq!(back.decide("a.a"), Decision::Allow);
        assert_eq!(back.decide("b.b"), Decision::Refuse);
        assert_eq!(back.decide("c.c"), Decision::Ask);
    }
    #[test] fn a_damaged_or_odd_saved_file_gives_no_choices_rather_than_a_crash() {
        for v in [json!(null), json!({}), json!({"apps": 5}), json!({"apps": {"a": "sometimes", "b": 7}})] {
            let mut c = Consent::from_json(&v);
            assert_eq!(c.decide("a"), Decision::Ask);
        }
    }

    #[test] fn a_damaged_answers_file_is_kept_aside_and_the_next_answer_does_not_erase_it() {
        let d = std::env::temp_dir().join(format!("ph-answers-{}", std::process::id())); let _ = std::fs::remove_dir_all(&d); std::fs::create_dir_all(&d).unwrap();
        let f = d.join("prompt_help.json");
        // No file: no answers, nothing moved.
        let (mut c, damaged) = load_answers(&f);
        assert!(!damaged); assert_eq!(c.decide(APP), Decision::Ask);
        // A good file is read.
        std::fs::write(&f, r#"{"apps":{"a.a":"never"}}"#).unwrap();
        let (mut c, damaged) = load_answers(&f);
        assert!(!damaged); assert_eq!(c.decide("a.a"), Decision::Refuse);
        // A cut off file is moved aside whole, and the answers start empty.
        std::fs::write(&f, r#"{"apps":{"a.a":"nev"#).unwrap();
        let (_, damaged) = load_answers(&f);
        assert!(damaged);
        assert!(!f.exists());
        assert_eq!(std::fs::read_to_string(d.join(DAMAGED_ANSWERS)).unwrap(), r#"{"apps":{"a.a":"nev"#);
        // Something that is JSON but not the answers is a damaged file too.
        std::fs::write(&f, "[1,2]").unwrap();
        assert!(load_answers(&f).1);
        let _ = std::fs::remove_dir_all(&d);
    }

    // ---- the per app answers in Settings (ph.appAnswers, M11 area 5) ----
    fn op(v: Value) -> AppsOp { apps_op(&v).unwrap() }
    #[test] fn settings_can_set_each_answer_and_ask_each_time_is_kept_and_survives_a_restart() {
        let mut c = Consent::default();
        c.change(&op(json!({ "op": "answer", "app": APP, "answer": "always" })), "").unwrap();
        assert_eq!(c.decide(APP), Decision::Allow);
        c.change(&op(json!({ "op": "answer", "app": APP, "answer": "ask" })), "").unwrap();
        assert_eq!(c.decide(APP), Decision::Ask);
        assert_eq!(c.decide(APP), Decision::Ask, "ask each time is not used up");
        assert_eq!(c.to_json(), json!({ "apps": { APP: "ask" } }), "kept, so the app stays in the list");
        let mut back = Consent::from_json(&c.to_json());
        assert_eq!(back.decide(APP), Decision::Ask);
        // Just this once is only ever an answer on the card, never a setting.
        assert!(apps_op(&json!({ "op": "answer", "app": APP, "answer": "once" })).is_err());
    }
    #[test] fn the_built_in_never_list_can_never_be_changed_or_forgotten_from_settings() {
        for id in ["com.1password.1password", "com.apple.Passwords", "com.apple.keychainaccess", "COM.BITWARDEN.DESKTOP"] {
            let mut c = Consent::default();
            for v in [json!({ "op": "answer", "app": id, "answer": "always", "confirmed": true }), json!({ "op": "answer", "app": id, "answer": "ask", "confirmed": true }), json!({ "op": "forget", "app": id, "confirmed": true })] {
                assert_eq!(c.change(&op(v.clone()), ""), Err("builtIn"), "{id} {v}");
            }
            // Still never read, whatever is stored for it.
            c.record(id, Choice::Always);
            assert_eq!(read_verdict("AXTextArea", "", false, id, &Denylist::default(), &mut c), ReadVerdict::RefuseNeverApp, "{id}: macOS ignores case in ids, so the list does too");
        }
    }
    #[test] fn a_never_the_person_added_is_a_protection_loosened_only_after_a_confirm() {
        let mut c = Consent::default();
        c.record("com.mybank.app", Choice::Never);
        for v in [json!({ "op": "answer", "app": "com.mybank.app", "answer": "always" }), json!({ "op": "answer", "app": "com.mybank.app", "answer": "ask" }), json!({ "op": "forget", "app": "com.mybank.app" })] {
            assert_eq!(c.change(&op(v.clone()), ""), Err("confirm"), "{v}");
            assert_eq!(c.decide("com.mybank.app"), Decision::Refuse, "unchanged: {v}");
        }
        c.change(&op(json!({ "op": "forget", "app": "com.mybank.app", "confirmed": true })), "").unwrap();
        assert_eq!(c.decide("com.mybank.app"), Decision::Ask);
        // Making something stricter never needs a confirm.
        c.record(APP, Choice::Always);
        c.change(&op(json!({ "op": "answer", "app": APP, "answer": "never" })), "").unwrap();
        assert_eq!(c.decide(APP), Decision::Refuse);
    }
    #[test] fn forget_all_forgets_every_answer_except_the_apps_never_to_read() {
        let mut c = Consent::default();
        c.record("a.a", Choice::Always); c.record("b.b", Choice::Ask); c.record("n.n", Choice::Never);
        assert_eq!(c.change(&AppsOp::ForgetAll, ""), Ok(2));
        assert_eq!(c.to_json(), json!({ "apps": { "n.n": "never" } }));
    }
    #[test] fn the_app_in_front_can_be_added_to_never_read_but_never_companion_itself() {
        let front = |app: &str| AppsOp::NeverFront { app: app.to_string() };
        let mut c = Consent::default();
        c.record("com.notes.app", Choice::Always);
        c.change(&front("com.notes.app"), "com.notes.app").unwrap();
        assert_eq!(c.decide("com.notes.app"), Decision::Refuse);
        assert_eq!(c.change(&front("dev.companion.app"), "dev.companion.app"), Err("ownApp"));
        assert_eq!(c.change(&front(""), ""), Err("ownApp"));
        assert_eq!(c.change(&front("com.1password.1password"), "com.1password.1password"), Ok(0), "already never read");
    }
    #[test] fn add_the_app_in_front_changes_only_the_app_the_person_was_shown() {
        // The page names the app in front first ("Never read Notes?") and sends that id; another app in front by the time
        // the person says yes changes nothing.
        let mut c = Consent::default();
        assert_eq!(c.change(&AppsOp::NeverFront { app: "com.notes.app".into() }, "com.mail.app"), Err("frontChanged"));
        assert_eq!(c.to_json(), json!({ "apps": {} }), "nothing was recorded");
        assert_eq!(c.change(&AppsOp::NeverFront { app: "COM.NOTES.APP".into() }, "com.notes.app"), Ok(1), "macOS ignores case in ids");
        assert_eq!(c.decide("com.notes.app"), Decision::Refuse);
        // The page must say which app: an operation that names none is refused like any other odd value.
        assert_eq!(apps_op(&json!({ "op": "neverFront" })).err(), Some("custom"));
        assert_eq!(apps_op(&json!({ "op": "neverFront", "app": "com.notes.app" })), Ok(AppsOp::NeverFront { app: "com.notes.app".into() }));
        // The same shape of id as everywhere else in Settings (settings.rs app_id_ok), one rule for both.
        assert!(include_str!("prompthelp.rs").contains("fn app_id_ok(id: &str) -> bool { crate::settings::app_id_ok(id) }"));
    }
    #[test] fn only_real_looking_app_ids_and_known_operations_are_taken() {
        let mut c = Consent::default();
        for bad in ["", "two words", "../etc", "a\nb", &"x".repeat(201)] {
            assert_eq!(c.change(&op(json!({ "op": "answer", "app": bad, "answer": "never" })), ""), Err("notApp"), "{bad:?}");
        }
        for v in [json!(null), json!("forget"), json!({ "op": "wipe" }), json!({ "op": "answer", "app": APP }), json!({ "op": "answer", "app": 5, "answer": "never" })] {
            assert_eq!(apps_op(&v).err(), Some("custom"), "{v}");
        }
    }

    #[test] fn prompt_help_rewrites_in_full_unless_a_light_touch_was_chosen() {
        assert_eq!(style_of(&json!("full")), "full");
        assert_eq!(style_of(&json!("light")), "light");
        for odd in [json!(null), json!("Light"), json!(true), json!("none")] { assert_eq!(style_of(&odd), "full", "{odd}"); }
        let phelp = include_str!("phelp.rs");
        assert!(phelp.contains("\"style\": rules::style_of(&crate::setting_now(\"ph.style\"))"), "the prompt is sent with the chosen style");
        assert!(!phelp.contains("\"style\": \"full\""));
        // An answer given on the card (Prompt help or the error explainer) shows in Settings at once.
        assert!(phelp.contains("crate::settings_told(&app, &[\"ph.appAnswers\".to_string()])"));
        assert!(include_str!("errhelp.rs").contains("crate::settings_told(&app, &[\"ph.appAnswers\".to_string()])"));
        assert!(include_str!("seclook.rs").contains("crate::settings_told(&app, &[\"ph.appAnswers\".to_string()])"));
        // Settings changes the answers only through these rules, and a failed save changes nothing.
        let change = &phelp[phelp.find("pub fn apps_change(").unwrap()..];
        let change = &change[..change.find("\n}\n").unwrap()];
        assert!(change.contains("next.change(&op, front)?") && change.contains("try_save_consent(&next)?") && change.find("try_save_consent(&next)?") < change.find("st.consent = Some(next)"));
    }

    fn verdict(role: &str, sub: &str, secure: bool, app: &str, c: &mut Consent) -> ReadVerdict { read_verdict(role, sub, secure, app, &Denylist::default(), c) }
    #[test] fn a_password_field_is_refused_even_if_the_app_is_allowed() {
        let mut c = Consent::default(); c.record(APP, Choice::Always);
        assert_eq!(verdict("AXTextField", "AXSecureTextField", false, APP, &mut c), ReadVerdict::RefuseSecureField);
        assert_eq!(verdict("AXSecureTextField", "", false, APP, &mut c), ReadVerdict::RefuseSecureField);
    }
    #[test] fn secure_keyboard_input_is_refused() {
        let mut c = Consent::default(); c.record(APP, Choice::Always);
        assert_eq!(verdict("AXTextArea", "", true, APP, &mut c), ReadVerdict::RefuseSecureInput);
    }
    #[test] fn a_never_read_app_is_refused_before_consent_is_even_asked() {
        let mut c = Consent::default(); c.record("com.1password.1password", Choice::Always);
        assert_eq!(verdict("AXTextArea", "", false, "com.1password.1password", &mut c), ReadVerdict::RefuseNeverApp);
    }
    #[test] fn a_refusal_never_uses_up_a_once() {
        let mut c = Consent::default(); c.record(APP, Choice::Once);
        assert_eq!(verdict("AXSecureTextField", "", false, APP, &mut c), ReadVerdict::RefuseSecureField);
        assert_eq!(verdict("AXTextArea", "", false, APP, &mut c), ReadVerdict::Ok);
    }
    #[test] fn an_ordinary_field_in_a_new_app_needs_consent_then_reads() {
        let mut c = Consent::default();
        assert_eq!(verdict("AXTextArea", "", false, APP, &mut c), ReadVerdict::NeedConsent);
        c.record(APP, Choice::Always);
        assert_eq!(verdict("AXTextArea", "", false, APP, &mut c), ReadVerdict::Ok);
    }
    #[test] fn an_app_you_said_never_to_is_refused_in_your_words() {
        let mut c = Consent::default(); c.record(APP, Choice::Never);
        let v = verdict("AXTextArea", "", false, APP, &mut c);
        assert_eq!(v, ReadVerdict::RefusedByYou);
        assert!(v.plain().contains("told me not to"));
    }
    #[test] fn every_refusal_has_a_plain_sentence() {
        for v in [ReadVerdict::NeedConsent, ReadVerdict::RefuseSecureField, ReadVerdict::RefuseSecureInput, ReadVerdict::RefuseNeverApp, ReadVerdict::RefusedByYou] { assert!(!v.plain().is_empty()); }
    }
    #[test] fn every_refusal_has_its_own_code_for_the_page() {
        // The error explainer's card words live in the page's strings file; it is told which refusal by this code.
        let all = [ReadVerdict::Ok, ReadVerdict::NeedConsent, ReadVerdict::RefuseSecureField, ReadVerdict::RefuseSecureInput, ReadVerdict::RefuseNeverApp, ReadVerdict::RefusedByYou];
        let codes: Vec<&str> = all.iter().map(|v| v.code()).collect();
        assert_eq!(codes, vec!["ok", "consent", "secure_field", "secure_input", "never_app", "refused_by_you"]);
    }

    #[test] fn nothing_is_read_before_the_indicator_is_lit() {
        let mut s = ReadSession::default();
        assert!(s.begin_read().is_err());
        s.indicator_on();
        assert!(s.begin_read().is_ok());
    }
    #[test] fn one_hotkey_press_reads_only_once() {
        let mut s = ReadSession::default(); s.indicator_on();
        assert!(s.begin_read().is_ok()); assert!(s.begin_read().is_err());
        s.finish();
        assert!(s.begin_read().is_err());           // a new press must light the indicator again
    }

    const F1: Focus = Focus { pid: 10, element: 1 };
    #[test] fn the_same_box_in_the_same_app_is_pasted_into() { assert_eq!(paste_plan(F1, F1, false, false), PasteVerdict::Paste); }
    #[test] fn another_app_in_front_means_copy_only() {
        match paste_plan(F1, Focus { pid: 11, element: 1 }, false, false) { PasteVerdict::CopyOnly(m) => assert!(m.contains("another app")), v => panic!("{v:?}") }
    }
    #[test] fn another_box_in_the_same_app_means_copy_only() {
        match paste_plan(F1, Focus { pid: 10, element: 2 }, false, false) { PasteVerdict::CopyOnly(m) => assert!(m.contains("another box")), v => panic!("{v:?}") }
    }
    #[test] fn terminals_always_copy() {
        match paste_plan(F1, F1, true, false) { PasteVerdict::CopyOnly(m) => assert!(m.contains("Cmd+V")), v => panic!("{v:?}") }
    }
    #[test] fn if_our_own_card_has_the_keyboard_nothing_is_pasted() {
        assert!(matches!(paste_plan(F1, F1, false, true), PasteVerdict::CopyOnly(_)));
    }

    #[test] fn the_clipboard_is_saved_and_restored_only_when_macos_will_not_alert() {
        assert_eq!(clipboard_plan(AccessBehavior::Allowed), ClipboardPlan::SaveAndRestore);
        for b in [AccessBehavior::Ask, AccessBehavior::Denied, AccessBehavior::Unknown] { assert!(matches!(clipboard_plan(b), ClipboardPlan::SkipAndTell(_)), "{b:?}"); }
    }
    #[test] fn what_macos_says_about_reading_the_clipboard_decides_whether_it_is_saved() {
        // NSPasteboard.accessBehavior: 0 default (asks when a program reads it), 1 ask, 2 always allow, 3 always deny.
        assert_eq!(access_behavior(Some(2)), AccessBehavior::Allowed);
        assert_eq!(access_behavior(Some(0)), AccessBehavior::Ask);
        assert_eq!(access_behavior(Some(1)), AccessBehavior::Ask);
        assert_eq!(access_behavior(Some(3)), AccessBehavior::Denied);
        assert_eq!(access_behavior(Some(9)), AccessBehavior::Unknown);
        // Before macOS 15.4 there is no such setting and no clipboard alert at all.
        assert_eq!(access_behavior(None), AccessBehavior::Allowed);
        assert_eq!(clipboard_plan(access_behavior(Some(0))), ClipboardPlan::SkipAndTell("Your clipboard now holds the improved prompt."));
        assert_eq!(clipboard_plan(access_behavior(Some(2))), ClipboardPlan::SaveAndRestore);
    }
    #[test] fn the_persons_clipboard_comes_back_after_a_paste_that_landed() {
        let keep = ClipboardPlan::SaveAndRestore;
        assert!(restore_after(&keep, PasteOutcome::Landed, 41, 41));
        // Nothing was pasted because the person moved on first: their clipboard comes back too.
        assert!(restore_after(&keep, PasteOutcome::Cancelled, 41, 41));
    }
    #[test] fn the_clipboard_is_left_alone_when_it_still_has_a_job_or_someone_else_changed_it() {
        let keep = ClipboardPlan::SaveAndRestore;
        // The text could not be pasted (or not confirmed): it stays on the clipboard so the person can press Cmd+V.
        assert!(!restore_after(&keep, PasteOutcome::CopiedInstead, 41, 41));
        assert!(!restore_after(&keep, PasteOutcome::Unconfirmed, 41, 41));
        // Something else wrote to the clipboard after Companion did: that is never overwritten.
        assert!(!restore_after(&keep, PasteOutcome::Landed, 41, 42));
        // macOS would have asked to let Companion read it, so it was never saved and cannot be put back.
        let skip = clipboard_plan(AccessBehavior::Ask);
        for o in [PasteOutcome::Landed, PasteOutcome::Cancelled, PasteOutcome::Unconfirmed, PasteOutcome::CopiedInstead] { assert!(!restore_after(&skip, o, 41, 41), "{o:?}"); }
    }
    #[test] fn a_clipboard_marked_private_or_short_lived_is_never_saved() {
        // A password manager marks what it copies and clears it after a while, but only if nobody wrote to the clipboard
        // since. Saving and putting it back would leave the password there with no time limit, so it is never touched.
        for marker in ["org.nspasteboard.ConcealedType", "org.nspasteboard.TransientType", "org.nspasteboard.AutoGeneratedType",
                       "com.agilebits.onepassword", "de.petermaurer.TransientPasteboardType", "net.antelle.keeweb", "ORG.NSPASTEBOARD.CONCEALEDTYPE"] {
            assert!(!may_save(&["public.utf8-plain-text", marker]), "{marker}");
        }
        assert!(may_save(&["public.utf8-plain-text", "public.html"]));
        assert!(may_save::<&str>(&[]), "an empty clipboard has nothing private on it");
        assert!(may_save(&["public.utf8-plain-text".to_string()]), "names read from the Mac work too");
    }
    #[test] fn the_clipboard_rule_reads_names_only_when_macos_allows_and_skips_anything_private() {
        let plain = || vec!["public.utf8-plain-text".to_string()];
        let secret = || vec!["public.utf8-plain-text".to_string(), "org.nspasteboard.ConcealedType".to_string()];
        assert_eq!(clipboard_plan_with(AccessBehavior::Allowed, plain), ClipboardPlan::SaveAndRestore);
        assert_eq!(clipboard_plan_with(AccessBehavior::Allowed, secret), ClipboardPlan::skip());
        for b in [AccessBehavior::Ask, AccessBehavior::Denied, AccessBehavior::Unknown] {
            assert_eq!(clipboard_plan_with(b, || panic!("the names must not even be asked for when macOS would alert")), ClipboardPlan::skip(), "{b:?}");
        }
        // Not saved means the card tells the person what Cmd+V would paste now.
        assert_eq!(paste_words(false, true, &clipboard_plan_with(AccessBehavior::Allowed, secret)), "Done. Your clipboard now holds the improved prompt.");
    }

    #[test] fn without_a_selection_the_whole_box_is_replaced_either_way() {
        // The box is counted the way the Mac counts (UTF-16): an emoji is two.
        for restore in [false, true] { assert_eq!(paste_target(false, restore, "fix 🐛 now", None, Some("x")), PasteTarget::WholeBox(10)); }
    }
    #[test] fn using_the_improved_text_for_a_selection_pastes_over_the_selection_only() {
        assert_eq!(paste_target(true, false, "Hello OLD world", Some(6), None), PasteTarget::Selection);
    }
    #[test] fn putting_the_original_back_after_a_selection_touches_only_where_the_improved_text_went() {
        // Only "OLD" was read and replaced. Putting it back must never select the whole box (that would delete "Hello " and " world").
        let box_now = "Hello NEW TEXT world";
        assert_eq!(paste_target(true, true, box_now, Some(6), Some("NEW TEXT")), PasteTarget::Range { start: 6, len: 8 });
        // Counted the way the Mac counts: the emoji before it is two units.
        assert_eq!(paste_target(true, true, "🐛 NEW TEXT!", Some(3), Some("NEW TEXT")), PasteTarget::Range { start: 3, len: 8 });
    }
    #[test] fn if_the_improved_text_is_not_where_it_went_the_box_is_left_alone() {
        let box_now = "Hello NEW TEXT world";
        assert_eq!(paste_target(true, true, "Hello NEW edited world", Some(6), Some("NEW TEXT")), PasteTarget::NotFound, "the person edited it");
        assert_eq!(paste_target(true, true, box_now, Some(5), Some("NEW TEXT")), PasteTarget::NotFound, "a different place");
        assert_eq!(paste_target(true, true, box_now, None, Some("NEW TEXT")), PasteTarget::NotFound, "the place was never known");
        assert_eq!(paste_target(true, true, box_now, Some(6), None), PasteTarget::NotFound, "nothing was pasted");
        assert_eq!(paste_target(true, true, box_now, Some(18), Some("NEW TEXT")), PasteTarget::NotFound, "past the end");
        assert_eq!(paste_target(true, true, box_now, Some(usize::MAX), Some("NEW TEXT")), PasteTarget::NotFound, "a nonsense place");
        assert_eq!(paste_target(true, true, box_now, Some(6), Some("")), PasteTarget::NotFound, "nothing to find");
        assert!(ORIGINAL_NOT_FOUND.contains("Cmd+V") && !ORIGINAL_NOT_FOUND.contains('—'));
    }
    #[test] fn a_paste_counts_as_landed_only_when_the_box_really_changed() {
        // Putting the original back: the box already holds the improved text, which starts with the original's words.
        let (original, improved) = ("Fix the login bug", "Fix the login bug in auth.ts and add a test");
        assert!(!paste_seen(improved, improved, original), "the box had not changed yet, so nothing has been pasted");
        assert!(paste_seen(improved, original, original));
        // Using the improved text: the box changes from the original to the improved one.
        assert!(!paste_seen(original, original, &improved[..24]));
        assert!(paste_seen(original, improved, &improved[..24]));
        // The text did not show up at all.
        assert!(!paste_seen(original, "something else", &improved[..24]));
    }
    #[test] fn the_card_says_what_the_clipboard_holds_only_when_it_was_not_given_back() {
        let keep = ClipboardPlan::SaveAndRestore;
        let skip = clipboard_plan(AccessBehavior::Ask);
        assert_eq!(paste_words(false, true, &keep), "Done.");
        assert_eq!(paste_words(true, true, &keep), "Your original is back.");
        assert_eq!(paste_words(false, true, &skip), "Done. Your clipboard now holds the improved prompt.");
        assert_eq!(paste_words(true, true, &skip), "Your original is back. Your clipboard now holds your original text.");
        // Not confirmed: the text stays on the clipboard either way, and the card says so.
        for plan in [&keep, &skip] {
            assert_eq!(paste_words(false, false, plan), "I pasted it, but could not confirm it landed. Please look at your text box. Your clipboard now holds the improved prompt.");
            assert_eq!(paste_words(true, false, plan), "I pasted it, but could not confirm it landed. Please look at your text box. Your clipboard now holds your original text.");
        }
    }

    #[test] fn a_log_line_cannot_hold_the_text() {
        let secret = "my secret prompt about my bank account";
        let line = log_line("prompt_help_read", APP, 12, secret.len(), "ok").to_string();
        assert!(!line.contains("secret")); assert!(!line.contains("bank"));
        assert!(line.contains("\"chars\":38"));
        let keys: Vec<String> = log_line("x", "a", 1, 2, "ok").as_object().unwrap().keys().cloned().collect();
        assert_eq!(keys, vec!["app", "chars", "ev", "ms", "outcome"]);
    }
}
