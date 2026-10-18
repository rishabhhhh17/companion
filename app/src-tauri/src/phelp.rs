//! Prompt help, the hotkey flow: read the text box you are in, ask the runner for a better version, and put it back.
//! Every decision goes through the tested rules in `prompthelp.rs`; the macOS calls are in `ax.rs`.
//! The text lives only in memory here and is never written to a log. Nothing happens except on the hotkey.

#![cfg(target_os = "macos")]

use crate::ax;
use crate::prompthelp as rules;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const INDICATOR_DRAW: Duration = Duration::from_millis(150);

struct Pending {
    pid: i32, bundle: String, name: String,
    element: Arc<ax::Cf>, element_id: u64,
    original: String, had_selection: bool,
    /// Where the selection that was read starts (UTF-16 units). Updated to where the improved text really went just before
    /// it is pasted, so putting the original back replaces only that.
    sel_start: Option<usize>,
    improved: Option<String>, handback_copy: bool,
}
#[derive(Default)]
struct State { consent: Option<rules::Consent>, deny: rules::Denylist, awaiting: Option<(i32, String, String)>, pending: Option<Pending> }
/// The state lock. If some thread ever panicked while holding it, later users still get it: one mistake must not break Prompt help for good.
fn st() -> std::sync::MutexGuard<'static, State> { STATE.lock().unwrap_or_else(|e| e.into_inner()) }
/// Counts hotkey presses and dismissals, so a paste that is already under way can tell the person has moved on.
static GEN: AtomicU64 = AtomicU64::new(0);
static PASTING: AtomicBool = AtomicBool::new(false);

static STATE: Mutex<State> = Mutex::new(State { consent: None, deny: rules::Denylist::empty(), awaiting: None, pending: None });

fn data_file() -> PathBuf { PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("Library/Application Support/dev.companion.app/prompt_help.json") }
fn load_consent() -> rules::Consent { std::fs::read_to_string(data_file()).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).map(|v| rules::Consent::from_json(&v)).unwrap_or_default() }
fn save_consent(c: &rules::Consent) { let _ = try_save_consent(c); }
fn try_save_consent(c: &rules::Consent) -> Result<(), &'static str> {
    if let Some(d) = data_file().parent() { let _ = std::fs::create_dir_all(d); }
    crate::logfile::write_atomic(&data_file(), c.to_json().to_string().as_bytes()).map_err(|_| "notSaved")
}

/// Settings (ph.appAnswers): the answers kept for each app, as prompt_help.json holds them.
pub fn apps_value() -> Value {
    let mut st = st();
    if st.consent.is_none() { st.consent = Some(load_consent()); }
    st.consent.as_ref().map(|c| c.to_json()).unwrap_or_else(|| json!({ "apps": {} }))
}
/// Settings changes one answer, forgets one or all (never the apps never to read), or adds the app in front to never read
/// (`front`: only its bundle id). The rules are in prompthelp.rs (`Consent::change`); nothing changes unless it is saved.
pub fn apps_change(v: &Value, front: &str) -> Result<(), &'static str> {
    let op = rules::apps_op(v)?;
    let mut st = st();
    if st.consent.is_none() { st.consent = Some(load_consent()); }
    let mut next = st.consent.clone().unwrap_or_default();
    next.change(&op, front)?;
    try_save_consent(&next)?;
    st.consent = Some(next);
    Ok(())
}
fn now_ms() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0) }

/// Tell the pages what stage Prompt help is in. Never any of the person's text except what the page needs to show.
fn say(app: &AppHandle, stage: &str, extra: Value) {
    let mut v = json!({ "v": 1, "id": format!("ph{}", now_ms()), "type": "app.prompt_help", "stage": stage });
    if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) { for (k, x) in e { o.insert(k.clone(), x.clone()); } }
    let _ = app.emit("runner-event", v);
}
fn note(kind: &str, app_id: &str, ms: u64, chars: usize, outcome: &str) {
    // The helper names the event "ev"; rename it so it does not replace the log's own event name.
    let mut v = rules::log_line(kind, app_id, ms, chars, outcome);
    if let Some(o) = v.as_object_mut() { if let Some(k) = o.remove("ev") { o.insert("kind".into(), k); } }
    crate::log("prompt_help", v);
}

