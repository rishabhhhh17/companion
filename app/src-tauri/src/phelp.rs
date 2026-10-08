//! Prompt help, the hotkey flow: read the text box you are in, ask the runner for a better version, and put it back.
//! Every decision goes through the tested rules in `prompthelp.rs`; the macOS calls are in `ax.rs`.
//! The text lives only in memory here and is never written to a log. Nothing happens except on the hotkey.

#![cfg(target_os = "macos")]

use crate::ax;
use crate::prompthelp as rules;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const INDICATOR_DRAW: Duration = Duration::from_millis(150);

struct Pending {
    pid: i32, bundle: String, name: String,
    element: ax::Cf, element_id: u64,
    original: String, had_selection: bool,
    improved: Option<String>, handback_copy: bool,
}
#[derive(Default)]
struct State { consent: Option<rules::Consent>, deny: rules::Denylist, awaiting: Option<(i32, String, String)>, pending: Option<Pending> }
static STATE: Mutex<State> = Mutex::new(State { consent: None, deny: rules::Denylist::empty(), awaiting: None, pending: None });

fn data_file() -> PathBuf { PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("Library/Application Support/dev.companion.app/prompt_help.json") }
fn load_consent() -> rules::Consent { std::fs::read_to_string(data_file()).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).map(|v| rules::Consent::from_json(&v)).unwrap_or_default() }
fn save_consent(c: &rules::Consent) { if let Some(d) = data_file().parent() { let _ = std::fs::create_dir_all(d); } let _ = std::fs::write(data_file(), c.to_json().to_string()); }
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
    let mut cmd = json!({ "v": 1, "id": format!("ph{}", now_ms()), "type": "assist.prompt", "req": format!("ph_{}", now_ms()), "app": bundle, "target": target_kind(bundle), "text": text, "style": "full" });
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
        {   let mut st = STATE.lock().unwrap(); st.pending = None; st.awaiting = None; }
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
            let mut st = STATE.lock().unwrap();
            if st.consent.is_none() { st.consent = Some(load_consent()); }
            let State { consent, deny, .. } = &mut *st;
            rules::read_verdict(&f.role, &f.subrole, ax::secure_input_enabled(), &front.bundle_id, deny, consent.as_mut().unwrap())
        };
        match verdict {
            rules::ReadVerdict::Ok => finish_read(&app, session, front.pid, front.bundle_id, front.name, t0),
            rules::ReadVerdict::NeedConsent => {
                STATE.lock().unwrap().awaiting = Some((front.pid, front.bundle_id.clone(), front.name.clone()));
                say(&app, "consent", json!({ "app": front.name }));
            }
            other => { say(&app, "refused", json!({ "message": other.plain() })); note("read", &front.bundle_id, 0, 0, "refused"); }
        }
    });
}

fn finish_read(app: &AppHandle, mut session: rules::ReadSession, pid: i32, bundle: String, name: String, t0: Instant) {
    if session.begin_read().is_err() { return; }
    match ax::read_ladder(pid) {
        None => { say(app, "nothing_to_read", json!({ "app": name })); note("read", &bundle, t0.elapsed().as_millis() as u64, 0, "nothing"); }
        Some((el, r)) => {
            let chars = r.text.chars().count();
            note("read", &bundle, t0.elapsed().as_millis() as u64, chars, r.rung);
            let element_id = el.id();
            let text = r.text.clone();
            STATE.lock().unwrap().pending = Some(Pending { pid, bundle: bundle.clone(), name: name.clone(), element: el, element_id, original: r.text, had_selection: r.had_selection, improved: None, handback_copy: false });
            say(app, "thinking", json!({ "app": name, "selection": r.had_selection }));
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
        let Some((pid, bundle, name)) = STATE.lock().unwrap().awaiting.take() else { return };
        {
            let mut st = STATE.lock().unwrap();
            if st.consent.is_none() { st.consent = Some(load_consent()); }
            let c = st.consent.as_mut().unwrap();
            c.record(&bundle, choice);
            save_consent(c);
        }
        if choice == rules::Choice::Never { say(&app, "refused", json!({ "message": rules::ReadVerdict::RefusedByYou.plain() })); return; }
        // Ask the rules again so "once" is used up by this one read.
        let ok = { let mut st = STATE.lock().unwrap(); st.consent.as_mut().unwrap().decide(&bundle) == rules::Decision::Allow };
        if !ok { return; }
        let mut session = rules::ReadSession::default();
        session.indicator_on();
        say(&app, "reading", json!({ "app": name }));
        std::thread::sleep(INDICATOR_DRAW);
        finish_read(&app, session, pid, bundle, name, Instant::now());
    });
}

