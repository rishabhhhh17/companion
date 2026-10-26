//! The error explainer, the hotkey flow: read the text the person selected in another app (Terminal, a browser console, a
//! builder's chat) and hand it to the engine, which hides secrets in it before using it, explains it in two plain sentences
//! and finds where it lives in the open project. The same rules as Prompt help (phelp.rs): only on the hotkey, the light
//! first, through Accessibility, never a password box, secure typing or a never-read app, the same answer per app, and the
//! text lives only in memory and is never logged. The tested rules are in `errorsel.rs` and `prompthelp.rs`.

#![cfg(target_os = "macos")]

use crate::prompthelp::{self as rules, ReadSession, ReadVerdict};
use crate::errorsel::Outcome;
use crate::{ax, errorsel, phelp};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const INDICATOR_DRAW: Duration = Duration::from_millis(150);
/// Each press takes a number. Stop everything, Close or a newer press changes it, and a read still under way is then dropped
/// without being sent.
static GEN: AtomicU64 = AtomicU64::new(0);
/// The app waiting for the person's answer about reading in it: (pid, bundle id, name).
static AWAITING: Mutex<Option<(i32, String, String)>> = Mutex::new(None);
fn awaiting() -> std::sync::MutexGuard<'static, Option<(i32, String, String)>> { AWAITING.lock().unwrap_or_else(|e| e.into_inner()) }

fn now_ms() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0) }

/// Tell the pages what stage the explainer is in. Never any of the selected text: the engine's answer carries what the card shows.
fn say(app: &AppHandle, stage: &str, extra: Value) {
    let mut v = json!({ "v": 1, "id": format!("eh{}", now_ms()), "type": "app.explain_error", "stage": stage });
    if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) { for (k, x) in e { o.insert(k.clone(), x.clone()); } }
    let _ = app.emit("runner-event", v);
}
fn note(bundle: &str, ms: u64, chars: usize, outcome: &str) { crate::log("explain_error", errorsel::log_line(bundle, ms, chars, outcome)); }

/// Every way a press ends is shown to the person in plain words (finding D) and logged as one `explain_error` line, never
/// the text. The reading thread and a five second timer may both answer; the first one to claim the press shows, so a read
/// that finishes late never overwrites the timeout message (errorsel.rs `Answered`).
static ANSWERED: errorsel::Answered = errorsel::Answered::new();

/// Shows the end of this press, unless a newer press, Close or Stop everything came, or the timer answered first.
fn show(app: &AppHandle, gen: u64, o: Outcome, extra: Value) -> bool {
    if GEN.load(Ordering::SeqCst) != gen || !ANSWERED.claim(gen) { return false; }
    let mut x = if extra.is_object() { extra } else { json!({}) };
    if let Some(w) = o.why() { x["why"] = json!(w); }
    say(app, o.stage(), x);
    true
}
/// `show`, and the log line for it.
fn finish(app: &AppHandle, gen: u64, o: Outcome, extra: Value, bundle: &str, t0: Instant, chars: usize) -> bool {
    let shown = show(app, gen, o, extra);
    if shown { note(bundle, t0.elapsed().as_millis() as u64, chars, &o.code()); }
    shown
}

/// If the press has not ended after READ_LIMIT, say so in plain words and drop whatever the reading finds later.
fn arm_timer(app: &AppHandle, gen: u64, open_card: Option<fn(&AppHandle, &str, bool)>) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(errorsel::READ_LIMIT);
        if GEN.load(Ordering::SeqCst) != gen || !ANSWERED.claim(gen) { return; }
        if let Some(open) = open_card { open(&app, "explain_error", false); }   // the card is there even if the thread never got to open it
        say(&app, Outcome::Slow.stage(), json!({ "why": Outcome::Slow.why() }));
        note("", READ_MS, 0, &Outcome::Slow.code());
        GEN.fetch_add(1, Ordering::SeqCst);   // the slow read, when it ends, is dropped unsent
        ax::let_apps_sleep_soon();
    });
}
const READ_MS: u64 = errorsel::READ_LIMIT.as_millis() as u64;

/// Runs one press's work on this thread; a failure inside it still ends in a plain message.
fn guarded(app: &AppHandle, gen: u64, work: impl FnOnce()) {
    if std::panic::catch_unwind(std::panic::AssertUnwindSafe(work)).is_err() {
        ax::let_apps_sleep();
        finish(app, gen, Outcome::Crashed, json!({}), "", Instant::now(), 0);
    }
}

/// The hotkey (Control, Option, Command and E unless changed in Settings, keymap.rs). Runs on its own thread: waking another app's text can take a few seconds.
pub fn on_hotkey(app: &AppHandle, open_card: fn(&AppHandle, &str, bool)) {
    let app = app.clone();
    *awaiting() = None;
    let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
    arm_timer(&app, gen, Some(open_card));
    std::thread::spawn(move || guarded(&app.clone(), gen, || press(&app, open_card, gen)));
}