const TERMINALS: &[&str] = &["com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "net.kovidgoyal.kitty", "com.mitchellh.ghostty", "org.alacritty", "co.zeit.hyper", "com.github.wez.wezterm"];
const CHAT_APPS: &[&str] = &["com.openai.codex", "com.anthropic.claudefordesktop", "com.openai.chat", "com.google.gemini"];
pub fn target_kind(bundle: &str) -> &'static str {
    if TERMINALS.contains(&bundle) { "claude_code" } else if CHAT_APPS.contains(&bundle) { "chat" } else { "other" }
}

fn send_prompt(app: &AppHandle, bundle: &str, text: &str, answer: Option<&str>) {
    // Prompt help rewrites (ph.style in Settings): a full rewrite unless the person chose a light touch.
    let mut cmd = json!({ "v": 1, "id": format!("ph{}", now_ms()), "type": "assist.prompt", "req": format!("ph_{}", now_ms()), "app": bundle, "target": target_kind(bundle), "text": text, "style": rules::style_of(&crate::setting_now("ph.style")) });
    // The folder the person chose gives Prompt help what the project is (its stack and purpose) and what Companion remembers.
    { let project = crate::current_project(); if !project.is_empty() { cmd["project"] = json!(project); } }
    if let (Some(a), Some(o)) = (answer, cmd.as_object_mut()) { o.insert("answer".into(), json!(a)); o.insert("noQuestion".into(), json!(true)); }
    if let Err(e) = app.state::<crate::runner::Runner>().send(&cmd) { say(app, "error", json!({ "message": format!("Prompt help could not reach the engine ({e}).") })); }
}

/// The hotkey. Runs on its own thread because reading can take a few seconds in apps that wake their text late.
pub fn on_hotkey(app: &AppHandle, open_card: fn(&AppHandle, &str, bool)) {
    let app = app.clone();
    std::thread::spawn(move || {
        let t0 = Instant::now();
        crate::log("prompt_help_step", json!({ "step": "thread_started" }));
        let Some(front) = ax::front_app() else { crate::log("prompt_help_step", json!({ "step": "no_front_app" })); return };
        crate::log("prompt_help_step", json!({ "step": "front", "app": front.bundle_id }));
        if front.bundle_id.is_empty() || front.bundle_id.starts_with("dev.companion") { say(&app, "error", json!({ "message": "Click into the text box you want help with first, then press the hotkey." })); return; }
        {   let mut s = st(); s.pending = None; s.awaiting = None; }
        ax::let_apps_sleep();   // whatever an earlier read switched on in another app
        GEN.fetch_add(1, Ordering::SeqCst);
        // The light comes first, and gets a moment to draw, before anything is read (rule 5).
        let mut session = rules::ReadSession::default();
        say(&app, "reading", json!({ "app": front.name }));
        open_card(&app, "prompt_help", false);
        std::thread::sleep(INDICATOR_DRAW);
        session.indicator_on();
        crate::log("prompt_help_step", json!({ "step": "indicator_lit", "trusted": ax::trusted(false) }));
        if !ax::trusted(false) {
            let ok = ax::trusted(true);          // the first press shows macOS's own question; nothing is asked before this
            if !ok { say(&app, "needs_accessibility", json!({})); note("read", &front.bundle_id, 0, 0, "needs_accessibility"); return; }
        }
        let Some(f) = ax::focused(front.pid) else { say(&app, "nothing_to_read", json!({ "app": front.name })); note("read", &front.bundle_id, t0.elapsed().as_millis() as u64, 0, "no_field"); return; };
        let verdict = {
            let mut st = st();
            if st.consent.is_none() { st.consent = Some(load_consent()); }
            let State { consent, deny, .. } = &mut *st;
            rules::read_verdict(&f.role, &f.subrole, ax::secure_input_enabled(), &front.bundle_id, deny, consent.as_mut().unwrap())
        };
        match verdict {
            rules::ReadVerdict::Ok => finish_read(&app, session, front.pid, front.bundle_id, front.name, t0),
            rules::ReadVerdict::NeedConsent => {
                st().awaiting = Some((front.pid, front.bundle_id.clone(), front.name.clone()));
                say(&app, "consent", json!({ "app": front.name }));
            }
            other => { say(&app, "refused", json!({ "message": other.plain() })); note("read", &front.bundle_id, 0, 0, "refused"); }
        }
    });
}

