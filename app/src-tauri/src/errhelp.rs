//! The error explainer, the hotkey flow: read the text the person selected in another app (Terminal, a browser console, a
//! builder's chat) and hand it to the engine, which hides secrets in it before using it, explains it in two plain sentences
//! and finds where it lives in the open project. The same rules as Prompt help (phelp.rs): only on the hotkey, the light
//! first, through Accessibility, never a password box, secure typing or a never-read app, the same answer per app, and the
//! text lives only in memory and is never logged. The tested rules are in `errorsel.rs` and `prompthelp.rs`.

#![cfg(target_os = "macos")]

use crate::prompthelp::{self as rules, ReadSession, ReadVerdict};
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

/// The hotkey (Control, Option, Command and E unless changed in Settings, keymap.rs). Runs on its own thread: waking another app's text can take a few seconds.
pub fn on_hotkey(app: &AppHandle, open_card: fn(&AppHandle, &str, bool)) {
    let app = app.clone();
    std::thread::spawn(move || {
        let t0 = Instant::now();
        let Some(front) = ax::front_app() else { return };
        if front.bundle_id.is_empty() || front.bundle_id.starts_with("dev.companion") {
            say(&app, "error", json!({ "why": "own_app" }));
            open_card(&app, "explain_error", false);
            return;
        }
        *awaiting() = None;
        let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
        // The light comes first, and gets a moment to draw, before anything is read (rule 5).
        let mut session = ReadSession::default();
        say(&app, "reading", json!({ "app": front.name }));
        open_card(&app, "explain_error", false);
        std::thread::sleep(INDICATOR_DRAW);
        session.indicator_on();
        if !ax::trusted(false) && !ax::trusted(true) {   // the first press shows macOS's own question; nothing is asked before this
            say(&app, "needs_accessibility", json!({}));
            note(&front.bundle_id, 0, 0, "needs_accessibility");
            return;
        }
        let Some(f) = ax::focused(front.pid) else { say(&app, "nothing_selected", json!({ "app": front.name })); note(&front.bundle_id, t0.elapsed().as_millis() as u64, 0, "no_field"); return };
        match phelp::shared_verdict(&f.role, &f.subrole, &front.bundle_id) {
            ReadVerdict::Ok => read_and_send(&app, session, gen, front.pid, &front.bundle_id, &front.name, t0),
            ReadVerdict::NeedConsent => { *awaiting() = Some((front.pid, front.bundle_id.clone(), front.name.clone())); say(&app, "consent", json!({ "app": front.name })); }
            other => { say(&app, "refused", json!({ "why": other.code() })); note(&front.bundle_id, 0, 0, "refused"); }
        }
    });
}

fn read_and_send(app: &AppHandle, mut session: ReadSession, gen: u64, pid: i32, bundle: &str, name: &str, t0: Instant) {
    if session.begin_read().is_err() { return; }
    // The box and the keyboard as they are now (a question about this app may have waited for its answer): never a
    // password box, never during secure typing.
    let now = ax::focused(pid);
    let (role, subrole) = now.as_ref().map(|f| (f.role.as_str(), f.subrole.as_str())).unwrap_or(("", ""));
    if let Some(v) = rules::secure_now(role, subrole, ax::secure_input_enabled()) {
        session.finish(); say(app, "refused", json!({ "why": v.code() })); note(bundle, 0, 0, "refused"); return;
    }
    drop(now);
    let read = ax::read_selection(pid);
    ax::let_apps_sleep();   // whatever reading switched on in the other app goes off again at once
    session.finish();
    // Stop everything, Close or a newer press came while the text was being read: it is dropped here, never sent.
    if GEN.load(Ordering::SeqCst) != gen { return; }
    let ms = t0.elapsed().as_millis() as u64;
    let Some((raw, rung)) = read else { say(app, "nothing_selected", json!({ "app": name })); note(bundle, ms, 0, "nothing"); return };
    match errorsel::prepare(&raw) {
        errorsel::Selection::Send(text) => {
            let req = format!("eh_{}", now_ms());
            note(bundle, ms, text.chars().count(), rung);
            say(app, "thinking", json!({ "app": name, "req": req }));
            // The character comes beside the window the error was in while the card explains it (F18 item 2).
            crate::roam_beside_window_of(app, pid);
            if app.state::<crate::runner::Runner>().send(&errorsel::command(&req, bundle, &text, &crate::current_project())).is_err() {
                say(app, "error", json!({ "why": "no_engine" }));
            }
        }
        _ => { say(app, "nothing_selected", json!({ "app": name })); note(bundle, ms, 0, "too_short"); }
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
        let mut session = ReadSession::default();
        say(&app, "reading", json!({ "app": name }));
        std::thread::sleep(INDICATOR_DRAW);
        session.indicator_on();
        read_and_send(&app, session, gen, pid, &bundle, &name, Instant::now());
    });
}

/// Close, Cancel or Stop everything: a read under way is dropped, a question about an app is forgotten.
pub fn dismiss(app: &AppHandle) {
    GEN.fetch_add(1, Ordering::SeqCst);
    *awaiting() = None;
    say(app, "dismissed", json!({}));
}