fn press(app: &AppHandle, open_card: fn(&AppHandle, &str, bool), gen: u64) {
    let t0 = Instant::now();
    // Who is in front. The Mac sometimes answers "nobody" for a moment (an app switching, a panel taking the lead): ask again.
    let mut front = None;
    for i in 0..3 {
        if i > 0 { std::thread::sleep(Duration::from_millis(80)); }
        front = ax::front_app();
        if errorsel::front_case(front.as_ref().map(|f| f.bundle_id.as_str())) != errorsel::FrontCase::NoFront { break; }
    }
    let bundle = front.as_ref().map(|f| f.bundle_id.clone()).unwrap_or_default();
    match errorsel::front_case(front.as_ref().map(|f| f.bundle_id.as_str())) {
        errorsel::FrontCase::NoFront => { open_card(app, "explain_error", false); finish(app, gen, Outcome::NoFront, json!({}), &bundle, t0, 0); return; }
        errorsel::FrontCase::Own => { open_card(app, "explain_error", false); finish(app, gen, Outcome::OwnApp, json!({}), &bundle, t0, 0); return; }
        errorsel::FrontCase::Read => {}
    }
    let Some(front) = front else { return };
    // The light comes first, and gets a moment to draw, before anything is read (rule 5).
    let mut session = ReadSession::default();
    if GEN.load(Ordering::SeqCst) != gen { return; }
    say(app, "reading", json!({ "app": front.name }));
    open_card(app, "explain_error", false);
    std::thread::sleep(INDICATOR_DRAW);
    session.indicator_on();
    if !ax::trusted(false) && !ax::trusted(true) {   // the first press shows macOS's own question; nothing is asked before this
        finish(app, gen, Outcome::NeedsAccessibility, json!({}), &bundle, t0, 0);
        return;
    }
    // Electron apps often show no focused box until woken: wake the app in front, only now, and put it back to sleep after.
    let focused = ax::focused_waking(front.pid, false);
    let Some(f) = focused else {
        ax::let_apps_sleep();
        finish(app, gen, Outcome::NoField, json!({ "app": front.name }), &bundle, t0, 0);
        return;
    };
    match phelp::shared_verdict(&f.role, &f.subrole, &front.bundle_id) {
        ReadVerdict::Ok => read_and_send(app, session, gen, front.pid, &front.bundle_id, &front.name, t0),
        ReadVerdict::NeedConsent => {
            ax::let_apps_sleep();
            *awaiting() = Some((front.pid, front.bundle_id.clone(), front.name.clone()));
            if !finish(app, gen, Outcome::Consent, json!({ "app": front.name }), &bundle, t0, 0) { *awaiting() = None; }
        }
        other => { ax::let_apps_sleep(); finish(app, gen, Outcome::Refused(other.code()), json!({}), &bundle, t0, 0); }
    }
}

fn read_and_send(app: &AppHandle, mut session: ReadSession, gen: u64, pid: i32, bundle: &str, name: &str, t0: Instant) {
    if session.begin_read().is_err() { ax::let_apps_sleep(); finish(app, gen, Outcome::Crashed, json!({}), bundle, t0, 0); return; }
    // The box and the keyboard as they are now (a question about this app may have waited for its answer): never a
    // password box, never during secure typing.
    let now = ax::focused(pid);
    let (role, subrole) = now.as_ref().map(|f| (f.role.as_str(), f.subrole.as_str())).unwrap_or(("", ""));
    if let Some(v) = rules::secure_now(role, subrole, ax::secure_input_enabled()) {
        session.finish(); ax::let_apps_sleep(); finish(app, gen, Outcome::Refused(v.code()), json!({}), bundle, t0, 0); return;
    }
    drop(now);
    let read = ax::read_selection(pid);
    ax::let_apps_sleep();   // whatever reading switched on in the other app goes off again at once
    session.finish();
    // Stop everything, Close, a newer press or the timeout came while the text was being read: it is dropped here, never sent.
    if GEN.load(Ordering::SeqCst) != gen { return; }
    let Some((raw, rung)) = read else { finish(app, gen, Outcome::Nothing, json!({ "app": name }), bundle, t0, 0); return };
    match errorsel::prepare(&raw) {
        errorsel::Selection::Send(text) => {
            let req = format!("eh_{}", now_ms());
            if !finish(app, gen, Outcome::Sent(rung), json!({ "app": name, "req": req }), bundle, t0, text.chars().count()) { return; }
            // The character comes beside the window the error was in while the card explains it (F18 item 2).
            crate::roam_beside_window_of(app, pid);
            if app.state::<crate::runner::Runner>().send(&errorsel::command(&req, bundle, &text, &crate::current_project())).is_err() {
                say(app, Outcome::NoEngine.stage(), json!({ "why": Outcome::NoEngine.why() }));
                note(bundle, t0.elapsed().as_millis() as u64, 0, &Outcome::NoEngine.code());
            }
        }
        _ => { finish(app, gen, Outcome::TooShort, json!({ "app": name }), bundle, t0, 0); }
    }
}

/// The person answered "always", "once" or "never" for this app on the card. The answer is shared with Prompt help.
pub fn consent_answer(app: &AppHandle, choice: &str) {
    let (app, choice) = (app.clone(), choice.to_string());
    std::thread::spawn(move || {
        let Some((pid, bundle, name)) = awaiting().take() else { return };
        let may = phelp::shared_answer(&bundle, &choice);
        crate::settings_told(&app, &["ph.appAnswers".to_string()]);   // Settings shows the new answer
        if !may {
            if choice == "never" { say(&app, "refused", json!({ "why": ReadVerdict::RefusedByYou.code() })); }
            return;
        }
        let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
        arm_timer(&app, gen, None);
        let a2 = app.clone();
        guarded(&a2, gen, || {
            let mut session = ReadSession::default();
            say(&app, "reading", json!({ "app": name }));
            std::thread::sleep(INDICATOR_DRAW);
            session.indicator_on();
            read_and_send(&app, session, gen, pid, &bundle, &name, Instant::now());
        });
    });
}

/// Close, Cancel or Stop everything: a read under way is dropped, a question about an app is forgotten.
pub fn dismiss(app: &AppHandle) {
    GEN.fetch_add(1, Ordering::SeqCst);
    *awaiting() = None;
    say(app, "dismissed", json!({}));
}