fn finish_read(app: &AppHandle, mut session: rules::ReadSession, pid: i32, bundle: String, name: String, t0: Instant) {
    if session.begin_read().is_err() { return; }
    let gen = GEN.load(Ordering::SeqCst);
    let read = ax::read_ladder(pid);
    // Stop everything (or a newer press) came while the text was being read: it is dropped here, never sent to the model.
    if GEN.load(Ordering::SeqCst) != gen { session.finish(); return; }
    match read {
        None => { say(app, "nothing_to_read", json!({ "app": name })); note("read", &bundle, t0.elapsed().as_millis() as u64, 0, "nothing"); }
        Some((el, r)) => {
            let chars = r.text.chars().count();
            note("read", &bundle, t0.elapsed().as_millis() as u64, chars, r.rung);
            let element_id = el.id();
            let text = r.text.clone();
            st().pending = Some(Pending { pid, bundle: bundle.clone(), name: name.clone(), element: Arc::new(el), element_id, original: r.text, had_selection: r.had_selection, sel_start: r.sel_start, improved: None, handback_copy: false });
            say(app, "thinking", json!({ "app": name, "selection": r.had_selection }));
            // The character comes beside the window the prompt was read from while the card shows the result (F18 item 2).
            crate::roam_beside_window_of(app, pid);
            send_prompt(app, &bundle, &text, None);
        }
    }
    session.finish();
}

/// The person answered "once", "always" or "never" for this app.
pub fn consent_answer(app: &AppHandle, choice: &str) {
    let app = app.clone();
    let choice = match choice { "once" => rules::Choice::Once, "always" => rules::Choice::Always, _ => rules::Choice::Never };
    std::thread::spawn(move || {
        let Some((pid, bundle, name)) = st().awaiting.take() else { return };
        {
            let mut st = st();
            if st.consent.is_none() { st.consent = Some(load_consent()); }
            let c = st.consent.as_mut().unwrap();
            c.record(&bundle, choice);
            save_consent(c);
        }
        crate::settings_told(&app, &["ph.appAnswers".to_string()]);   // Settings shows the new answer
        if choice == rules::Choice::Never { say(&app, "refused", json!({ "message": rules::ReadVerdict::RefusedByYou.plain() })); return; }
        // Ask the rules again so "once" is used up by this one read.
        let ok = { let mut st = st(); st.consent.as_mut().unwrap().decide(&bundle) == rules::Decision::Allow };
        if !ok { return; }
        let mut session = rules::ReadSession::default();
        session.indicator_on();
        say(&app, "reading", json!({ "app": name }));
        std::thread::sleep(INDICATOR_DRAW);
        finish_read(&app, session, pid, bundle, name, Instant::now());
    });
}

/// The error explainer reads in other apps too, under the same rules and the same answer per app (asked once for both):
/// never a password box, secure typing or a never-read app, and only where the person said always or just this once.
pub fn shared_verdict(role: &str, subrole: &str, bundle: &str) -> rules::ReadVerdict {
    let mut st = st();
    if st.consent.is_none() { st.consent = Some(load_consent()); }
    let State { consent, deny, .. } = &mut *st;
    rules::read_verdict(role, subrole, ax::secure_input_enabled(), bundle, deny, consent.as_mut().unwrap())
}
/// The person answered for this app from the error explainer's card. True when it may be read right now ("once" is used up).
pub fn shared_answer(bundle: &str, choice: &str) -> bool {
    let choice = match choice { "once" => rules::Choice::Once, "always" => rules::Choice::Always, _ => rules::Choice::Never };
    let mut st = st();
    if st.consent.is_none() { st.consent = Some(load_consent()); }
    let c = st.consent.as_mut().unwrap();
    c.record(bundle, choice);
    save_consent(c);
    choice != rules::Choice::Never && c.decide(bundle) == rules::Decision::Allow
}