/// The page has shown the improved text; remember it so accept can paste it. Nothing is stored on disk.
pub fn ready(improved: String, handback_copy: bool) {
    if let Some(p) = STATE.lock().unwrap().pending.as_mut() { p.improved = Some(improved); p.handback_copy = handback_copy; }
}

pub fn dismiss(app: &AppHandle) { STATE.lock().unwrap().pending = None; say(app, "dismissed", json!({})); }

/// Answer the one question and ask again, without asking another.
pub fn answer(app: &AppHandle, answer: String) {
    let (bundle, original) = match STATE.lock().unwrap().pending.as_ref() { Some(p) => (p.bundle.clone(), p.original.clone()), None => return };
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
    let app = app.clone();
    std::thread::spawn(move || {
        let (text, current_len, handback_copy, at_read, name, had_selection) = {
            let st = STATE.lock().unwrap();
            let Some(p) = st.pending.as_ref() else { return };
            let text = if restore { p.original.clone() } else { match &p.improved { Some(t) => t.clone(), None => return } };
            let current = ax::value_of(&p.element).unwrap_or_default();
            (text, current.encode_utf16().count(), p.handback_copy, rules::Focus { pid: p.pid, element: p.element_id }, p.name.clone(), p.had_selection)
        };
        let now = current_focus(at_read.pid).map(|(pid, element)| rules::Focus { pid, element }).unwrap_or(rules::Focus { pid: -1, element: 0 });
        match rules::paste_plan(at_read, now, handback_copy && !restore, false) {
            rules::PasteVerdict::CopyOnly(msg) => { ax::write_clipboard(&text); say(&app, "copied", json!({ "message": msg })); note("paste", &name, 0, text.chars().count(), "copied"); }
            rules::PasteVerdict::Paste => {
                // The clipboard is put back only when macOS will not alert for reading it. Until that is checked on this Mac, it is not read.
                let plan = rules::clipboard_plan(rules::AccessBehavior::Unknown);
                let ours = ax::write_clipboard(&text);
                let _ = ours;
                {
                    let st = STATE.lock().unwrap();
                    let p = st.pending.as_ref().unwrap();
                    // Replace the whole box, or only the selection if that is what was read.
                    if !(had_selection && !restore) { ax::select_all(&p.element, current_len); std::thread::sleep(Duration::from_millis(60)); }
                }
                if !ax::ensure_front(at_read.pid) {
                    say(&app, "copied", json!({ "message": "I could not return to your text box, so I copied the text instead. Press Cmd+V where you want it." }));
                    note("paste", &name, 0, text.chars().count(), "no_focus");
                    return;
                }
                ax::press_paste();
                // Some apps take a moment to show pasted text, so look for up to two seconds.
                let probe: String = text.chars().take(24).collect();
                let started = Instant::now();
                let mut landed = false;
                while started.elapsed() < Duration::from_millis(2000) {
                    std::thread::sleep(Duration::from_millis(100));
                    landed = STATE.lock().unwrap().pending.as_ref().and_then(|p| ax::value_of(&p.element)).is_some_and(|v| v.contains(probe.as_str()));
                    if landed { break; }
                }
                let tell = match plan { rules::ClipboardPlan::SkipAndTell(_) if restore => "Your clipboard now holds your original text.", rules::ClipboardPlan::SkipAndTell(m) => m, rules::ClipboardPlan::SaveAndRestore => "" };
                let msg = if landed { format!("{} {tell}", if restore { "Your original is back." } else { "Done." }) } else { format!("I pasted it, but could not confirm it landed. {tell}") };
                say(&app, if restore { "restored" } else { "pasted" }, json!({ "message": msg.trim(), "confirmed": landed }));
                note("paste", &name, 0, text.chars().count(), if landed { "landed" } else { "unconfirmed" });
            }
        }
    });
}