/// The page has shown the improved text; remember it so accept can paste it. Nothing is stored on disk.
pub fn ready(improved: String, handback_copy: bool) {
    if let Some(p) = st().pending.as_mut() { p.improved = Some(improved); p.handback_copy = handback_copy; }
}

pub fn dismiss(app: &AppHandle) { GEN.fetch_add(1, Ordering::SeqCst); st().pending = None; ax::let_apps_sleep(); say(app, "dismissed", json!({})); }

/// Answer the one question and ask again, without asking another.
pub fn answer(app: &AppHandle, answer: String) {
    let (bundle, original) = match st().pending.as_ref() { Some(p) => (p.bundle.clone(), p.original.clone()), None => return };
    say(app, "thinking", json!({}));
    send_prompt(app, &bundle, &original, Some(&answer));
}

fn current_focus(pid: i32) -> Option<(i32, u64)> {
    let f = ax::front_app()?;
    let el = ax::focused(f.pid)?;
    let _ = pid;
    Some((f.pid, el.element.id()))
}

/// Put the improved text in (accept) or the original back (restore). Always by paste, after the rules agree.
pub fn put_back(app: &AppHandle, restore: bool) {
    // Two clicks at once must not paste twice.
    if PASTING.swap(true, Ordering::SeqCst) { return; }
    let app = app.clone();
    std::thread::spawn(move || { put_back_now(&app, restore); PASTING.store(false, Ordering::SeqCst); ax::let_apps_sleep(); });
}

fn put_back_now(app: &AppHandle, restore: bool) {
    let gen = GEN.load(Ordering::SeqCst);
    // Take what is needed out of the shared state and let go of it: the calls into the other app below can be slow.
    let (text, improved, handback_copy, at_read, name, had_selection, sel_start, element) = {
        let s = st();
        let Some(p) = s.pending.as_ref() else { return };
        let text = if restore { p.original.clone() } else { match &p.improved { Some(t) => t.clone(), None => return } };
        (text, p.improved.clone(), p.handback_copy, rules::Focus { pid: p.pid, element: p.element_id }, p.name.clone(), p.had_selection, p.sel_start, p.element.clone())
    };
    let moved_on = || GEN.load(Ordering::SeqCst) != gen;
    let focus_now = || current_focus(at_read.pid).map(|(pid, element)| rules::Focus { pid, element }).unwrap_or(rules::Focus { pid: -1, element: 0 });
    match rules::paste_plan(at_read, focus_now(), handback_copy && !restore, false) {
        rules::PasteVerdict::CopyOnly(msg) => { ax::write_clipboard(&text); say(app, "copied", json!({ "message": msg })); note("paste", &name, 0, text.chars().count(), "copied"); }
        rules::PasteVerdict::Paste => {
            // Where the text goes: the whole box, or only the selection if that is what was read. Putting the original back
            // after a selection replaces only where the improved text went; if it is not there any more, the box is left
            // alone and the original is only copied (the rule is tested in prompthelp.rs).
            let box_now = ax::value_of(&element).unwrap_or_default();
            let target = rules::paste_target(had_selection, restore, &box_now, sel_start, improved.as_deref());
            let selected = match target {
                rules::PasteTarget::WholeBox(len) => { ax::select_all(&element, len); true }
                rules::PasteTarget::Range { start, len } => ax::select_range(&element, start, len),
                rules::PasteTarget::Selection => true,
                rules::PasteTarget::NotFound => false,
            };
            if !selected {
                ax::write_clipboard(&text);
                say(app, "copied", json!({ "message": rules::ORIGINAL_NOT_FOUND }));
                note("paste", &name, 0, text.chars().count(), "not_found");
                return;
            }
            if target != rules::PasteTarget::Selection { std::thread::sleep(Duration::from_millis(60)); }
            // The person's own clipboard is saved first and put back after the paste, but only when macOS lets Companion read
            // it without an alert (T11) and nothing on it is marked private (a password manager clears those by itself).
            // Otherwise it is not read at all, and the card says the clipboard now holds the text.
            let mut plan = rules::clipboard_plan_with(rules::access_behavior(ax::clipboard_access_raw()), ax::clipboard_types);
            let saved = if plan == rules::ClipboardPlan::SaveAndRestore { ax::save_clipboard() } else { None };
            if saved.is_none() { plan = rules::ClipboardPlan::skip(); }   // not saved, so the card must say what it holds now
            let ours = ax::write_clipboard(&text);
            let give_back = |outcome: rules::PasteOutcome| {
                if let Some(s) = &saved { if rules::restore_after(&plan, outcome, ours, ax::clipboard_change_count()) { ax::restore_clipboard(s, ours); } }
            };
            let fronted = ax::ensure_front(at_read.pid);
            std::thread::sleep(Duration::from_millis(250));
            if !fronted {
                give_back(rules::PasteOutcome::CopiedInstead);   // the text stays on the clipboard for the person to paste
                say(app, "copied", json!({ "message": "I could not return to your text box, so I copied the text instead. Press Cmd+V where you want it." }));
                note("paste", &name, 0, text.chars().count(), "no_focus");
                return;
            }
            // Just before pasting, make sure the person is still in the same box and has not moved on. If not, only copy.
            if moved_on() { give_back(rules::PasteOutcome::Cancelled); note("paste", &name, 0, text.chars().count(), "cancelled"); return; }
            if focus_now() != at_read {
                give_back(rules::PasteOutcome::CopiedInstead);
                say(app, "copied", json!({ "message": "You moved to another box, so I copied the text instead of pasting. Press Cmd+V where you want it." }));
                note("paste", &name, 0, text.chars().count(), "moved");
                return;
            }
            // Using the improved text over a selection: remember where it goes, so putting the original back replaces only that.
            if target == rules::PasteTarget::Selection {
                if let Some(at) = ax::selection_start(&element) {
                    if let Some(p) = st().pending.as_mut() { if p.element_id == at_read.element { p.sel_start = Some(at); } }
                }
            }
            // The app's own Edit > Paste first. Cmd+V only when that menu item could not be pressed at all: pressing both would paste twice.
            let probe: String = text.chars().take(24).collect();
            // What the box holds right before the paste: it has landed only once the box changed from this and holds our text.
            let before = ax::value_of(&element).unwrap_or_default();
            let check = |ms: u64| -> bool {
                let started = Instant::now();
                while started.elapsed() < Duration::from_millis(ms) {
                    std::thread::sleep(Duration::from_millis(100));
                    if ax::value_of(&element).is_some_and(|v| rules::paste_seen(&before, &v, &probe)) { return true; }
                }
                false
            };
            let menu_pressed = ax::press_menu(at_read.pid, "Edit", "Paste");
            let (landed, how) = if menu_pressed { (check(1500), "menu") } else { ax::press_paste(); (check(1500), "keys") };
            // The app has read the clipboard once the text shows in the box, so the person's own clipboard can come back now.
            give_back(if landed { rules::PasteOutcome::Landed } else { rules::PasteOutcome::Unconfirmed });
            crate::log("prompt_help_step", json!({ "step": "pasted_by", "how": how, "landed": landed, "clipboard_saved": saved.is_some() }));
            say(app, if restore { "restored" } else { "pasted" }, json!({ "message": rules::paste_words(restore, landed, &plan), "confirmed": landed }));
            note("paste", &name, 0, text.chars().count(), if landed { "landed" } else { "unconfirmed" });
        }
    }
}
